import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ipcMain } from "electron";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes.js";
import type { MeetingStore } from "../../src/features/meetings/meetingStore.js";
import type {
  AudioCaptureStartRequest,
  AudioCaptureDevice,
  AudioCaptureProvider,
  AudioCaptureUnsubscribe
} from "../../src/features/recording/audioCaptureProvider.js";
import { createRecordingSession } from "../../src/features/recording/recordingSession.js";
import { createDemoAudioCaptureProvider } from "./demoAudioCaptureProvider.js";
import { sendIfAlive } from "./sendIfAlive.js";

export { createDemoAudioCaptureProvider } from "./demoAudioCaptureProvider.js";

export type RecordingIpcContext = {
  store: MeetingStore;
  audioCaptureMode?: "production" | "demo";
  createAudioCaptureProvider?: () => AudioCaptureProvider;
};

export type RecordingStartIpcOptions = {
  audioSources?: {
    system?: boolean;
    microphone?: boolean;
  };
  deviceIds?: {
    system?: string;
    microphone?: string;
  };
};

export function registerRecordingIpc({
  store,
  audioCaptureMode = "production",
  createAudioCaptureProvider
}: RecordingIpcContext): { shutdown(): Promise<void> } {
  let activeSession:
    | {
        meetingId: string;
        session: ReturnType<typeof createRecordingSession>;
        unsubscribeLevel: AudioCaptureUnsubscribe;
      }
    | undefined;
  let activeProbe:
    | {
        provider: AudioCaptureProvider;
        tempDirectory: string;
        unsubscribeLevel: AudioCaptureUnsubscribe;
      }
    | undefined;

  let deviceListRequest: Promise<AudioCaptureDevice[]> | undefined;
  let audioOperations: Promise<void> = Promise.resolve();
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | undefined;
  function scheduleAudio<T>(operation: () => Promise<T>): Promise<T> {
    const result = audioOperations.then(operation);
    // A failed operation must not block later stop or retry requests.
    audioOperations = result.then(() => undefined, () => undefined);
    return result;
  }

  ipcMain.handle("recording:list-devices", async () => {
    if (deviceListRequest) return deviceListRequest;
    const provider = resolveAudioCaptureProvider({
      mode: audioCaptureMode,
      createAudioCaptureProvider
    });
    deviceListRequest = provider.listDevices().finally(() => { deviceListRequest = undefined; });
    return deviceListRequest;
  });

  ipcMain.handle(
    "recording:start",
    async (
      _event,
      meetingId: string,
      options?: RecordingStartIpcOptions
    ): Promise<MeetingMetadata> => scheduleAudio(async () => {
      if (shuttingDown) throw new Error("Application is closing");
      if (activeSession) {
        throw new Error("A recording is already active");
      }
      if (activeProbe) {
        throw new Error("Stop audio probe before starting recording");
      }

      const metadata = await store.readMetadata(meetingId);
      const paths = store.getMeetingPaths(meetingId);
      await mkdir(paths.audioDir, { recursive: true });
      const requestedSources = normalizeAudioSources(options);

      const provider = resolveAudioCaptureProvider({
        mode: audioCaptureMode,
        createAudioCaptureProvider
      });
      const unsubscribeLevel = provider.onLevel((update) => {
        if (!shuttingDown) sendIfAlive(_event.sender, "recording:level", { ...update, source: "recording" });
      });
      const session = createRecordingSession({ provider });
      try {
        await session.start({
          meetingId,
          tracks: {
            system: requestedSources.system
              ? {
                  filePath: join(paths.audioDir, "system.wav"),
                  deviceId: options?.deviceIds?.system
                }
              : undefined,
            microphone: requestedSources.microphone
              ? {
                  filePath: join(paths.audioDir, "microphone.wav"),
                  deviceId: options?.deviceIds?.microphone
                }
              : undefined
          }
        });
      } catch (error) {
        unsubscribeLevel();
        throw error;
      }
      activeSession = { meetingId, session, unsubscribeLevel };

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
    })
  );

  async function stopRecording(): Promise<MeetingMetadata> {
    if (!activeSession) {
      throw new Error("No recording is active");
    }

    const { meetingId, session, unsubscribeLevel } = activeSession;
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
      unsubscribeLevel();
      try {
        await session.dispose();
      } finally {
        activeSession = undefined;
      }
    }
  }
  ipcMain.handle("recording:stop", () => scheduleAudio(stopRecording));

  ipcMain.handle("recording:pause", async (): Promise<MeetingMetadata> => {
    if (!activeSession) {
      throw new Error("No recording is active");
    }

    await activeSession.session.pause();
    return store.readMetadata(activeSession.meetingId);
  });

  ipcMain.handle("recording:resume", async (): Promise<MeetingMetadata> => {
    if (!activeSession) {
      throw new Error("No recording is active");
    }

    await activeSession.session.resume();
    return store.readMetadata(activeSession.meetingId);
  });

  ipcMain.handle(
    "recording:probe-start",
    async (_event, options?: RecordingStartIpcOptions): Promise<void> => scheduleAudio(async () => {
      if (shuttingDown) throw new Error("Application is closing");
      if (activeSession) {
        throw new Error("Cannot start audio probe while recording is active");
      }
      if (activeProbe) {
        const previousProbe = activeProbe;
        activeProbe = undefined;
        await stopActiveProbe(previousProbe);
      }

      const requestedSources = normalizeAudioSources(options);
      const tempDirectory = await mkdtemp(join(tmpdir(), "meetmap-preflight-"));
      const provider = resolveAudioCaptureProvider({
        mode: audioCaptureMode,
        createAudioCaptureProvider
      });
      const unsubscribeLevel = provider.onLevel((update) => {
        if (!shuttingDown) sendIfAlive(_event.sender, "recording:level", { ...update, source: "preflight" });
      });

      try {
        await provider.start(createProbeStartRequest({ options, requestedSources, tempDirectory }));
      } catch (error) {
        unsubscribeLevel();
        await rm(tempDirectory, { force: true, recursive: true });
        throw error;
      }

      activeProbe = {
        provider,
        tempDirectory,
        unsubscribeLevel
      };
    })
  );

  ipcMain.handle("recording:probe-stop", async (): Promise<void> => scheduleAudio(async () => {
    if (!activeProbe) {
      return;
    }

    const probe = activeProbe;
    activeProbe = undefined;
    await stopActiveProbe(probe);
  }));

  return {
    shutdown() {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;
      shutdownPromise = scheduleAudio(async () => {
        // Both paths run even if one cleanup fails. Meeting audio is never deleted.
        const results = await Promise.allSettled([
          (async () => {
            const probe = activeProbe;
            activeProbe = undefined;
            if (probe) await stopActiveProbe(probe);
          })(),
          activeSession ? stopRecording() : Promise.resolve()
        ]);
        if (results.some((result) => result.status === "rejected")) {
          throw new Error("Audio shutdown did not complete successfully; local recording artifacts were preserved.");
        }
      });
      return shutdownPromise;
    }
  };
}

