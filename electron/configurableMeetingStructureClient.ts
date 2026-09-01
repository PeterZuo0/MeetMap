import type { MeetingStructureClient } from "../src/features/intelligence/meetingStructureClient.js";
import { createOpenAiMeetingStructureClient } from "../src/features/intelligence/openAiMeetingStructureClient.js";
import { createOpenAiCompatibleMeetingStructureRequester } from "../src/features/providers/openAiRequesters.js";
import type { LlmProviderWithSecret } from "../src/features/providers/llmProviderConfig.js";
import type { LlmProviderManager } from "./llmProviderManager.js";

export function createConfigurableMeetingStructureClient({
  fallbackProvider,
  providerManager
}: {
  fallbackProvider?: LlmProviderWithSecret;
  providerManager: LlmProviderManager;
}): MeetingStructureClient {
  return {
    async extractStructure(request) {
      const provider = providerManager.getActiveProviderWithSecret() ?? fallbackProvider;
      if (!provider) {
        throw new Error("请先在 Edit → 设置中配置并启用一个 LLM 提供商。");
      }

      return createOpenAiMeetingStructureClient({
        apiKey: provider.apiKey,
        model: provider.model,
        requestStructure: createOpenAiCompatibleMeetingStructureRequester({
          apiStyle: provider.apiStyle,
          baseUrl: provider.baseUrl
        })
      }).extractStructure(request);
    }
  };
}
