import { fitToContext } from "./openai";

describe('fitToContext', () => {
  it('should return all messages if they fit within the budget', () => {
    const messages = {
      systemMessage: { role: "system" as const, content: "systemMessage" },
      spatialContextMessage: { role: "system" as const, content: "spatialContextMessage" },
      temporalContextMessage: { role: "system" as const, content: "temporalContextMessage" },
      planNodeMessage: { role: "system" as const, content: "planNodeMessage" },
      externalDependencyMessage: { role: "system" as const, content: "externalDependencyMessage" },
      finalMessage: { role: "system" as const, content: "finalMessage" },
    };

    const result = fitToContext(1000, messages);

    expect(result).toEqual(Object.values(messages));
    expect(result.length).toBe(6);
  });

  it('should handle null values gracefully', () => {
    const messages = {
      systemMessage: { role: "system" as const, content: "systemMessage" },
      spatialContextMessage: null,
      temporalContextMessage: null,
      planNodeMessage: null,
      externalDependencyMessage: null,
      finalMessage: { role: "system" as const, content: "finalMessage" },
    };

    const result = fitToContext(1000, messages);

    expect(result).toEqual([
      { role: "system" as const, content: "systemMessage" },
      { role: "system" as const, content: "finalMessage" }
    ]);
  });

  it('should truncate messages when they exceed the budget', () => {
    const messages = {
      systemMessage: { role: "system" as const, content: "systemMessage" },
      spatialContextMessage: { role: "system" as const, content: "a".repeat(10) },
      temporalContextMessage: {  role: "system" as const,content: "b".repeat(10) },
      planNodeMessage: { role: "system" as const, content: "c".repeat(10) },
      externalDependencyMessage: { role: "system" as const, content: "d".repeat(10) },
      finalMessage: { role: "system" as const, content: "finalMessage" },
    };

    const result = fitToContext(40, messages);

    expect(result.length).toBe(3);
    expect(result[2]?.content).toBe("finalMessage");
    expect(result[1]?.content).toBe("c".repeat(10));
  });

  it('should handle combination of null values and exceeding messages', () => {
    const messages = {
      systemMessage: { role: "system" as const, content: "systemMessage" },
      spatialContextMessage: { role: "system" as const, content: "a".repeat(10) },
      temporalContextMessage: null,
      planNodeMessage: { role: "system" as const, content: "b".repeat(10) },
      externalDependencyMessage: null,
      finalMessage: { role: "system" as const, content: "finalMessage" },
    };

    const result = fitToContext(35, messages);

    expect(result.length).toBe(3);
    expect(result[1]?.content).toBe("b".repeat(10));
  });

  it('should throw an error when it is impossible to reduce the content enough', () => {
    const messages = {
      systemMessage: { role: "system" as const, content: "systemMessage" },
      spatialContextMessage: { role: "system" as const, content: "a".repeat(10) },
      temporalContextMessage: null,
      planNodeMessage: { role: "system" as const, content: "b".repeat(10) },
      externalDependencyMessage: null,
      finalMessage: { role: "system" as const, content: "finalMessage" },
    };

    expect(() => fitToContext(15, messages)).toThrow("Unable to remove enough characters to meet the budget.");
  });
});
