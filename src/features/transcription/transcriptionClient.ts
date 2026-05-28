import type { AudioTrackId } from "../meetings/meetingTypes.js";
import type { RecognitionLanguagePreferences } from "../settings/processingPreferences.js";
import type { TranscriptSegment } from "./transcriptionTypes.js";

export type TranscriptionChunkId = string;

export type TranscriptionChunkRequest<
  TrackId extends AudioTrackId = AudioTrackId
> = {
  id: TranscriptionChunkId;
  index: number;
  trackId: TrackId;
  filePath: string;
  startOffsetMs: number;
  durationMs?: number;
  autoDeleteCloudCopies?: boolean;
  recognitionLanguages?: RecognitionLanguagePreferences;
  speakerDiarization?: boolean;
  uploadSeparateTracks?: boolean;
};

export type TranscriptionClient = {
  transcribeChunk(
    request: TranscriptionChunkRequest
  ): Promise<TranscriptSegment[]>;
};

export type TranscriptionErrorKind =
  | "upload"
  | "rate-limit"
  | "provider"
  | "invalid-audio";

export type TranscriptionErrorInput = {
  kind: TranscriptionErrorKind;
  message: string;
  retryable: boolean;
  providerCode?: string;
  retryAfterMs?: number;
  cause?: unknown;
};

export type TranscriptionError = Error & {
  name: "TranscriptionError";
  kind: TranscriptionErrorKind;
  retryable: boolean;
  providerCode?: string;
  retryAfterMs?: number;
  cause?: unknown;
};

export function createTranscriptionError(
  input: TranscriptionErrorInput
): TranscriptionError {
  const error = new Error(input.message) as TranscriptionError;
  error.name = "TranscriptionError";
  error.kind = input.kind;
  error.retryable = input.retryable;
  error.providerCode = input.providerCode;
  error.retryAfterMs = input.retryAfterMs;
  error.cause = input.cause;

  return error;
}

export async function transcribeChunks(
  client: TranscriptionClient,
  requests: readonly TranscriptionChunkRequest[]
): Promise<TranscriptSegment[]> {
  const segments: TranscriptSegment[] = [];

  for (const request of requests) {
    segments.push(...(await client.transcribeChunk(request)));
  }

  return segments;
}
