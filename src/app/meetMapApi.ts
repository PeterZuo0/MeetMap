import type { AudioTrackId, MeetingMetadata, ProcessingProgressUpdate, SummaryStyle } from "../features/meetings/meetingTypes";
import type { RecordingWidgetState, RecordingWidgetAction } from "../features/recording/recordingWidget";
export type { RecordingWidgetState, RecordingWidgetAction } from "../features/recording/recordingWidget";
import type { TranscriptSegment } from "../features/transcription/transcriptionTypes";
import type { LanguageOptionValue } from "../features/settings/languageOptions";
import type { ProcessingPreferences } from "../features/settings/processingPreferences";
import type { AppSettings, SettingsRuntimeStatus } from "../features/settings/appSettings";
import type { MeetingStructure } from "../features/intelligence/meetingStructure";
import type {
  LlmProviderState,
  SaveLlmProviderInput
} from "../features/providers/llmProviderConfig";

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
  peak?: number;
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

export type { ProcessingProgressUpdate };
export type { AppSettings, SettingsRuntimeStatus, ThemeMode, UiLanguage } from "../features/settings/appSettings";

export type MeetMapApi = {
  updateRecordingWidget?(state: RecordingWidgetState | null): void;
  onRecordingWidgetState?(callback: (state: RecordingWidgetState) => void): () => void;
  onRecordingWidgetAction?(callback: (action: RecordingWidgetAction) => void): () => void;
  recordingWidgetAction?(action: RecordingWidgetAction): void;
  platform: string;
  getSettings?(): Promise<AppSettings>;
  updateSettings?(settings: AppSettings): Promise<AppSettings>;
  getSettingsRuntimeStatus?(): Promise<SettingsRuntimeStatus>;
  onOpenSettings?(callback: () => void): () => void;
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
  importDroppedAudio?(file: File, input: {
    outputLanguage: LanguageOptionValue;
    summaryStyle?: SummaryStyle;
  }): Promise<MeetingMetadata>;
  renameMeeting?(meetingId: string, title: string): Promise<MeetingMetadata>;
  deleteMeeting?(meetingId: string): Promise<void>;
  getLlmProviders?(): Promise<LlmProviderState>;
  saveLlmProvider?(input: SaveLlmProviderInput): Promise<LlmProviderState>;
  deleteLlmProvider?(providerId: string): Promise<LlmProviderState>;
  setActiveLlmProvider?(providerId: string | null): Promise<LlmProviderState>;
  listLlmModels?(input: { baseUrl: string; apiKey?: string; providerId?: string }): Promise<string[]>;
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
  analyzeMeeting?(meetingId: string, preferences?: ProcessingPreferences): Promise<MeetingMetadata>;
  saveMeetingAudio?(meetingId: string): Promise<string | null>;
  saveTaggedMoment?(meetingId: string, moment: TaggedMomentInput): Promise<void>;
  searchMeetings?(query: string): Promise<MeetingSearchResult[]>;
  revealMeetingFolder?(meetingId: string): Promise<void>;
  getMeetingDetailData?(meetingId: string): Promise<MeetingDetailData>;
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
