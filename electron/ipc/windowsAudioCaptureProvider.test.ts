import { EventEmitter } from "node:events";
import { describe, expect, test } from "vitest";

import type { AudioCaptureStartRequest } from "../../src/features/recording/audioCaptureProvider";
import {
  createWindowsAudioCaptureProvider,
  type WindowsAudioCaptureChildProcess,
  type WindowsAudioCaptureSpawn
} from "./windowsAudioCaptureProvider";

class FakeChildProcess extends EventEmitter implements WindowsAudioCaptureChildProcess {
  readonly stdinWrites: string[] = [];
  readonly stdin = {
    write: (value: string) => {
      this.stdinWrites.push(value);
    },
    end: () => undefined
  };
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
}

function startRequest(): AudioCaptureStartRequest {
  return {
    meetingId: "meeting-1",
    tracks: {
      system: { filePath: "C:/meetings/1/audio/system.wav" },
      microphone: { filePath: "C:/meetings/1/audio/microphone.wav" }
    }
  };
}

describe("createWindowsAudioCaptureProvider", () => {
  test("starts native capture and returns WAV metadata when stopped", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: Parameters<WindowsAudioCaptureSpawn>[] = [];
    const provider = createWindowsAudioCaptureProvider({
      projectPath: "C:/repo/native/windows-audio/src/MeetMap.WindowsAudio.csproj",
      spawn(command, args, options) {
        spawnCalls.push([command, args, options]);
        return child;
      },
      async stat(filePath) {
        return {
          size: filePath.includes("system") ? 4096 : 2048
        };
      },
      now: (() => {
        const values = [1000, 6500];
        return () => values.shift() ?? 6500;
      })()
    });

    await provider.start(startRequest());
    const stop = provider.stop();
    child.emit("exit", 0, null);

    await expect(stop).resolves.toEqual({
      tracks: {
        system: {
          id: "system",
          filePath: "C:/meetings/1/audio/system.wav",
          format: "wav",
          hasAudio: true,
          durationMs: 5500,
          byteLength: 4096
        },
        microphone: {
          id: "microphone",
          filePath: "C:/meetings/1/audio/microphone.wav",
          format: "wav",
          hasAudio: true,
          durationMs: 5500,
          byteLength: 2048
        }
      }
    });

    expect(spawnCalls).toEqual([
      [
        "dotnet",
        [
          "run",
          "--project",
          "C:/repo/native/windows-audio/src/MeetMap.WindowsAudio.csproj",
          "--",
          "--system-output",
          "C:/meetings/1/audio/system.wav",
          "--microphone-output",
          "C:/meetings/1/audio/microphone.wav",
          "--wait-for-stdin-stop"
        ],
        { windowsHide: true }
      ]
    ]);
    expect(child.stdinWrites).toEqual(["stop\n"]);
  });

  test("emits provider errors when native capture exits before stop", async () => {
    const child = new FakeChildProcess();
    const errors: Error[] = [];
    const provider = createWindowsAudioCaptureProvider({
      projectPath: "native.csproj",
      spawn() {
        return child;
      },
      async stat() {
        return { size: 0 };
      }
    });
    provider.onError((error) => errors.push(error.error));

    await provider.start(startRequest());
    child.stderr.emit("data", Buffer.from("No microphone capture devices are available."));
    child.emit("exit", 3, null);

    expect(errors[0].message).toContain("No microphone capture devices are available.");
  });
});
