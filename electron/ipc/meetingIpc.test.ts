import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, expect, test, vi } from "vitest";
import { createMeetingStore } from "../../src/features/meetings/meetingStore";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes";
import { registerMeetingIpc } from "./meetingIpc";

const electronMock = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
  shellOpenPath: vi.fn()
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.ipcMainHandle
  },
  shell: {
    openPath: electronMock.shellOpenPath
  }
}));

type IpcHandler = (event: unknown, ...args: never[]) => Promise<unknown>;

const handlers = new Map<string, IpcHandler>();

beforeEach(() => {
  handlers.clear();
  electronMock.ipcMainHandle.mockReset();
  electronMock.shellOpenPath.mockReset();
  electronMock.shellOpenPath.mockResolvedValue("");
  electronMock.ipcMainHandle.mockImplementation(
    (channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }
  );
});

function getHandler(channel: string): IpcHandler {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler: ${channel}`);
  }

  return handler;
}

test("creates meetings with the selected summary style", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    registerMeetingIpc({ store });

    const meeting = await getHandler("meeting:create")(null, {
      title: "Planning",
      outputLanguage: "en",
      summaryStyle: "highlights"
    } as never);

    expect((meeting as MeetingMetadata).summaryStyle).toBe("highlights");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("rejects malformed create meeting requests at the IPC boundary", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:create")(null, null as never)
    ).rejects.toThrow("Invalid create meeting request");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("does not process a meeting with silent demo workflow services", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "meeting-production",
      title: "Meeting Production",
      outputLanguage: "en"
    });

    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:process")(null, meeting.id as never)
    ).rejects.toThrow("Post-meeting workflow services must be configured");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("rejects malformed process meeting requests at the IPC boundary", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:process")(null, 123 as never)
    ).rejects.toThrow("Invalid meeting id");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("passes processing preferences into the post-meeting workflow", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "meeting-preferences",
      title: "Meeting Preferences",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await store.writeMetadata({
      ...meeting,
      status: "recorded",
      audioTracks: {
        system: {
          id: "system",
          filePath: join(paths.audioDir, "system.wav"),
          format: "wav",
          hasAudio: true
        }
      }
    });
    const services = {
      detectActivity: vi.fn(async () => ({ tracksToProcess: ["system" as const] })),
      transcribe: vi.fn(async () => [
        {
          id: "seg-1",
          trackId: "system" as const,
          startTimeMs: 1_000,
          endTimeMs: 5_000,
          text: "Ship the export defaults.",
          language: "en",
          speakerLabel: "Speaker 1"
        }
      ]),
      extractStructure: vi.fn(async () => ({
        metadata: {
          meetingId: meeting.id,
          title: meeting.title,
          startedAt: meeting.timestamps.createdAt,
          endedAt: meeting.timestamps.updatedAt,
          sourceLanguage: "en",
          outputLanguage: "en"
        },
        summary: "The team discussed export defaults.",
        topics: [
          {
            id: "topic-1",
            type: "topic" as const,
            title: "Export defaults",
            summary: "Export defaults should come from settings.",
            sourceRefs: [{ segmentId: "seg-1", startTimeMs: 1_000, endTimeMs: 5_000 }]
          }
        ],
        decisions: [],
        actionItems: [],
        openQuestions: [],
        risks: [],
        relations: [{ id: "rel-1", type: "contains" as const, fromId: meeting.id, toId: "topic-1" }]
      }))
    };
    const preferences = {
      autoDeleteCloudCopies: false,
      preserveTranscriptLanguage: true,
      recognitionLanguages: {
        cantonese: true,
        englishGB: false,
        englishUS: true,
        mandarin: true,
        mixedCodeSwitching: true
      },
      speakerDiarization: false,
      uploadRecordedAudio: true,
      uploadSeparateTracks: false,
      useOutputLanguage: true
    };

    registerMeetingIpc({ store, workflowServices: services });

    await getHandler("meeting:process")(null, meeting.id as never, preferences as never);

    expect(services.transcribe).toHaveBeenCalledWith(["system"], expect.any(Object), preferences);
    expect(services.extractStructure).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), preferences);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("rejects malformed processing preferences at the IPC boundary", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "meeting-bad-preferences",
      title: "Bad Preferences",
      outputLanguage: "en"
    });

    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:process")(null, meeting.id as never, { uploadRecordedAudio: "yes" } as never)
    ).rejects.toThrow("Invalid processing preferences");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("opens the fixed export path instead of a tampered metadata path", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "tampered-export",
      title: "Tampered Export",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await mkdir(paths.exportsDir, { recursive: true });
    await writeFile(paths.wordExportPath, "fixed export");
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      exportPaths: {
        wordSummaryPath: "C:\\Users\\peter.z\\Documents\\tampered.docx",
        htmlMeetingMapPath: null
      }
    } satisfies MeetingMetadata);

    registerMeetingIpc({ store });

    await getHandler("meeting:open-export")(null, {
      meetingId: meeting.id,
      kind: "word"
    } as never);

    expect(electronMock.shellOpenPath).toHaveBeenCalledWith(paths.wordExportPath);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("regenerates HTML export with selected export options before opening it", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "filtered-export",
      title: "Filtered Export",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await mkdir(paths.exportsDir, { recursive: true });
    await writeFile(paths.htmlMapExportPath, "stale Ship Word export before HTML map export.", "utf8");
    await writeFile(
      paths.structurePath,
      JSON.stringify({
        metadata: {
          meetingId: meeting.id,
          title: meeting.title,
          startedAt: meeting.timestamps.createdAt,
          endedAt: meeting.timestamps.updatedAt,
          sourceLanguage: "en",
          outputLanguage: "en"
        },
        summary: "The team discussed export filtering.",
        topics: [
          {
            id: "topic-1",
            type: "topic",
            title: "Export filtering",
            summary: "Export options should affect generated files.",
            sourceRefs: [{ segmentId: "seg-1", startTimeMs: 1_000, endTimeMs: 5_000 }]
          }
        ],
        decisions: [
          {
            id: "decision-1",
            type: "decision",
            text: "Ship Word export before HTML map export.",
            topicId: "topic-1",
            sourceRefs: [{ segmentId: "seg-2", startTimeMs: 5_000, endTimeMs: 8_000 }]
          }
        ],
        actionItems: [],
        openQuestions: [],
        risks: [],
        relations: []
      }),
      "utf8"
    );
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      structurePath: "structure.json",
      exportPaths: {
        wordSummaryPath: null,
        htmlMeetingMapPath: "exports/meeting-map.html"
      }
    } satisfies MeetingMetadata);

    registerMeetingIpc({ store });

    await getHandler("meeting:open-export")(null, {
      meetingId: meeting.id,
      kind: "html",
      options: {
        actions: true,
        audio: false,
        decisions: false,
        map: true,
        timestamps: false,
        transcript: false
      }
    } as never);

    const html = await readFile(paths.htmlMapExportPath, "utf8");
    expect(html).toContain("Export filtering");
    expect(html).not.toContain("Ship Word export before HTML map export.");
    expect(electronMock.shellOpenPath).toHaveBeenCalledWith(paths.htmlMapExportPath);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("rejects malformed open export requests at the IPC boundary", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:open-export")(null, undefined as never)
    ).rejects.toThrow("Invalid export request");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("rejects unsupported export kinds at the IPC boundary", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "bad-export-kind",
      title: "Bad Export Kind",
      outputLanguage: "en"
    });
    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:open-export")(null, {
        meetingId: meeting.id,
        kind: "pdf"
      } as never)
    ).rejects.toThrow("Unsupported export kind");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("rejects malformed export options at the IPC boundary", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "bad-export-options",
      title: "Bad Export Options",
      outputLanguage: "en"
    });
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      exportPaths: {
        wordSummaryPath: "meeting-summary.docx",
        htmlMeetingMapPath: null
      }
    } satisfies MeetingMetadata);

    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:open-export")(null, {
        meetingId: meeting.id,
        kind: "word",
        options: { transcript: "yes" }
      } as never)
    ).rejects.toThrow("Invalid export options");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
