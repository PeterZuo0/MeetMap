import { spawn as nodeSpawn } from "node:child_process";
import { stat as nodeStat } from "node:fs/promises";
import { join } from "node:path";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { EventEmitter } from "node:events";
import type {
  AudioCaptureDevice,
  AudioCaptureError,
  AudioLevelUpdate,
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
  helperPath?: string;
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
const MIN_METER_DBFS = -45;
const MAX_METER_DBFS = -10;

export function createWindowsAudioCaptureProvider({
  helperPath = join(
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
  const levelSubscribers = new Set<(update: AudioLevelUpdate) => void>();
  let activeCapture: ActiveCapture | undefined;

  return {
    async listDevices(): Promise<AudioCaptureDevice[]> {
      const output: string[] = [];
      const child = spawnCaptureHelper(helperPath, ["--list-devices"], spawn);
      subscribeToOutput(child.stdout, output);
      subscribeToOutput(child.stderr, output);
      const exitCode = await waitForExit(child);

      if (exitCode !== 0) {
        throw createNativeExitError(exitCode, output);
      }

      return [
        {
          id: "windows-default-system",
          label: "Default Windows system audio",
          track: "system",
          isDefault: true
        },
        ...parseDeviceList(output.join(""))
      ];
    },

    async start(request) {
      if (activeCapture) {
        throw new Error("Windows audio capture is already active");
      }

      if (!request.tracks.system && !request.tracks.microphone) {
        throw new Error("Windows audio capture requires at least one audio track");
      }

      const args = [
        "--wait-for-stdin-stop"
      ];
      if (request.tracks.system) {
        args.push("--system-output", request.tracks.system.filePath);
      }
      if (request.tracks.microphone) {
        args.push("--microphone-output", request.tracks.microphone.filePath);
        const microphoneDeviceNumber = parseMicrophoneDeviceId(request.tracks.microphone.deviceId);
        if (microphoneDeviceNumber !== undefined) {
          args.push("--microphone-device", String(microphoneDeviceNumber));
        }
      }
      const output: string[] = [];
      const child = spawnCaptureHelper(helperPath, args, spawn);

      activeCapture = {
        request,
        process: child,
        startedAtMs: now(),
        stopRequested: false,
        output
      };

      subscribeToOutput(child.stdout, output, (line) => {
        const update = parseLevelLine(line);
        if (update) {
          levelSubscribers.forEach((callback) => callback(update));
        }
      });
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
        capture.request.tracks.system
          ? stat(capture.request.tracks.system.filePath)
          : Promise.resolve(undefined),
        capture.request.tracks.microphone
          ? stat(capture.request.tracks.microphone.filePath)
          : Promise.resolve(undefined)
      ]);

      return {
        tracks: {
          system:
            capture.request.tracks.system && systemStats
              ? {
                  id: "system",
                  filePath: capture.request.tracks.system.filePath,
                  format: "wav",
                  hasAudio: systemStats.size > WAV_HEADER_BYTE_LENGTH,
                  durationMs,
                  byteLength: systemStats.size
                }
              : undefined,
          microphone:
            capture.request.tracks.microphone && microphoneStats
              ? {
                  id: "microphone",
                  filePath: capture.request.tracks.microphone.filePath,
                  format: "wav",
                  hasAudio: microphoneStats.size > WAV_HEADER_BYTE_LENGTH,
                  durationMs,
                  byteLength: microphoneStats.size
                }
              : undefined
        }
      };
    },

    async pause(): Promise<void> {
      if (!activeCapture) {
        throw new Error("Windows audio capture is not active");
      }

      activeCapture.process.stdin.write("pause\n");
    },

    async resume(): Promise<void> {
      if (!activeCapture) {
        throw new Error("Windows audio capture is not active");
      }

      activeCapture.process.stdin.write("resume\n");
    },

    onLevel(callback): AudioCaptureUnsubscribe {
      levelSubscribers.add(callback);
      return () => {
        levelSubscribers.delete(callback);
      };
    },

    onError(callback): AudioCaptureUnsubscribe {
      errorSubscribers.add(callback);
      return () => {
        errorSubscribers.delete(callback);
      };
    }
  };
}

function subscribeToOutput(
  stream: EventEmitter,
  output: string[],
  onLine?: (line: string) => void
): void {
  let buffered = "";
  stream.on("data", (chunk: unknown) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    output.push(text);
    if (!onLine) {
      return;
    }

    buffered += text;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    lines.forEach(onLine);
  });
}

function spawnCaptureHelper(
  helperPath: string,
  args: string[],
  spawn: WindowsAudioCaptureSpawn
): WindowsAudioCaptureChildProcess {
  if (helperPath.toLowerCase().endsWith(".csproj")) {
    return spawn("dotnet", ["run", "--project", helperPath, "--", ...args], {
      windowsHide: true
    });
  }

  return spawn(helperPath, args, { windowsHide: true });
}

function parseLevelLine(line: string): AudioLevelUpdate | null {
  const match = /^LEVEL\s+(system|microphone)\s+([0-9.]+)(?:\s+([0-9.]+))?$/i.exec(line.trim());
  if (!match) {
    return null;
  }

  const level = normalizeNativeRmsLevel(Number(match[2]));
  return {
    track: match[1].toLowerCase() as "system" | "microphone",
    level,
    peak: match[3] === undefined ? level : normalizeNativeRmsLevel(Number(match[3])),
    occurredAt: new Date().toISOString()
  };
}

function normalizeNativeRmsLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) {
    return 0;
  }

  const dbfs = 20 * Math.log10(Math.min(1, level));
  return Math.max(0, Math.min(1, (dbfs - MIN_METER_DBFS) / (MAX_METER_DBFS - MIN_METER_DBFS)));
}

function parseDeviceList(output: string): AudioCaptureDevice[] {
  const devices: AudioCaptureDevice[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [marker, track, index, ...labelParts] = line.split("\t");
    if (marker !== "DEVICE" || track !== "microphone" || !/^\d+$/.test(index)) {
      continue;
    }

    const isDefault = devices.length === 0;
    devices.push({
      id: `microphone:${index}`,
      label: labelParts.join("\t").trim() || `Microphone ${index}`,
      track: "microphone",
      ...(isDefault ? { isDefault: true } : {})
    });
  }

  return devices;
}

function parseMicrophoneDeviceId(deviceId: string | undefined): number | undefined {
  const match = /^microphone:(\d+)$/.exec(deviceId ?? "");
  return match ? Number(match[1]) : undefined;
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