async function stopActiveProbe(probe: {
  provider: AudioCaptureProvider;
  tempDirectory: string;
  unsubscribeLevel: AudioCaptureUnsubscribe;
}): Promise<void> {
  try {
    await probe.provider.stop();
  } finally {
    probe.unsubscribeLevel();
    await rm(probe.tempDirectory, { force: true, recursive: true });
  }
}

function normalizeAudioSources(options?: RecordingStartIpcOptions): {
  system: boolean;
  microphone: boolean;
} {
  const system = options?.audioSources?.system ?? true;
  const microphone = options?.audioSources?.microphone ?? true;

  if (!system && !microphone) {
    throw new Error("Cannot start recording without audio sources");
  }

  return { system, microphone };
}

function createProbeStartRequest({
  options,
  requestedSources,
  tempDirectory
}: {
  options: RecordingStartIpcOptions | undefined;
  requestedSources: { system: boolean; microphone: boolean };
  tempDirectory: string;
}): AudioCaptureStartRequest {
  return {
    meetingId: "preflight",
    tracks: {
      system: requestedSources.system
        ? {
            filePath: join(tempDirectory, "system.wav"),
            deviceId: options?.deviceIds?.system
          }
        : undefined,
      microphone: requestedSources.microphone
        ? {
            filePath: join(tempDirectory, "microphone.wav"),
            deviceId: options?.deviceIds?.microphone
          }
        : undefined
    }
  };
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
