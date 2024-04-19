import type { SyntaxKind } from "ts-morph";

import type { CodePlanNodeId } from ".";
import type { Replacement } from "../llm";

export type DependencyGraphNode = {
  id: CodePlanNodeId;
  block: string;
  kind: Kind;
  name: string;
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

export type Kind = keyof typeof SyntaxKind;
