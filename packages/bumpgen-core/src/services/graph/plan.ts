import { DirectedGraph } from "graphology";
import { topologicalSort, willCreateCycle } from "graphology-dag";
import { subgraph } from "graphology-operators";
import { bfsFromNode } from "graphology-traversal";

import type { CodePlanNodeId, PlanGraph } from "../../models/graph";
import type { DependencyGraphNode } from "../../models/graph/dependency";
import type {
  ErrorMessage,
  PlanGraphEdge,
  PlanGraphNode,
} from "../../models/graph/plan";

export const createPlanGraphService = () => {
  return {
    initialize: (
      seeds: (Omit<PlanGraphNode, "status" | "kind" | "replacements"> & {
        errorMessages: ErrorMessage[];
      })[],
    ): PlanGraph => {
      // initalizing the plan graph adds "seeds" as root nodes in the DAG.
      // seeds are the starting point of an upgrade task, and are dervied from
      // type errors immediately after upgrading a major package version
      const planGraph = new DirectedGraph<PlanGraphNode, PlanGraphEdge>();

      seeds.forEach((seed) => {
        planGraph.addNode(seed.id, {
          ...seed,
          kind: "seed",
          status: "pending",
        });
      });

      return planGraph;
    },
    addObligation: (
      graph: PlanGraph,
      {
        depGraphNode,
        parentID,
      }: {
        depGraphNode: DependencyGraphNode & {
          typeSignature: string;
        };
        parentID: string;
      },
    ) => {
      const id = depGraphNode.id;

      if (willCreateCycle(graph, parentID, id)) {
        throw new Error("Adding this node would create a cycle");
      }

      const planNode = {
        id,
        block: depGraphNode.block,
        startLine: depGraphNode.startLine,
        endLine: depGraphNode.endLine,
        path: depGraphNode.path,
        dependencyGraphNodeId: depGraphNode.id,
        typeSignature: depGraphNode.typeSignature,
        status: "pending" as const,
        kind: "descendant" as const,
      };

      if (!graph.hasNode(id) && !graph.hasEdge(parentID, id)) {
        graph.addNode(id, planNode);
        graph.addEdge(parentID, id, { relationship: "referencedBy" });
      }
    },
    node: {
      get: (
        graph: PlanGraph,
        {
          id,
        }: {
          id: CodePlanNodeId;
        },
      ) => {
        const node = graph.findNode((n) => n === id);
        if (!node) {
          throw new Error(`Node with id ${id} does not exist`);
        }
        return graph.getNodeAttributes(id);
      },
      update: (
        graph: PlanGraph,
        { id, node }: { id: CodePlanNodeId; node: Partial<PlanGraphNode> },
      ) => {
        const existingNode = graph.findNode((n) => n === id);
        if (!existingNode) {
          throw new Error(`Node with id ${id} does not exist`);
        }

        graph.mergeNodeAttributes(id, node);
      },
      getContext: (graph: PlanGraph, { id }: { id: CodePlanNodeId }) => {
        const node = graph.findNode((n) => n === id);
        if (!node) {
          throw new Error(`Node with id ${id} does not exist`);
        }

        const ancestors = new Set<CodePlanNodeId>();

        // These operations are inefficient (we can do this in a single traversal),
        // but the graph is generally not large
        bfsFromNode(
          graph,
          id,
          (_, attrs) => {
            ancestors.add(attrs.id);
          },
          { mode: "outbound" },
        );

        return topologicalSort(subgraph(graph, ancestors))
          .map((id) => graph.getNodeAttributes(id))
          .slice(0, -1);
      },
    },
    nodes: {
      nextPending: (graph: PlanGraph) => {
        return topologicalSort(graph)
          .map((id) => graph.getNodeAttributes(id))
          .find((n) => n.status === "pending");
      },
    },
  };
};

export const injectPlanGraphService = () => {
  return createPlanGraphService();
};

export type PlanGraphService = ReturnType<typeof injectPlanGraphService>;
