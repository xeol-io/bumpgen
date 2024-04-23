const { fitToContext } = require('./openai.ts');

describe('fitToContext', () => {
  const LLM_CONTEXT_SIZE = 1024;

  it('should return all messages if they fit within the budget', () => {
    const messages = [
      { content: "systemMessage" },
      { content: "spatialContextMessage" },
      { content: "temporalContextMessage" },
      { content: "planNodeMessage" },
      { content: "externalDependencyMessage" },
      { content: "finalMessage" },
    ];
    const result = fitToContext(1000, messages);
    expect(result).toEqual(messages);
    expect(result.length).toBe(6);
  });

  it('should handle null values gracefully', () => {
    const messages = [
      { content: "systemMessage" },
      null,
      null,
      null,
      null,
      { content: "finalMessage" },
    ];
    const result = fitToContext(1000, messages);
    expect(result).toEqual([{ content: "systemMessage" }, { content: "finalMessage" }]);
  });

  it('should truncate messages when they exceed the budget', () => {
    const messages = [
      { content: "systemMessage" },
      { content: "a".repeat(10) },
      { content: "b".repeat(10) },
      { content: "c".repeat(10) },
      { content: "d".repeat(10) },
      { content: "finalMessage" },
    ];
    const result = fitToContext(50, messages);
    expect(result.length).toBe(5);
    expect(result[4]).toStrictEqual({ content: "finalMessage" });
    expect(result[1].content).toBe("a".repeat(5));
  });

  it('should handle combination of null values and exceeding messages', () => {
    const messages = [
      { content: "systemMessage" },
      { content: "a".repeat(10) },
      null,
      { content: "b".repeat(10) },
      null,
      { content: "finalMessage" },
    ];
    const result = fitToContext(30, messages);
    expect(result.length).toBe(3);
    expect(result[1].content).toBe("b".repeat(5));
  });
});