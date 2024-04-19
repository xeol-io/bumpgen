import type { CodePlanNodeId } from ".";
import type { Replacement } from "../llm";

export type DependencyGraphNode = {
  id: CodePlanNodeId;
  block: string;
  kind: string;
  name: string;
  typeSignature?: string;
  path: string;
  startLine: number;
  endLine: number;
  edits: {
    replacements: Replacement[];
    causedErrors: string[];
  }[];
};

export type Relationship = "referencedBy" | "importDeclaration";

export type DependencyGraphEdge = {
  source: CodePlanNodeId;
  target: CodePlanNodeId;
  relationship: Relationship;
};
