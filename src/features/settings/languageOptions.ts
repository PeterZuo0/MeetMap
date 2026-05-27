export const LANGUAGE_OPTION_VALUES = ["zh", "en", "bilingual", "auto"] as const;

export type LanguageOptionValue = (typeof LANGUAGE_OPTION_VALUES)[number];

export type LanguageOption = {
  value: LanguageOptionValue;
  label: string;
};

export const LANGUAGE_OPTION_LABELS: Record<LanguageOptionValue, string> = {
  zh: "Chinese",
  en: "English",
  bilingual: "Bilingual",
  auto: "Auto"
};

export const LANGUAGE_OPTIONS: readonly LanguageOption[] =
  LANGUAGE_OPTION_VALUES.map((value) => ({
    value,
    label: LANGUAGE_OPTION_LABELS[value]
  }));

export const DEFAULT_LANGUAGE_OPTION: LanguageOptionValue = "auto";

export function getLanguageOption(
  value: LanguageOptionValue
): LanguageOption | undefined {
  return LANGUAGE_OPTIONS.find((option) => option.value === value);
}
