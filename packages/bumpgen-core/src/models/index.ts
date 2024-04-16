export const SupportedLanguages = ["typescript"] as const;

export type SupportedLanguage = (typeof SupportedLanguages)[number];

export const SupportedModels = ["gpt-4-turbo-preview"] as const;

export type SupportedModel = (typeof SupportedModels)[number];
