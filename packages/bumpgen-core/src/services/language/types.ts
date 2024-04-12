import type { BuildError } from "../../models/build";
import type { BumpgenGraph, DependencyGraph } from "../../models/graph";
import type { PlanGraphNode } from "../../models/graph/plan";
import type { Replacement } from "../../models/llm";

export type BumpgenLanguageService = {
  ast: {
    initialize: (projectRoot: string) => unknown;
  };
  build: {
    getErrors: () => Promise<BuildError[]>;
  };
  graph: {
    initialize: (ast: unknown, projectRoot: string) => DependencyGraph;
    recomputeFileAfterChange: (
      graph: BumpgenGraph,
      affectedNode: PlanGraphNode,
      replacements: Replacement[],
    ) => BumpgenGraph;
  };
};
