const { fitToContext } = require('./openai.ts');

describe('fitToContext', () => {
  it('should truncate messages to fit the specified negative remaining budget', () => {
    const messages = [
      { content: "Short message" },
      { content: "A bit longer message than the first" },
      { content: "A significantly longer message that should be truncated significantly to fit the budget" },
      { content: "Short" },
      { content: "An adequately sized message for testing" }
    ];
    const remainingBudget = -50; // Need to remove 50 characters

    fitToContext(remainingBudget, messages);

    // Calculate total length of all messages after processing
    const totalLength = messages.reduce((acc, msg) => acc + msg.content.length, 0);
    const initialTotalLength = 151; // Total length of all initial message contents
    expect(totalLength).toBe(initialTotalLength + remainingBudget);
  });
});