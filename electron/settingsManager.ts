import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppSettings, SettingsRuntimeStatus } from "../src/features/settings/appSettings.js";
import { DEFAULT_APP_SETTINGS } from "../src/features/settings/appSettings.js";

export type SettingsManager = {
  get(): Promise<AppSettings>;
  getRuntimeStatus(): Promise<SettingsRuntimeStatus>;
  load(): Promise<AppSettings>;
  update(settings: AppSettings): Promise<AppSettings>;
};

export type ConfiguredTranscriptionProvider = {
  name: string;
  model: string;
  transcriptionModel: string;
};

export type SettingsManagerOptions = {
  applyOpenAtStartup?: (enabled: boolean) => void;
  configPath: string;
  env?: NodeJS.ProcessEnv;
  /** The provider saved in settings, which outranks environment credentials. */
  getConfiguredProvider?: () => ConfiguredTranscriptionProvider | null;
};

const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_OPENAI_STRUCTURE_MODEL = "gpt-4.1-mini";

export function createSettingsManager({
  applyOpenAtStartup,
  configPath,
  env = process.env,
  getConfiguredProvider
}: SettingsManagerOptions): SettingsManager {
  let settings = DEFAULT_APP_SETTINGS;
  let loaded = false;

  async function load(): Promise<AppSettings> {
    try {
      settings = normalizeSettings(JSON.parse(await readFile(configPath, "utf8")));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
      settings = DEFAULT_APP_SETTINGS;
    }

    loaded = true;
    return settings;
  }

  async function get(): Promise<AppSettings> {
    if (!loaded) {
      await load();
    }

    return settings;
  }

  async function update(nextSettings: AppSettings): Promise<AppSettings> {
    settings = normalizeSettings(nextSettings);
    loaded = true;
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    applyOpenAtStartup?.(settings.openAtStartup);
    return settings;
  }

  async function getRuntimeStatus(): Promise<SettingsRuntimeStatus> {
    const provider = getConfiguredProvider?.() ?? null;
    if (provider?.transcriptionModel.trim()) {
      return {
        openAi: {
          configured: true,
          source: provider.name,
          structureModel: provider.model,
          transcriptionModel: provider.transcriptionModel
        }
      };
    }

    const apiKey = env.OPENAI_API_KEY?.trim();
    return {
      openAi: {
        configured: Boolean(apiKey),
        source: apiKey
          ? ".env or process environment"
          : provider
            ? `${provider.name}（未选择转写模型）`
            : "missing OPENAI_API_KEY",
        structureModel: provider?.model ?? env.OPENAI_STRUCTURE_MODEL ?? DEFAULT_OPENAI_STRUCTURE_MODEL,
        transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL ?? DEFAULT_OPENAI_TRANSCRIPTION_MODEL
      }
    };
  }

  return {
    get,
    getRuntimeStatus,
    load,
    update
  };
}

function normalizeSettings(input: unknown): AppSettings {
  const candidate = isRecord(input) ? input : {};
  return {
    ...DEFAULT_APP_SETTINGS,
    ...candidate,
    accent: typeof candidate.accent === "string" ? candidate.accent : DEFAULT_APP_SETTINGS.accent,
    customVocabulary: normalizeCustomVocabulary(candidate.customVocabulary),
    defaultMicrophoneDeviceId: normalizeNullableString(candidate.defaultMicrophoneDeviceId),
    defaultSystemAudioDeviceId: normalizeNullableString(candidate.defaultSystemAudioDeviceId),
    defaultOutputLanguage: isOneOf(candidate.defaultOutputLanguage, ["zh", "en", "bilingual"])
      ? candidate.defaultOutputLanguage
      : DEFAULT_APP_SETTINGS.defaultOutputLanguage,
    speakerDiarization: false,
    summaryInstructions: normalizeSummaryInstructions(candidate.summaryInstructions),
    theme: isOneOf(candidate.theme, ["light", "dark"]) ? candidate.theme : DEFAULT_APP_SETTINGS.theme,
    uploadSeparateTracks: true,
    useOutputLanguage: true,
    uiLanguage: isOneOf(candidate.uiLanguage, ["en", "zh", "bi"]) ? candidate.uiLanguage : DEFAULT_APP_SETTINGS.uiLanguage
  } as AppSettings;
}

function normalizeCustomVocabulary(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 80))]
    .slice(0, 100);
}

function normalizeSummaryInstructions(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 1000) : "";
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isOneOf<const T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
