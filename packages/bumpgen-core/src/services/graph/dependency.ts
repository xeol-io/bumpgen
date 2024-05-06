import path from "path";
import { unique } from "radash";

import type { DependencyGraph } from "../../models/graph";
import type { Kind, Relationship } from "../../models/graph/dependency";

export const createDependencyGraphService = () => {
  return {
    getNodesByBlock: (graph: DependencyGraph, { block }: { block: string }) => {
      return graph
        .nodes()
        .map((node) => graph.getNodeAttributes(node))
        .filter((node) => node.block === block);
    },
    getReferencingNodes: (
      graph: DependencyGraph,
      { id, relationships }: { id: string; relationships: Relationship[] },
    ) => {
      return Array.from(graph.outEdgeEntries(id))
        .filter((edge) => {
          return relationships.includes(edge.attributes.relationship);
        })
        .map((edge) => {
          return graph.getNodeAttributes(edge.target);
        });
    },
    getContextsForNodeById: (
      graph: DependencyGraph,
      { id, relationships }: { id: string; relationships: Relationship[] },
    ) => {
      return unique(
        Array.from(graph.inEdgeEntries(id))
          .filter((edge) => {
            return relationships.includes(edge.attributes.relationship);
          })
          .filter((edge) => {
            return edge.source === edge.target;
          })
          .map((edge) => {
            return graph.getNodeAttributes(edge.target);
          }),
        (s) => s.block,
      );
    },
    getNodeById: (graph: DependencyGraph, { id }: { id: string }) => {
      return graph.getNodeAttributes(id);
    },
    getNodes: (
      graph: DependencyGraph,
      projectRoot: string,
      {
        filePath,
        startLine,
        endLine,
        kinds,
      }: {
        filePath?: string;
        startLine?: number;
        endLine?: number;
        kinds?: Kind[];
      },
    ) => {
      const fullPath = filePath
        ? filePath.startsWith(projectRoot)
          ? filePath
          : path.join(projectRoot, filePath)
        : null;
      return graph
        .filterNodes((_, attrs) => {
          return (
            (fullPath ? attrs.path === fullPath : true) &&
            (startLine ? attrs.startLine <= startLine : true) &&
            (endLine ? attrs.endLine >= endLine : true) &&
            (kinds ? kinds.includes(attrs.kind) : true)
          );
        })
        .map((node) => graph.getNodeAttributes(node))
        .sort((a, b) => a.startLine - b.startLine);
    },
  };
};

export const injectDependencyGraphService = () => {
  return createDependencyGraphService();
};

export type DependencyGraphService = ReturnType<
  typeof createDependencyGraphService
>;
