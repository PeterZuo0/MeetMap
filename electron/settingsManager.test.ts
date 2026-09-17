import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

import { DEFAULT_APP_SETTINGS } from "../src/features/settings/appSettings";
import { createSettingsManager } from "./settingsManager";

test("loads default settings when no settings file exists", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-settings-manager-"));

  try {
    const manager = createSettingsManager({
      configPath: join(baseDirectory, "settings.json")
    });

    await expect(manager.load()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("persists settings and reloads them from disk", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-settings-manager-"));

  try {
    const configPath = join(baseDirectory, "settings.json");
    const manager = createSettingsManager({ configPath });
    await manager.update({
      ...DEFAULT_APP_SETTINGS,
      customVocabulary: ["MeetMap", "PowerApps"],
      defaultOutputLanguage: "en",
      defaultMicrophoneDeviceId: "microphone:usb",
      summaryInstructions: "优先总结客户反馈。"
    });

    await expect(createSettingsManager({ configPath }).load()).resolves.toEqual(
      expect.objectContaining({
        defaultOutputLanguage: "en",
        defaultMicrophoneDeviceId: "microphone:usb",
        customVocabulary: ["MeetMap", "PowerApps"],
        summaryInstructions: "优先总结客户反馈。"
      })
    );
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("normalizes invalid or duplicated custom content from disk", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-settings-manager-"));

  try {
    const configPath = join(baseDirectory, "settings.json");
    const manager = createSettingsManager({ configPath });
    await manager.update({
      ...DEFAULT_APP_SETTINGS,
      customVocabulary: [" MeetMap ", "MeetMap", "", "x".repeat(81)],
      summaryInstructions: `  ${"a".repeat(1100)}  `
    });

    await expect(manager.get()).resolves.toMatchObject({
      customVocabulary: ["MeetMap"],
      summaryInstructions: "a".repeat(1000)
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("applies Windows startup integration when open at startup changes", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-settings-manager-"));
  const applyOpenAtStartup = vi.fn();

  try {
    const manager = createSettingsManager({
      applyOpenAtStartup,
      configPath: join(baseDirectory, "settings.json")
    });

    await manager.update({
      ...DEFAULT_APP_SETTINGS,
      openAtStartup: false
    });

    expect(applyOpenAtStartup).toHaveBeenCalledWith(false);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("reports a saved provider with a transcription model as the configured service", async () => {
  const manager = createSettingsManager({
    configPath: join(tmpdir(), "meetmap-settings-status.json"),
    env: {},
    getConfiguredProvider: () => ({
      name: "公司 Azure OpenAI",
      model: "gpt-4.1-mini",
      transcriptionModel: "gpt-4o-mini-transcribe"
    })
  });

  await expect(manager.getRuntimeStatus()).resolves.toEqual({
    openAi: {
      configured: true,
      source: "公司 Azure OpenAI",
      structureModel: "gpt-4.1-mini",
      transcriptionModel: "gpt-4o-mini-transcribe"
    }
  });
});

test("stays unconfigured while the enabled provider has no transcription model", async () => {
  const manager = createSettingsManager({
    configPath: join(tmpdir(), "meetmap-settings-status.json"),
    env: {},
    getConfiguredProvider: () => ({
      name: "Ollama（本地）",
      model: "qwen3:8b",
      transcriptionModel: ""
    })
  });

  const status = await manager.getRuntimeStatus();
  expect(status.openAi.configured).toBe(false);
  expect(status.openAi.source).toBe("Ollama（本地）（未选择转写模型）");
});
