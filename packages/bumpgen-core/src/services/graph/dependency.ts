import type { DirectedGraph } from "graphology";

import type {
  DependencyEdgeType,
  DependencyGraphEdge,
  DependencyGraphNode,
} from "../../models/graph/dependency";

export const createDependencyGraphService = () => {
  // const graph = new DirectedGraph<DependencyGraphNode, DependencyGraphEdge>();
  // let project = new Project({
  //   tsConfigFilePath: `${rootDir}/tsconfig.json`,
  // });

  // const _getFile = (path: string) => {
  //   return project.getSourceFiles().find((sourceFile) => {
  //     return (
  //       sourceFile.getFilePath().replace(rootDir, "").replace(/^\//, "") ===
  //       path
  //     );
  //   });
  // };

  return {
    // getFiles: () => {
    //   return project.getSourceFiles().map((sourceFile) => {
    //     return sourceFile.getFilePath().replace(rootDir, "").replace(/^\//, "");
    //   });
    // },
    // initialize: () => {
    //   console.log("Initializing the dependency graph...");
    //   graph.clear();
    //   const sourceFiles = project.getSourceFiles();

    //   // await parallel(3, sourceFiles, async (sourceFile) => {
    //   sourceFiles.forEach((sourceFile) => {
    //     // console.log("Processing source file:", sourceFile.getFilePath());
    //     const { nodes, edges } = processSourceFile(sourceFile, rootDir);
    //     for (const node of nodes) {
    //       if (!graph.hasNode(node.id)) {
    //         graph.addNode(node.id, node);
    //       }
    //     }
    //     for (const edge of edges) {
    //       if (!graph.hasEdge(edge.nodeFromId, edge.nodeToId)) {
    //         graph.addDirectedEdge(edge.nodeFromId, edge.nodeToId, {
    //           relationship: edge.relationship,
    //         });
    //       }
    //     }
    //   });
    // },
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
      {
        id,
        relationships,
      }: { id: string; relationships: DependencyEdgeType[] },
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
      {
        id,
        relationships,
      }: { id: string; relationships: DependencyEdgeType[] },
    ) => {
      return Array.from(graph.inEdgeEntries(id))
        .filter((edge) => {
          return relationships.includes(edge.attributes.relationship);
        })
        .map((edge) => {
          return graph.getNodeAttributes(edge.target);
        });
    },
    // recompute file will update nodes and edges for a file
    // so that line numbers are correct
    // recomputeFileAfterChange: (
    //   affectedNode: PlanGraphNode,
    //   replacements: Replacement[],
    // ) => {
    //   console.log("recomputing file after change...");
    //   project = new Project({
    //     tsConfigFilePath: `${rootDir}/tsconfig.json`,
    //     skipAddingFilesFromTsConfig: true,
    //   });
    //   project.addSourceFileAtPath(affectedNode.path);
    //   const sourceFile = project.getSourceFile(affectedNode.path);
    //   if (!sourceFile) {
    //     throw new Error("File not found");
    //   }
    //   const { nodes } = processSourceFile(sourceFile, rootDir);
    //   nodes.forEach((node) => {
    //     const oldNode = graph.findNode((n) => n === node.id);
    //     if (!oldNode) {
    //       console.log("old node not found, something in the tree changed");
    //       return;
    //       // throw new Error("old node not found, something in the tree changed");
    //     }
    //     const oldAttrs = graph.getNodeAttributes(oldNode);
    //     graph.updateNode(node.id, () => {
    //       return {
    //         ...node,
    //         edits: [
    //           ...oldAttrs.edits,
    //           ...(node.id === affectedNode.id
    //             ? [
    //                 {
    //                   replacements,
    //                   causedErrors: [],
    //                 },
    //               ]
    //             : []),
    //         ],
    //       };
    //     });
    //   });
    //   console.log("recomputing file after change...done");
    // },
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
      {
        filePath,
        startLine,
        endLine,
      }: { filePath: string; startLine: number; endLine: number },
    ) => {
      return graph
        .filterNodes((_, attrs) => {
          console;
          return (
            attrs.path === filePath &&
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
