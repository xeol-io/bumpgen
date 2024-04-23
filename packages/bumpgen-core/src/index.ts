import process from "process";

import type { SupportedLanguage } from "./models";
import type { BuildError } from "./models/build";
import type { AbstractSyntaxTree, BumpgenGraph } from "./models/graph";
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

export type { SupportedLanguage } from "./models";
export type { SupportedModel } from "./models/llm";
export { SupportedModels } from "./models/llm";
export { SupportedLanguages } from "./models";

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
    ast: AbstractSyntaxTree,
    node: DependencyGraphNode,
    existingNodes: Map<
      string,
      Parameters<typeof services.graphService.plan.initialize>[0][number]
    >,
    err: BuildError,
  ) => {
    const { language } = services;
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
        typeSignature: language.graph.getTypeSignature(ast, node),
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
      initialize: (errs: BuildError[]): BumpgenGraph => {
        const { language, graphService } = services;
        const { packageToUpgrade, projectRoot } = args;
        const ast = language.ast.initialize(args.projectRoot);

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
            graphService.dependency.getNodesInFileWithinRange(
              dependencyGraph,
              projectRoot,
              {
                filePath: err.path,
                startLine: err.line,
                endLine: err.line,
              },
            );

          if (affectedNodes.length === 0) {
            console.debug(
              "ERROR_NO_NODES_FOR_ERROR: No affected nodes found for error - ",
              err,
            );
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
                ast,
                node,
                externallyCausedPlanGraphNodes,
                err,
              );
            } else {
              createOrUpdatePlanGraphNode(
                ast,
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
          root: args.projectRoot,
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
          const { llm, graphService, language } = services;
          const { packageToUpgrade } = args;
          const planNode = graphService.plan.nodes.nextPending(graph.plan);

          if (!planNode) {
            return null;
          }

          const spatialContext = graphService.dependency
            .getContextsForNodeById(graph.dependency, {
              id: planNode.id,
              relationships: ["referencedBy"],
            })
            .map((node) => {
              return {
                ...node,
                typeSignature: language.graph.getTypeSignature(graph.ast, node),
              };
            });

          const temporalContext = graphService.plan.node.getContext(
            graph.plan,
            {
              id: planNode.id,
            },
          );
          const importContext = graphService.dependency
            .getReferencingNodes(graph.dependency, {
              id: planNode.id,
              relationships: ["importDeclaration"],
            })
            .map((node) => {
              return {
                ...node,
                typeSignature: language.graph.getTypeSignature(graph.ast, node),
              };
            });

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
            const newFileContents = replacements.reduce((acc, replacement) => {
              const beforeReplace = acc;
              const afterReplace = acc.replace(
                replacement.oldCode,
                replacement.newCode,
              );
              if (beforeReplace === afterReplace) {
                console.log(
                  `ERROR_REPLACEMENTS: Replacement did not match - ${replacement.oldCode} -> ${replacement.newCode}`,
                );
              }
              return afterReplace;
            }, fileContents);

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

            if (
              originalSignature !==
              services.language.graph.getTypeSignature(
                graph.ast,
                newDepGraphNode,
              )
            ) {
              const affectedNodes = graphService.dependency.getReferencingNodes(
                graph.dependency,
                { id: planNode.id, relationships: ["referencedBy"] },
              );

              affectedNodes.forEach((node) => {
                graphService.plan.addObligation(graph.plan, {
                  depGraphNode: {
                    ...node,
                    typeSignature: services.language.graph.getTypeSignature(
                      graph.ast,
                      node,
                    ),
                  },
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
