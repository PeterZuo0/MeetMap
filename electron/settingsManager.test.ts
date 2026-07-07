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
      defaultOutputLanguage: "en",
      defaultMicrophoneDeviceId: "microphone:usb"
    });

    await expect(createSettingsManager({ configPath }).load()).resolves.toEqual(
      expect.objectContaining({
        defaultOutputLanguage: "en",
        defaultMicrophoneDeviceId: "microphone:usb"
      })
    );
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
