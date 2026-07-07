import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";

import { App } from "./App";
import type { AppSettings, MeetMapApi, MeetingDetailData } from "./meetMapApi";
import type { MeetingMetadata } from "../features/meetings/meetingTypes";

vi.setConfig({ testTimeout: 10_000 });

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

function detailDataFixture(): MeetingDetailData {
  return {
    audio: {
      tracks: [
        {
          track: "system",
          audioUrl: "file:///C:/MeetMapWorkspace/meetings/meeting-1/audio/system.wav",
          durationMs: 1_720_000,
          peaks: [0.2, 0.38, 0.72, 0.51, 0.84, 0.63, 0.45, 0.28, 0.56, 0.76, 0.34, 0.18]
        }
      ]
    },
    transcript: {
      segments: [
        {
          id: "seg-1",
          trackId: "system",
          startTimeMs: 12_000,
          endTimeMs: 40_000,
          text: "Before we get into roadmap items, lock the July cuts.",
          language: "en",
          confidence: 0.96
        },
        {
          id: "seg-2",
          trackId: "system",
          startTimeMs: 78_000,
          endTimeMs: 108_000,
          text: "Maya owns the export pipeline; Yi handles the tree layout.",
          language: "en",
          confidence: 0.94
        },
        {
          id: "seg-3",
          trackId: "microphone",
          startTimeMs: 92_000,
          endTimeMs: 120_000,
          text: "I want the map to be a draggable tree with topics as nodes.",
          language: "en",
          confidence: 0.93
        },
        {
          id: "seg-4",
          trackId: "system",
          startTimeMs: 760_000,
          endTimeMs: 786_000,
          text: "Tencent STT pricing is still open for batch jobs.",
          language: "en",
          confidence: 0.91
        },
        {
          id: "seg-5",
          trackId: "system",
          startTimeMs: 1_690_000,
          endTimeMs: 1_720_000,
          text: "The hiring update can move after export validation.",
          language: "en",
          confidence: 0.9
        }
      ]
    },
    structure: {
      metadata: {
        meetingId: "meeting-1",
        title: "Roadmap review",
        startedAt: "2026-05-28T00:00:00.000Z",
        endedAt: "2026-05-28T00:30:00.000Z",
        sourceLanguage: "en",
        outputLanguage: "bilingual"
      },
      summary: "Locked the July ship list and started structure-map export planning.",
      topics: [
        {
          id: "topic-1",
          type: "topic",
          title: "Ship list cuts",
          summary: "Feedback widget stays, async digest is removed.",
          sourceRefs: [{ segmentId: "seg-1", startTimeMs: 12_000, endTimeMs: 40_000 }]
        },
        {
          id: "topic-2",
          type: "topic",
          title: "Structure map export",
          summary: "Tree layout spike and export pipeline owner confirmed.",
          sourceRefs: [{ segmentId: "seg-2", startTimeMs: 78_000, endTimeMs: 108_000 }]
        },
        {
          id: "topic-3",
          type: "topic",
          title: "Tencent STT pricing",
          summary: "Tencent STT batch processing remains open.",
          sourceRefs: [{ segmentId: "seg-4", startTimeMs: 760_000, endTimeMs: 786_000 }]
        }
      ],
      decisions: [
        {
          id: "decision-1",
          type: "decision",
          text: "Keep feedback widget read-only for July MVP.",
          topicId: "topic-1",
          sourceRefs: [{ segmentId: "seg-3", startTimeMs: 92_000, endTimeMs: 120_000 }]
        }
      ],
      actionItems: [
        {
          id: "action-1",
          type: "action",
          text: "Own the export pipeline.",
          owner: "Maya",
          status: "open",
          topicId: "topic-2",
          sourceRefs: [{ segmentId: "seg-2", startTimeMs: 78_000, endTimeMs: 108_000 }]
        }
      ],
      openQuestions: [
        {
          id: "question-1",
          type: "question",
          text: "Confirm Tencent STT batch pricing.",
          topicId: "topic-3",
          sourceRefs: [{ segmentId: "seg-4", startTimeMs: 760_000, endTimeMs: 786_000 }]
        }
      ],
      risks: [],
      relations: []
    }
  };
}

