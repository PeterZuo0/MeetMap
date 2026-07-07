import type { AudioTrackId, MeetingMetadata, ProcessingProgressUpdate, SummaryStyle } from "../features/meetings/meetingTypes";
import type { MeetingStructure } from "../features/intelligence/meetingStructure";
import type { TranscriptSegment } from "../features/transcription/transcriptionTypes";
import type { LanguageOptionValue } from "../features/settings/languageOptions";
import type { ProcessingPreferences } from "../features/settings/processingPreferences";
import type { ExportOptions } from "../features/exports/exportOptions";
import type { AppSettings, SettingsRuntimeStatus } from "../features/settings/appSettings";

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

export type TaggedMomentInput = {
  time: string;
  elapsedMs: number;
  text: string;
  level: number;
  track: AudioTrackId | "none";
};

export type MeetingSearchResult = {
  meetingId: string;
  title: string;
  status: MeetingMetadata["status"];
  updatedAt: string;
  matches: Array<{
    kind: "meeting" | "transcript" | "topic" | "decision" | "action" | "question" | "risk";
    label: string;
    snippet: string;
    startTimeMs?: number;
  }>;
};

export type RecordingStartOptions = {
  audioSources: RecordingAudioSources;
  deviceIds?: Partial<Record<AudioTrackId, string>>;
};

export type MeetingDetailData = {
  transcript: { segments: TranscriptSegment[] } | null;
  structure: MeetingStructure | null;
  audio: {
    tracks: Array<{
      track: AudioTrackId;
      audioUrl: string;
      durationMs: number;
      peaks: number[];
    }>;
  } | null;
};

export type WorkspaceState = {
  currentPath: string | null;
  recentPaths: string[];
};

export type { ExportOptions };
export type { ProcessingProgressUpdate };
export type { AppSettings, SettingsRuntimeStatus, ThemeMode, UiLanguage } from "../features/settings/appSettings";

export type MeetMapApi = {
  platform: string;
  getSettings?(): Promise<AppSettings>;
  updateSettings?(settings: AppSettings): Promise<AppSettings>;
  getSettingsRuntimeStatus?(): Promise<SettingsRuntimeStatus>;
  getWorkspace?(): Promise<WorkspaceState>;
  chooseWorkspaceFolder?(): Promise<WorkspaceState>;
  useWorkspaceFolder?(folderPath: string): Promise<WorkspaceState>;
  revealWorkspaceFolder?(): Promise<void>;
  listMeetings?(): Promise<MeetingMetadata[]>;
  createMeeting(input: {
    title: string;
    outputLanguage: LanguageOptionValue;
    summaryStyle?: SummaryStyle;
  }): Promise<MeetingMetadata>;
  importAudio?(input: {
    outputLanguage: LanguageOptionValue;
    summaryStyle?: SummaryStyle;
  }): Promise<MeetingMetadata | null>;
  startRecording(meetingId: string, options?: RecordingStartOptions): Promise<MeetingMetadata>;
  startAudioProbe?(options?: RecordingStartOptions): Promise<void>;
  stopAudioProbe?(): Promise<void>;
  pauseRecording?(): Promise<MeetingMetadata>;
  resumeRecording?(): Promise<MeetingMetadata>;
  stopRecording(): Promise<MeetingMetadata>;
  listAudioDevices?(): Promise<RecordingAudioDevice[]>;
  onAudioLevel?(callback: (update: RecordingAudioLevel) => void): () => void;
  onProcessingProgress?(callback: (update: ProcessingProgressUpdate) => void): () => void;
  processMeeting(meetingId: string, preferences?: ProcessingPreferences): Promise<MeetingMetadata>;
  saveMeetingAudio?(meetingId: string): Promise<string | null>;
  saveTaggedMoment?(meetingId: string, moment: TaggedMomentInput): Promise<void>;
  searchMeetings?(query: string): Promise<MeetingSearchResult[]>;
  revealMeetingFolder?(meetingId: string): Promise<void>;
  getMeetingDetailData?(meetingId: string): Promise<MeetingDetailData>;
  openExport(input: { meetingId: string; kind: "word" | "html"; options?: ExportOptions }): Promise<void>;
};

export type WorkflowPhase =
  | "workspace"
  | "library"
  | "pre"
  | "recording"
  | "processing"
  | "detail"
  | "settings";

declare global {
  interface Window {
    meetMap?: MeetMapApi;
  }
}
