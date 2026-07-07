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

export type SettingsManagerOptions = {
  applyOpenAtStartup?: (enabled: boolean) => void;
  configPath: string;
  env?: NodeJS.ProcessEnv;
};

const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const DEFAULT_OPENAI_STRUCTURE_MODEL = "gpt-4.1-mini";

export function createSettingsManager({
  applyOpenAtStartup,
  configPath,
  env = process.env
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
    const apiKey = env.OPENAI_API_KEY?.trim();
    return {
      openAi: {
        configured: Boolean(apiKey),
        source: apiKey ? ".env or process environment" : "missing OPENAI_API_KEY",
        structureModel: env.OPENAI_STRUCTURE_MODEL ?? DEFAULT_OPENAI_STRUCTURE_MODEL,
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
    defaultMicrophoneDeviceId: normalizeNullableString(candidate.defaultMicrophoneDeviceId),
    defaultSystemAudioDeviceId: normalizeNullableString(candidate.defaultSystemAudioDeviceId),
    defaultOutputLanguage: isOneOf(candidate.defaultOutputLanguage, ["zh", "en", "bilingual"])
      ? candidate.defaultOutputLanguage
      : DEFAULT_APP_SETTINGS.defaultOutputLanguage,
    speakerDiarization: false,
    theme: isOneOf(candidate.theme, ["light", "dark"]) ? candidate.theme : DEFAULT_APP_SETTINGS.theme,
    uploadSeparateTracks: true,
    useOutputLanguage: true,
    uiLanguage: isOneOf(candidate.uiLanguage, ["en", "zh", "bi"]) ? candidate.uiLanguage : DEFAULT_APP_SETTINGS.uiLanguage
  } as AppSettings;
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
