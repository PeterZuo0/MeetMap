import { describe, expect, test } from "vitest";

import {
  createOpenAiAudioTranscriptionRequester,
  createOpenAiMeetingStructureRequester
} from "./openAiRequesters";

describe("createOpenAiAudioTranscriptionRequester", () => {
  test("posts audio files to the OpenAI transcription endpoint", async () => {
    const calls: unknown[] = [];
    const requester = createOpenAiAudioTranscriptionRequester({
      async readFile(filePath) {
        expect(filePath).toBe("C:/meetings/1/audio/system.wav");
        return new Uint8Array([1, 2, 3]);
      },
      async fetch(input, init) {
        calls.push([input, init]);
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              text: "hello",
              language: "en",
              segments: []
            };
          }
        };
      }
    });

    await expect(
      requester({
        apiKey: "test-key",
        model: "gpt-4o-mini-transcribe",
        filePath: "C:/meetings/1/audio/system.wav",
        responseFormat: "verbose_json",
        timestampGranularities: ["segment"]
      })
    ).resolves.toEqual({
      text: "hello",
      language: "en",
      segments: []
    });

    const [url, init] = calls[0] as [
      string,
      { headers: Record<string, string>; body: FormData }
    ];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(init.body.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(init.body.get("response_format")).toBe("verbose_json");
    expect(init.body.get("timestamp_granularities[]")).toBe("segment");
    expect(init.body.get("file")).toBeInstanceOf(File);
  });

  test("includes optional transcription language and prompt hints in the request body", async () => {
    const calls: unknown[] = [];
    const requester = createOpenAiAudioTranscriptionRequester({
      async readFile() {
        return new Uint8Array([1, 2, 3]);
      },
      async fetch(input, init) {
        calls.push([input, init]);
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              text: "hello",
              language: "en",
              segments: []
            };
          }
        };
      }
    });

    await requester({
      apiKey: "test-key",
      model: "gpt-4o-mini-transcribe",
      filePath: "system.wav",
      language: "en",
      prompt: "Expected speech languages: English (US).",
      responseFormat: "verbose_json",
      timestampGranularities: ["segment"]
    });

    const [, init] = calls[0] as [
      string,
      { headers: Record<string, string>; body: FormData }
    ];
    expect(init.body.get("language")).toBe("en");
    expect(init.body.get("prompt")).toBe("Expected speech languages: English (US).");
  });

  test("does not expose provider-supplied API key fragments in auth failures", async () => {
    const requester = createOpenAiAudioTranscriptionRequester({
      async readFile() {
        return new Uint8Array([1, 2, 3]);
      },
      async fetch() {
        return {
          ok: false,
          status: 401,
          async json() {
            return {
              error: {
                message: "Incorrect API key provided: sk-secret-fragment.",
                code: "invalid_api_key"
              }
            };
          }
        };
      }
    });

    await expect(
      requester({
        apiKey: "test-key",
        model: "gpt-4o-mini-transcribe",
        filePath: "system.wav",
        responseFormat: "verbose_json",
        timestampGranularities: ["segment"]
      })
    ).rejects.toThrow("OpenAI request failed: invalid API key.");
  });
});

describe("createOpenAiMeetingStructureRequester", () => {
  test("posts structured-output requests to the OpenAI Responses endpoint", async () => {
    const calls: unknown[] = [];
    const requester = createOpenAiMeetingStructureRequester({
      async fetch(input, init) {
        calls.push([input, init]);
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              output_text: "{\"summary\":\"ok\"}"
            };
          }
        };
      }
    });

    await expect(
      requester({
        apiKey: "test-key",
        model: "gpt-4.1-mini",
        instructions: "Extract in bilingual.",
        input: "{\"transcript\":[]}",
        text: {
          format: {
            type: "json_schema",
            name: "meeting_structure",
            strict: true,
            schema: { type: "object" }
          }
        }
      })
    ).resolves.toEqual({
      outputText: "{\"summary\":\"ok\"}"
    });

    const [url, init] = calls[0] as [
      string,
      { headers: Record<string, string>; body: string }
    ];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "gpt-4.1-mini",
      instructions: "Extract in bilingual.",
      input: "{\"transcript\":[]}"
    });
  });
});
