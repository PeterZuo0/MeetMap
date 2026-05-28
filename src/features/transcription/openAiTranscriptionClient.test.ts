import { describe, expect, test } from "vitest";

import {
  createOpenAiTranscriptionClient,
  type OpenAiAudioTranscriptionRequester
} from "./openAiTranscriptionClient";

describe("createOpenAiTranscriptionClient", () => {
  test("maps transcription chunk requests to OpenAI audio transcription requests", async () => {
    const calls: Parameters<OpenAiAudioTranscriptionRequester>[] = [];
    const requester: OpenAiAudioTranscriptionRequester = async (request) => {
      calls.push([request]);
      return {
        segments: [
          {
            id: "provider-seg-1",
            start: 1.25,
            end: 3.5,
            text: "We kept export workflow in scope.",
            language: "en",
            confidence: 0.91
          }
        ]
      };
    };
    const client = createOpenAiTranscriptionClient({
      apiKey: "test-key",
      model: "whisper-1",
      requestTranscription: requester
    });

    const result = await client.transcribeChunk({
      id: "chunk-1",
      index: 0,
      trackId: "system",
      filePath: "C:/meetings/1/audio/system.wav",
      startOffsetMs: 5000,
      durationMs: 15000
    });

    expect(calls).toEqual([
      [
        {
          apiKey: "test-key",
          model: "whisper-1",
          filePath: "C:/meetings/1/audio/system.wav",
          responseFormat: "verbose_json",
          timestampGranularities: ["segment"]
        }
      ]
    ]);
    expect(result).toEqual([
      {
        id: "chunk-1-provider-seg-1",
        trackId: "system",
        startTimeMs: 6250,
        endTimeMs: 8500,
        text: "We kept export workflow in scope.",
        language: "en",
        confidence: 0.91
      }
    ]);
  });

  test("uses json response format for gpt-4o transcribe models", async () => {
    const calls: Parameters<OpenAiAudioTranscriptionRequester>[] = [];
    const client = createOpenAiTranscriptionClient({
      apiKey: "test-key",
      model: "gpt-4o-mini-transcribe",
      async requestTranscription(request) {
        calls.push([request]);
        return {
          text: "MeetMap smoke test.",
          language: "en"
        };
      }
    });

    await client.transcribeChunk({
      id: "chunk-1",
      index: 0,
      trackId: "microphone",
      filePath: "mic.wav",
      startOffsetMs: 0,
      durationMs: 2000
    });

    expect(calls[0][0]).toMatchObject({
      responseFormat: "json"
    });
    expect(calls[0][0].timestampGranularities).toBeUndefined();
  });

  test("falls back to one segment when provider does not return segment timings", async () => {
    const client = createOpenAiTranscriptionClient({
      apiKey: "test-key",
      model: "gpt-4o-mini-transcribe",
      async requestTranscription() {
        return {
          text: "Single response text.",
          language: "en"
        };
      }
    });

    await expect(
      client.transcribeChunk({
        id: "chunk-1",
        index: 0,
        trackId: "microphone",
        filePath: "mic.wav",
        startOffsetMs: 12000,
        durationMs: 3000
      })
    ).resolves.toEqual([
      {
        id: "chunk-1-segment-0",
        trackId: "microphone",
        startTimeMs: 12000,
        endTimeMs: 15000,
        text: "Single response text.",
        language: "en",
        confidence: 1
      }
    ]);
  });

  test("maps rate-limit provider failures to retryable transcription errors", async () => {
    const client = createOpenAiTranscriptionClient({
      apiKey: "test-key",
      model: "gpt-4o-mini-transcribe",
      async requestTranscription() {
        throw Object.assign(new Error("Too many requests"), {
          status: 429,
          code: "rate_limit_exceeded"
        });
      }
    });

    await expect(
      client.transcribeChunk({
        id: "chunk-1",
        index: 0,
        trackId: "system",
        filePath: "system.wav",
        startOffsetMs: 0
      })
    ).rejects.toMatchObject({
      name: "TranscriptionError",
      kind: "rate-limit",
      retryable: true,
      providerCode: "rate_limit_exceeded"
    });
  });

  test("maps invalid audio provider failures to non-retryable errors", async () => {
    const client = createOpenAiTranscriptionClient({
      apiKey: "test-key",
      model: "gpt-4o-mini-transcribe",
      async requestTranscription() {
        throw Object.assign(new Error("Invalid file format"), {
          status: 400,
          code: "invalid_file"
        });
      }
    });

    await expect(
      client.transcribeChunk({
        id: "chunk-1",
        index: 0,
        trackId: "system",
        filePath: "system.wav",
        startOffsetMs: 0
      })
    ).rejects.toMatchObject({
      name: "TranscriptionError",
      kind: "invalid-audio",
      retryable: false,
      providerCode: "invalid_file"
    });
  });
});
