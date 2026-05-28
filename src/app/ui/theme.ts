import type { AppSettings } from "../meetMapApi";

export const ACCENT_OPTIONS = ["#5C6CE0", "#0E7C66", "#C24A2E", "#1A1A1A"] as const;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoDeleteCloudCopies: true,
  autoGain: false,
  theme: "light",
  accent: ACCENT_OPTIONS[0],
  cantonese: false,
  englishGB: false,
  englishUS: true,
  exportMapView: "tree",
  uiLanguage: "bi",
  defaultOutputLanguage: "bilingual",
  includeTimestamps: true,
  includeTranscriptAppendix: true,
  keepIntermediateArtifacts: true,
  mandarin: true,
  minimizeToTray: true,
  mixedCodeSwitching: true,
  noiseSuppression: true,
  openAfterExport: false,
  openAtStartup: true,
  preserveTranscriptLanguage: true,
  speakerDiarization: true,
  standaloneExport: true,
  uploadRecordedAudio: true,
  uploadSeparateTracks: true,
  useOutputLanguage: true
};
