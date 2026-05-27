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

test("keeps the active recording session when stop fails", async () => {
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
    await expect(getHandler("recording:stop")(null)).rejects.toThrow(
      "Cannot stop recording from failed"
    );
    await expect(store.readMetadata(meeting.id)).resolves.toMatchObject({
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
