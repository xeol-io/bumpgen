import path from "path";
import type { DirectedGraph } from "graphology";

import type {
  DependencyGraphEdge,
  DependencyGraphNode,
  Relationship,
} from "../../models/graph/dependency";

export const createDependencyGraphService = () => {
  return {
    getNodesByBlock: (
      graph: DirectedGraph<DependencyGraphNode, DependencyGraphEdge>,
      { block }: { block: string },
    ) => {
      return graph
        .nodes()
        .map((node) => graph.getNodeAttributes(node))
        .filter((node) => node.block === block);
    },
    getReferencingNodes: (
      graph: DirectedGraph<DependencyGraphNode, DependencyGraphEdge>,
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
      graph: DirectedGraph<DependencyGraphNode, DependencyGraphEdge>,
      { id, relationships }: { id: string; relationships: Relationship[] },
    ) => {
      return Array.from(graph.inEdgeEntries(id))
        .filter((edge) => {
          return relationships.includes(edge.attributes.relationship);
        })
        .map((edge) => {
          return graph.getNodeAttributes(edge.target);
        });
    },
    getNodeById: (
      graph: DirectedGraph<DependencyGraphNode, DependencyGraphEdge>,
      { id }: { id: string },
    ) => {
      return graph.getNodeAttributes(id);
    },
    getNodes: (
      graph: DirectedGraph<DependencyGraphNode, DependencyGraphEdge>,
    ) => {
      return graph.nodes().map((node) => graph.getNodeAttributes(node));
    },
    getNodesInFile: (
      graph: DirectedGraph<DependencyGraphNode, DependencyGraphEdge>,
      { filePath }: { filePath: string },
    ) => {
      return graph
        .filterNodes((_, attrs) => {
          return attrs.path === filePath;
        })
        .map((node) => graph.getNodeAttributes(node));
    },
    getNodesInFileWithinRange: (
      graph: DirectedGraph<DependencyGraphNode, DependencyGraphEdge>,
      projectRoot: string,
      {
        filePath,
        startLine,
        endLine,
      }: { filePath: string; startLine: number; endLine: number },
    ) => {
      const fullPath = path.join(projectRoot, filePath);
      return graph
        .filterNodes((_, attrs) => {
          return (
            attrs.path === fullPath &&
            attrs.startLine <= startLine &&
            attrs.endLine >= endLine
          );
        })
        .map((node) => graph.getNodeAttributes(node));
    },
  };
};

export const injectDependencyGraphService = () => {
  return createDependencyGraphService();
};

export type DependencyGraphService = ReturnType<
  typeof createDependencyGraphService
>;
