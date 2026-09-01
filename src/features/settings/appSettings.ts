import type { LanguageOptionValue } from "./languageOptions";

export const ACCENT_OPTIONS = ["#5C6CE0", "#0E7C66", "#C24A2E", "#1A1A1A"] as const;

export type UiLanguage = "en" | "zh" | "bi";
export type ThemeMode = "light" | "dark";

export type SettingsRuntimeStatus = {
  openAi: {
    configured: boolean;
    source: string;
    structureModel: string;
    transcriptionModel: string;
  };
};

export type AppSettings = {
  autoDeleteCloudCopies: boolean;
  theme: ThemeMode;
  accent: string;
  cantonese: boolean;
  customVocabulary: string[];
  defaultMicrophoneDeviceId: string | null;
  defaultSystemAudioDeviceId: string | null;
  englishGB: boolean;
  englishUS: boolean;
  uiLanguage: UiLanguage;
  defaultOutputLanguage: LanguageOptionValue;
  includeTimestamps: boolean;
  includeTranscriptAppendix: boolean;
  mandarin: boolean;
  mixedCodeSwitching: boolean;
  openAtStartup: boolean;
  preserveTranscriptLanguage: boolean;
  speakerDiarization: boolean;
  summaryInstructions: string;
  uploadRecordedAudio: boolean;
  uploadSeparateTracks: boolean;
  useOutputLanguage: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoDeleteCloudCopies: true,
  theme: "light",
  accent: ACCENT_OPTIONS[0],
  cantonese: false,
  customVocabulary: [],
  defaultMicrophoneDeviceId: null,
  defaultSystemAudioDeviceId: null,
  englishGB: false,
  englishUS: true,
  uiLanguage: "bi",
  defaultOutputLanguage: "bilingual",
  includeTimestamps: true,
  includeTranscriptAppendix: true,
  mandarin: true,
  mixedCodeSwitching: true,
  openAtStartup: true,
  preserveTranscriptLanguage: true,
  speakerDiarization: false,
  summaryInstructions: "",
  uploadRecordedAudio: true,
  uploadSeparateTracks: true,
  useOutputLanguage: true
};
