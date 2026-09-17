/**
 * Every OpenAI-compatible service (OpenAI, Ollama, LM Studio, vLLM, …) exposes
 * `GET {baseUrl}/models`, so the model field can offer a real list instead of
 * asking the user to remember an exact id.
 */

export type ModelListRequest = {
  baseUrl: string;
  apiKey?: string;
  providerId?: string;
};

export function createModelsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("请先填写 API Base URL。");
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error("API Base URL 需要以 http:// 或 https:// 开头。");
  }
  return trimmed.endsWith("/models") ? trimmed : `${trimmed}/models`;
}

/** Accepts the OpenAI `{ data: [{ id }] }` shape and the bare-array variants. */
export function parseModelListResponse(payload: unknown): string[] {
  const entries = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : isRecord(payload) && Array.isArray(payload.models)
        ? payload.models
        : null;

  if (!entries) {
    throw new Error("模型列表响应格式无法识别。");
  }

  const ids = entries
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (!isRecord(entry)) {
        return "";
      }
      return typeof entry.id === "string"
        ? entry.id
        : typeof entry.name === "string"
          ? entry.name
          : "";
    })
    .map((id) => id.trim())
    .filter(Boolean);

  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

/**
 * The dropdown always keeps the currently configured model selectable, even
 * when the service is unreachable or no longer lists it.
 */
export function buildModelOptions({
  current,
  fallback = [],
  fetched = []
}: {
  current: string;
  fallback?: string[];
  fetched?: string[];
}): string[] {
  const options = fetched.length > 0 ? [...fetched] : [...fallback];
  const trimmedCurrent = current.trim();
  if (trimmedCurrent && !options.includes(trimmedCurrent)) {
    options.unshift(trimmedCurrent);
  }
  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
