import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ipcMain } from "electron";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes.js";
import type { MeetingStore } from "../../src/features/meetings/meetingStore.js";
import type {
  AudioCaptureError,
  AudioCaptureProvider,
  AudioCaptureStartRequest,
  AudioCaptureStopResult,
  AudioCaptureUnsubscribe
} from "../../src/features/recording/audioCaptureProvider.js";
import { createRecordingSession } from "../../src/features/recording/recordingSession.js";

export type RecordingIpcContext = {
  store: MeetingStore;
  audioCaptureMode?: "production" | "demo";
  createAudioCaptureProvider?: () => AudioCaptureProvider;
};

export function registerRecordingIpc({
  store,
  audioCaptureMode = "production",
  createAudioCaptureProvider
}: RecordingIpcContext): void {
  let activeSession:
    | {
        meetingId: string;
        session: ReturnType<typeof createRecordingSession>;
      }
    | undefined;

  ipcMain.handle(
    "recording:start",
    async (_event, meetingId: string): Promise<MeetingMetadata> => {
      if (activeSession) {
        throw new Error("A recording is already active");
      }

      const metadata = await store.readMetadata(meetingId);
      const paths = store.getMeetingPaths(meetingId);
      await mkdir(paths.audioDir, { recursive: true });

      const session = createRecordingSession({
        provider: resolveAudioCaptureProvider({
          mode: audioCaptureMode,
          createAudioCaptureProvider
        })
      });
      await session.start({
        meetingId,
        tracks: {
          system: {
            filePath: join(paths.audioDir, "system.wav")
          },
          microphone: {
            filePath: join(paths.audioDir, "microphone.wav")
          }
        }
      });
      activeSession = { meetingId, session };

      const now = new Date().toISOString();
      const updatedMetadata: MeetingMetadata = {
        ...metadata,
        status: "recording",
        timestamps: {
          ...metadata.timestamps,
          updatedAt: now,
          recordingStartedAt: now
        }
      };
      await store.writeMetadata(updatedMetadata);
      return updatedMetadata;
    }
  );

  ipcMain.handle("recording:stop", async (): Promise<MeetingMetadata> => {
    if (!activeSession) {
      throw new Error("No recording is active");
    }

    const { meetingId, session } = activeSession;
    const stopResult = await session.stop();
    const metadata = await store.readMetadata(meetingId);
    const now = new Date().toISOString();
    const updatedMetadata: MeetingMetadata = {
      ...metadata,
      status: "recorded",
      audioTracks: stopResult.tracks,
      timestamps: {
        ...metadata.timestamps,
        updatedAt: now,
        recordingEndedAt: now
      }
    };
    await store.writeMetadata(updatedMetadata);
    activeSession = undefined;
    return updatedMetadata;
  });
}

function resolveAudioCaptureProvider({
  mode,
  createAudioCaptureProvider
}: {
  mode: NonNullable<RecordingIpcContext["audioCaptureMode"]>;
  createAudioCaptureProvider: RecordingIpcContext["createAudioCaptureProvider"];
}): AudioCaptureProvider {
  if (createAudioCaptureProvider) {
    return createAudioCaptureProvider();
  }

  if (mode === "demo") {
    return createDemoAudioCaptureProvider();
  }

  throw new Error("Audio capture provider must be configured");
}

export function createDemoAudioCaptureProvider(): AudioCaptureProvider {
  let request: AudioCaptureStartRequest | undefined;
  const errorSubscribers = new Set<(error: AudioCaptureError) => void>();

  return {
    async listDevices() {
      return [
        {
          id: "demo-system",
          label: "Demo system audio",
          track: "system",
          isDefault: true
        },
        {
          id: "demo-microphone",
          label: "Demo microphone",
          track: "microphone",
          isDefault: true
        }
      ];
    },

    async start(startRequest) {
      request = startRequest;
      await Promise.all(
        Object.values(startRequest.tracks).map(async (track) => {
          if (!track) {
            return;
          }
          await writeFile(track.filePath, createDemoWavBytes());
        })
      );
    },

    async stop(): Promise<AudioCaptureStopResult> {
      if (!request) {
        throw new Error("Demo capture was not started");
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

    onLevel(): AudioCaptureUnsubscribe {
      return () => {};
    },

    onError(callback): AudioCaptureUnsubscribe {
      errorSubscribers.add(callback);
      return () => errorSubscribers.delete(callback);
    }
  };
}

function createDemoWavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00,
    0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
  ]);
}
