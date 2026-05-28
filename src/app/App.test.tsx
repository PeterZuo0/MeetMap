import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    pauseRecording: vi.fn(async () => metadata({ status: "recording" })),
    resumeRecording: vi.fn(async () => metadata({ status: "recording" })),
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

test("supports template library filters and view switching", () => {
  render(<App />);

  expect(screen.getByText(/TOTAL MEETINGS/i)).toBeInTheDocument();
  expect(screen.getByText(/HOURS CAPTURED/i)).toBeInTheDocument();
  expect(screen.getByText(/STORAGE USED/i)).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /Meeting/ })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /Folder/ })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /Lang/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Processing/ }));

  expect(screen.getByText(/Vendor sync/)).toBeInTheDocument();
  expect(screen.queryByText(/Acme Corp/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Today/ }));
  expect(screen.getByText(/Q3 roadmap review/)).toBeInTheDocument();
  expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  expect(screen.queryByText(/Vendor sync/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Filter/ }));
  expect(screen.getByText(/Filter: Client calls/)).toBeInTheDocument();
  expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  expect(screen.queryByText(/Q3 roadmap review/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Any date/ }));
  expect(screen.getByText(/Date: This week/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Grid view/ }));
  expect(screen.getByRole("list", { name: /Meeting grid/ })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: /Meeting/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /List view/ }));
  expect(screen.getByRole("columnheader", { name: /Meeting/ })).toBeInTheDocument();
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
      outputLanguage: "bilingual",
      summaryStyle: "decisions_actions"
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

test("opens privacy settings from the pre-recording privacy link", () => {
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Privacy settings/ }));

  expect(screen.getByRole("heading", { name: "Privacy & storage" })).toBeInTheDocument();
  expect(screen.getByText(/What gets uploaded/)).toBeInTheDocument();
});

test("opens audio settings from one-sided recording fix action", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("switch", { name: /Microphone/ }));
  expect(screen.getByText(/System audio only/)).toBeInTheDocument();
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

  fireEvent.click(screen.getByRole("button", { name: /Fix/ }));

  expect(screen.getByRole("heading", { name: "Audio devices" })).toBeInTheDocument();
  expect(screen.getByText(/System audio capture/)).toBeInTheDocument();
});

test("selects summary style in the pre-recording setup", () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: "Highlights" }));

  expect(screen.getByRole("button", { name: "Highlights" })).toHaveClass("soft-active");
  expect(screen.getByRole("button", { name: "Decisions & actions" })).not.toHaveClass("soft-active");
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  expect(api.createMeeting).toHaveBeenCalledWith({
    title: "Untitled meeting",
    outputLanguage: "bilingual",
    summaryStyle: "highlights"
  });
});

test("can return from audio settings and stop an active recording", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("switch", { name: /Microphone/ }));
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByText(/System audio only/);

  fireEvent.click(screen.getByRole("button", { name: /Fix/ }));
  expect(screen.getByRole("heading", { name: "Audio devices" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Recording/ }));
  expect(await screen.findByRole("button", { name: /Stop.*process/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));

  await waitFor(() => {
    expect(api.stopRecording).toHaveBeenCalled();
  });
});

test("pauses and resumes recording through the desktop API", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });

  fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
  await waitFor(() => {
    expect(api.pauseRecording).toHaveBeenCalled();
  });
  expect(screen.getByRole("button", { name: /Resume/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
  await waitFor(() => {
    expect(api.resumeRecording).toHaveBeenCalled();
  });
});

test("updates recording audio state from live level events when available", async () => {
  let levelCallback: Parameters<NonNullable<MeetMapApi["onAudioLevel"]>>[0] | undefined;
  installApi({
    onAudioLevel(callback) {
      levelCallback = callback;
      return () => undefined;
    }
  });
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });

  expect(screen.getByText(/No audio detected/)).toBeInTheDocument();
  act(() => {
    levelCallback?.({
      track: "system",
      level: 0.4,
      occurredAt: "2026-05-28T00:00:01.000Z"
    });
  });

  expect(await screen.findByText(/System audio only/)).toBeInTheDocument();
});

