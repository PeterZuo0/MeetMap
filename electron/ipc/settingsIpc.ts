import { ipcMain } from "electron";
import type { AppSettings, SettingsRuntimeStatus } from "../../src/features/settings/appSettings.js";
import { DEFAULT_APP_SETTINGS } from "../../src/features/settings/appSettings.js";
import type { SettingsManager } from "../settingsManager.js";

export type SettingsIpcContext = {
  settingsManager: SettingsManager;
};

export function registerSettingsIpc({ settingsManager }: SettingsIpcContext): void {
  ipcMain.handle("settings:get", async (): Promise<AppSettings> => settingsManager.get());

  ipcMain.handle("settings:update", async (_event, input: unknown): Promise<AppSettings> => {
    if (!isAppSettings(input)) {
      throw new Error("Invalid application settings");
    }

    return settingsManager.update(input);
  });

  ipcMain.handle("settings:runtime-status", async (): Promise<SettingsRuntimeStatus> =>
    settingsManager.getRuntimeStatus()
  );
}

function isAppSettings(value: unknown): value is AppSettings {
  if (!isRecord(value)) {
    return false;
  }

  const booleans: Array<keyof AppSettings> = [
    "autoDeleteCloudCopies",
    "cantonese",
    "englishGB",
    "englishUS",
    "includeTimestamps",
    "includeTranscriptAppendix",
    "mandarin",
    "mixedCodeSwitching",
    "openAtStartup",
    "preserveTranscriptLanguage",
    "speakerDiarization",
    "uploadRecordedAudio",
    "uploadSeparateTracks",
    "useOutputLanguage"
  ];

  return (
    value.defaultOutputLanguage !== undefined &&
    isOneOf(value.defaultOutputLanguage, ["zh", "en", "bilingual"]) &&
    isOneOf(value.theme, ["light", "dark"]) &&
    isOneOf(value.uiLanguage, ["en", "zh", "bi"]) &&
    typeof value.accent === "string" &&
    isCustomVocabulary(value.customVocabulary) &&
    typeof value.summaryInstructions === "string" &&
    value.summaryInstructions.length <= 1000 &&
    isNullableString(value.defaultMicrophoneDeviceId) &&
    isNullableString(value.defaultSystemAudioDeviceId) &&
    booleans.every((key) => typeof value[key] === "boolean") &&
    Object.keys(value).every((key) => key in DEFAULT_APP_SETTINGS)
  );
}

function isCustomVocabulary(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length <= 100 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 80);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOneOf<const T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
