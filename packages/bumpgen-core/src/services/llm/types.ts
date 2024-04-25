import type { LLMContext, ReplacementsResult } from "../../models/llm";

export type LLMService = {
  codeplan: {
    getReplacements: (
      context: LLMContext,
      temperature: number
    ) => Promise<ReplacementsResult>;
  };
};
