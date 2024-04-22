const { fitToContext } = require('./openai.ts');

describe('fitToContext', () => {
  it('should truncate messages in the right order to fit the specified negative remaining budget', () => {
    
    const messages = [
      { content: "Short message" },
      { content: "A bit longer message than the first" },
      { content: "A significantly longer message that should be truncated significantly to fit the budget" },
      { content: "Short" },
      { content: "An adequately sized message for testing" }
    ];
    
    const originalLength = messages.reduce((acc, msg) => acc + msg.content.length, 0);
    const remainingBudget = -50;
    
    fitToContext(remainingBudget, messages);

    const totalLength = messages.reduce((acc, msg) => acc + msg.content.length, 0);
    
    expect(totalLength).toBe(originalLength + remainingBudget);
    expect(messages[1]).toBe({content: ""});
  });
});