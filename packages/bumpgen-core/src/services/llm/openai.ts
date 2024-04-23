import type { OpenAI } from "openai";

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
  const importMessages = makeImportContextMessage(importContext);
  return {
    role: "user" as const,
    content: [
      `I'm upgrading the package '${bumpedPackage}' and my code is failing. You might need to modify the code or the imports. Look at the errors below and think step-by-step about what the errors mean and how to fix the code.\n`,
      `<code \n  path="${planNode.path}"\n>`,
    ]
      .concat(importMessages.length ? [...importMessages, "\n"] : [])
      .concat([`${planNode.block}`, "</code>\n"])
      .concat(
        planNode.kind === "seed" && planNode.errorMessages.length > 0
          ? [
              `The block has the following build errors:`,
              "<errors>",
              ...planNode.errorMessages.map((e) => `\n${e.message}\n`),
              "</errors>",
            ]
          : [],
      )
      .join("\n"),
  };
};

const makeExternalDependencyContextMessage = (
  importContext: (DependencyGraphNode & {
    typeSignature: string;
  })[],
) => {
  if (importContext.length === 0) {
    return null;
  }
  if (importContext.map((imp) => imp.typeSignature).join("") === "") {
    return null;
  }

  return {
    role: "user" as const,
    content: [
      ...(importContext.length > 0
        ? [
            `Type signatures for the imports used in the code block:\n`,
            ...importContext.map((imp) => {
              if (imp.typeSignature.length > 0) {
                return `<import \n  statement="${imp.block}"\n>\n${imp.typeSignature}\n</import>`;
              } else {
                return "";
              }
            }),
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
      `<relevant_code \n  type_signature="${context.typeSignature}" \n  relationship="referencedBy" \n  file_path="${context.path}"\n>\n${context.block}\n</relevant_code>`,
    );
  }

  if (relevantMessage.length === 0) {
    return null;
  }

  return {
    role: "user" as const,
    content: `The code-to-edit is referenced by these files:\n${relevantMessage.join(
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

const makeImportContextMessage = (importContext: DependencyGraphNode[]) => {
  return importContext.map((context) => {
    return context.block;
  });
};

export const fitToContext = (
  contextSize: number,
  messages: (Message | null)[],
): Message[] => {
  const remainingBudget =
    contextSize -
    messages.reduce((acc, m) => acc + (m ? m.content.length : 0), 0);

  if (remainingBudget < 0) {
    let charsToRemove = -remainingBudget;

    console.debug(`messages too large, removing ${charsToRemove} characters`);

    // chunking priority order
    const priorityOrder = [4, 1, 2, 3];

    for (const index of priorityOrder) {
      if (charsToRemove <= 0) break;

      const message = messages[index];

      if (!message) continue;

      const currentLength = message.content.length;

      if (currentLength > charsToRemove) {
        message.content = message.content.substring(
          0,
          currentLength - charsToRemove,
        );
        charsToRemove = 0;
      } else {
        charsToRemove -= currentLength;
        messages[index] = null;
      }
    }

    if (charsToRemove > 0) {
      throw new Error("Unable to remove enough characters to meet the budget.");
    }
  }

  return messages.filter(<T>(r: T | null): r is T => !!r);
};

// const makeChangeReasonMessage = (planNode: PlanGraphNode) => {};

export const createOpenAIService = (openai: OpenAI) => {
  return {
    codeplan: {
      getReplacements: async (
        context: LLMContext,
        // externalDependencyContext: {
        //   imports: DependencyGraphNode[];
        //   sourcegraph: ContextSearchResponse["getCodyContext"];
        // },
      ) => {
        const {
          spatialContext,
          temporalContext,
          currentPlanNode,
          importContext,
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
        const externalDependencyMessage =
          makeExternalDependencyContextMessage(importContext);

        const messages = fitToContext(LLM_CONTEXT_SIZE, [
          systemMessage,
          spatialContextMessage,
          temporalContextMessage,
          planNodeMessage,
          externalDependencyMessage,
          finalMessage,
        ]);

        console.log("ChatGPT Message:\n", messages);

        const response = await openai.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages,
          temperature: 0.2,
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
