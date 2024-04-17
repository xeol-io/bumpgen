import process from "process";

import type { SupportedLanguage } from "./models";
import type { BuildError } from "./models/build";
import type { BumpgenGraph } from "./models/graph";
import type { DependencyGraphNode } from "./models/graph/dependency";
import type { SupportedModel } from "./models/llm";
import type { PackageUpgrade } from "./models/packages";
import type { FilesystemService } from "./services/filesystem";
import type { GraphService } from "./services/graph";
import type { BumpgenLanguageService } from "./services/language/types";
import type { LLMService } from "./services/llm/types";
import { injectFilesystemService } from "./services/filesystem";
import { injectGraphService } from "./services/graph";
import { injectLanguageService } from "./services/language";
import { injectLLMService } from "./services/llm";

const _bumpgen = ({
  services,
  args,
}: {
  services: {
    llm: LLMService;
    language: BumpgenLanguageService;
    graphService: GraphService;
    filesystem: FilesystemService;
  };
  args: {
    projectRoot: string;
    packageToUpgrade: PackageUpgrade;
  };
}) => {
  const createOrUpdatePlanGraphNode = (
    node: DependencyGraphNode,
    existingNodes: Map<
      string,
      Parameters<typeof services.graphService.plan.initialize>[0][number]
    >,
    err: BuildError,
  ) => {
    if (existingNodes.has(node.id)) {
      const existingNode = existingNodes.get(node.id)!;

      existingNode.errorMessages.push(err);

      existingNode.errorMessages = existingNode.errorMessages
        .sort((a, b) => a.line - b.line)
        .slice(0, 1);
    } else {
      existingNodes.set(node.id, {
        id: node.id,
        block: node.block,
        startLine: node.startLine,
        endLine: node.endLine,
        path: node.path,
        typeSignature: node.typeSignature,
        errorMessages: [err],
      });
    }
  };

  const bumpgen = {
    build: {
      getErrors: async () => {
        const { language } = services;
        const { projectRoot } = args;
        return await language.build.getErrors(projectRoot);
      },
    },
    upgrade: {
      list: async () => {
        const { language } = services;
        const { projectRoot } = args;
        return language.packages.upgrade.list(projectRoot);
      },
      apply: async () => {
        const { language } = services;
        const { projectRoot, packageToUpgrade } = args;
        return language.packages.upgrade.apply(projectRoot, packageToUpgrade);
      },
    },
    graph: {
      initialize: (projectRoot: string, errs: BuildError[]): BumpgenGraph => {
        const { language, graphService } = services;
        const { packageToUpgrade } = args;
        const ast = language.ast.initialize(projectRoot);

        const dependencyGraph = language.graph.dependency.initialize(ast);

        const externallyCausedPlanGraphNodes = new Map<
          string,
          Parameters<typeof graphService.plan.initialize>[0][number]
        >();

        const internallyCausedPlanGraphNodes = new Map<
          string,
          Parameters<typeof graphService.plan.initialize>[0][number]
        >();

        for (const err of errs) {
          const affectedNodes =
            graphService.dependency.getNodesInFileWithinRange(dependencyGraph, {
              filePath: err.path,
              startLine: err.line,
              endLine: err.line,
            });

          if (affectedNodes.length === 0) {
            console.debug("No affected nodes found for error:", err);
            continue;
          }

          for (const node of affectedNodes) {
            if (
              language.graph.dependency.checkImportsForPackage(
                dependencyGraph,
                node,
                packageToUpgrade.packageName,
              )
            ) {
              createOrUpdatePlanGraphNode(
                node,
                externallyCausedPlanGraphNodes,
                err,
              );
            } else {
              createOrUpdatePlanGraphNode(
                node,
                internallyCausedPlanGraphNodes,
                err,
              );
            }
          }
        }

        const externallyCausedPlanGraphNodesArray = Array.from(
          externallyCausedPlanGraphNodes.values(),
        );

        const internallyCausedPlanGraphNodesArray = Array.from(
          internallyCausedPlanGraphNodes.values(),
        );

        const planGraph = graphService.plan.initialize(
          externallyCausedPlanGraphNodesArray.length > 0
            ? externallyCausedPlanGraphNodesArray
            : internallyCausedPlanGraphNodesArray,
        );

        return {
          root: projectRoot,
          dependency: dependencyGraph,
          plan: planGraph,
          ast,
        };
      },
      plan: {
        isComplete: (graph: BumpgenGraph) => {
          const { graphService } = services;
          return graphService.plan.nodes.nextPending(graph.plan) === undefined;
        },
        execute: async (graph: BumpgenGraph) => {
          const { llm, graphService } = services;
          const { packageToUpgrade } = args;
          const planNode = graphService.plan.nodes.nextPending(graph.plan);

          if (!planNode) {
            return null;
          }

          const spatialContext = graphService.dependency.getContextsForNodeById(
            graph.dependency,
            {
              id: planNode.id,
              relationships: ["referencedBy"],
            },
          );
          const temporalContext = graphService.plan.node.getContext(
            graph.plan,
            {
              id: planNode.id,
            },
          );
          const importContext = graphService.dependency.getReferencingNodes(
            graph.dependency,
            {
              id: planNode.id,
              relationships: ["importDeclaration"],
            },
          );

          const { replacements, commitMessage } =
            await llm.codeplan.getReplacements({
              currentPlanNode: planNode,
              importContext,
              spatialContext,
              temporalContext,
              bumpedPackage: packageToUpgrade.packageName,
            });

          if (replacements.length > 0) {
            const fileContents = await services.filesystem.read(planNode.path);

            // TODO: implement the new fuzzy matcher
            const newFileContents = replacements.reduce(
              (acc, replacement) =>
                acc.replace(replacement.oldCode, replacement.newCode),
              fileContents,
            );

            const originalSignature = planNode.typeSignature;

            await services.filesystem.write(planNode.path, newFileContents);
            services.language.graph.recomputeGraphAfterChange(
              graph,
              planNode,
              replacements,
            );

            const newDepGraphNode = graphService.dependency.getNodeById(
              graph.dependency,
              { id: planNode.id },
            );

            if (originalSignature !== newDepGraphNode.typeSignature) {
              const affectedNodes = graphService.dependency.getReferencingNodes(
                graph.dependency,
                { id: planNode.id, relationships: ["referencedBy"] },
              );
              affectedNodes.forEach((node) => {
                graphService.plan.addObligation(graph.plan, {
                  depGraphNode: node,
                  parentID: planNode.id,
                });
              });
            }
          }
          graphService.plan.node.update(graph.plan, {
            id: planNode.id,
            node: { status: "completed", replacements },
          });

          const updatedPlanNode = graphService.plan.node.get(graph.plan, {
            id: planNode.id,
          });

          return {
            commitMessage,
            planNode: updatedPlanNode,
            replacements,
          };
        },
      },
    },
  };

  return {
    ...bumpgen,
    // execute: async function* () {
    //   yield await bumpgen.build.getErrors();
    // },
  };
};

export const makeBumpgen = ({
  llmApiKey,
  packageToUpgrade,
  model,
  language,
  projectRoot,
}: {
  llmApiKey: string;
  packageToUpgrade: PackageUpgrade;
  model?: SupportedModel;
  language?: SupportedLanguage;
  projectRoot?: string;
}) => {
  model = model ?? "gpt-4-turbo-preview";
  language = language ?? "typescript";
  projectRoot = projectRoot ?? process.cwd();
  const languageService = injectLanguageService(language)();
  const llm = injectLLMService({ llmApiKey, model })();
  const graphService = injectGraphService();
  const filesystem = injectFilesystemService();

  return _bumpgen({
    services: { llm, language: languageService, graphService, filesystem },
    args: { projectRoot, packageToUpgrade },
  });
};
