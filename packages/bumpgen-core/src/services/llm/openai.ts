import type { OpenAI } from "openai";
import { unique } from "radash";

// import type { ContextSearchResponse } from "../../clients/sourcegraph/responses";
import type { DependencyGraphNode } from "../../models/graph/dependency";
import type { PlanGraphNode } from "../../models/graph/plan";
import type { LLMContext } from "../../models/llm";
import type { LLMService } from "./types";
import { ReplacementsResultSchema } from "../../models/llm";

const LLM_CONTEXT_SIZE = 56_000;

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const makePlanNodeMessage = (
  planNode: PlanGraphNode,
  importContext: DependencyGraphNode[],
  bumpedPackage: string,
) => {
  const importMessages = unique(
    importContext.map((context) => {
      return context.block;
    }),
  );
  return {
    role: "user" as const,
    content: [
      `I'm upgrading the package '${bumpedPackage}' and my code is failing. You might need to modify the code or the imports. Look at the errors below and think step-by-step about what the errors mean and how to fix the code.\n`,
      `<relevant_imports path=${planNode.path}>\n${importMessages.join("\n")}\n</relevant_imports>`,
      `<code \n  path="${planNode.path}"\n>`,
      `${planNode.block}`,
      "</code>\n",
      ...(planNode.kind === "seed" && planNode.errorMessages.length > 0
        ? [
            `The block has the following build errors:`,
            "<errors>",
            ...planNode.errorMessages.map((e) => `\n${e.message}\n`),
            "</errors>",
          ]
        : []),
    ].join("\n"),
  };
};

const makeExternalDependencyContextMessage = (
  pkg: string,
  importContext: (DependencyGraphNode & {
    typeSignature: string;
  })[],
) => {
  const typeSignatures = importContext
    .filter((imp) => imp.typeSignature !== "")
    .map((imp) => {
      return `<import \n  statement="${imp.block}"\n>\n${imp.typeSignature}\n</import>`;
    });

  const exports = importContext
    .filter(
      (
        imp,
      ): imp is DependencyGraphNode & {
        typeSignature: string;
        external: NonNullable<DependencyGraphNode["external"]>;
      } => !!imp.external,
    )
    .flatMap((imp) => {
      return imp.external.exports.map((exp) => {
        return exp;
      });
    });

  if (typeSignatures.length === 0 && exports.length === 0) {
    return null;
  }

  return {
    role: "user" as const,
    content: [
      ...(typeSignatures.length > 0
        ? [
            `Type signatures for the ${pkg} imports used in the code block:\n`,
            ...typeSignatures,
          ]
        : []),
      ...(exports.length > 0
        ? [
            `The imported ${pkg} module(s) contain the following exports:`,
            `<exports>\n${exports.join("\n")}\n</exports>`,
          ]
        : []),
    ].join("\n"),
  };
};

const makeSpatialContextMessage = (
  spatialContext: (DependencyGraphNode & {
    typeSignature: string;
  })[],
) => {
  const relevantMessage: string[] = [];

  for (const context of spatialContext) {
    relevantMessage.push(
      `<relevant_code \n  typeSignature="${context.typeSignature} \n  "relationship="references" \n  file_path="${context.path}"\n>\n${context.block}\n</relevant_code>`,
    );
  }

  if (relevantMessage.length === 0) {
    return null;
  }

  return {
    role: "user" as const,
    content: `The code-to-edit makes reference to these other code blocks:\n${relevantMessage.join(
      "\n",
    )}`,
  };
};

const makeTemporalContextMessage = (temporalContext: PlanGraphNode[]) => {
  const editedFiles = temporalContext
    .map((node) => {
      if (!node.replacements) {
        return undefined;
      }
      const diff: string[] = [];
      for (const replacement of node.replacements) {
        const oldCodeLines = replacement.oldCode
          .split("\n")
          .map((line) => `- ${line}`);
        const newCodeLines = replacement.newCode
          .split("\n")
          .map((line) => `+ ${line}`);

        diff.push(
          [
            `# Description of Change: ${replacement.reason}`,
            ...oldCodeLines,
            ...newCodeLines,
          ].join("\n"),
        );
      }

      return `
      <changed_code \n  file_path="${node.path}">${diff.join("\n")}</changed_code>`;
    })
    .filter(<T>(r: T | undefined): r is T => !!r);

  if (editedFiles.length === 0) {
    return null;
  }

  return {
    role: "user" as const,
    content: `You have previously made these code changes:\n${editedFiles.join(
      "\n",
    )}`,
  };
};

