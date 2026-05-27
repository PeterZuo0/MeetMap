import {
  DEFAULT_LANGUAGE_OPTION,
  LANGUAGE_OPTIONS,
  LANGUAGE_OPTION_LABELS,
  getLanguageOption,
  parseLanguageOption
} from "./languageOptions";

test("defines stable language option values and labels", () => {
  expect(LANGUAGE_OPTIONS).toEqual([
    { value: "zh", label: "Chinese" },
    { value: "en", label: "English" },
    { value: "bilingual", label: "Bilingual" },
    { value: "auto", label: "Auto" }
  ]);

  expect(LANGUAGE_OPTION_LABELS).toEqual({
    zh: "Chinese",
    en: "English",
    bilingual: "Bilingual",
    auto: "Auto"
  });
});

test("defaults to auto output language", () => {
  expect(DEFAULT_LANGUAGE_OPTION).toBe("auto");
});

test("looks up language options by value", () => {
  expect(getLanguageOption("zh")).toEqual({ value: "zh", label: "Chinese" });
  expect(getLanguageOption("en")).toEqual({ value: "en", label: "English" });
  expect(getLanguageOption("bilingual")).toEqual({
    value: "bilingual",
    label: "Bilingual"
  });
  expect(getLanguageOption("auto")).toEqual({ value: "auto", label: "Auto" });
});

test("parses external language option values", () => {
  expect(parseLanguageOption("zh")).toEqual({ value: "zh", label: "Chinese" });
  expect(parseLanguageOption("unsupported")).toBeUndefined();
});
