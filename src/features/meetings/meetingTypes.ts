import type { LanguageOptionValue } from "../settings/languageOptions";

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

export const AUDIO_TRACK_ID_VALUES = ["system", "microphone"] as const;

export type AudioTrackId = (typeof AUDIO_TRACK_ID_VALUES)[number];

export type MeetingId = string;

export type MeetingTimestamps = {
  createdAt: string;
  updatedAt: string;
  recordingStartedAt?: string;
  recordingEndedAt?: string;
  processingStartedAt?: string;
  completedAt?: string;
  failedAt?: string;
};

export type AudioTrackMetadata = {
  id: AudioTrackId;
  filePath: string;
  format: "wav";
  hasAudio: boolean;
  sampleRateHz?: number;
  channelCount?: number;
  durationMs?: number;
  byteLength?: number;
};

export type MeetingExportPaths = {
  wordSummaryPath: string | null;
  htmlMeetingMapPath: string | null;
};

export type MeetingMetadata = {
  id: MeetingId;
  title: string;
  status: MeetingStatus;
  outputLanguage: LanguageOptionValue;
  timestamps: MeetingTimestamps;
  audioTracks: Partial<Record<AudioTrackId, AudioTrackMetadata>>;
  transcriptPath: string | null;
  structurePath: string | null;
  exportPaths: MeetingExportPaths;
};