test("stops, processes, and opens Word exports through the export dialog", async () => {
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
    expect(api.processMeeting).toHaveBeenCalledWith(
      "meeting-1",
      expect.objectContaining({
        uploadRecordedAudio: true,
        uploadSeparateTracks: true
      })
    );
  });
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Export/ }));
  const dialog = screen.getByRole("dialog", { name: /Export meeting/ });
  expect(within(dialog).getByRole("radio", { name: /Word document/ })).toHaveAttribute("aria-checked", "true");
  expect(within(dialog).getByLabelText(/Full transcript/)).toBeChecked();
  expect(within(dialog).getByLabelText(/Embedded audio/)).toBeDisabled();

  fireEvent.click(within(dialog).getByRole("button", { name: /^Export/ }));
  expect(api.openExport).toHaveBeenCalledWith({
    meetingId: "meeting-1",
    kind: "word",
    options: expect.objectContaining({
      transcript: true,
      timestamps: true
    })
  });
});

test("opens HTML exports from the export dialog format card", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Export/ }));
  const dialog = screen.getByRole("dialog", { name: /Export meeting/ });
  fireEvent.click(within(dialog).getByRole("radio", { name: /Structure map/ }));
  expect(within(dialog).getByLabelText(/Embedded audio/)).toBeDisabled();

  fireEvent.click(within(dialog).getByRole("button", { name: /^Export/ }));
  expect(api.openExport).toHaveBeenCalledWith({
    meetingId: "meeting-1",
    kind: "html",
    options: expect.objectContaining({
      audio: false,
      map: true
    })
  });
});

test("uses export defaults from Settings in the export dialog", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
  fireEvent.click(screen.getByRole("button", { name: /Export defaults/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Include transcript appendix/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Include timestamps/ }));

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Export/ }));
  const dialog = screen.getByRole("dialog", { name: /Export meeting/ });

  expect(within(dialog).getByLabelText(/Full transcript/)).not.toBeChecked();
  expect(within(dialog).getByLabelText(/Timestamps/)).not.toBeChecked();
  fireEvent.click(within(dialog).getByRole("button", { name: /^Export/ }));

  expect(api.openExport).toHaveBeenCalledWith({
    meetingId: "meeting-1",
    kind: "word",
    options: expect.objectContaining({
      transcript: false,
      timestamps: false
    })
  });
});

test("passes processing preferences from Settings into post-meeting processing", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
  fireEvent.click(screen.getByRole("button", { name: /Privacy & storage/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Upload microphone and system tracks separately/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Request cloud copy deletion when supported/ }));
  fireEvent.click(screen.getByRole("button", { name: /Transcription & summary/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Speaker diarization/ }));

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));

  await waitFor(() => {
    expect(api.processMeeting).toHaveBeenCalledWith("meeting-1", {
      autoDeleteCloudCopies: false,
      preserveTranscriptLanguage: true,
      recognitionLanguages: {
        cantonese: false,
        englishGB: false,
        englishUS: true,
        mandarin: true,
        mixedCodeSwitching: true
      },
      speakerDiarization: false,
      uploadRecordedAudio: true,
      uploadSeparateTracks: false,
      useOutputLanguage: true
    });
  });
});

test("supports transcript search and track filtering in meeting detail", async () => {
  installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.change(screen.getByLabelText(/Meeting title/), {
    target: { value: "Roadmap review" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/Search transcript/), {
    target: { value: "Maya" }
  });

  expect(screen.getByText("1 / 5")).toBeInTheDocument();
  expect(screen.getByText(/Maya owns the export pipeline/)).toBeInTheDocument();
  expect(screen.queryByText(/feedback widget read-only/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Mic/ }));

  expect(screen.getByText("0 / 5")).toBeInTheDocument();
  expect(screen.getByText(/No transcript turns match/)).toBeInTheDocument();
});

test("supports meeting detail summary, map export, share, and audio controls", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.change(screen.getByLabelText(/Meeting title/), {
    target: { value: "Roadmap review" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Share meeting/ }));
  expect(screen.getByText(/Share link copied/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Play recording/ }));
  expect(screen.getByRole("button", { name: /Pause recording/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Summary/ }));
  fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
  expect(screen.getByText(/Regenerated from structured meeting data/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Structure map/ }));
  fireEvent.click(screen.getByRole("button", { name: /Open as HTML/ }));

  expect(api.openExport).toHaveBeenCalledWith({ meetingId: "meeting-1", kind: "html" });
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
  expect(screen.queryByRole("button", { name: /^Export/ })).not.toBeInTheDocument();
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
