import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import { SettingsScreen, type SettingsSectionId } from "./SettingsScreen";
import { DEFAULT_APP_SETTINGS } from "./theme";
import type { AppSettings } from "../meetMapApi";

function renderSettings(initialSection: SettingsSectionId) {
  function Harness() {
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
    return <SettingsScreen initialSection={initialSection} onChange={setSettings} settings={settings} />;
  }

  return render(<Harness />);
}

test("general startup switches can be changed", () => {
  renderSettings("general");

  const windowsStartup = screen.getByRole("switch", { name: "Open at Windows startup" });
  const trayOnClose = screen.getByRole("switch", { name: "Minimize to tray on close" });

  expect(windowsStartup).toHaveAttribute("aria-checked", "true");
  expect(trayOnClose).toHaveAttribute("aria-checked", "true");

  fireEvent.click(windowsStartup);
  fireEvent.click(trayOnClose);

  expect(windowsStartup).toHaveAttribute("aria-checked", "false");
  expect(trayOnClose).toHaveAttribute("aria-checked", "false");
});

test("audio device toggles can be changed before recording", () => {
  renderSettings("audio");

  const noiseSuppression = screen.getByRole("switch", { name: "Noise suppression" });
  const autoGain = screen.getByRole("switch", { name: "Auto-gain control" });

  expect(noiseSuppression).toHaveAttribute("aria-checked", "true");
  expect(autoGain).toHaveAttribute("aria-checked", "false");

  fireEvent.click(noiseSuppression);
  fireEvent.click(autoGain);

  expect(noiseSuppression).toHaveAttribute("aria-checked", "false");
  expect(autoGain).toHaveAttribute("aria-checked", "true");
});

test("recognition language switches are interactive", () => {
  renderSettings("language");

  const cantonese = screen.getByRole("switch", { name: "Cantonese (zh-HK)" });
  const codeSwitching = screen.getByRole("switch", { name: "Mixed code-switching" });

  expect(cantonese).toHaveAttribute("aria-checked", "false");
  expect(codeSwitching).toHaveAttribute("aria-checked", "true");

  fireEvent.click(cantonese);
  fireEvent.click(codeSwitching);

  expect(cantonese).toHaveAttribute("aria-checked", "true");
  expect(codeSwitching).toHaveAttribute("aria-checked", "false");
});

test("export default controls can be adjusted", () => {
  renderSettings("export");

  fireEvent.click(screen.getByRole("button", { name: "Radial" }));
  expect(screen.getByRole("button", { name: "Radial" })).toHaveClass("active");
  expect(screen.getByRole("button", { name: "Radial" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Tree" })).not.toHaveClass("active");
  expect(screen.getByRole("button", { name: "Tree" })).toHaveAttribute("aria-pressed", "false");

  const openAfterExport = screen.getByRole("switch", { name: "Open after export" });
  expect(openAfterExport).toHaveAttribute("aria-checked", "false");

  fireEvent.click(openAfterExport);

  expect(openAfterExport).toHaveAttribute("aria-checked", "true");
});

test("transcription and summary switches can be changed", () => {
  renderSettings("transcription");

  const diarization = screen.getByRole("switch", { name: "Speaker diarization" });
  const outputLanguage = screen.getByRole("switch", { name: "Use output language setting" });

  expect(diarization).toHaveAttribute("aria-checked", "true");
  expect(outputLanguage).toHaveAttribute("aria-checked", "true");

  fireEvent.click(diarization);
  fireEvent.click(outputLanguage);

  expect(diarization).toHaveAttribute("aria-checked", "false");
  expect(outputLanguage).toHaveAttribute("aria-checked", "false");
});

test("privacy and storage switches can be changed", () => {
  renderSettings("privacy");

  const deleteCloudCopies = screen.getByRole("switch", { name: "Auto-delete cloud processing copies" });
  const keepArtifacts = screen.getByRole("switch", { name: "Keep intermediate artifacts" });

  expect(deleteCloudCopies).toHaveAttribute("aria-checked", "true");
  expect(keepArtifacts).toHaveAttribute("aria-checked", "true");

  fireEvent.click(deleteCloudCopies);
  fireEvent.click(keepArtifacts);

  expect(deleteCloudCopies).toHaveAttribute("aria-checked", "false");
  expect(keepArtifacts).toHaveAttribute("aria-checked", "false");
});

test("settings values survive a SettingsScreen remount when held by the parent settings model", () => {
  let parentSettings = DEFAULT_APP_SETTINGS;
  const onChange = vi.fn((nextSettings: AppSettings) => {
    parentSettings = nextSettings;
  });
  const { unmount } = render(
    <SettingsScreen initialSection="audio" onChange={onChange} settings={parentSettings} />
  );

  fireEvent.click(screen.getByRole("switch", { name: "Noise suppression" }));
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ noiseSuppression: false }));
  unmount();

  render(<SettingsScreen initialSection="audio" onChange={onChange} settings={parentSettings} />);

  expect(screen.getByRole("switch", { name: "Noise suppression" })).toHaveAttribute("aria-checked", "false");
});
