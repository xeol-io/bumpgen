import process from "process";
import { serializeError } from "serialize-error";
import { v4 } from "uuid";

import type { SupportedLanguage } from "./models";
import type { BuildError } from "./models/build";
import type {
  AbstractSyntaxTree,
  BumpgenGraph,
  SerializeableBumpgenGraph,
} from "./models/graph";
import type { DependencyGraphNode } from "./models/graph/dependency";
import type { SupportedModel } from "./models/llm";
import type { PackageUpgrade } from "./models/packages";
import type { FilesystemService } from "./services/filesystem";
import type { GraphService } from "./services/graph";
import type { BumpgenLanguageService } from "./services/language/types";
import type { LLMService } from "./services/llm/types";
import type { MatchingService } from "./services/matching";
import { injectFilesystemService } from "./services/filesystem";
import { injectGraphService } from "./services/graph";
import { injectLanguageService } from "./services/language";
import { injectLLMService } from "./services/llm";
import { injectMatchingService } from "./services/matching";

export { injectGitService } from "./services/git";

export type { SupportedLanguage } from "./models";
export type { SupportedModel } from "./models/llm";
export type {
  BumpgenGraph,
  PlanGraph,
  DependencyGraph,
  SerializeableBumpgenGraph,
} from "./models/graph";
export type { PlanGraphNode, PlanGraphEdge } from "./models/graph/plan";
export type {
  DependencyGraphNode,
  DependencyGraphEdge,
} from "./models/graph/dependency";
export { SupportedModels } from "./models/llm";
export { SupportedLanguages } from "./models";

const makeSerializeableGraph = (
  graph: BumpgenGraph,
): SerializeableBumpgenGraph => {
  return {
    root: graph.root,
    dependency: graph.dependency.export(),
    plan: graph.plan.export(),
  };
};

const bumpFinder = ({
  services,
  args,
}: {
  services: { language: BumpgenLanguageService };
  args: {
    projectRoot: string;
  };
}) => {
  return {
    list: async () => {
      const { language } = services;
      const { projectRoot } = args;
      return await language.packages.upgrade.list(projectRoot);
    },
  };
};