export const fitToContext = (
  contextSize: number,
  messages: Record<string, Message | null>,
): Message[] => {
  let totalContentLength = 0;
  Object.values(messages).forEach((m) => {
    if (m) totalContentLength += m.content.length;
  });

  let remainingBudget = contextSize - totalContentLength;

  if (remainingBudget < 0) {
    console.debug(
      `messages too large, removing ${-remainingBudget} characters`,
    );

    // top of the list is least important context
    const priorityOrder = [
      "externalDependencyMessage",
      "temporalContextMessage",
      "spatialContextMessage",
      "planNodeMessage",
    ];

    for (const key of priorityOrder) {
      if (remainingBudget >= 0) break;

      const message = messages[key];
      if (!message) continue;

      const lines = message.content.split("\n");
      while (lines.length > 0 && remainingBudget < 0) {
        const lastLine = lines.pop();
        remainingBudget += lastLine ? lastLine.length + 1 : 0;
      }

      message.content = lines.join("\n");
      if (message.content.length === 0) {
        messages[key] = null;
      }
    }

    if (remainingBudget < 0) {
      throw new Error("Unable to remove enough characters to meet the budget.");
    }
  }

  return Object.values(messages).filter(
    (message): message is Message => message !== null,
  );
};

export const createOpenAIService = (openai: OpenAI) => {
  return {
    codeplan: {
      getReplacements: async (context: LLMContext, temperature: number) => {
        const {
          spatialContext,
          temporalContext,
          currentPlanNode,
          importContext,
          externalImportContext,
          bumpedPackage,
        } = context;

        const systemMessage = {
          role: "system" as const,
          content: [
            `You are a seasoned software engineer assigned to resolve an issue in a TypeScript file related to an '${bumpedPackage}' upgrade. You will receive a specific code block, its context, and the revision history. Your task is to correct errors in the code block under the following constraints.`,
            "\n",
            "- Preserve the original behavior without introducing functional changes.",
            "- Maintain all hardcoded values as is.",
            "- Avoid adding comments within the code.",
            "- Refrain from using explicit type casting.",
            "- Only show the specific lines of code that have been changed or need modification, without including unchanged surrounding code.",
            "- Keep all existing variable, function, and class names unchanged.",
          ].join("\n"),
        };
        const finalMessage = {
          role: "user" as const,
          content:
            "First, think step-by-step about the errors given, and then use the update_code function to fix the code block.",
        };
        const spatialContextMessage = makeSpatialContextMessage(spatialContext);
        const temporalContextMessage =
          makeTemporalContextMessage(temporalContext);
        const planNodeMessage = makePlanNodeMessage(
          currentPlanNode,
          importContext,
          bumpedPackage,
        );
        const externalDependencyMessage = makeExternalDependencyContextMessage(
          bumpedPackage,
          externalImportContext,
        );

        const messages = fitToContext(LLM_CONTEXT_SIZE, {
          systemMessage: systemMessage,
          spatialContextMessage: spatialContextMessage,
          temporalContextMessage: temporalContextMessage,
          planNodeMessage: planNodeMessage,
          externalDependencyMessage: externalDependencyMessage,
          finalMessage: finalMessage,
        });

        console.log("OpenAI Messages:\n", messages);

        const response = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages,
          temperature,
          tools: [
            {
              type: "function",
              function: {
                name: "update_code",
                description: "Update the code to fix the code block",
                parameters: {
                  type: "object",
                  properties: {
                    replacements: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["oldCode", "newCode", "reason"],
                        properties: {
                          oldCode: {
                            type: "string",
                            description:
                              "The old lines of code. Be sure to add lines before and after to disambiguate the change.",
                          },
                          newCode: {
                            type: "string",
                            description:
                              "The new lines of code to replace oldCode in the block. This MUST be different from the code being replaced.",
                          },
                          reason: {
                            type: "string",
                            description:
                              "A brief explanation of the change. Please describe the class, function, or variable that the change is related to.",
                          },
                        },
                      },
                      description:
                        "An array of code sections to update in the block. If there are no changes to be made, this array MUST be empty.",
                    },
                    commitMessage: {
                      type: "string",
                      description:
                        "A short commit message representing the change, using conventional commit format.",
                    },
                  },
                  required: ["replacements", "commitMessage"],
                },
              },
            },
          ],
        });

        if (!response.choices[0]?.message?.tool_calls?.[0]) {
          console.debug("No tool call in OpenAI response");
          return {
            replacements: [],
            commitMessage: "No changes needed",
          };
        }

        const rawJson = JSON.parse(
          response.choices[0].message.tool_calls[0].function.arguments,
        ) as unknown;
        const parsed = ReplacementsResultSchema.safeParse(rawJson);

        if (!parsed.success) {
          console.log(
            response.choices[0].message.tool_calls[0].function.arguments,
          );
          console.debug("Invalid response from OpenAI: ", parsed.error);
          return {
            replacements: [],
            commitMessage: "No valid changes provided",
          };
        }

        console.log("ChatGPT Response:\n", parsed.data);

        return parsed.data;
      },
    },
  } satisfies LLMService;
};

export type OpenAIService = ReturnType<typeof createOpenAIService>;
