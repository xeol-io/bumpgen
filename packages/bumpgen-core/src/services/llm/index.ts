import OpenAI from "openai";

import type { SupportedModel } from "../../models/llm";
import { createOpenAIService } from "./openai";

export const injectLLMService =
  ({ llmApiKey, model }: { llmApiKey: string; model: SupportedModel }) =>
  () => {
    if (model === "gpt-4-turbo-preview") {
      const openai = new OpenAI({
        apiKey: llmApiKey,
      });

      return createOpenAIService(openai);
    } else {
      throw new Error("Model not supported");
    }
  };
