import type { CodePlanNodeId } from ".";
import type { Replacement } from "../llm";

export type KnownKind = "CallExpression" | "TypeReference" | "NewExpression";

export type DependencyGraphNode = {
  id: CodePlanNodeId;
  block: string;
  kind: KnownKind;
  name: string;
  typeSignature: string;
  path: string;
  startLine: number;
  endLine: number;
  edits: {
    replacements: Replacement[];
    causedErrors: string[];
  }[];
};

export const DependencyEdgeTypes = [
  "referencedBy",
  "importDeclaration",
] as const;
export type DependencyEdgeType = (typeof DependencyEdgeTypes)[number];

export type DependencyGraphEdge = {
  relationship: DependencyEdgeType;
};

export type Edge = {
  nodeFromId: CodePlanNodeId;
  nodeToId: CodePlanNodeId;
  relationship: DependencyEdgeType;
};