function installApi(api: Partial<MeetMapApi> = {}) {
  const completeApi = {
    platform: "win32",
    getWorkspace: vi.fn(async () => ({
      currentPath: "C:\\MeetMapWorkspace",
      recentPaths: ["C:\\MeetMapWorkspace"]
    })),
    getSettings: vi.fn(async (): Promise<AppSettings> => ({
      autoDeleteCloudCopies: true,
      defaultMicrophoneDeviceId: null,
      defaultOutputLanguage: "bilingual",
      defaultSystemAudioDeviceId: null,
      theme: "light",
      accent: "#5C6CE0",
      cantonese: false,
      englishGB: false,
      englishUS: true,
      includeTimestamps: true,
      includeTranscriptAppendix: true,
      mandarin: true,
      mixedCodeSwitching: true,
      openAtStartup: true,
      preserveTranscriptLanguage: true,
      speakerDiarization: false,
      uploadRecordedAudio: true,
      uploadSeparateTracks: true,
      uiLanguage: "bi",
      useOutputLanguage: true
    })),
    updateSettings: vi.fn(async (settings) => settings),
    getSettingsRuntimeStatus: vi.fn(async () => ({
      openAi: {
        configured: true,
        source: ".env or process environment",
        structureModel: "gpt-4.1-mini",
        transcriptionModel: "gpt-4o-mini-transcribe"
      }
    })),
    chooseWorkspaceFolder: vi.fn(async () => ({
      currentPath: "C:\\MeetMapWorkspace",
      recentPaths: ["C:\\MeetMapWorkspace"]
    })),
    useWorkspaceFolder: vi.fn(async (folderPath: string) => ({
      currentPath: folderPath,
      recentPaths: [folderPath, "C:\\MeetMapWorkspace"]
    })),
    revealWorkspaceFolder: vi.fn(async () => undefined),
    listMeetings: vi.fn(async () => []),
    createMeeting: vi.fn(async () => metadata()),
    importAudio: vi.fn(async () => metadata({
      title: "Imported audio",
      status: "recorded",
      audioTracks: {
        system: {
          id: "system",
          filePath: "C:\\MeetMapWorkspace\\meetings\\meeting-1\\audio\\system.wav",
          format: "wav",
          hasAudio: true,
          durationMs: 60_000,
          byteLength: 120_000
        }
      }
    })),
    startRecording: vi.fn(async () => metadata({ status: "recording" })),
    pauseRecording: vi.fn(async () => metadata({ status: "recording" })),
    resumeRecording: vi.fn(async () => metadata({ status: "recording" })),
    stopRecording: vi.fn(async () => metadata({ status: "recorded" })),
    processMeeting: vi.fn(async () =>
      metadata({
        status: "completed",
        processingStep: "completed",
        transcriptPath: "transcript.json",
        structurePath: "structure.json",
        exportPaths: {
          wordSummaryPath: "meeting-summary.docx",
          htmlMeetingMapPath: "meeting-map.html"
        }
      })
    ),
    getMeetingDetailData: vi.fn(async () => detailDataFixture()),
    openExport: vi.fn(async () => undefined),
    saveMeetingAudio: vi.fn(async () => "C:\\MeetMapWorkspace\\Roadmap review-audio.wav"),
    ...api
  } as MeetMapApi;

  window.meetMap = completeApi;
  return completeApi;
}

async function renderAppReady() {
  const result = render(<App />);
  await screen.findByRole("heading", { name: /All meetings|Choose a workspace folder/ });
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.meetMap;
});

test("renders the migrated library shell by default", async () => {
  installApi();
  const { container } = await renderAppReady();

  expect(await screen.findByRole("heading", { name: /All meetings/ })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /New recording/ })).not.toHaveLength(0);
  expect(screen.queryByText(/MeetMap - All meetings/)).not.toBeInTheDocument();
  expect(container.querySelector(".win-titlebar")).not.toBeInTheDocument();
  expect(screen.queryByText(/Post-meeting workflow/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Tweaks/)).not.toBeInTheDocument();
});

test("keeps only Settings in the sidebar footer without user login status", async () => {
  installApi();
  await renderAppReady();

  expect(screen.getByRole("button", { name: /Settings/ })).toBeInTheDocument();
  expect(screen.queryByText("Yi Zhang")).not.toBeInTheDocument();
  expect(screen.queryByText(/Workspace ready|No workspace/)).not.toBeInTheDocument();
});

