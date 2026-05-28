import { spawn as nodeSpawn } from "node:child_process";
import { stat as nodeStat } from "node:fs/promises";
import { join } from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { EventEmitter } from "node:events";
import type {
  AudioCaptureDevice,
  AudioCaptureError,
  AudioCaptureProvider,
  AudioCaptureStartRequest,
  AudioCaptureStopResult,
  AudioCaptureUnsubscribe
} from "../../src/features/recording/audioCaptureProvider.js";

export type WindowsAudioCaptureChildProcess = Pick<
  ChildProcessWithoutNullStreams,
  "stdin" | "stdout" | "stderr" | "on"
>;

export type WindowsAudioCaptureSpawn = (
  command: string,
  args: string[],
  options: { windowsHide: true }
) => WindowsAudioCaptureChildProcess;

export type WindowsAudioCaptureProviderOptions = {
  projectPath?: string;
  spawn?: WindowsAudioCaptureSpawn;
  stat?: (filePath: string) => Promise<{ size: number }>;
  now?: () => number;
};

type ActiveCapture = {
  request: AudioCaptureStartRequest;
  process: WindowsAudioCaptureChildProcess;
  startedAtMs: number;
  stopRequested: boolean;
  output: string[];
};

const WAV_HEADER_BYTE_LENGTH = 44;

export function createWindowsAudioCaptureProvider({
  projectPath = join(
    process.cwd(),
    "native",
    "windows-audio",
    "src",
    "MeetMap.WindowsAudio.csproj"
  ),
  spawn = nodeSpawn as WindowsAudioCaptureSpawn,
  stat = nodeStat,
  now = Date.now
}: WindowsAudioCaptureProviderOptions = {}): AudioCaptureProvider {
  const errorSubscribers = new Set<(error: AudioCaptureError) => void>();
  let activeCapture: ActiveCapture | undefined;

  return {
    async listDevices(): Promise<AudioCaptureDevice[]> {
      return [
        {
          id: "windows-default-system",
          label: "Default Windows system audio",
          track: "system",
          isDefault: true
        },
        {
          id: "windows-default-microphone",
          label: "Default Windows microphone",
          track: "microphone",
          isDefault: true
        }
      ];
    },

    async start(request) {
      if (activeCapture) {
        throw new Error("Windows audio capture is already active");
      }

      if (!request.tracks.system || !request.tracks.microphone) {
        throw new Error("Windows audio capture requires system and microphone tracks");
      }

      const output: string[] = [];
      const child = spawn(
        "dotnet",
        [
          "run",
          "--project",
          projectPath,
          "--",
          "--system-output",
          request.tracks.system.filePath,
          "--microphone-output",
          request.tracks.microphone.filePath,
          "--wait-for-stdin-stop"
        ],
        { windowsHide: true }
      );

      activeCapture = {
        request,
        process: child,
        startedAtMs: now(),
        stopRequested: false,
        output
      };

      subscribeToOutput(child.stdout, output);
      subscribeToOutput(child.stderr, output);
      child.on("exit", (code) => {
        if (!activeCapture || activeCapture.process !== child) {
          return;
        }

        if (!activeCapture.stopRequested && code !== 0) {
          emitError(errorSubscribers, createNativeExitError(code, output));
          activeCapture = undefined;
        }
      });
    },

    async stop(): Promise<AudioCaptureStopResult> {
      if (!activeCapture) {
        throw new Error("Windows audio capture is not active");
      }

      const capture = activeCapture;
      capture.stopRequested = true;
      capture.process.stdin.write("stop\n");

      const exitCode = await waitForExit(capture.process);
      activeCapture = undefined;

      if (exitCode !== 0) {
        throw createNativeExitError(exitCode, capture.output);
      }

      const durationMs = Math.max(0, now() - capture.startedAtMs);
      const [systemStats, microphoneStats] = await Promise.all([
        stat(capture.request.tracks.system?.filePath ?? ""),
        stat(capture.request.tracks.microphone?.filePath ?? "")
      ]);

      return {
        tracks: {
          system: {
            id: "system",
            filePath: capture.request.tracks.system?.filePath ?? "",
            format: "wav",
            hasAudio: systemStats.size > WAV_HEADER_BYTE_LENGTH,
            durationMs,
            byteLength: systemStats.size
          },
          microphone: {
            id: "microphone",
            filePath: capture.request.tracks.microphone?.filePath ?? "",
            format: "wav",
            hasAudio: microphoneStats.size > WAV_HEADER_BYTE_LENGTH,
            durationMs,
            byteLength: microphoneStats.size
          }
        }
      };
    },

    onLevel(): AudioCaptureUnsubscribe {
      return () => undefined;
    },

    onError(callback): AudioCaptureUnsubscribe {
      errorSubscribers.add(callback);
      return () => {
        errorSubscribers.delete(callback);
      };
    }
  };
}

function subscribeToOutput(stream: EventEmitter, output: string[]): void {
  stream.on("data", (chunk: unknown) => {
    output.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
  });
}

function waitForExit(process: WindowsAudioCaptureChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    process.on("exit", (code) => resolve(code));
  });
}

function emitError(
  subscribers: Set<(error: AudioCaptureError) => void>,
  error: Error
): void {
  subscribers.forEach((callback) => callback({ error }));
}

function createNativeExitError(code: number | null, output: string[]): Error {
  const message = output.join("").trim();
  return new Error(
    message.length > 0
      ? `Windows audio capture failed: ${message}`
      : `Windows audio capture failed with exit code ${code ?? "unknown"}`
  );
}
