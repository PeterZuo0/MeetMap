import { expect, test, vi } from "vitest";
import type { LlmProviderWithSecret } from "../src/features/providers/llmProviderConfig";
import type { TranscriptionChunkRequest } from "../src/features/transcription/transcriptionClient";
import type { LlmProviderManager } from "./llmProviderManager";
import { createConfigurableTranscriptionClient } from "./configurableTranscriptionClient";

function provider(overrides: Partial<LlmProviderWithSecret> = {}): LlmProviderWithSecret {
  return {
    id: "provider-1",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    transcriptionModel: "gpt-4o-mini-transcribe",
    apiStyle: "responses",
    apiKeyRequired: true,
    apiKey: "sk-live",
    ...overrides
  };
}

function providerManager(active: LlmProviderWithSecret | null): LlmProviderManager {
  return {
    getActiveProviderWithSecret: vi.fn(() => active)
  } as unknown as LlmProviderManager;
}

const chunkRequest: TranscriptionChunkRequest = {
  id: "chunk-1",
  index: 0,
  filePath: "C:/audio/system.wav",
  trackId: "system",
  startOffsetMs: 0,
  durationMs: 1_000
};

test("explains how to configure transcription when no provider is enabled", async () => {
  const client = createConfigurableTranscriptionClient({ providerManager: providerManager(null) });

  await expect(client.transcribeChunk(chunkRequest)).rejects.toThrow(/LLM 提供商/);
});

test("names the provider that still needs a transcription model", async () => {
  const client = createConfigurableTranscriptionClient({
    providerManager: providerManager(provider({ name: "Ollama", transcriptionModel: "" }))
  });

  await expect(client.transcribeChunk(chunkRequest)).rejects.toThrow(/Ollama.*转写模型/s);
});

test("falls back to environment credentials only when nothing is enabled in settings", async () => {
  const client = createConfigurableTranscriptionClient({
    fallbackProvider: provider({ name: "OpenAI（环境变量）", transcriptionModel: "" }),
    providerManager: providerManager(null)
  });

  await expect(client.transcribeChunk(chunkRequest)).rejects.toThrow(/环境变量/);
});

test("resolves the enabled provider on every chunk", async () => {
  const getActive = vi.fn(() => provider({ transcriptionModel: "" }));
  const client = createConfigurableTranscriptionClient({
    providerManager: { getActiveProviderWithSecret: getActive } as unknown as LlmProviderManager
  });

  await expect(client.transcribeChunk(chunkRequest)).rejects.toThrow();
  await expect(client.transcribeChunk(chunkRequest)).rejects.toThrow();

  // A key saved mid-session must take effect without restarting the app.
  expect(getActive).toHaveBeenCalledTimes(2);
});
