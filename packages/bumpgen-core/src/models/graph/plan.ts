import type { CodePlanNodeId } from ".";
import type { Replacement } from "../llm";

export type ErrorMessage = {
  message: string;
  line: number;
  column: number;
};

export type PlanGraphEdge = {
  relationship: "referencedBy";
};

export type PlanGraphNode = {
  // a sha1 of the block
  id: CodePlanNodeId;
  // the code block
  block: string;
  // the start line of the code block
  startLine: number;
  // the end line of the code block
  endLine: number;
  // the file path of the code block
  path: string;

  // the status of this plan
  status: "pending" | "completed";

  typeSignature?: string;
} & (
  | {
      kind: "seed";
      errorMessages: ErrorMessage[];
    }
  | {
      kind: "descendant";
      errorMessages?: never;
    }
) &
  (
    | {
        status: "pending";
        replacements?: never;
      }
    | {
        status: "completed";
        replacements: Replacement[] | undefined;
      }
  );
