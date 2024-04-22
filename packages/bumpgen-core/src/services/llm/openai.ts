import type { OpenAI } from "openai";

// import type { ContextSearchResponse } from "../../clients/sourcegraph/responses";
import type { DependencyGraphNode } from "../../models/graph/dependency";
import type { PlanGraphNode } from "../../models/graph/plan";
import type { LLMContext } from "../../models/llm";
import type { LLMService } from "./types";
import { ReplacementsResultSchema } from "../../models/llm";

const LLM_CONTEXT_SIZE = 28_000;

interface Message {
  role: string;
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
      `I'm upgrading ${bumpedPackage} and my code is failing. You are tasked with fixing the following code block if there is a problem with it. You might need to change the code or the imports, depending on the error message. If there is no related error message, don't make a change unless you absolutely need to!\n`,
      `<code path="${planNode.path}" type_signature=${planNode.typeSignature}>`,
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
  bumpedPackage: string,
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
            `Type signatures for the imports from ${bumpedPackage}:\n`,
            ...importContext.map(
              (imp) =>
                `<import statement=${imp.block}>${imp.typeSignature}</import>`,
            ),
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
      `<relevant_code type_signature="${context.typeSignature}" relationship="referencedBy" file_path="${context.path}">\n${context.block}\n</relevant_code>`,
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
      <changed_code file_path="${node.path}">${diff.join("\n")}</changed_code>`;
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

const checkBudget = (
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  budget: number = LLM_CONTEXT_SIZE,
) => {
  const remaining =
    budget - messages.reduce((acc, m) => acc + m.content.length, 0);
  if (remaining < 0) {
    throw new Error("The messages are too large");
  }
  return remaining;
};

const makeImportContextMessage = (importContext: DependencyGraphNode[]) => {
  return importContext.map((context) => {
    return context.block;
  });
};

// TODO: make it smarter based on relevance of messages
export const fitToContext = (remainingBudget: number, messages: Message[]) => {
  let charsToRemove = -remainingBudget;

  // chunking priority order
  const priorityOrder = [1, 2, 3, 0, 4];

  for (const index of priorityOrder) {
      if (charsToRemove <= 0) break;
  
      const message = messages[index];

      if (!message) continue; 

      let currentLength = message.content.length;
  
      if (currentLength > charsToRemove) {
          message.content = message.content.substring(0, currentLength - charsToRemove);
          charsToRemove = 0;
      } else {
          charsToRemove -= currentLength;
          message.content = '';
      }
  }

  if (charsToRemove > 0) {
    console.debug('Unable to remove enough characters to meet the budget.');
  }
}

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
            `You are an expert software engineer tasked with fixing a code block in a typescript file. We're trying to upgrade ${bumpedPackage} and the code is failing, You will be provided with a block of code-to-edit, the context of the code block, and the history of changes so far.\n`,
            "Think through step-by-step to fix the code block if it needs to be fixed",
            "- Do not make any behavioral changes to the code, only fix the errors while preserving existing behavior",
            "- Do not change any hardcoded values in the code",
            "- Do not add comments to the code",
            "- Never explicitly cast types",
            "- Do not change the imports unless there is an error message related to an import",
            "- Do not change the name of any variables, functions, or classes",
            "- You can assume that the code block is part of a larger codebase and that the code is correct except for the errors provided",
          ].join("\n"),
        };
        const finalMessage = {
          role: "user" as const,
          content:
            "Given the above information, use the update_code function to fix the code block. If there are no changes to be made, use the update_code function to return an empty array of replacements.",
        };
  
        const spatialContextMessage = makeSpatialContextMessage(spatialContext);
        const temporalContextMessage = makeTemporalContextMessage(temporalContext);
        const planNodeMessage = makePlanNodeMessage(
          currentPlanNode,
          importContext,
          bumpedPackage,
        );
        const externalDependencyMessage = makeExternalDependencyContextMessage(
          importContext,
          bumpedPackage,
        );

        const messages = [
          systemMessage,
          spatialContextMessage,
          temporalContextMessage,
          planNodeMessage,
          externalDependencyMessage,
          finalMessage,
        ].filter(<T>(r: T | null): r is T => !!r);

        const remaining = checkBudget(messages, LLM_CONTEXT_SIZE);

        if (remaining < 0) {
          fitToContext(remaining, messages);
        }

        console.debug("Remaining budget", remaining);

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
          throw new Error("No tool called in OpenAI response");
        }

        const rawJson = JSON.parse(
          response.choices[0].message.tool_calls[0].function.arguments,
        ) as unknown;
        const parsed = ReplacementsResultSchema.safeParse(rawJson);

        if (!parsed.success) {
          console.log(
            response.choices[0].message.tool_calls[0].function.arguments,
          );
          throw new Error("Invalid response from OpenAI", parsed.error);
        }

        return parsed.data;
      },
    },
  } satisfies LLMService;
};

export type OpenAIService = ReturnType<typeof createOpenAIService>;
