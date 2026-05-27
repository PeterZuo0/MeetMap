import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ipcMain } from "electron";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes.js";
import type { MeetingStore } from "../../src/features/meetings/meetingStore.js";
import type {
  AudioCaptureProvider,
} from "../../src/features/recording/audioCaptureProvider.js";
import { createRecordingSession } from "../../src/features/recording/recordingSession.js";
import { createDemoAudioCaptureProvider } from "./demoAudioCaptureProvider.js";

export { createDemoAudioCaptureProvider } from "./demoAudioCaptureProvider.js";

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
    try {
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
      return updatedMetadata;
    } catch (error) {
      try {
        await persistFailedRecordingMetadata({
          store,
          meetingId
        });
      } catch (metadataError) {
        throw createStopRecoveryError({ error, metadataError });
      }

      throw error;
    } finally {
      try {
        await session.dispose();
      } finally {
        activeSession = undefined;
      }
    }
  });
}

async function persistFailedRecordingMetadata({
  store,
  meetingId
}: {
  store: MeetingStore;
  meetingId: string;
}): Promise<void> {
  const metadata = await store.readMetadata(meetingId);
  const now = new Date().toISOString();
  await store.writeMetadata({
    ...metadata,
    status: "failed",
    processingStep: "failed",
    timestamps: {
      ...metadata.timestamps,
      updatedAt: now,
      failedAt: now
    }
  });
}

function createStopRecoveryError({
  error,
  metadataError
}: {
  error: unknown;
  metadataError: unknown;
}): Error {
  const stopError = error instanceof Error ? error : new Error(String(error));
  const failedMetadataError =
    metadataError instanceof Error
      ? metadataError
      : new Error(String(metadataError));
  const recoveryError = new Error(
    `Recording stop failed (${stopError.message}) and failed metadata could not be persisted (${failedMetadataError.message})`
  ) as Error & { cause?: unknown };
  recoveryError.cause = {
    stopError,
    metadataError: failedMetadataError
  };
  return recoveryError;
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
