import { readFile as nodeReadFile } from "node:fs/promises";
import { basename } from "node:path";
import type {
  OpenAiAudioTranscriptionRequester,
  OpenAiAudioTranscriptionResponse
} from "../transcription/openAiTranscriptionClient.js";
import type {
  OpenAiMeetingStructureRequester,
  OpenAiMeetingStructureResponse
} from "../intelligence/openAiMeetingStructureClient.js";
import type { LlmApiStyle } from "./llmProviderConfig.js";

const OPENAI_AUDIO_TRANSCRIPTIONS_URL =
  "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type OpenAiFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type OpenAiFetch = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: unknown;
  }
) => Promise<OpenAiFetchResponse>;

export type OpenAiRequesterDependencies = {
  fetch?: OpenAiFetch;
  readFile?: (filePath: string) => Promise<Uint8Array>;
};

export function createOpenAiRequesters(
  dependencies: OpenAiRequesterDependencies = {}
): {
  requestTranscription: OpenAiAudioTranscriptionRequester;
  requestStructure: OpenAiMeetingStructureRequester;
} {
  return {
    requestTranscription: createOpenAiAudioTranscriptionRequester(dependencies),
    requestStructure: createOpenAiMeetingStructureRequester(dependencies)
  };
}

export function createOpenAiAudioTranscriptionRequester(
  dependencies: OpenAiRequesterDependencies = {}
): OpenAiAudioTranscriptionRequester {
  const fetchImpl = dependencies.fetch ?? (globalThis.fetch as OpenAiFetch);
  const readFile = dependencies.readFile ?? nodeReadFile;

  return async (request) => {
    const audioBytes = await readFile(request.filePath);
    const audioFileBytes = new Uint8Array(audioBytes.byteLength);
    audioFileBytes.set(audioBytes);
    const formData = new FormData();
    const audioMimeType = getAudioMimeType(request.filePath);
    const audioBlob = new Blob([audioFileBytes], {
      type: audioMimeType
    });

    formData.set(
      "file",
      new File([audioBlob], basename(request.filePath), {
        type: audioMimeType
      })
    );
    formData.set("model", request.model);
    formData.set("response_format", request.responseFormat);
    if (request.language) {
      formData.set("language", request.language);
    }
    if (request.prompt) {
      formData.set("prompt", request.prompt);
    }
    request.timestampGranularities?.forEach((granularity) => {
      formData.append("timestamp_granularities[]", granularity);
    });

    const response = await fetchImpl(OPENAI_AUDIO_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.apiKey}`
      },
      body: formData
    });

    const json = await readJsonResponse(response);
    if (!response.ok) {
      throw createOpenAiHttpError(json, response.status);
    }

    return json as OpenAiAudioTranscriptionResponse;
  };
}

function getAudioMimeType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".m4a") || lowerPath.endsWith(".mp4")) {
    return "audio/mp4";
  }

  if (lowerPath.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  return "audio/wav";
}
export function createOpenAiMeetingStructureRequester(
  dependencies: Pick<OpenAiRequesterDependencies, "fetch"> = {}
): OpenAiMeetingStructureRequester {
  const fetchImpl = dependencies.fetch ?? (globalThis.fetch as OpenAiFetch);

  return async (request) => {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model,
        instructions: request.instructions,
        input: request.input,
        text: request.text
      })
    });

    const json = await readJsonResponse(response);
    if (!response.ok) {
      throw createOpenAiHttpError(json, response.status);
    }

    return normalizeResponsesOutput(json);
  };
}

export function createOpenAiCompatibleMeetingStructureRequester({
  apiStyle,
  baseUrl,
  fetch: fetchOverride
}: {
  apiStyle: LlmApiStyle;
  baseUrl: string;
  fetch?: OpenAiFetch;
}): OpenAiMeetingStructureRequester {
  const fetchImpl = fetchOverride ?? (globalThis.fetch as OpenAiFetch);
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return async (request) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (request.apiKey) {
      headers.Authorization = `Bearer ${request.apiKey}`;
    }

    const isChatCompletions = apiStyle === "chat_completions";
    const response = await fetchImpl(
      `${normalizedBaseUrl}/${isChatCompletions ? "chat/completions" : "responses"}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(isChatCompletions
          ? {
              model: request.model,
              messages: [
                { role: "system", content: request.instructions },
                { role: "user", content: request.input }
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: request.text.format.name,
                  strict: request.text.format.strict,
                  schema: request.text.format.schema
                }
              },
              temperature: 0
            }
          : {
              model: request.model,
              instructions: request.instructions,
              input: request.input,
              text: request.text
            })
      }
    );
    const json = await readJsonResponse(response);
    if (!response.ok) {
      throw createOpenAiHttpError(json, response.status);
    }
    return isChatCompletions
      ? normalizeChatCompletionsOutput(json)
      : normalizeResponsesOutput(json);
  };
}

async function readJsonResponse(response: OpenAiFetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw Object.assign(new Error("OpenAI returned an invalid JSON response"), {
      status: response.status,
      cause: error
    });
  }
}

function normalizeResponsesOutput(json: unknown): OpenAiMeetingStructureResponse {
  if (!isRecord(json)) {
    return {};
  }

  if (typeof json.output_text === "string") {
    return { outputText: json.output_text };
  }

  const outputText = findResponsesOutputText(json.output);
  return outputText ? { outputText } : { outputJson: json };
}

function normalizeChatCompletionsOutput(json: unknown): OpenAiMeetingStructureResponse {
  if (!isRecord(json) || !Array.isArray(json.choices)) {
    return {};
  }
  const firstChoice = json.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return {};
  }
  const content = firstChoice.message.content;
  return typeof content === "string" ? { outputText: content } : {};
}

function findResponsesOutputText(output: unknown): string | undefined {
  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return undefined;
}

function createOpenAiHttpError(json: unknown, status: number): Error {
  const providerError = isRecord(json) && isRecord(json.error) ? json.error : {};
  const code =
    typeof providerError.code === "string" ? providerError.code : undefined;
  const message =
    code === "invalid_api_key"
      ? "OpenAI request failed: invalid API key."
      : typeof providerError.message === "string"
      ? providerError.message
      : `OpenAI request failed with status ${status}`;

  return Object.assign(new Error(message), {
    status,
    code
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
