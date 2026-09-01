import { ipcMain } from "electron";
import type { SaveLlmProviderInput } from "../../src/features/providers/llmProviderConfig.js";
import type { LlmProviderManager } from "../llmProviderManager.js";

export function registerLlmProviderIpc({
  providerManager
}: {
  providerManager: LlmProviderManager;
}): void {
  ipcMain.handle("llm-provider:get", async () => providerManager.getState());
  ipcMain.handle("llm-provider:save", async (_event, input: SaveLlmProviderInput) =>
    providerManager.saveProvider(input));
  ipcMain.handle("llm-provider:delete", async (_event, providerId: string) =>
    providerManager.deleteProvider(providerId));
  ipcMain.handle("llm-provider:set-active", async (_event, providerId: string | null) =>
    providerManager.setActiveProvider(providerId));
}
