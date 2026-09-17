import { createOpenAiTranscriptionClient } from "../src/features/transcription/openAiTranscriptionClient.js";
import { createOpenAiCompatibleAudioTranscriptionRequester } from "../src/features/providers/openAiRequesters.js";
import type { LlmProviderWithSecret } from "../src/features/providers/llmProviderConfig.js";
import type { TranscriptionClient } from "../src/features/transcription/transcriptionClient.js";
import type { LlmProviderManager } from "./llmProviderManager.js";

/**
 * Resolves the enabled provider on every chunk, so a key configured mid-session
 * takes effect without restarting the app.
 */
export function createConfigurableTranscriptionClient({
  fallbackProvider,
  providerManager
}: {
  fallbackProvider?: LlmProviderWithSecret;
  providerManager: LlmProviderManager;
}): TranscriptionClient {
  return {
    async transcribeChunk(request) {
      const provider = providerManager.getActiveProviderWithSecret() ?? fallbackProvider;
      if (!provider) {
        throw new Error("音频转写尚未配置。请在设置的「LLM 提供商」中添加并启用一个服务。");
      }

      if (!provider.transcriptionModel.trim()) {
        throw new Error(
          `「${provider.name}」还没有选择转写模型。请在设置的「LLM 提供商」中为它选择一个转写模型（例如 gpt-4o-mini-transcribe 或 whisper-1）。`
        );
      }

      return createOpenAiTranscriptionClient({
        apiKey: provider.apiKey,
        model: provider.transcriptionModel,
        requestTranscription: createOpenAiCompatibleAudioTranscriptionRequester({
          baseUrl: provider.baseUrl
        })
      }).transcribeChunk(request);
    }
  };
}
