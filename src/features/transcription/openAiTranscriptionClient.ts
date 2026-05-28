import {
  createTranscriptionError,
  type TranscriptionClient,
  type TranscriptionChunkRequest
} from "./transcriptionClient.js";
import type { TranscriptSegment } from "./transcriptionTypes.js";

export type OpenAiTranscriptionSegment = {
  id?: string | number;
  start: number;
  end: number;
  text: string;
  language?: string;
  confidence?: number;
};

export type OpenAiAudioTranscriptionRequest = {
  apiKey: string;
  model: string;
  filePath: string;
  responseFormat: "json" | "verbose_json";
  timestampGranularities?: ["segment"];
};

export type OpenAiAudioTranscriptionResponse = {
  text?: string;
  language?: string;
  segments?: OpenAiTranscriptionSegment[];
};

export type OpenAiAudioTranscriptionRequester = (
  request: OpenAiAudioTranscriptionRequest
) => Promise<OpenAiAudioTranscriptionResponse>;

export type OpenAiTranscriptionClientOptions = {
  apiKey: string;
  model: string;
  requestTranscription: OpenAiAudioTranscriptionRequester;
};

export function createOpenAiTranscriptionClient({
  apiKey,
  model,
  requestTranscription
}: OpenAiTranscriptionClientOptions): TranscriptionClient {
  return {
    async transcribeChunk(request) {
      try {
        const responseOptions = createTranscriptionResponseOptions(model);
        const response = await requestTranscription({
          apiKey,
          model,
          filePath: request.filePath,
          ...responseOptions
        });

        return mapOpenAiResponseToTranscriptSegments(request, response);
      } catch (error) {
        throw mapOpenAiTranscriptionError(error);
      }
    }
  };
}

function createTranscriptionResponseOptions(
  model: string
): Pick<
  OpenAiAudioTranscriptionRequest,
  "responseFormat" | "timestampGranularities"
> {
  if (/^gpt-4o(?:-.+)?-transcribe/i.test(model)) {
    return {
      responseFormat: "json"
    };
  }

  return {
    responseFormat: "verbose_json",
    timestampGranularities: ["segment"]
  };
}

function mapOpenAiResponseToTranscriptSegments(
  chunk: TranscriptionChunkRequest,
  response: OpenAiAudioTranscriptionResponse
): TranscriptSegment[] {
  if (response.segments?.length) {
    return response.segments.map((segment, index) => ({
      id: `${chunk.id}-${segment.id ?? `segment-${index}`}`,
      trackId: chunk.trackId,
      startTimeMs: chunk.startOffsetMs + secondsToMilliseconds(segment.start),
      endTimeMs: chunk.startOffsetMs + secondsToMilliseconds(segment.end),
      text: segment.text,
      language: segment.language ?? response.language ?? "unknown",
      confidence: segment.confidence ?? 1
    }));
  }

  return [
    {
      id: `${chunk.id}-segment-0`,
      trackId: chunk.trackId,
      startTimeMs: chunk.startOffsetMs,
      endTimeMs: chunk.startOffsetMs + (chunk.durationMs ?? 0),
      text: response.text ?? "",
      language: response.language ?? "unknown",
      confidence: 1
    }
  ];
}

function secondsToMilliseconds(value: number): number {
  return Math.round(value * 1000);
}

function mapOpenAiTranscriptionError(error: unknown): Error {
  const providerError = normalizeProviderError(error);

  if (providerError.status === 429) {
    return createTranscriptionError({
      kind: "rate-limit",
      message: providerError.message,
      retryable: true,
      providerCode: providerError.code,
      cause: error
    });
  }

  if (
    providerError.status === 400 &&
    (providerError.code === "invalid_file" ||
      providerError.code === "unsupported_file")
  ) {
    return createTranscriptionError({
      kind: "invalid-audio",
      message: providerError.message,
      retryable: false,
      providerCode: providerError.code,
      cause: error
    });
  }

  return createTranscriptionError({
    kind: "provider",
    message: providerError.message,
    retryable: providerError.status === undefined || providerError.status >= 500,
    providerCode: providerError.code,
    cause: error
  });
}

function normalizeProviderError(error: unknown): {
  message: string;
  status?: number;
  code?: string;
} {
  if (typeof error !== "object" || error === null) {
    return {
      message: "OpenAI transcription request failed"
    };
  }

  const record = error as Record<string, unknown>;
  return {
    message:
      typeof record.message === "string"
        ? record.message
        : "OpenAI transcription request failed",
    status: typeof record.status === "number" ? record.status : undefined,
    code: typeof record.code === "string" ? record.code : undefined
  };
}
