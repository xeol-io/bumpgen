import { DirectedGraph } from "graphology";
import { Project } from "ts-morph";

import type { BumpgenGraph } from "../../../models/graph";
import type {
  DependencyGraphEdge,
  DependencyGraphNode,
} from "../../../models/graph/dependency";
import type { PlanGraphNode } from "../../../models/graph/plan";
import type { Replacement } from "../../../models/llm";
import type { BumpgenLanguageService } from "../types";
import { processSourceFile } from "./process";

export const makeTypescriptService = () => {
  return {
    build: {
      getErrors: async () => {
        return Promise.resolve([]);
      },
    },
    ast: {
      initialize: (projectRoot: string) => {
        const project = new Project({
          tsConfigFilePath: `${projectRoot}/tsconfig.json`,
        });

        return project;
      },
    },
    graph: {
      dependency: {
        initialize: (project: unknown) => {
          console.log("Initializing the dependency graph...");

          if (!(project instanceof Project)) {
            throw new Error("Invalid project type");
          }

          const graph = new DirectedGraph<
            DependencyGraphNode,
            DependencyGraphEdge
          >();
          const sourceFiles = project.getSourceFiles();

          sourceFiles.forEach((sourceFile) => {
            const { nodes, edges } = processSourceFile(sourceFile);
            for (const node of nodes) {
              if (!graph.hasNode(node.id)) {
                graph.addNode(node.id, node);
              }
            }
            for (const edge of edges) {
              if (!graph.hasEdge(edge.source, edge.target)) {
                graph.addDirectedEdge(edge.source, edge.target, edge);
              }
            }
          });
          return graph;
        },
      },
      //  recompute file will update nodes and edges for a file
      // so that line numbers are correct
      recomputeFileAfterChange: (
        graph: BumpgenGraph,
        affectedNode: PlanGraphNode,
        replacements: Replacement[],
      ) => {
        if (!(graph.ast instanceof Project)) {
          throw new Error("Invalid project type");
        }

        const sourceFile = graph.ast.getSourceFile(affectedNode.path);
        if (!sourceFile) {
          throw new Error("File not found");
        }
        const removed = graph.ast.removeSourceFile(sourceFile);
        if (!removed) {
          throw new Error("File not removed");
        }

        const newSourceFile = graph.ast.addSourceFileAtPath(affectedNode.path);
        const { nodes } = processSourceFile(newSourceFile);

        nodes.forEach((node) => {
          const oldNode = graph.dependency.findNode((n) => n === node.id);
          if (!oldNode) {
            console.log("old node not found, something in the tree changed");
            return;
          }
          const oldAttrs = graph.dependency.getNodeAttributes(oldNode);
          graph.dependency.updateNode(node.id, () => {
            return {
              ...node,
              edits: [
                ...oldAttrs.edits,
                ...(node.id === affectedNode.id
                  ? [
                      {
                        replacements,
                        causedErrors: [],
                      },
                    ]
                  : []),
              ],
            };
          });
        });
        return graph;
      },
    },
  } satisfies BumpgenLanguageService;
};

export const injectTypescriptService = () => {
  return makeTypescriptService();
};

export type TypescriptService = ReturnType<typeof makeTypescriptService>;
