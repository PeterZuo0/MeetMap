import { writeFile } from "node:fs/promises";
import type {
  AudioCaptureError,
  AudioLevelUpdate,
  AudioCaptureProvider,
  AudioCaptureStartRequest,
  AudioCaptureStopResult,
  AudioCaptureUnsubscribe
} from "../../src/features/recording/audioCaptureProvider.js";

export function createDemoAudioCaptureProvider(): AudioCaptureProvider {
  let request: AudioCaptureStartRequest | undefined;
  let levelTimer: NodeJS.Timeout | undefined;
  const errorSubscribers = new Set<(error: AudioCaptureError) => void>();
  const levelSubscribers = new Set<(update: AudioLevelUpdate) => void>();

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
      startLevelTimer();
      await Promise.all(
        Object.values(startRequest.tracks).map(async (track) => {
          if (!track) {
            return;
          }
          await writeFile(track.filePath, createDemoWavBytes());
        })
      );
    },

    async pause() {
      if (!request) {
        throw new Error("Demo capture was not started");
      }
      stopLevelTimer();
    },

    async resume() {
      if (!request) {
        throw new Error("Demo capture was not started");
      }
      startLevelTimer();
    },

    async stop(): Promise<AudioCaptureStopResult> {
      if (!request) {
        throw new Error("Demo capture was not started");
      }

      stopLevelTimer();
      const stoppedRequest = request;
      request = undefined;

      return {
        tracks: {
          system: stoppedRequest.tracks.system
            ? {
                id: "system",
                filePath: stoppedRequest.tracks.system.filePath,
                format: "wav",
                hasAudio: true
              }
            : undefined,
          microphone: stoppedRequest.tracks.microphone
            ? {
                id: "microphone",
                filePath: stoppedRequest.tracks.microphone.filePath,
                format: "wav",
                hasAudio: true
              }
            : undefined
        }
      };
    },

    onLevel(callback): AudioCaptureUnsubscribe {
      levelSubscribers.add(callback);
      return () => levelSubscribers.delete(callback);
    },

    onError(callback): AudioCaptureUnsubscribe {
      errorSubscribers.add(callback);
      return () => errorSubscribers.delete(callback);
    }
  };

  function startLevelTimer(): void {
    if (!request || levelTimer) {
      return;
    }

    levelTimer = setInterval(() => {
      const occurredAt = new Date().toISOString();
      if (request?.tracks.system) {
        emitLevel(levelSubscribers, { track: "system", level: 0.62, occurredAt });
      }
      if (request?.tracks.microphone) {
        emitLevel(levelSubscribers, { track: "microphone", level: 0.34, occurredAt });
      }
    }, 500);
  }

  function stopLevelTimer(): void {
    if (!levelTimer) {
      return;
    }

    clearInterval(levelTimer);
    levelTimer = undefined;
  }
}

function emitLevel(
  subscribers: Set<(update: AudioLevelUpdate) => void>,
  update: AudioLevelUpdate
): void {
  subscribers.forEach((callback) => callback(update));
}

function createDemoWavBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x40, 0x1f, 0x00, 0x00, 0x80, 0x3e, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00,
    0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
  ]);
}