test("renders the real empty workspace library without sample meetings", async () => {
  installApi();
  await renderAppReady();

  expect(await screen.findByRole("heading", { name: /All meetings/ })).toBeInTheDocument();
  expect(screen.getByText(/TOTAL MEETINGS/i)).toBeInTheDocument();
  expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  expect(screen.getByText(/No meetings in this workspace yet/)).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /Meeting/ })).toBeInTheDocument();
  expect(screen.queryByText(/Q3 roadmap review/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Acme Corp/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Product weekly/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Grid view/ }));
  expect(screen.getByRole("list", { name: /Meeting grid/ })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: /Meeting/ })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /List view/ }));
  expect(screen.getByRole("columnheader", { name: /Meeting/ })).toBeInTheDocument();
});

test("opens a historical meeting from the library row and returns through breadcrumb", async () => {
  const historicalMeeting = metadata({
    id: "historical-meeting",
    title: "Historical review",
    status: "completed",
    processingStep: "completed",
    transcriptPath: "transcript.json",
    structurePath: "structure.json",
    exportPaths: {
      wordSummaryPath: "meeting-summary.docx",
      htmlMeetingMapPath: "meeting-map.html"
    }
  });
  const api = installApi({
    listMeetings: vi.fn(async () => [historicalMeeting])
  });
  await renderAppReady();

  fireEvent.click(screen.getByLabelText("Open Historical review"));

  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();
  expect(screen.getByText("Historical review")).toBeInTheDocument();
  await waitFor(() => {
    expect(api.getMeetingDetailData).toHaveBeenCalledWith("historical-meeting");
  });

  fireEvent.click(screen.getByRole("button", { name: "MeetMap" }));
  expect(await screen.findByRole("heading", { name: /All meetings/ })).toBeInTheDocument();
});
test("loads persisted settings and saves setting changes through the desktop API", async () => {
  const api = installApi({
    getSettings: vi.fn(async (): Promise<AppSettings> => ({
      autoDeleteCloudCopies: true,
      defaultMicrophoneDeviceId: "mic-default",
      defaultOutputLanguage: "en",
      defaultSystemAudioDeviceId: "speaker-default",
      theme: "light",
      accent: "#5C6CE0",
      cantonese: false,
      englishGB: false,
      englishUS: true,
      includeTimestamps: true,
      includeTranscriptAppendix: true,
      mandarin: true,
      mixedCodeSwitching: true,
      openAtStartup: true,
      preserveTranscriptLanguage: true,
      speakerDiarization: false,
      uploadRecordedAudio: true,
      uploadSeparateTracks: true,
      uiLanguage: "en",
      useOutputLanguage: true
    })),
    listAudioDevices: vi.fn(async () => [
      { id: "speaker-default", label: "Default speakers", track: "system" as const },
      { id: "mic-default", label: "Default microphone", track: "microphone" as const }
    ])
  });
  await renderAppReady();
  await waitFor(() => {
    expect(api.getSettings).toHaveBeenCalled();
  });

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
  await waitFor(() => {
    expect(screen.getByLabelText("Default output language")).toHaveValue("en");
  });
  fireEvent.change(screen.getByLabelText("Default output language"), {
    target: { value: "bilingual" }
  });

  await waitFor(() => {
    expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ defaultOutputLanguage: "bilingual" }));
  });

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));

  await waitFor(() => {
    expect(api.createMeeting).toHaveBeenCalledWith(expect.objectContaining({ outputLanguage: "bilingual" }));
  });
});

test("requires a workspace folder before showing the meeting library", async () => {
  const api = installApi({
    getWorkspace: vi.fn(async () => ({
      currentPath: null,
      recentPaths: ["C:\\OldMeetMapWorkspace"]
    })),
    chooseWorkspaceFolder: vi.fn(async () => ({
      currentPath: "C:\\SelectedMeetMapWorkspace",
      recentPaths: ["C:\\SelectedMeetMapWorkspace", "C:\\OldMeetMapWorkspace"]
    }))
  } as Partial<MeetMapApi>);
  await renderAppReady();

  expect(await screen.findByRole("heading", { name: /Choose a workspace folder/ })).toBeInTheDocument();
  expect(screen.getByText("C:\\OldMeetMapWorkspace")).toBeInTheDocument();
  fireEvent.click(within(screen.getByLabelText("Workspace setup")).getByRole("button", { name: /Choose folder/ }));

  await waitFor(() => {
    expect(api.chooseWorkspaceFolder).toHaveBeenCalled();
  });
  expect(await screen.findByRole("heading", { name: /All meetings/ })).toBeInTheDocument();
});

