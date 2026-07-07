import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { vi } from "vitest";

import { SettingsScreen, type SettingsSectionId } from "./SettingsScreen";
import { DEFAULT_APP_SETTINGS } from "./theme";
import type { AppSettings, SettingsRuntimeStatus } from "../meetMapApi";

const audioDevices = [
  { id: "system:default", label: "Default speakers", track: "system" as const },
  { id: "microphone:usb", label: "USB microphone", track: "microphone" as const }
];

const apiStatus: SettingsRuntimeStatus = {
  openAi: {
    configured: true,
    source: ".env or process environment",
    structureModel: "gpt-4.1-mini",
    transcriptionModel: "gpt-4o-mini-transcribe"
  }
};

function renderSettings(initialSection: SettingsSectionId, initialSettings: AppSettings = DEFAULT_APP_SETTINGS) {
  function Harness() {
    const [settings, setSettings] = useState<AppSettings>(initialSettings);
    return (
      <SettingsScreen
        apiStatus={apiStatus}
        audioDevices={audioDevices}
        initialSection={initialSection}
        onChange={setSettings}
        settings={settings}
      />
    );
  }

  return render(<Harness />);
}

test("general settings controls can be changed", () => {
  renderSettings("general");

  const theme = screen.getByLabelText(/Theme/);
  const uiLanguage = screen.getByLabelText(/UI language/);

  fireEvent.change(theme, { target: { value: "dark" } });
  fireEvent.change(uiLanguage, { target: { value: "zh" } });

  expect(theme).toHaveValue("dark");
  expect(screen.getByLabelText("界面语言")).toHaveValue("zh");
});

test("output language choices are limited to Chinese, English, and bilingual", () => {
  renderSettings("general");

  const outputLanguage = screen.getByLabelText(/Default output language/);
  expect([...outputLanguage.querySelectorAll("option")].map((option) => option.value)).toEqual([
    "zh",
    "en",
    "bilingual"
  ]);
});

test("Windows startup switch is a real setting", () => {
  renderSettings("general");

  const windowsStartup = screen.getByRole("switch", { name: /Open at Windows startup/ });
  expect(windowsStartup).toHaveAttribute("aria-checked", "true");

  fireEvent.click(windowsStartup);

  expect(windowsStartup).toHaveAttribute("aria-checked", "false");
});

test("audio default devices can be changed before recording", () => {
  renderSettings("audio");

  const microphone = screen.getByLabelText(/Default microphone input/);
  expect(microphone).toHaveValue("");

  fireEvent.change(microphone, { target: { value: "microphone:usb" } });

  expect(microphone).toHaveValue("microphone:usb");
});

test("recognition language switches are interactive", () => {
  renderSettings("language");

  const cantonese = screen.getByRole("switch", { name: /Cantonese/ });
  const codeSwitching = screen.getByRole("switch", { name: /Mixed code-switching/ });

  expect(cantonese).toHaveAttribute("aria-checked", "false");
  expect(codeSwitching).toHaveAttribute("aria-checked", "true");

  fireEvent.click(cantonese);
  fireEvent.click(codeSwitching);

  expect(cantonese).toHaveAttribute("aria-checked", "true");
  expect(codeSwitching).toHaveAttribute("aria-checked", "false");
});

test("export default controls can be adjusted", () => {
  renderSettings("export");

  const transcriptAppendix = screen.getByRole("switch", { name: /Include transcript appendix/ });
  expect(transcriptAppendix).toHaveAttribute("aria-checked", "true");

  fireEvent.click(transcriptAppendix);

  expect(transcriptAppendix).toHaveAttribute("aria-checked", "false");
});

test("transcription settings include speaker diarization as an opt-in local processing control", () => {
  renderSettings("transcription");

  const preserveLanguage = screen.getByRole("switch", { name: /Preserve transcript language/ });
  const speakerDiarization = screen.getByRole("switch", { name: /Identify speakers/ });

  expect(preserveLanguage).toHaveAttribute("aria-checked", "true");
  expect(speakerDiarization).toHaveAttribute("aria-checked", "false");
  expect(screen.queryByRole("switch", { name: /Use output language setting/ })).not.toBeInTheDocument();

  fireEvent.click(preserveLanguage);
  fireEvent.click(speakerDiarization);

  expect(preserveLanguage).toHaveAttribute("aria-checked", "false");
  expect(speakerDiarization).toHaveAttribute("aria-checked", "true");
});

test("privacy switches can be changed", () => {
  renderSettings("privacy");

  const uploadAudio = screen.getByRole("switch", { name: /Upload recorded audio after meeting ends/ });
  expect(uploadAudio).toHaveAttribute("aria-checked", "true");
  expect(screen.getByText(/Applies to future meetings/)).toBeInTheDocument();

  fireEvent.click(uploadAudio);

  expect(uploadAudio).toHaveAttribute("aria-checked", "false");
  expect(screen.queryByRole("switch", { name: /Upload microphone and system tracks separately/ })).not.toBeInTheDocument();
});

test("settings values survive a SettingsScreen remount when held by the parent settings model", () => {
  let parentSettings = DEFAULT_APP_SETTINGS;
  const onChange = vi.fn((nextSettings: AppSettings) => {
    parentSettings = nextSettings;
  });
  const { unmount } = render(
    <SettingsScreen
      apiStatus={apiStatus}
      audioDevices={audioDevices}
      initialSection="audio"
      onChange={onChange}
      settings={parentSettings}
    />
  );

  fireEvent.change(screen.getByLabelText(/Default microphone input/), {
    target: { value: "microphone:usb" }
  });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ defaultMicrophoneDeviceId: "microphone:usb" }));
  unmount();

  render(
    <SettingsScreen
      apiStatus={apiStatus}
      audioDevices={audioDevices}
      initialSection="audio"
      onChange={onChange}
      settings={parentSettings}
    />
  );

  expect(screen.getByLabelText(/Default microphone input/)).toHaveValue("microphone:usb");
});

test("settings page is localized when UI language is Chinese", () => {
  renderSettings("general", { ...DEFAULT_APP_SETTINGS, uiLanguage: "zh" });

  expect(screen.getByRole("heading", { name: "通用" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /音频设备/ })).toBeInTheDocument();
});

test("settings changes announce autosave feedback", () => {
  renderSettings("general");

  expect(screen.getByRole("status")).toHaveTextContent(/Changes save automatically/);
  fireEvent.change(screen.getByLabelText(/Theme/), { target: { value: "dark" } });

  expect(screen.getByRole("status")).toHaveTextContent(/Settings saved/);
});

test("bilingual labels expose a secondary language layer for scanning", () => {
  const { container } = renderSettings("general");

  expect(container.querySelectorAll(".settings-label-secondary").length).toBeGreaterThan(0);
  expect(screen.getByText("Theme")).toBeInTheDocument();
});

test("api settings show real runtime status without planned credential storage copy", () => {
  render(
    <SettingsScreen
      apiStatus={{
        openAi: {
          configured: false,
          source: "missing OPENAI_API_KEY",
          structureModel: "gpt-4.1-mini",
          transcriptionModel: "gpt-4o-mini-transcribe"
        }
      }}
      audioDevices={audioDevices}
      initialSection="api"
      onChange={vi.fn()}
      settings={DEFAULT_APP_SETTINGS}
    />
  );

  expect(screen.getByText(/missing OPENAI_API_KEY/)).toBeInTheDocument();
  expect(screen.getByText(/Set OPENAI_API_KEY/)).toBeInTheDocument();
  expect(screen.queryByText(/planned/i)).not.toBeInTheDocument();
});
