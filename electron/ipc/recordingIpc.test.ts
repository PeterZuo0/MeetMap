import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, expect, test, vi } from "vitest";
import { createMeetingStore } from "../../src/features/meetings/meetingStore";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes";
import type {
  AudioCaptureProvider,
  AudioCaptureStartRequest,
  AudioLevelUpdate
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

function createLevelCapturingProvider(
  requests: AudioCaptureStartRequest[],
  levelCallbacks: Array<(update: AudioLevelUpdate) => void>,
  stops: string[] = []
): AudioCaptureProvider {
  return {
    async listDevices() {
      return [];
    },
    async start(startRequest) {
      requests.push(startRequest);
    },
    async stop() {
      stops.push("stop");
      return { tracks: {} };
    },
    onLevel(callback) {
      levelCallbacks.push(callback);
      return () => {
        stops.push("unsubscribe-level");
      };
    },
    onError() {
      return () => {};
    }
  };
}

function createIpcEvent() {
  const sent: Array<{ channel: string; update: unknown }> = [];

  return {
    event: {
      sender: {
        send(channel: string, update: unknown) {
          sent.push({ channel, update });
        }
      }
    },
    sent
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

test("starts an audio preflight probe with selected sources", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const requests: AudioCaptureStartRequest[] = [];
    const store = createMeetingStore(baseDirectory);

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () => createCapturingProvider(requests)
    } as RecordingIpcContext);

    await getHandler("recording:probe-start")(
      createIpcEvent().event as never,
      {
        audioSources: { system: true, microphone: false },
        deviceIds: { system: "speaker-1" }
      } as never
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      meetingId: "preflight",
      tracks: {
        system: {
          deviceId: "speaker-1"
        }
      }
    });
    expect(requests[0]?.tracks.system?.filePath).toContain("meetmap-preflight-");
    expect(requests[0]?.tracks.system?.filePath).toContain("system.wav");
    expect(requests[0]?.tracks.microphone).toBeUndefined();
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("passes selected microphone device id into preflight probe requests", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const requests: AudioCaptureStartRequest[] = [];
    const store = createMeetingStore(baseDirectory);

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () => createCapturingProvider(requests)
    } as RecordingIpcContext);

    await getHandler("recording:probe-start")(
      createIpcEvent().event as never,
      {
        audioSources: { system: false, microphone: true },
        deviceIds: { microphone: "microphone:1" }
      } as never
    );

    expect(requests[0]?.tracks.microphone?.deviceId).toBe("microphone:1");
    expect(requests[0]?.tracks.system).toBeUndefined();
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("forwards preflight level updates with a source marker", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const requests: AudioCaptureStartRequest[] = [];
    const levelCallbacks: Array<(update: AudioLevelUpdate) => void> = [];
    const store = createMeetingStore(baseDirectory);
    const { event, sent } = createIpcEvent();

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () =>
        createLevelCapturingProvider(requests, levelCallbacks)
    } as RecordingIpcContext);

    await getHandler("recording:probe-start")(
      event as never,
      { audioSources: { system: false, microphone: true } } as never
    );
    levelCallbacks[0]?.({
      track: "microphone",
      level: 0.4,
      occurredAt: "2026-05-29T00:00:01.000Z"
    });

    expect(sent).toEqual([
      {
        channel: "recording:level",
        update: {
          track: "microphone",
          level: 0.4,
          occurredAt: "2026-05-29T00:00:01.000Z",
          source: "preflight"
        }
      }
    ]);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("keeps audio probe and active recording mutually exclusive", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const requests: AudioCaptureStartRequest[] = [];
    const stops: string[] = [];
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "recording-after-probe",
      title: "Recording After Probe",
      outputLanguage: "en"
    });

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () =>
        createLevelCapturingProvider(requests, [], stops)
    } as RecordingIpcContext);

    await getHandler("recording:probe-start")(
      createIpcEvent().event as never,
      { audioSources: { system: true, microphone: true } } as never
    );

    await expect(
      getHandler("recording:start")(null, meeting.id as never)
    ).rejects.toThrow("Stop audio probe before starting recording");

    await getHandler("recording:probe-stop")(null);
    expect(stops).toContain("stop");
    expect(stops).toContain("unsubscribe-level");

    await expect(
      getHandler("recording:start")(null, meeting.id as never)
    ).resolves.toMatchObject({
      id: meeting.id,
      status: "recording"
    } satisfies Partial<MeetingMetadata>);

    await expect(
      getHandler("recording:probe-start")(
        createIpcEvent().event as never,
        { audioSources: { system: true, microphone: false } } as never
      )
    ).rejects.toThrow("Cannot start audio probe while recording is active");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("replaces an active audio probe when setup starts a new probe", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-recording-ipc-"));

  try {
    const requests: AudioCaptureStartRequest[] = [];
    const stops: string[] = [];
    const store = createMeetingStore(baseDirectory);

    registerRecordingIpc({
      store,
      createAudioCaptureProvider: () =>
        createLevelCapturingProvider(requests, [], stops)
    } as RecordingIpcContext);

    await getHandler("recording:probe-start")(
      createIpcEvent().event as never,
      { audioSources: { system: true, microphone: true } } as never
    );
    await getHandler("recording:probe-start")(
      createIpcEvent().event as never,
      { audioSources: { system: true, microphone: false } } as never
    );

    expect(stops).toEqual(["stop", "unsubscribe-level"]);
    expect(requests).toHaveLength(2);
    expect(requests[1]?.tracks.system).toBeDefined();
    expect(requests[1]?.tracks.microphone).toBeUndefined();
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
