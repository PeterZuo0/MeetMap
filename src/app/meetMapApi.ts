import type { AudioTrackId, MeetingMetadata } from "../features/meetings/meetingTypes";
import type { LanguageOptionValue } from "../features/settings/languageOptions";

export type RecordingAudioSources = {
  system: boolean;
  microphone: boolean;
};

export type RecordingAudioDevice = {
  id: string;
  label: string;
  track: AudioTrackId;
};

export type RecordingStartOptions = {
  audioSources: RecordingAudioSources;
  deviceIds?: Partial<Record<AudioTrackId, string>>;
};

export type MeetMapApi = {
  platform: string;
  createMeeting(input: {
    title: string;
    outputLanguage: LanguageOptionValue;
  }): Promise<MeetingMetadata>;
  startRecording(meetingId: string, options?: RecordingStartOptions): Promise<MeetingMetadata>;
  stopRecording(): Promise<MeetingMetadata>;
  listAudioDevices?(): Promise<RecordingAudioDevice[]>;
  processMeeting(meetingId: string): Promise<MeetingMetadata>;
  openExport(input: { meetingId: string; kind: "word" | "html" }): Promise<void>;
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
  theme: ThemeMode;
  accent: string;
  uiLanguage: UiLanguage;
  defaultOutputLanguage: LanguageOptionValue;
};

declare global {
  interface Window {
    meetMap?: MeetMapApi;
  }
}
