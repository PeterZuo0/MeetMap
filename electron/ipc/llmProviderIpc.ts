import { ipcMain } from "electron";
import {
  createModelsUrl,
  parseModelListResponse,
  type ModelListRequest
} from "../../src/features/providers/llmModelCatalog.js";
import type { SaveLlmProviderInput } from "../../src/features/providers/llmProviderConfig.js";
import type { LlmProviderManager } from "../llmProviderManager.js";

export type LlmModelListFetch = (
  input: string,
  init: { headers: Record<string, string> }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function registerLlmProviderIpc({
  fetch: fetchImpl,
  providerManager
}: {
  fetch?: LlmModelListFetch;
  providerManager: LlmProviderManager;
}): void {
  const request = fetchImpl ?? (globalThis.fetch as unknown as LlmModelListFetch);

  ipcMain.handle("llm-provider:get", async () => providerManager.getState());
  ipcMain.handle("llm-provider:save", async (_event, input: SaveLlmProviderInput) =>
    providerManager.saveProvider(input));
  ipcMain.handle("llm-provider:delete", async (_event, providerId: string) =>
    providerManager.deleteProvider(providerId));
  ipcMain.handle("llm-provider:set-active", async (_event, providerId: string | null) =>
    providerManager.setActiveProvider(providerId));
  ipcMain.handle("llm-provider:list-models", async (_event, input: unknown): Promise<string[]> => {
    const parsed = parseModelListRequest(input);
    const url = createModelsUrl(parsed.baseUrl);
    // An edited provider keeps its saved key, so the renderer never has to
    // re-send a secret it does not hold.
    const apiKey = parsed.apiKey?.trim()
      || (parsed.providerId ? providerManager.getProviderSecret(parsed.providerId) ?? "" : "");
    const response = await request(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
    });

    if (!response.ok) {
      throw new Error(`获取模型列表失败（HTTP ${response.status}）。请检查 Base URL 和 API Key。`);
    }

    return parseModelListResponse(await response.json());
  });
}

function parseModelListRequest(input: unknown): ModelListRequest {
  if (typeof input !== "object" || input === null) {
    throw new Error("Invalid model list request");
  }

  const value = input as Record<string, unknown>;
  if (typeof value.baseUrl !== "string") {
    throw new Error("Invalid model list request");
  }

  return {
    baseUrl: value.baseUrl,
    apiKey: typeof value.apiKey === "string" ? value.apiKey : undefined,
    providerId: typeof value.providerId === "string" ? value.providerId : undefined
  };
}
