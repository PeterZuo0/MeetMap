import type { LanguageOptionValue } from "../settings/languageOptions.js";

export const MEETING_STATUS_VALUES = [
  "setup",
  "recording",
  "recorded",
  "processing",
  "completed",
  "failed",
  "no_audio"
] as const;

export type MeetingStatus = (typeof MEETING_STATUS_VALUES)[number];

export const PROCESSING_STEP_VALUES = [
  "activity_detection",
  "transcription",
  "merge",
  "structure_extraction",
  "word_export",
  "html_map_export",
  "completed",
  "no_audio",
  "failed"
] as const;

export type ProcessingStep = (typeof PROCESSING_STEP_VALUES)[number];

export const AUDIO_TRACK_ID_VALUES = ["system", "microphone"] as const;

export type AudioTrackId = (typeof AUDIO_TRACK_ID_VALUES)[number];

export type MeetingId = string;

export const SUMMARY_STYLE_VALUES = [
  "decisions_actions",
  "topic_outline",
  "qa",
  "highlights"
] as const;

export type SummaryStyle = (typeof SUMMARY_STYLE_VALUES)[number];

export type MeetingTimestamps = {
  createdAt: string;
  updatedAt: string;
  recordingStartedAt?: string;
  recordingEndedAt?: string;
  processingStartedAt?: string;
  completedAt?: string;
  failedAt?: string;
};

export type AudioTrackMetadata<TrackId extends AudioTrackId = AudioTrackId> = {
  id: TrackId;
  filePath: string;
  format: "wav";
  hasAudio: boolean;
  sampleRateHz?: number;
  channelCount?: number;
  durationMs?: number;
  byteLength?: number;
};

export type MeetingAudioTracks = {
  [TrackId in AudioTrackId]?: AudioTrackMetadata<TrackId>;
};

export type MeetingExportPaths = {
  wordSummaryPath: string | null;
  htmlMeetingMapPath: string | null;
};

export type MeetingPaths = {
  meetingDir: string;
  metadataPath: string;
  audioDir: string;
  chunksDir: string;
  exportsDir: string;
  logsDir: string;
  transcriptPath: string;
  structurePath: string;
  wordExportPath: string;
  htmlMapExportPath: string;
};

export type MeetingMetadata = {
  id: MeetingId;
  title: string;
  status: MeetingStatus;
  processingStep?: ProcessingStep;
  outputLanguage: LanguageOptionValue;
  summaryStyle?: SummaryStyle;
  timestamps: MeetingTimestamps;
  audioTracks: MeetingAudioTracks;
  transcriptPath: string | null;
  structurePath: string | null;
  exportPaths: MeetingExportPaths;
};
