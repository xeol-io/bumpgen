import OpenAI from "openai";

import { createOpenAIService } from "./openai";

export const injectLLMService =
  ({ llmApiKey, model }: { llmApiKey: string; model: "gpt-4-turbo-preview" }) =>
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
