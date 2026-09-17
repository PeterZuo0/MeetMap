import { beforeEach, expect, test, vi } from "vitest";
import type { LlmProviderManager } from "../llmProviderManager";
import { registerLlmProviderIpc, type LlmModelListFetch } from "./llmProviderIpc";

const electronMock = vi.hoisted(() => ({
  ipcMainHandle: vi.fn()
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.ipcMainHandle
  }
}));

type IpcHandler = (event: unknown, ...args: never[]) => Promise<unknown>;

const handlers = new Map<string, IpcHandler>();

beforeEach(() => {
  handlers.clear();
  electronMock.ipcMainHandle.mockReset();
  electronMock.ipcMainHandle.mockImplementation(
    (channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }
  );
});

function getHandler(channel: string): IpcHandler {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler: ${channel}`);
  }

  return handler;
}

function createProviderManager(secret: string | null = null): LlmProviderManager {
  return {
    load: vi.fn(),
    getState: vi.fn(),
    saveProvider: vi.fn(),
    deleteProvider: vi.fn(),
    setActiveProvider: vi.fn(),
    getActiveProviderWithSecret: vi.fn(),
    getProviderSecret: vi.fn(() => secret)
  } as unknown as LlmProviderManager;
}

test("lists models from an OpenAI-compatible endpoint using the typed key", async () => {
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: "gpt-4o-mini" }, { id: "gpt-4.1-mini" }] })
  })) as unknown as LlmModelListFetch;
  registerLlmProviderIpc({ fetch: fetchImpl, providerManager: createProviderManager() });

  const models = await getHandler("llm-provider:list-models")(null, {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-typed"
  } as never);

  expect(models).toEqual(["gpt-4.1-mini", "gpt-4o-mini"]);
  expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
    headers: { Authorization: "Bearer sk-typed" }
  });
});

test("falls back to the stored key when editing a saved provider", async () => {
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [{ id: "qwen3:8b" }] })
  })) as unknown as LlmModelListFetch;
  registerLlmProviderIpc({
    fetch: fetchImpl,
    providerManager: createProviderManager("sk-stored")
  });

  await getHandler("llm-provider:list-models")(null, {
    baseUrl: "https://api.example.com/v1",
    providerId: "provider-1"
  } as never);

  expect(fetchImpl).toHaveBeenCalledWith("https://api.example.com/v1/models", {
    headers: { Authorization: "Bearer sk-stored" }
  });
});

test("omits the authorization header for a key-less local service", async () => {
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [] })
  })) as unknown as LlmModelListFetch;
  registerLlmProviderIpc({ fetch: fetchImpl, providerManager: createProviderManager() });

  await getHandler("llm-provider:list-models")(null, {
    baseUrl: "http://localhost:11434/v1"
  } as never);

  expect(fetchImpl).toHaveBeenCalledWith("http://localhost:11434/v1/models", { headers: {} });
});

test("reports an unreachable or unauthorized endpoint", async () => {
  const fetchImpl = vi.fn(async () => ({
    ok: false,
    status: 401,
    json: async () => ({})
  })) as unknown as LlmModelListFetch;
  registerLlmProviderIpc({ fetch: fetchImpl, providerManager: createProviderManager() });

  await expect(getHandler("llm-provider:list-models")(null, {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-wrong"
  } as never)).rejects.toThrow(/HTTP 401/);
});
