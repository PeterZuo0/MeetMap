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
  expect(api.startRecording).toHaveBeenCalledWith("meeting-1");
  expect(await screen.findByRole("heading", { name: "Recording" })).toBeInTheDocument();
});

test("stops, processes, and opens exports through the desktop API", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.change(screen.getByLabelText(/Meeting title/), {
    target: { value: "Roadmap review" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: "Recording" });

  fireEvent.click(screen.getByRole("button", { name: /Stop and process/ }));

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

test("moves prototype tweaks into Settings General", () => {
  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));

  expect(screen.getByRole("heading", { name: /General/ })).toBeInTheDocument();
  expect(screen.getByLabelText(/Theme/)).toBeInTheDocument();
  expect(screen.getByText(/^Accent color$/)).toBeInTheDocument();
  expect(screen.getByLabelText(/UI language/)).toHaveValue("bi");
  expect(screen.getByLabelText(/Default output language/)).toBeInTheDocument();
});
