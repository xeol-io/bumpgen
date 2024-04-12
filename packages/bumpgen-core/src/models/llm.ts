import { z } from "zod";

import type { DependencyGraphNode } from "./graph/dependency";
import type { PlanGraphNode } from "./graph/plan";

export const ReplacementSchema = z.object({
  oldCode: z.string(),
  newCode: z.string(),
  reason: z.string(),
});

export type LLMContext = {
  bumpedPackage: string;
  importContext: DependencyGraphNode[];
  spatialContext: DependencyGraphNode[];
  temporalContext: PlanGraphNode[];
  currentPlanNode: PlanGraphNode;
};

export type Replacement = z.infer<typeof ReplacementSchema>;

export const ReplacementsResultSchema = z.object({
  replacements: z.array(ReplacementSchema),
  commitMessage: z.string(),
});

export type ReplacementsResult = z.infer<typeof ReplacementsResultSchema>;
