import type { AppSettings } from "../meetMapApi";

export const ACCENT_OPTIONS = ["#5C6CE0", "#0E7C66", "#C24A2E", "#1A1A1A"] as const;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "light",
  accent: ACCENT_OPTIONS[0],
  uiLanguage: "bi",
  defaultOutputLanguage: "bilingual"
};
