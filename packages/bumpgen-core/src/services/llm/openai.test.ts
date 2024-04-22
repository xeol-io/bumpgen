const { fitToContext } = require('./openai.ts');

describe('fitToContext', () => {
  test('should return all messages if total length is under the budget', () => {
    const messages = ['Hello', 'World'];
    const budget = 100; 
    const result = fitToContext(budget, messages);

    expect(result.remainingMessages).toEqual(messages);
    expect(result.remainingMessages.join('').length).toBeLessThanOrEqual(budget);
    expect(result.remainingBudget).toBeGreaterThan(0);
  });

  test('should remove messages if total length exceeds the budget', () => {
    const messages = ['Hello', 'World', 'This is a very long message that should be trimmed'];
    const budget = 20;
    const result = fitToContext(budget, messages);

    expect(result.remainingMessages).not.toContain('This is a very long message that should be trimmed');
    expect(result.remainingMessages.join('').length).toBeLessThanOrEqual(budget);
    expect(result.remainingBudget).toBeGreaterThanOrEqual(0);
  });

  test('should handle an empty array of messages', () => {
    const messages: string[] = [];
    const budget = 50;
    const result = fitToContext(budget, messages);

    expect(result.remainingMessages).toEqual([]);
    expect(result.remainingBudget).toEqual(budget);
  });

  test('should handle very small budgets', () => {
    const messages = ['Hello', 'World'];
    const budget = 5;
    const result = fitToContext(budget, messages);

    expect(result.remainingMessages).toEqual(["Hello"]);
    expect(result.remainingBudget).toEqual(0);
  });
});
