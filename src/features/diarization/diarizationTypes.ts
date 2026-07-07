import type { AudioTrackId, MeetingAudioTracks, MeetingMetadata } from "../meetings/meetingTypes.js";

export type DiarizationDevice = "cpu" | "gpu";

export type DiarizationSpeaker = {
  id: string;
  label: string;
};

export type DiarizationSegment = {
  id: string;
  trackId?: AudioTrackId;
  speakerId: string;
  speakerLabel: string;
  startTimeMs: number;
  endTimeMs: number;
  confidence?: number;
};

export type DiarizationResult = {
  engine: string;
  device: DiarizationDevice | string;
  speakers: DiarizationSpeaker[];
  segments: DiarizationSegment[];
};

export type DiarizationInput = {
  meeting: MeetingMetadata;
  tracksToProcess: AudioTrackId[];
  audioTracks: MeetingAudioTracks;
};

export type DiarizationClient = {
  diarize(input: DiarizationInput): Promise<DiarizationResult | null>;
};
