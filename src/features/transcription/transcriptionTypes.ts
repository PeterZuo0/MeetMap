import type { AudioTrackId } from "../meetings/meetingTypes.js";

export type TranscriptSegmentId = string;

export type TranscriptSegment<TrackId extends AudioTrackId = AudioTrackId> = {
  id: TranscriptSegmentId;
  trackId: TrackId;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  language: string;
  confidence: number;
  speakerId?: string;
  speakerLabel?: string;
};
