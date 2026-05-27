import { writeFile } from "node:fs/promises";
import type {
  AudioCaptureError,
  AudioCaptureProvider,
  AudioCaptureStartRequest,
  AudioCaptureStopResult,
  AudioCaptureUnsubscribe
} from "../../src/features/recording/audioCaptureProvider.js";

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
