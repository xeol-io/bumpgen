export const SupportedLanguages = ["typescript"] as const;

export type SupportedLanguage = (typeof SupportedLanguages)[number];
