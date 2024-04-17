import type { SupportedLanguage } from "../../models";
import { injectTypescriptService } from "./typescript";

export const injectLanguageService = (language: SupportedLanguage) => () => {
  if (language === "typescript") {
    return injectTypescriptService();
  } else {
    throw new Error(`Unsupported language`);
  }
};
