export const LANGUAGE_OPTION_VALUES = ["zh", "en", "bilingual"] as const;

export type LanguageOptionValue = (typeof LANGUAGE_OPTION_VALUES)[number];

export type LanguageOption = {
  value: LanguageOptionValue;
  label: string;
};

export const LANGUAGE_OPTION_LABELS: Record<LanguageOptionValue, string> = {
  zh: "Chinese",
  en: "English",
  bilingual: "Bilingual"
};

const LANGUAGE_OPTIONS_BY_VALUE: Record<LanguageOptionValue, LanguageOption> = {
  zh: { value: "zh", label: LANGUAGE_OPTION_LABELS.zh },
  en: { value: "en", label: LANGUAGE_OPTION_LABELS.en },
  bilingual: {
    value: "bilingual",
    label: LANGUAGE_OPTION_LABELS.bilingual
  }
};

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  LANGUAGE_OPTIONS_BY_VALUE.zh,
  LANGUAGE_OPTIONS_BY_VALUE.en,
  LANGUAGE_OPTIONS_BY_VALUE.bilingual
];

export const DEFAULT_LANGUAGE_OPTION: LanguageOptionValue = "bilingual";

export function getLanguageOption(value: LanguageOptionValue): LanguageOption {
  return LANGUAGE_OPTIONS_BY_VALUE[value];
}

export function parseLanguageOption(value: string): LanguageOption | undefined {
  if (Object.hasOwn(LANGUAGE_OPTIONS_BY_VALUE, value)) {
    return LANGUAGE_OPTIONS_BY_VALUE[value as LanguageOptionValue];
  }

  return undefined;
}
