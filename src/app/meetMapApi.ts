import type { AudioTrackId, MeetingMetadata, SummaryStyle } from "../features/meetings/meetingTypes";
import type { LanguageOptionValue } from "../features/settings/languageOptions";
import type { ProcessingPreferences } from "../features/settings/processingPreferences";
import type { ExportOptions } from "../features/exports/exportOptions";

export type RecordingAudioSources = {
  system: boolean;
  microphone: boolean;
};

export type RecordingAudioDevice = {
  id: string;
  label: string;
  track: AudioTrackId;
};

export type RecordingAudioLevel = {
  track: AudioTrackId;
  level: number;
  occurredAt: string;
  source?: "preflight" | "recording";
};

export type RecordingStartOptions = {
  audioSources: RecordingAudioSources;
  deviceIds?: Partial<Record<AudioTrackId, string>>;
};

export type { ExportOptions };

export type MeetMapApi = {
  platform: string;
	  createMeeting(input: {
	    title: string;
	    outputLanguage: LanguageOptionValue;
	    summaryStyle?: SummaryStyle;
	  }): Promise<MeetingMetadata>;
  startRecording(meetingId: string, options?: RecordingStartOptions): Promise<MeetingMetadata>;
  startAudioProbe?(options?: RecordingStartOptions): Promise<void>;
  stopAudioProbe?(): Promise<void>;
  pauseRecording?(): Promise<MeetingMetadata>;
  resumeRecording?(): Promise<MeetingMetadata>;
  stopRecording(): Promise<MeetingMetadata>;
  listAudioDevices?(): Promise<RecordingAudioDevice[]>;
  onAudioLevel?(callback: (update: RecordingAudioLevel) => void): () => void;
  processMeeting(meetingId: string, preferences?: ProcessingPreferences): Promise<MeetingMetadata>;
  openExport(input: { meetingId: string; kind: "word" | "html"; options?: ExportOptions }): Promise<void>;
};

export type WorkflowPhase =
  | "library"
  | "pre"
  | "recording"
  | "processing"
  | "detail"
  | "settings";

export type UiLanguage = "en" | "zh" | "bi";
export type ThemeMode = "light" | "dark";

export type AppSettings = {
  autoDeleteCloudCopies: boolean;
  autoGain: boolean;
  theme: ThemeMode;
  accent: string;
  cantonese: boolean;
  englishGB: boolean;
  englishUS: boolean;
  exportMapView: "tree" | "radial" | "timeline";
  uiLanguage: UiLanguage;
  defaultOutputLanguage: LanguageOptionValue;
  includeTimestamps: boolean;
  includeTranscriptAppendix: boolean;
  keepIntermediateArtifacts: boolean;
  mandarin: boolean;
  minimizeToTray: boolean;
  mixedCodeSwitching: boolean;
  noiseSuppression: boolean;
  openAfterExport: boolean;
  openAtStartup: boolean;
  preserveTranscriptLanguage: boolean;
  speakerDiarization: boolean;
  standaloneExport: boolean;
  uploadRecordedAudio: boolean;
  uploadSeparateTracks: boolean;
  useOutputLanguage: boolean;
};

declare global {
  interface Window {
    meetMap?: MeetMapApi;
  }
}
