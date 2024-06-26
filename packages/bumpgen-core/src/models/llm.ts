import { z } from "zod";

import type { DependencyGraphNode } from "./graph/dependency";
import type { PlanGraphNode } from "./graph/plan";

export const SupportedModels = ["gpt-4-turbo-preview"] as const;

export type SupportedModel = (typeof SupportedModels)[number];

export const ReplacementSchema = z.object({
  oldCode: z.string(),
  newCode: z.string(),
  reason: z.string(),
});

export type LLMContext = {
  bumpedPackage: string;
  importContext: DependencyGraphNode[];
  externalImportContext: (DependencyGraphNode & {
    typeSignature: string;
    external: NonNullable<DependencyGraphNode["external"]>;
  })[];
  spatialContext: (DependencyGraphNode & {
    typeSignature: string;
  })[];
  temporalContext: PlanGraphNode[];
  currentPlanNode: PlanGraphNode;
};

export type Replacement = z.infer<typeof ReplacementSchema>;

export const ReplacementsResultSchema = z.object({
  replacements: z.array(ReplacementSchema),
  commitMessage: z.string(),
});

export type ReplacementsResult = z.infer<typeof ReplacementsResultSchema>;