test("imports audio from the library and processes it", async () => {
  const api = installApi();
  await renderAppReady();

  fireEvent.click(screen.getByRole("button", { name: /Import audio/ }));

  await waitFor(() => {
    expect(api.importAudio).toHaveBeenCalledWith({
      outputLanguage: "bilingual",
      summaryStyle: "decisions_actions"
    });
  });
  await waitFor(() => {
    expect(api.processMeeting).toHaveBeenCalledWith(
      "meeting-1",
      expect.objectContaining({ uploadRecordedAudio: true })
    );
  });
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();
});
test("updates the processing screen from desktop progress events", async () => {
  let progressCallback: Parameters<NonNullable<MeetMapApi["onProcessingProgress"]>>[0] | undefined;
  let resolveProcess: ((meeting: MeetingMetadata) => void) | undefined;
  const api = installApi({
    onProcessingProgress(callback) {
      progressCallback = callback;
      return () => undefined;
    },
    processMeeting: vi.fn(() => new Promise<MeetingMetadata>((resolve) => {
      resolveProcess = resolve;
    }))
  });
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));

  expect(await screen.findByRole("heading", { name: /Processing your meeting/ })).toBeInTheDocument();
  expect(screen.getByLabelText("0% complete")).toBeInTheDocument();

  act(() => {
    progressCallback?.({
      meetingId: "meeting-1",
      step: "transcription",
      currentStep: 2,
      totalSteps: 6,
      percent: 25,
      updatedAt: "2026-05-28T00:00:00.000Z",
      transcription: {
        completedChunks: 2,
        totalChunks: 6
      }
    });
  });

  expect(screen.getByLabelText("25% complete")).toBeInTheDocument();
  expect(screen.getByText(/25% - 2 of 6 steps/)).toBeInTheDocument();
  expect(screen.getAllByText(/2 of 6 chunks/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/ETA/)).not.toBeInTheDocument();

  act(() => {
    resolveProcess?.(metadata({
      status: "completed",
      processingStep: "completed",
      transcriptPath: "transcript.json",
      structurePath: "structure.json",
      exportPaths: {
        wordSummaryPath: "meeting-summary.docx",
        htmlMeetingMapPath: "meeting-map.html"
      }
    }));
  });

  await waitFor(() => {
    expect(api.processMeeting).toHaveBeenCalled();
  });
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();
});
test("starts recording through the desktop API from the pre-recording screen", async () => {
  const api = installApi();
  await renderAppReady();

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
  expect(screen.getAllByText(/Recording system \+ microphone/).length).toBeGreaterThan(0);
});

test("starts an audio preflight probe on the pre-recording screen", async () => {
  const api = installApi({
    startAudioProbe: vi.fn(async () => undefined),
    stopAudioProbe: vi.fn(async () => undefined)
  });
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);

  await waitFor(() => {
    expect(api.startAudioProbe).toHaveBeenCalledWith({
      audioSources: { system: true, microphone: true },
      deviceIds: {}
    });
  });
});

test("uses only preflight level events for setup audio status", async () => {
  let levelCallback: Parameters<NonNullable<MeetMapApi["onAudioLevel"]>>[0] | undefined;
  installApi({
    startAudioProbe: vi.fn(async () => undefined),
    stopAudioProbe: vi.fn(async () => undefined),
    onAudioLevel(callback) {
      levelCallback = callback;
      return () => undefined;
    }
  });
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  expect(screen.getByRole("button", { name: /Start recording/ })).toBeEnabled();

  act(() => {
    levelCallback?.({
      track: "system",
      level: 0.4,
      occurredAt: new Date().toISOString(),
      source: "recording"
    });
  });
  expect(screen.getByRole("button", { name: /Start recording/ })).toBeEnabled();

  act(() => {
    levelCallback?.({
      track: "system",
      level: 0.4,
      occurredAt: new Date().toISOString(),
      source: "preflight"
    });
  });

  expect(await screen.findByText(/System audio only/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Start recording/ })).toBeEnabled();
});

