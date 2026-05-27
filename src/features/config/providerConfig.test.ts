import { describe, expect, test } from "vitest";

import { parseProviderConfig } from "./providerConfig";

describe("parseProviderConfig", () => {
  test("does not require cloud credentials in demo mode", () => {
    const result = parseProviderConfig({
      MEETMAP_DEMO_MODE: "1"
    });

    expect(result).toEqual({
      mode: "demo"
    });
  });

  test("requires OpenAI API key for production OpenAI providers", () => {
    expect(() =>
      parseProviderConfig({
        MEETMAP_TRANSCRIPTION_PROVIDER: "openai",
        MEETMAP_LLM_PROVIDER: "openai"
      })
    ).toThrow("OPENAI_API_KEY is required");
  });

  test("uses OpenAI defaults for production provider models", () => {
    const result = parseProviderConfig({
      OPENAI_API_KEY: "test-key"
    });

    expect(result).toEqual({
      mode: "production",
      transcription: {
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o-mini-transcribe"
      },
      structure: {
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4.1-mini"
      }
    });
  });

  test("rejects unsupported provider values", () => {
    expect(() =>
      parseProviderConfig({
        OPENAI_API_KEY: "test-key",
        MEETMAP_TRANSCRIPTION_PROVIDER: "other"
      })
    ).toThrow("Unsupported transcription provider");
  });
});