const bumpgen = ({
  services,
  args,
}: {
  services: {
    llm: LLMService;
    language: BumpgenLanguageService;
    graphService: GraphService;
    filesystem: FilesystemService;
    matching: MatchingService;
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
        return await language.packages.upgrade.list(projectRoot);
      },
      apply: async () => {
        const { language } = services;
        const { projectRoot, packageToUpgrade } = args;
        return await language.packages.upgrade.apply(
          projectRoot,
          packageToUpgrade,
        );
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
            const referencedImports =
              graphService.dependency.getReferencingNodes(dependencyGraph, {
                id: node.id,
                relationships: ["importDeclaration"],
              });

            if (
              referencedImports.some((n) =>
                language.graph.dependency.isImportedFromExternalPackage(
                  n,
                  packageToUpgrade.packageName,
                ),
              ) ||
              language.graph.dependency.isImportedFromExternalPackage(
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

        // all externally caused errors should be resolved before
        // we move on to internally caused errors
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
        execute: async (graph: BumpgenGraph, temperature: number) => {
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

          const depGraphNode = graphService.dependency.getNodeById(
            graph.dependency,
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

          const externalImportContext = importContext
            // we add the depGraph node since it might itself be an import node
            // and we need it as external context, if it's not an import node
            // it will be filtered out here
            .concat(depGraphNode)
            .filter(
              (
                node,
              ): node is DependencyGraphNode & {
                external: NonNullable<DependencyGraphNode["external"]>;
              } =>
                language.graph.dependency.isImportedFromExternalPackage(
                  node,
                  packageToUpgrade.packageName,
                ),
            )
            .map((node) => {
              return {
                ...node,
                typeSignature: language.graph.getTypeSignature(graph.ast, node),
              };
            });

          const { replacements, commitMessage } =
            await llm.codeplan.getReplacements(
              {
                currentPlanNode: planNode,
                importContext,
                externalImportContext,
                spatialContext,
                temporalContext,
                bumpedPackage: packageToUpgrade.packageName,
              },
              temperature,
            );

          if (replacements.length > 0) {
            let fileContents = await services.filesystem.read(planNode.path);

            for (const replacement of replacements) {
              fileContents = services.matching.replacements.fuzzy({
                content: fileContents,
                oldCode: replacement.oldCode,
                newCode: replacement.newCode,
              });
            }

            const originalSignature = planNode.typeSignature;

            await services.filesystem.write(planNode.path, fileContents);

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

  const execute = async function* (options?: {
    maxIterations?: number;
    timeout?: number;
  }) {
    let id;
    try {
      id = v4();
      yield {
        type: "upgrade.apply" as const,
        status: "started" as const,
        id,
      };
      const applied = await bumpgen.upgrade.apply();
      yield {
        type: "upgrade.apply" as const,
        status: "finished" as const,
        data: applied,
        id,
      };
      let iteration = 0;
      const startedAt = Date.now();

      const maxIterations = options?.maxIterations ?? 20;
      const timeout = options?.timeout ?? 1000 * 60 * 10;

      let errors;
      do {
        id = v4();
        yield {
          id,
          type: "build.getErrors" as const,
          status: "started" as const,
        };
        errors = await bumpgen.build.getErrors();
        yield {
          id,
          type: "build.getErrors" as const,
          status: "finished" as const,
          data: errors,
        };

        id = v4();
        yield {
          id,
          type: "graph.initialize" as const,
          status: "started" as const,
        };
        const graph = bumpgen.graph.initialize(errors);
        yield {
          id,
          type: "graph.initialize" as const,
          status: "finished" as const,
          data: graph,
        };

        while (!bumpgen.graph.plan.isComplete(graph)) {
          id = v4();
          yield {
            id,
            type: "graph.plan.execute" as const,
            status: "started" as const,
          };
          const iterationResult = await bumpgen.graph.plan.execute(
            graph,
            Math.min(
              iteration > maxIterations / 2
                ? 0.2 * Math.exp(0.3 * (iteration - maxIterations / 2))
                : 0.2,
              2,
            ),
          );
          if (!iterationResult) {
            break;
          }
          yield {
            id,
            type: "graph.plan.execute" as const,
            status: "finished" as const,
            data: {
              graph,
              iterationResult,
            },
          };
        }

        iteration += 1;
      } while (
        errors.length > 0 &&
        iteration < maxIterations &&
        Date.now() - startedAt < timeout
      );

      if (errors.length > 0) {
        yield {
          type: "failed" as const,
          data: {
            reason:
              iteration >= maxIterations
                ? ("maxIterations" as const)
                : ("timeout" as const),
            errors,
          },
        };
      } else {
        yield {
          type: "complete" as const,
          data: null,
        };
      }
    } catch (e) {
      yield {
        type: "error" as const,
        data: e,
      };
    }
  };

  const executeSerializeable = async function* () {
    for await (const event of execute()) {
      if (event.type === "graph.initialize" && event.status === "finished") {
        yield {
          ...event,
          data: makeSerializeableGraph(event.data),
        };
      } else if (
        event.type === "graph.plan.execute" &&
        event.status === "finished"
      ) {
        yield {
          ...event,
          data: {
            ...event.data,
            graph: makeSerializeableGraph(event.data.graph),
          },
        };
      } else if (event.type === "error") {
        yield {
          ...event,
          data: serializeError(event.data),
        };
      } else {
        yield event;
      }
    }
  };

  return {
    ...bumpgen,
    execute,
    executeSerializeable,
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
  const matching = injectMatchingService();

  return bumpgen({
    services: {
      llm,
      language: languageService,
      graphService,
      filesystem,
      matching,
    },
    args: { projectRoot, packageToUpgrade },
  });
};

export const makeBumpFinder = ({
  language,
  projectRoot,
}: {
  language?: SupportedLanguage;
  projectRoot?: string;
}) => {
  language = language ?? "typescript";
  projectRoot = projectRoot ?? process.cwd();
  const languageService = injectLanguageService(language)();
  return bumpFinder({
    services: { language: languageService },
    args: { projectRoot },
  });
};

export type Bumpgen = ReturnType<typeof makeBumpgen>;
export type BumpgenEvent =
  ReturnType<Bumpgen["execute"]> extends AsyncGenerator<
    infer R,
    unknown,
    unknown
  >
    ? R
    : never;

export type SerializeableBumpgenEvent =
  ReturnType<Bumpgen["executeSerializeable"]> extends AsyncGenerator<
    infer R,
    unknown,
    unknown
  >
    ? R
    : never;