test("renders setup input levels from preflight samples", async () => {
  let levelCallback: Parameters<NonNullable<MeetMapApi["onAudioLevel"]>>[0] | undefined;
  installApi({
    startAudioProbe: vi.fn(async () => undefined),
    stopAudioProbe: vi.fn(async () => undefined),
    onAudioLevel(callback) {
      levelCallback = callback;
      return () => undefined;
    }
  });
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  expect(screen.queryByText("62%")).not.toBeInTheDocument();
  expect(screen.queryByText("34%")).not.toBeInTheDocument();

  act(() => {
    levelCallback?.({
      track: "system",
      level: 0.4,
      occurredAt: new Date().toISOString(),
      source: "preflight"
    });
  });

  expect(await screen.findByText(/^40%$/)).toBeInTheDocument();
  expect(screen.getByText(/Peak 40%/)).toBeInTheDocument();
});

test("marks quiet selected setup sources as warnings without blocking one-sided audio", async () => {
  let levelCallback: Parameters<NonNullable<MeetMapApi["onAudioLevel"]>>[0] | undefined;
  installApi({
    startAudioProbe: vi.fn(async () => undefined),
    stopAudioProbe: vi.fn(async () => undefined),
    onAudioLevel(callback) {
      levelCallback = callback;
      return () => undefined;
    }
  });
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  act(() => {
    levelCallback?.({
      track: "system",
      level: 0.42,
      occurredAt: new Date().toISOString(),
      source: "preflight"
    });
    levelCallback?.({
      track: "microphone",
      level: 0.01,
      occurredAt: new Date().toISOString(),
      source: "preflight"
    });
  });

  expect(await screen.findByText(/System audio only/)).toBeInTheDocument();
  const microphoneCard = screen.getByText("Microphone").closest(".pre-audio-card");
  expect(microphoneCard).toHaveClass("warning");
  expect(within(microphoneCard as HTMLElement).getByText("Quiet")).toHaveClass("warn");
  expect(screen.getByText(/No microphone input detected yet/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Start recording/ })).toBeEnabled();
});

test("allows setup start with selected sources even when preflight is quiet", async () => {
  let levelCallback: Parameters<NonNullable<MeetMapApi["onAudioLevel"]>>[0] | undefined;
  const api = installApi({
    startAudioProbe: vi.fn(async () => undefined),
    stopAudioProbe: vi.fn(async () => undefined),
    onAudioLevel(callback) {
      levelCallback = callback;
      return () => undefined;
    }
  });
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  expect(screen.getByText(/Waiting for audio/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Start recording/ })).toBeEnabled();

  act(() => {
    levelCallback?.({
      track: "system",
      level: 0.01,
      occurredAt: new Date().toISOString(),
      source: "preflight"
    });
    levelCallback?.({
      track: "microphone",
      level: 0.01,
      occurredAt: new Date().toISOString(),
      source: "preflight"
    });
  });
  expect(screen.getByRole("button", { name: /Start recording/ })).toBeEnabled();
  expect(screen.getByText(/No microphone input detected yet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));

  await waitFor(() => {
    expect(api.startRecording).toHaveBeenCalled();
  });
});

test("stops the preflight probe before creating a meeting", async () => {
  let levelCallback: Parameters<NonNullable<MeetMapApi["onAudioLevel"]>>[0] | undefined;
  const calls: string[] = [];
  const api = installApi({
    createMeeting: vi.fn(async () => {
      calls.push("createMeeting");
      return metadata();
    }),
    startAudioProbe: vi.fn(async () => undefined),
    stopAudioProbe: vi.fn(async () => {
      calls.push("stopAudioProbe");
    }),
    startRecording: vi.fn(async () => {
      calls.push("startRecording");
      return metadata({ status: "recording" });
    }),
    onAudioLevel(callback) {
      levelCallback = callback;
      return () => undefined;
    }
  });
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  act(() => {
    levelCallback?.({
      track: "microphone",
      level: 0.4,
      occurredAt: new Date().toISOString(),
      source: "preflight"
    });
  });

  expect(await screen.findByText(/Microphone only/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));

  await waitFor(() => {
    expect(api.startRecording).toHaveBeenCalled();
  });
  expect(calls).toEqual(["stopAudioProbe", "createMeeting", "startRecording"]);
});

