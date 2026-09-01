import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  LLM_API_STYLES,
  type LlmApiStyle,
  type LlmProviderProfile,
  type LlmProviderState,
  type LlmProviderWithSecret,
  type SaveLlmProviderInput
} from "../src/features/providers/llmProviderConfig.js";

type StoredLlmProvider = Omit<LlmProviderProfile, "apiKeyConfigured"> & {
  encryptedApiKey: string;
};

type StoredLlmProviderState = {
  activeProviderId: string | null;
  providers: StoredLlmProvider[];
};

export type LlmProviderManager = {
  load(): Promise<LlmProviderState>;
  getState(): LlmProviderState;
  saveProvider(input: SaveLlmProviderInput): Promise<LlmProviderState>;
  deleteProvider(providerId: string): Promise<LlmProviderState>;
  setActiveProvider(providerId: string | null): Promise<LlmProviderState>;
  getActiveProviderWithSecret(): LlmProviderWithSecret | null;
};

export function createLlmProviderManager({
  configPath,
  decryptSecret,
  encryptSecret
}: {
  configPath: string;
  decryptSecret(value: string): string;
  encryptSecret(value: string): string;
}): LlmProviderManager {
  let storedState: StoredLlmProviderState = { activeProviderId: null, providers: [] };

  async function persist(): Promise<void> {
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(storedState, null, 2)}\n`, "utf8");
  }

  function getState(): LlmProviderState {
    return {
      activeProviderId: storedState.activeProviderId,
      providers: storedState.providers.map(toPublicProfile)
    };
  }

  return {
    async load() {
      try {
        const parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
        storedState = parseStoredState(parsed);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
      return getState();
    },
    getState,
    async saveProvider(input) {
      const parsed = parseProviderInput(input);
      const existing = parsed.id
        ? storedState.providers.find((provider) => provider.id === parsed.id)
        : undefined;
      const id = existing?.id ?? randomUUID();
      const apiKey = parsed.apiKey.trim();
      const encryptedApiKey = apiKey
        ? encryptSecret(apiKey)
        : parsed.apiKeyRequired
          ? existing?.encryptedApiKey ?? ""
          : "";

      if (parsed.apiKeyRequired && !encryptedApiKey) {
        throw new Error("需要填写 API Key 才能保存这个提供商。");
      }

      const saved: StoredLlmProvider = {
        id,
        name: parsed.name,
        baseUrl: parsed.baseUrl,
        model: parsed.model,
        apiStyle: parsed.apiStyle,
        apiKeyRequired: parsed.apiKeyRequired,
        encryptedApiKey
      };
      storedState = {
        activeProviderId: storedState.activeProviderId ?? id,
        providers: [saved, ...storedState.providers.filter((provider) => provider.id !== id)]
      };
      await persist();
      return getState();
    },
    async deleteProvider(providerId) {
      const id = parseProviderId(providerId);
      const providers = storedState.providers.filter((provider) => provider.id !== id);
      if (providers.length === storedState.providers.length) {
        throw new Error("找不到要删除的 LLM 提供商。");
      }
      storedState = {
        activeProviderId: storedState.activeProviderId === id
          ? providers[0]?.id ?? null
          : storedState.activeProviderId,
        providers
      };
      await persist();
      return getState();
    },
    async setActiveProvider(providerId) {
      if (providerId === null) {
        storedState = { ...storedState, activeProviderId: null };
      } else {
        const id = parseProviderId(providerId);
        if (!storedState.providers.some((provider) => provider.id === id)) {
          throw new Error("找不到要启用的 LLM 提供商。");
        }
        storedState = { ...storedState, activeProviderId: id };
      }
      await persist();
      return getState();
    },
    getActiveProviderWithSecret() {
      const active = storedState.providers.find(
        (provider) => provider.id === storedState.activeProviderId
      );
      if (!active) {
        return null;
      }
      return {
        id: active.id,
        name: active.name,
        baseUrl: active.baseUrl,
        model: active.model,
        apiStyle: active.apiStyle,
        apiKeyRequired: active.apiKeyRequired,
        apiKey: active.encryptedApiKey ? decryptSecret(active.encryptedApiKey) : ""
      };
    }
  };
}

function toPublicProfile(provider: StoredLlmProvider): LlmProviderProfile {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiStyle: provider.apiStyle,
    apiKeyRequired: provider.apiKeyRequired,
    apiKeyConfigured: Boolean(provider.encryptedApiKey)
  };
}

function parseProviderInput(input: SaveLlmProviderInput): Required<SaveLlmProviderInput> {
  if (!input || typeof input !== "object") {
    throw new Error("LLM 提供商配置无效。");
  }
  const name = parseShortText(input.name, "提供商名称", 80);
  const model = parseShortText(input.model, "模型名称", 160);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiStyle = parseApiStyle(input.apiStyle);
  const apiKeyRequired = input.apiKeyRequired !== false;
  const parsedUrl = new URL(baseUrl);
  if (apiKeyRequired && parsedUrl.protocol !== "https:" && !isLoopbackHost(parsedUrl.hostname)) {
    throw new Error("携带 API Key 的远程服务必须使用 https；本机 localhost 地址可以使用 http。");
  }
  return {
    id: input.id ? parseProviderId(input.id) : "",
    name,
    model,
    baseUrl,
    apiStyle,
    apiKeyRequired,
    apiKey: typeof input.apiKey === "string" ? input.apiKey : ""
  };
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseStoredState(input: unknown): StoredLlmProviderState {
  if (!isRecord(input) || !Array.isArray(input.providers)) {
    return { activeProviderId: null, providers: [] };
  }
  const providers = input.providers.flatMap((value) => {
    try {
      if (!isRecord(value)) {
        return [];
      }
      return [{
        id: parseProviderId(value.id),
        name: parseShortText(value.name, "提供商名称", 80),
        baseUrl: normalizeBaseUrl(value.baseUrl),
        model: parseShortText(value.model, "模型名称", 160),
        apiStyle: parseApiStyle(value.apiStyle),
        apiKeyRequired: value.apiKeyRequired !== false,
        encryptedApiKey: typeof value.encryptedApiKey === "string" ? value.encryptedApiKey : ""
      } satisfies StoredLlmProvider];
    } catch {
      return [];
    }
  });
  const activeProviderId = typeof input.activeProviderId === "string" &&
    providers.some((provider) => provider.id === input.activeProviderId)
    ? input.activeProviderId
    : providers[0]?.id ?? null;
  return { activeProviderId, providers };
}

function normalizeBaseUrl(value: unknown): string {
  const text = parseShortText(value, "API Base URL", 500).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("API Base URL 必须是有效的 http 或 https 地址。");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API Base URL 只支持 http 或 https。");
  }
  return text;
}

function parseApiStyle(value: unknown): LlmApiStyle {
  if (typeof value === "string" && LLM_API_STYLES.includes(value as LlmApiStyle)) {
    return value as LlmApiStyle;
  }
  throw new Error("不支持的 LLM API 类型。");
}

function parseProviderId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
    throw new Error("LLM 提供商 ID 无效。");
  }
  return value;
}

function parseShortText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label}不能为空，且不能超过 ${maxLength} 个字符。`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
