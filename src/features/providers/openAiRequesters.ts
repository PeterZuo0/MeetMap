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
    const audioBlob = new Blob([audioFileBytes], {
      type: "audio/wav"
    });

    formData.set(
      "file",
      new File([audioBlob], basename(request.filePath), {
        type: "audio/wav"
      })
    );
    formData.set("model", request.model);
    formData.set("response_format", request.responseFormat);
    request.timestampGranularities.forEach((granularity) => {
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
