import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, expect, test, vi } from "vitest";
import { createMeetingStore } from "../../src/features/meetings/meetingStore";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes";
import type {
  AudioCaptureProvider,
  AudioCaptureStartRequest
} from "../../src/features/recording/audioCaptureProvider";
import { registerRecordingIpc, type RecordingIpcContext } from "./recordingIpc";

const electronMock = vi.hoisted(() => ({
  ipcMainHandle: vi.fn()
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.ipcMainHandle
  }
}));

type IpcHandler = (event: unknown, ...args: never[]) => Promise<unknown>;

const handlers = new Map<string, IpcHandler>();

beforeEach(() => {
  handlers.clear();
  electronMock.ipcMainHandle.mockReset();
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

function createRejectingStopProvider(): AudioCaptureProvider {
  let request: AudioCaptureStartRequest | undefined;

  return {
    async listDevices() {
      return [];
    },
    async start(startRequest) {
      request = startRequest;
    },
    async stop() {
      if (!request) {
        throw new Error("capture was not started");
      }

      throw new Error("capture stop failed");
    },
    onLevel() {
      return () => {};
    },
    onError() {
      return () => {};
    }
  };
}

function createSuccessfulStopProvider(): AudioCaptureProvider {
  let request: AudioCaptureStartRequest | undefined;

  return {
    async listDevices() {
      return [];
    },
    async start(startRequest) {
      request = startRequest;
    },
    async stop() {
      if (!request) {
        throw new Error("capture was not started");
      }

      return {
        tracks: {
          system: request.tracks.system
            ? {
                id: "system",
                filePath: request.tracks.system.filePath,
                format: "wav",
                hasAudio: true
              }
            : undefined,
          microphone: request.tracks.microphone
            ? {
                id: "microphone",
                filePath: request.tracks.microphone.filePath,
                format: "wav",
                hasAudio: true
              }
            : undefined
        }
      };
    },
    onLevel() {
      return () => {};
    },
    onError() {
      return () => {};
    }
  };
}

function createCapturingProvider(
  requests: AudioCaptureStartRequest[],
  commands: string[] = []
): AudioCaptureProvider {
  return {
    async listDevices() {
      return [];
    },
    async start(startRequest) {
      requests.push(startRequest);
    },
    async stop() {
      return { tracks: {} };
    },
    async pause() {
      commands.push("pause");
    },
    async resume() {
      commands.push("resume");
    },
    onLevel() {
      return () => {};
    },
    onError() {
      return () => {};
    }
  };
}

test("starts only selected audio sources", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const requests: AudioCaptureStartRequest[] = [];
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "recording-system-only",
      title: "Recording System Only",
      outputLanguage: "en"
    });

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () => createCapturingProvider(requests)
    } as RecordingIpcContext);

    await getHandler("recording:start")(
      null,
      meeting.id as never,
      {
        audioSources: { system: true, microphone: false },
        deviceIds: { system: "speaker-1" }
      } as never
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]?.tracks.system?.filePath).toContain("system.wav");
    expect(requests[0]?.tracks.system?.deviceId).toBe("speaker-1");
    expect(requests[0]?.tracks.microphone).toBeUndefined();
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("lists audio devices from the configured capture provider", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () => ({
        ...createCapturingProvider([]),
        async listDevices() {
          return [
            { id: "speaker-1", label: "Speakers", track: "system" as const },
            { id: "mic-1", label: "Microphone", track: "microphone" as const }
          ];
        }
      })
    } as RecordingIpcContext);

    await expect(getHandler("recording:list-devices")(null)).resolves.toEqual([
      { id: "speaker-1", label: "Speakers", track: "system" },
      { id: "mic-1", label: "Microphone", track: "microphone" }
    ]);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("pauses and resumes the active recording session", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const requests: AudioCaptureStartRequest[] = [];
    const commands: string[] = [];
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "recording-pause",
      title: "Recording Pause",
      outputLanguage: "en"
    });

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () => createCapturingProvider(requests, commands)
    } as RecordingIpcContext);

    await getHandler("recording:start")(null, meeting.id as never);
    await getHandler("recording:pause")(null);
    await getHandler("recording:resume")(null);

    expect(commands).toEqual(["pause", "resume"]);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("rejects start when no audio sources are selected", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "recording-no-sources",
      title: "Recording No Sources",
      outputLanguage: "en"
    });

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () => createCapturingProvider([])
    } as RecordingIpcContext);

    await expect(
      getHandler("recording:start")(
        null,
        meeting.id as never,
        { audioSources: { system: false, microphone: false } } as never
      )
    ).rejects.toThrow("Cannot start recording without audio sources");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("clears the active recording session and marks metadata failed when stop fails", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "recording-stop-failure",
      title: "Recording Stop Failure",
      outputLanguage: "en"
    });

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: createRejectingStopProvider
    } as RecordingIpcContext);

    await getHandler("recording:start")(null, meeting.id as never);
    await expect(getHandler("recording:stop")(null)).rejects.toThrow(
      "capture stop failed"
    );
    await expect(store.readMetadata(meeting.id)).resolves.toMatchObject({
      status: "failed",
      processingStep: "failed"
    } satisfies Partial<MeetingMetadata>);

    const recoveryMeeting = await store.createMeeting({
      id: "recording-stop-recovery",
      title: "Recording Stop Recovery",
      outputLanguage: "en"
    });
    await expect(
      getHandler("recording:start")(null, recoveryMeeting.id as never)
    ).resolves.toMatchObject({
      id: recoveryMeeting.id,
      status: "recording"
    } satisfies Partial<MeetingMetadata>);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("clears the active recording session when stopped metadata cannot be persisted", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "recording-write-failure",
      title: "Recording Write Failure",
      outputLanguage: "en"
    });
    const writeMetadata = store.writeMetadata.bind(store);

    registerRecordingIpc({
      store: {
        ...store,
        async writeMetadata(metadata) {
          if (metadata.status === "recorded") {
            throw new Error("metadata write failed");
          }

          await writeMetadata(metadata);
        }
      },
      createAudioCaptureProvider: createSuccessfulStopProvider
    } as RecordingIpcContext);

    await getHandler("recording:start")(null, meeting.id as never);
    await expect(getHandler("recording:stop")(null)).rejects.toThrow(
      "metadata write failed"
    );

    const recoveryMeeting = await store.createMeeting({
      id: "recording-write-recovery",
      title: "Recording Write Recovery",
      outputLanguage: "en"
    });
    await expect(
      getHandler("recording:start")(null, recoveryMeeting.id as never)
    ).resolves.toMatchObject({
      id: recoveryMeeting.id,
      status: "recording"
    } satisfies Partial<MeetingMetadata>);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("does not start recording with a silent demo provider fallback", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "recording-production",
      title: "Recording Production",
      outputLanguage: "en"
    });

    registerRecordingIpc({ store });

    await expect(
      getHandler("recording:start")(null, meeting.id as never)
    ).rejects.toThrow("Audio capture provider must be configured");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
