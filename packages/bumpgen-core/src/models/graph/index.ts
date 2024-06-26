import type { DirectedGraph } from "graphology";

import type { DependencyGraphEdge, DependencyGraphNode } from "./dependency";
import type { PlanGraphEdge, PlanGraphNode } from "./plan";

export type CodePlanNodeId = string; // TODO: define a narrower type (either branding or structuring)

export type DependencyGraph = DirectedGraph<
  DependencyGraphNode,
  DependencyGraphEdge
>;
export type PlanGraph = DirectedGraph<PlanGraphNode, PlanGraphEdge>;

export type AbstractSyntaxTree<TAst = unknown> = {
  source: string;
  tree: TAst;
};

export type BumpgenGraph<TAst = unknown> = {
  root: string;
  dependency: DependencyGraph;
  plan: PlanGraph;
  ast: AbstractSyntaxTree<TAst>;
};

export type SerializeableBumpgenGraph = {
  root: string;
  dependency: ReturnType<DependencyGraph["export"]>;
  plan: ReturnType<PlanGraph["export"]>;
};
