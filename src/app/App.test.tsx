import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { App } from "./App";
import type { MeetMapApi } from "./meetMapApi";
import type { MeetingMetadata } from "../features/meetings/meetingTypes";

function metadata(overrides: Partial<MeetingMetadata> = {}): MeetingMetadata {
  return {
    id: "meeting-1",
    title: "Roadmap review",
    status: "setup",
    outputLanguage: "bilingual",
    timestamps: {
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z"
    },
    audioTracks: {},
    transcriptPath: null,
    structurePath: null,
    exportPaths: {
      wordSummaryPath: null,
      htmlMeetingMapPath: null
    },
    ...overrides
  };
}

function installApi(api: Partial<MeetMapApi> = {}) {
  const completeApi: MeetMapApi = {
    platform: "win32",
    createMeeting: vi.fn(async () => metadata()),
    startRecording: vi.fn(async () => metadata({ status: "recording" })),
    stopRecording: vi.fn(async () => metadata({ status: "recorded" })),
    processMeeting: vi.fn(async () =>
      metadata({
        status: "completed",
        processingStep: "completed",
        exportPaths: {
          wordSummaryPath: "meeting-summary.docx",
          htmlMeetingMapPath: "meeting-map.html"
        }
      })
    ),
    openExport: vi.fn(async () => undefined),
    ...api
  };

  window.meetMap = completeApi;
  return completeApi;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.meetMap;
});

test("renders the migrated library shell by default", () => {
  const { container } = render(<App />);

  expect(screen.getByRole("heading", { name: /All meetings/ })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /New recording/ })).not.toHaveLength(0);
  expect(screen.queryByText(/MeetMap - All meetings/)).not.toBeInTheDocument();
  expect(container.querySelector(".win-titlebar")).not.toBeInTheDocument();
  expect(screen.queryByText(/Post-meeting workflow/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Tweaks/)).not.toBeInTheDocument();
});

test("starts recording through the desktop API from the pre-recording screen", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.change(screen.getByLabelText(/Meeting title/), {
    target: { value: "Design review" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));

  await waitFor(() => {
    expect(api.createMeeting).toHaveBeenCalledWith({
      title: "Design review",
      outputLanguage: "bilingual"
    });
  });
  expect(api.startRecording).toHaveBeenCalledWith("meeting-1", {
    audioSources: {
      system: true,
      microphone: true
    },
    deviceIds: {}
  });
  expect(await screen.findByRole("heading", { name: /Roadmap review/ })).toBeInTheDocument();
  expect(screen.getByText(/Both tracks live/)).toBeInTheDocument();
});

test("passes one-sided pre-recording audio choices into recording startup", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("switch", { name: /Microphone/ }));
  fireEvent.change(screen.getByLabelText(/Meeting title/), {
    target: { value: "System-only review" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));

  await waitFor(() => {
    expect(api.startRecording).toHaveBeenCalledWith("meeting-1", {
      audioSources: {
        system: true,
        microphone: false
      },
      deviceIds: {}
    });
  });
  expect(await screen.findByText(/System audio only/)).toBeInTheDocument();
});

test("loads audio devices and passes selected device ids to recording startup", async () => {
  const api = installApi({
    listAudioDevices: vi.fn(async () => [
      { id: "speaker-default", label: "Default speakers", track: "system" as const },
      { id: "mic-default", label: "Default microphone", track: "microphone" as const },
      { id: "mic-usb", label: "USB microphone", track: "microphone" as const }
    ])
  });
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  expect(await screen.findByRole("combobox", { name: /Microphone device/ })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: /Microphone device/ }), {
    target: { value: "mic-usb" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));

  await waitFor(() => {
    expect(api.startRecording).toHaveBeenCalledWith("meeting-1", {
      audioSources: {
        system: true,
        microphone: true
      },
      deviceIds: {
        system: "speaker-default",
        microphone: "mic-usb"
      }
    });
  });
});

test("blocks start when no pre-recording audio source is selected", () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("switch", { name: /System audio/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Microphone/ }));

  expect(screen.getByText(/No audio source selected/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Start recording/ })).toBeDisabled();
  expect(api.startRecording).not.toHaveBeenCalled();
});

test("stops, processes, and opens exports through the desktop API", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.change(screen.getByLabelText(/Meeting title/), {
    target: { value: "Roadmap review" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });

  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));

  await waitFor(() => {
    expect(api.stopRecording).toHaveBeenCalled();
  });
  await waitFor(() => {
    expect(api.processMeeting).toHaveBeenCalledWith("meeting-1");
  });
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Open Word summary/ }));
  expect(api.openExport).toHaveBeenCalledWith({ meetingId: "meeting-1", kind: "word" });
});

test("shows no-audio result without export actions", async () => {
  installApi({
    processMeeting: vi.fn(async () =>
      metadata({
        status: "no_audio",
        processingStep: "no_audio"
      })
    )
  });
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));

  expect(await screen.findByText(/No speech was detected/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Open Word summary/ })).not.toBeInTheDocument();
});

test("moves prototype tweaks into Settings General", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));

  expect(screen.getByRole("heading", { name: /General/ })).toBeInTheDocument();
  expect(screen.getByLabelText(/Theme/)).toBeInTheDocument();
  expect(screen.getByText(/^Accent color$/)).toBeInTheDocument();
  expect(screen.getByLabelText(/UI language/)).toHaveValue("bi");
  expect(screen.getByLabelText(/Default output language/)).toBeInTheDocument();
});

test("renders settings sub-pages from the template navigation", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));

  fireEvent.click(screen.getByRole("button", { name: /Language/ }));
  expect(screen.getByRole("heading", { name: "Language" })).toBeInTheDocument();
  expect(screen.getByText(/Recognition languages/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Audio devices/ }));
  expect(screen.getByRole("heading", { name: "Audio devices" })).toBeInTheDocument();
  expect(screen.getByText(/System audio capture/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /API keys/ }));
  expect(screen.getByRole("heading", { name: "API keys" })).toBeInTheDocument();
  expect(screen.getByText(/OpenAI/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Privacy & storage/ }));
  expect(screen.getByRole("heading", { name: "Privacy & storage" })).toBeInTheDocument();
  expect(screen.getByText(/What gets uploaded/)).toBeInTheDocument();
});