test("passes one-sided pre-recording audio choices into recording startup", async () => {
  const api = installApi();
  await renderAppReady();

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
  expect((await screen.findAllByText(/Recording system audio/)).length).toBeGreaterThan(0);
});

test("loads audio devices and passes selected device ids to recording startup", async () => {
  const api = installApi({
    listAudioDevices: vi.fn(async () => [
      { id: "speaker-default", label: "Default speakers", track: "system" as const },
      { id: "mic-default", label: "Default microphone", track: "microphone" as const },
      { id: "mic-usb", label: "USB microphone", track: "microphone" as const }
    ])
  });
  await renderAppReady();

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

test("blocks start when no pre-recording audio source is selected", async () => {
  const api = installApi();
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("switch", { name: /System audio/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Microphone/ }));

  expect(screen.getByText(/No audio source selected/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Start recording/ })).toBeDisabled();
  expect(api.startRecording).not.toHaveBeenCalled();
});

test("opens privacy settings from the pre-recording privacy link", async () => {
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Privacy settings/ }));

  expect(screen.getByRole("heading", { name: /Privacy & upload/ })).toBeInTheDocument();
  expect(screen.getByText(/Cloud processing/)).toBeInTheDocument();
});

test("opens audio settings from one-sided recording fix action", async () => {
  const api = installApi();
  await renderAppReady();

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
  expect((await screen.findAllByText(/Recording system audio/)).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: /Devices/ }));

  expect(screen.getByRole("heading", { name: /Audio devices/ })).toBeInTheDocument();
  expect(screen.getByLabelText(/Default system audio input/)).toBeInTheDocument();
});

test("selects summary style in the pre-recording setup", async () => {
  const api = installApi();
  await renderAppReady();

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
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("switch", { name: /Microphone/ }));
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  expect((await screen.findAllByText(/Recording system audio/)).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole("button", { name: /Devices/ }));
  expect(screen.getByRole("heading", { name: /Audio devices/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Recording/ }));
  expect(await screen.findByRole("button", { name: /Stop.*process/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));

  await waitFor(() => {
    expect(api.stopRecording).toHaveBeenCalled();
  });
});

test("pauses and resumes recording through the desktop API", async () => {
  const api = installApi();
  await renderAppReady();

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

test("keeps recording audio state based on selected sources instead of live level silence", async () => {
  let levelCallback: Parameters<NonNullable<MeetMapApi["onAudioLevel"]>>[0] | undefined;
  installApi({
    onAudioLevel(callback) {
      levelCallback = callback;
      return () => undefined;
    }
  });
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });

  expect(screen.getAllByText(/Recording system \+ microphone/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/No audio detected/)).not.toBeInTheDocument();
  act(() => {
    levelCallback?.({
      track: "system",
      level: 0.4,
      occurredAt: "2026-05-28T00:00:01.000Z"
    });
  });

  expect(screen.getAllByText(/Recording system \+ microphone/).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(/System input level 40%/)).toBeInTheDocument();
  expect(screen.queryByText(/No audio detected/)).not.toBeInTheDocument();
});

test("stops, processes, and opens Word exports through the export dialog", async () => {
  const api = installApi();
  await renderAppReady();

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
  expect(within(dialog).queryByText("Auto")).not.toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole("button", { name: /^Export/ }));
  expect(api.openExport).toHaveBeenCalledWith({
    meetingId: "meeting-1",
    kind: "word",
    options: expect.objectContaining({
      transcript: true,
      timestamps: true
    })
  });
}, 10_000);

test("opens HTML exports from the export dialog format card", async () => {
  const api = installApi();
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Export/ }));
  const dialog = screen.getByRole("dialog", { name: /Export meeting/ });
  fireEvent.click(within(dialog).getByRole("radio", { name: /Structure map/ }));
  expect(within(dialog).getByLabelText(/Embedded audio/)).toBeEnabled();
  fireEvent.click(within(dialog).getByLabelText(/Embedded audio/));

  fireEvent.click(within(dialog).getByRole("button", { name: /^Export/ }));
  expect(api.openExport).toHaveBeenCalledWith({
    meetingId: "meeting-1",
    kind: "html",
    options: expect.objectContaining({
      audio: true,
      map: true
    })
  });
});

