import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { beforeEach, expect, test, vi } from "vitest";
import { createMeetingStore } from "../../src/features/meetings/meetingStore";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes";
import { registerMeetingIpc } from "./meetingIpc";

const electronMock = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
  shellOpenPath: vi.fn(),
  shellTrashItem: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  spawn: vi.fn()
}));

vi.mock("node:child_process", () => ({
  default: { spawn: electronMock.spawn },
  spawn: electronMock.spawn
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.ipcMainHandle
  },
  dialog: {
    showOpenDialog: electronMock.showOpenDialog,
    showSaveDialog: electronMock.showSaveDialog
  },
  shell: {
    openPath: electronMock.shellOpenPath,
    trashItem: electronMock.shellTrashItem
  }
}));

type IpcHandler = (event: unknown, ...args: never[]) => Promise<unknown>;

const handlers = new Map<string, IpcHandler>();

beforeEach(() => {
  handlers.clear();
  electronMock.ipcMainHandle.mockReset();
  electronMock.shellOpenPath.mockReset();
  electronMock.shellTrashItem.mockReset();
  electronMock.showOpenDialog.mockReset();
  electronMock.showSaveDialog.mockReset();
  electronMock.spawn.mockReset();
  electronMock.shellOpenPath.mockResolvedValue("");
  electronMock.shellTrashItem.mockResolvedValue(undefined);
  electronMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  electronMock.showSaveDialog.mockResolvedValue({ canceled: true });
  electronMock.spawn.mockImplementation((_command: string, args: string[]) => createSuccessfulSpawn(args));
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

test("lists persisted meetings through the IPC boundary", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const older = await store.createMeeting({
      id: "older-meeting",
      title: "Older Meeting",
      outputLanguage: "en"
    });
    const newer = await store.createMeeting({
      id: "newer-meeting",
      title: "Newer Meeting",
      outputLanguage: "en"
    });
    await store.writeMetadata({
      ...older,
      timestamps: { ...older.timestamps, updatedAt: "2026-05-28T00:00:00.000Z" }
    });
    await store.writeMetadata({
      ...newer,
      timestamps: { ...newer.timestamps, updatedAt: "2026-05-29T00:00:00.000Z" }
    });
    registerMeetingIpc({ store });

    await expect(getHandler("meeting:list")(null)).resolves.toMatchObject([
      { id: "newer-meeting", title: "Newer Meeting" },
      { id: "older-meeting", title: "Older Meeting" }
    ]);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("imports a WAV file as a recorded meeting", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const sourcePath = join(baseDirectory, "Imported Planning.wav");
    const sourceAudio = createPcm16Wav([0, 1200, -1200, 0], 4);
    await writeFile(sourcePath, sourceAudio);
    const store = createMeetingStore(join(baseDirectory, "meetings"));
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [sourcePath]
    });
    registerMeetingIpc({ store });

    const meeting = await getHandler("meeting:import-audio")(null, {
      outputLanguage: "zh",
      summaryStyle: "qa"
    } as never) as MeetingMetadata;

    expect(meeting).toMatchObject({
      title: "Imported Planning",
      outputLanguage: "zh",
      status: "recorded",
      summaryStyle: "qa",
      audioTracks: {
        system: {
          id: "system",
          format: "wav",
          hasAudio: true,
          channelCount: 1,
          sampleRateHz: 4,
          durationMs: 1000,
          byteLength: sourceAudio.byteLength
        }
      }
    });
    const importedPath = meeting.audioTracks.system?.filePath;
    expect(importedPath).toBe(join(store.getMeetingPaths(meeting.id).audioDir, "system.wav"));
    await expect(readFile(importedPath as string)).resolves.toEqual(sourceAudio);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("imports an M4A file as a recorded meeting", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const sourcePath = join(baseDirectory, "Customer Sync.m4a");
    const sourceAudio = Buffer.from("fake m4a payload");
    await writeFile(sourcePath, sourceAudio);
    const store = createMeetingStore(join(baseDirectory, "meetings"));
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [sourcePath]
    });
    registerMeetingIpc({ store });

    const meeting = await getHandler("meeting:import-audio")(null, {
      outputLanguage: "bilingual"
    } as never) as MeetingMetadata;

    expect(meeting).toMatchObject({
      title: "Customer Sync",
      outputLanguage: "bilingual",
      status: "recorded",
      audioTracks: {
        system: {
          id: "system",
          format: "m4a",
          hasAudio: true,
          byteLength: sourceAudio.byteLength
        }
      }
    });
    const importedPath = meeting.audioTracks.system?.filePath;
    expect(importedPath).toBe(join(store.getMeetingPaths(meeting.id).audioDir, "system.m4a"));
    await expect(readFile(importedPath as string)).resolves.toEqual(sourceAudio);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
test("saves a single-track meeting audio file", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(join(baseDirectory, "meetings"));
    const meeting = await store.createMeeting({
      id: "single-audio",
      title: "Single Audio",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await mkdir(paths.audioDir, { recursive: true });
    const sourcePath = join(paths.audioDir, "system.m4a");
    const savePath = join(baseDirectory, "saved.m4a");
    await writeFile(sourcePath, "single track audio");
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      audioTracks: {
        system: {
          id: "system",
          filePath: sourcePath,
          format: "m4a",
          hasAudio: true,
          byteLength: 18
        }
      }
    } satisfies MeetingMetadata);
    electronMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: savePath });
    registerMeetingIpc({ store });

    await expect(getHandler("meeting:save-audio")(null, meeting.id as never)).resolves.toBe(savePath);
    await expect(readFile(savePath, "utf8")).resolves.toBe("single track audio");
    expect(electronMock.spawn).not.toHaveBeenCalled();
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("renames a meeting and persists the trimmed title", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "rename-meeting",
      title: "Original title",
      outputLanguage: "zh"
    });
    registerMeetingIpc({ store });

    const renamed = await getHandler("meeting:rename")(null, {
      meetingId: meeting.id,
      title: "  客户季度复盘  "
    } as never) as MeetingMetadata;

    expect(renamed.title).toBe("客户季度复盘");
    expect(Date.parse(renamed.timestamps.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(meeting.timestamps.updatedAt)
    );
    await expect(store.readMetadata(meeting.id)).resolves.toMatchObject({
      id: meeting.id,
      title: "客户季度复盘"
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("moves an inactive meeting project to the operating-system recycle bin", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));
  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "delete-meeting",
      title: "Delete me",
      outputLanguage: "zh"
    });
    registerMeetingIpc({ store });

    await expect(getHandler("meeting:delete")(null, meeting.id as never)).resolves.toBeUndefined();
    expect(electronMock.shellTrashItem).toHaveBeenCalledWith(
      store.getMeetingPaths(meeting.id).meetingDir
    );
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test.each(["   ", "x".repeat(121)])(
  "rejects invalid renamed meeting title %j",
  async (title) => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

    try {
      const store = createMeetingStore(baseDirectory);
      const meeting = await store.createMeeting({
        id: "invalid-rename",
        title: "Original title",
        outputLanguage: "en"
      });
      registerMeetingIpc({ store });

      await expect(getHandler("meeting:rename")(null, {
        meetingId: meeting.id,
        title
      } as never)).rejects.toThrow(/Meeting title/);
      await expect(store.readMetadata(meeting.id)).resolves.toMatchObject({
        title: "Original title"
      });
    } finally {
      await rm(baseDirectory, { force: true, recursive: true });
    }
  }
);

