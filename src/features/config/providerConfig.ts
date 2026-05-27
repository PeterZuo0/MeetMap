export type ProviderConfig =
  | {
      mode: "demo";
    }
  | {
      mode: "production";
      transcription: OpenAiProviderConfig;
      structure: OpenAiProviderConfig;
    };

export type OpenAiProviderConfig = {
  provider: "openai";
  apiKey: string;
  model: string;
};

const DEFAULT_TRANSCRIPTION_PROVIDER = "openai";
const DEFAULT_LLM_PROVIDER = "openai";
const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_OPENAI_STRUCTURE_MODEL = "gpt-4.1-mini";

export function parseProviderConfig(
  env: Partial<
    Pick<
    NodeJS.ProcessEnv,
    | "MEETMAP_DEMO_MODE"
    | "MEETMAP_TRANSCRIPTION_PROVIDER"
    | "MEETMAP_LLM_PROVIDER"
    | "OPENAI_API_KEY"
    | "OPENAI_TRANSCRIPTION_MODEL"
    | "OPENAI_STRUCTURE_MODEL"
    >
  >
): ProviderConfig {
  if (env.MEETMAP_DEMO_MODE === "1") {
    return { mode: "demo" };
  }

  const transcriptionProvider =
    env.MEETMAP_TRANSCRIPTION_PROVIDER ?? DEFAULT_TRANSCRIPTION_PROVIDER;
  const llmProvider = env.MEETMAP_LLM_PROVIDER ?? DEFAULT_LLM_PROVIDER;

  if (transcriptionProvider !== "openai") {
    throw new Error(`Unsupported transcription provider: ${transcriptionProvider}`);
  }

  if (llmProvider !== "openai") {
    throw new Error(`Unsupported LLM provider: ${llmProvider}`);
  }

  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for production OpenAI providers");
  }

  return {
    mode: "production",
    transcription: {
      provider: "openai",
      apiKey,
      model: env.OPENAI_TRANSCRIPTION_MODEL ?? DEFAULT_OPENAI_TRANSCRIPTION_MODEL
    },
    structure: {
      provider: "openai",
      apiKey,
      model: env.OPENAI_STRUCTURE_MODEL ?? DEFAULT_OPENAI_STRUCTURE_MODEL
    }
  };
}