test("uses export defaults from Settings in the export dialog", async () => {
  const api = installApi();
  await renderAppReady();

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
  await renderAppReady();

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
  fireEvent.click(screen.getByRole("button", { name: /Privacy & upload/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Upload recorded audio after meeting ends/ }));
  fireEvent.click(screen.getByRole("button", { name: /Transcription & summary/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Preserve transcript language/ }));
  fireEvent.click(screen.getByRole("switch", { name: /Speaker diarization/ }));

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));

  await waitFor(() => {
    expect(api.processMeeting).toHaveBeenCalledWith("meeting-1", {
      autoDeleteCloudCopies: true,
      preserveTranscriptLanguage: false,
      recognitionLanguages: {
        cantonese: false,
        englishGB: false,
        englishUS: true,
        mandarin: true,
        mixedCodeSwitching: true
      },
      speakerDiarization: true,
      uploadRecordedAudio: false,
      uploadSeparateTracks: true,
      useOutputLanguage: true
    });
  });
});

test("supports transcript search and track filtering in meeting detail", async () => {
  installApi();
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.change(screen.getByLabelText(/Meeting title/), {
    target: { value: "Roadmap review" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();
  expect(await screen.findByText(/Maya owns the export pipeline/)).toBeInTheDocument();

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
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const api = installApi();
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.change(screen.getByLabelText(/Meeting title/), {
    target: { value: "Roadmap review" }
  });
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Share meeting/ }));
  expect(await screen.findByText(/Share link copied/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Play recording/ }));
  expect(screen.getByRole("button", { name: /Pause recording/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Summary/ }));
  const processCallCount = vi.mocked(api.processMeeting).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: /Regenerate/ }));
  await waitFor(() => {
    expect(api.processMeeting).toHaveBeenCalledTimes(processCallCount + 1);
  });
  expect(await screen.findByRole("heading", { name: "Meeting detail" })).toBeInTheDocument();

  fireEvent.click(within(screen.getByRole("tablist", { name: /Meeting detail views/ })).getByRole("button", { name: /Structure map/ }));
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
  await renderAppReady();

  fireEvent.click(screen.getAllByRole("button", { name: /New recording/ })[0]);
  fireEvent.click(screen.getByRole("button", { name: /Start recording/ }));
  await screen.findByRole("heading", { name: /Roadmap review/ });
  fireEvent.click(screen.getByRole("button", { name: /Stop.*process/ }));

  expect(await screen.findByText(/No speech was detected/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Export/ })).not.toBeInTheDocument();
});

test("moves prototype tweaks into Settings General", async () => {
  await renderAppReady();

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));

  expect(screen.getByRole("heading", { name: /General/ })).toBeInTheDocument();
  expect(screen.getByLabelText(/Theme/)).toBeInTheDocument();
  expect(screen.getByText(/Accent color/)).toBeInTheDocument();
  expect(screen.getByLabelText(/UI language/)).toHaveValue("bi");
  expect(screen.getByLabelText(/Default output language/)).toBeInTheDocument();
});

test("renders settings sub-pages from the template navigation", async () => {
  await renderAppReady();

  fireEvent.click(screen.getByRole("button", { name: /Settings/ }));

  fireEvent.click(screen.getByRole("button", { name: /Language/ }));
  expect(screen.getByRole("heading", { name: /Language/ })).toBeInTheDocument();
  expect(screen.getByText(/Recognition languages/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Audio devices/ }));
  expect(screen.getByRole("heading", { name: /Audio devices/ })).toBeInTheDocument();
  expect(screen.getByLabelText(/Default system audio input/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /API status/ }));
  expect(screen.getByRole("heading", { name: /API status/ })).toBeInTheDocument();
  expect(screen.getByText(/OpenAI/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Privacy & upload/ }));
  expect(screen.getByRole("heading", { name: /Privacy & upload/ })).toBeInTheDocument();
  expect(screen.getByText(/Cloud processing/)).toBeInTheDocument();
});