test("mixes dual-track meeting audio before saving", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(join(baseDirectory, "meetings"));
    const meeting = await store.createMeeting({
      id: "dual-audio",
      title: "Dual Audio",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await mkdir(paths.audioDir, { recursive: true });
    const systemPath = join(paths.audioDir, "system.wav");
    const microphonePath = join(paths.audioDir, "microphone.wav");
    const savePath = join(baseDirectory, "saved.wav");
    await writeFile(systemPath, createPcm16Wav([0, 500], 2));
    await writeFile(microphonePath, createPcm16Wav([0, 700], 2));
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      audioTracks: {
        system: {
          id: "system",
          filePath: systemPath,
          format: "wav",
          hasAudio: true
        },
        microphone: {
          id: "microphone",
          filePath: microphonePath,
          format: "wav",
          hasAudio: true
        }
      }
    } satisfies MeetingMetadata);
    electronMock.showSaveDialog.mockResolvedValue({ canceled: false, filePath: savePath });
    registerMeetingIpc({ store });

    await expect(getHandler("meeting:save-audio")(null, meeting.id as never)).resolves.toBe(savePath);
    await expect(readFile(savePath, "utf8")).resolves.toBe("mixed meeting audio");
    expect(electronMock.spawn).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining([
        "-i",
        systemPath,
        "-i",
        microphonePath,
        "-filter_complex",
        "amix=inputs=2:duration=longest:dropout_transition=0"
      ]),
      { windowsHide: true }
    );
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
test("returns null when audio import is canceled", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    registerMeetingIpc({ store });

    await expect(getHandler("meeting:import-audio")(null, { outputLanguage: "en" } as never)).resolves.toBeNull();
    await expect(store.listMeetings()).resolves.toEqual([]);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("rejects malformed import audio requests at the IPC boundary", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:import-audio")(null, null as never)
    ).rejects.toThrow("Invalid import audio request");
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

    expect(services.transcribe).toHaveBeenCalledWith(["system"], expect.any(Object), preferences, expect.any(Object));
    expect(services.extractStructure).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), preferences);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("emits processing progress updates through the IPC sender", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "meeting-progress",
      title: "Meeting Progress",
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
      transcribe: vi.fn(async (_tracks, _metadata, _preferences, context) => {
        context?.onTranscriptionProgress?.({ completedChunks: 1, totalChunks: 2 });
        return [
          {
            id: "seg-1",
            trackId: "system" as const,
            startTimeMs: 1_000,
            endTimeMs: 5_000,
            text: "Ship visible processing progress.",
            language: "en"
          }
        ];
      }),
      extractStructure: vi.fn(async () => ({
        metadata: {
          meetingId: meeting.id,
          title: meeting.title,
          startedAt: meeting.timestamps.createdAt,
          endedAt: meeting.timestamps.updatedAt,
          sourceLanguage: "en",
          outputLanguage: "en"
        },
        summary: "The team discussed visible progress.",
        topics: [
          {
            id: "topic-1",
            type: "topic" as const,
            title: "Processing progress",
            summary: "Progress should come from workflow events.",
            sourceRefs: [{ segmentId: "seg-1", startTimeMs: 1_000, endTimeMs: 5_000 }]
          }
        ],
        decisions: [],
        actionItems: [],
        openQuestions: [],
        risks: [],
        relations: []
      }))
    };
    const send = vi.fn();

    registerMeetingIpc({ store, workflowServices: services });
    await getHandler("meeting:process")({ sender: { send } } as never, meeting.id as never);

    expect(send).toHaveBeenCalledWith(
      "meeting:processing-progress",
      expect.objectContaining({
        meetingId: meeting.id,
        step: "transcription",
        transcription: {
          completedChunks: 1,
          totalChunks: 2
        }
      })
    );
    expect(send).toHaveBeenCalledWith(
      "meeting:processing-progress",
      expect.objectContaining({
        meetingId: meeting.id,
        step: "completed",
        percent: 100
      })
    );
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

test("returns transcript and structure data from fixed meeting artifact paths", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "detail-data",
      title: "Detail Data",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await mkdir(paths.audioDir, { recursive: true });
    const systemAudioPath = join(paths.audioDir, "system.wav");
    await writeFile(systemAudioPath, createPcm16Wav([0, 32767, 0, -32768], 4));
    const transcript = {
      segments: [
        {
          id: "seg-1",
          trackId: "system",
          startTimeMs: 1_000,
          endTimeMs: 3_000,
          text: "Use real transcript data.",
          language: "en",
          confidence: 0.97
        }
      ]
    };
    const structure = {
      metadata: {
        meetingId: meeting.id,
        title: meeting.title,
        startedAt: meeting.timestamps.createdAt,
        endedAt: meeting.timestamps.updatedAt,
        sourceLanguage: "en",
        outputLanguage: "en"
      },
      summary: "The meeting detail view should use persisted artifacts.",
      topics: [
        {
          id: "topic-1",
          type: "topic",
          title: "Real detail data",
          summary: "Persisted artifacts drive the detail screen.",
          sourceRefs: [{ segmentId: "seg-1", startTimeMs: 1_000, endTimeMs: 3_000 }]
        }
      ],
      decisions: [],
      actionItems: [],
      openQuestions: [],
      risks: [],
      relations: []
    };
    await writeFile(paths.transcriptPath, JSON.stringify(transcript), "utf8");
    await writeFile(paths.structurePath, JSON.stringify(structure), "utf8");
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      audioTracks: {
        system: {
          id: "system",
          filePath: systemAudioPath,
          format: "wav",
          hasAudio: true
        }
      },
      transcriptPath: "transcript.json",
      structurePath: "structure.json"
    } satisfies MeetingMetadata);

    registerMeetingIpc({ store });

    const detailData = await getHandler("meeting:detail-data")(null, meeting.id as never);

    expect(detailData).toEqual({
      transcript,
      structure,
      audio: {
        tracks: [
          expect.objectContaining({
            track: "system",
            audioUrl: pathToFileURL(systemAudioPath).toString(),
            durationMs: 1000,
            peaks: expect.any(Array)
          })
        ]
      }
    });
    const peaks = (detailData as { audio: { tracks: Array<{ peaks: number[] }> } }).audio.tracks[0].peaks;
    expect(peaks).toHaveLength(96);
    expect(peaks.slice(0, 4)).toEqual([0, expect.closeTo(1, 4), 0, 1]);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("returns M4A playback data without WAV waveform parsing", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "m4a-detail-data",
      title: "M4A Detail Data",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await mkdir(paths.audioDir, { recursive: true });
    const systemAudioPath = join(paths.audioDir, "system.m4a");
    await writeFile(systemAudioPath, Buffer.from("not a wav"));
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      audioTracks: {
        system: {
          id: "system",
          filePath: systemAudioPath,
          format: "m4a",
          hasAudio: true,
          byteLength: 9
        }
      },
      transcriptPath: null,
      structurePath: null
    } satisfies MeetingMetadata);

    registerMeetingIpc({ store });

    await expect(getHandler("meeting:detail-data")(null, meeting.id as never)).resolves.toEqual({
      transcript: null,
      structure: null,
      audio: {
        tracks: [
          {
            track: "system",
            audioUrl: pathToFileURL(systemAudioPath).toString(),
            durationMs: 0,
            peaks: []
          }
        ]
      }
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
test("returns null detail artifacts when processing has not produced them", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "missing-detail-data",
      title: "Missing Detail Data",
      outputLanguage: "en"
    });

    registerMeetingIpc({ store });

    await expect(getHandler("meeting:detail-data")(null, meeting.id as never)).resolves.toEqual({
      transcript: null,
      structure: null,
      audio: null
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

function createSuccessfulSpawn(args: string[]) {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
  child.stderr = new EventEmitter();
  const outputPath = args[args.length - 1];

  if (outputPath) {
    void writeFile(outputPath, "mixed meeting audio").then(() => child.emit("close", 0));
  } else {
    queueMicrotask(() => child.emit("close", 0));
  }

  return child;
}
function createPcm16Wav(samples: number[], sampleRateHz: number): Buffer {
  const dataByteLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataByteLength);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRateHz, 24);
  buffer.writeUInt32LE(sampleRateHz * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataByteLength, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}

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
