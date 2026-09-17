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

function systemOnlyRequest(): AudioCaptureStartRequest {
  return {
    meetingId: "meeting-1",
    tracks: {
      system: { filePath: "C:/meetings/1/audio/system.wav" }
    }
  };
}

describe("createWindowsAudioCaptureProvider", () => {
  test("starts native capture and returns WAV metadata when stopped", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: Parameters<WindowsAudioCaptureSpawn>[] = [];
    const provider = createWindowsAudioCaptureProvider({
      helperPath: "C:/repo/native/windows-audio/src/MeetMap.WindowsAudio.csproj",
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
    await provider.pause();
    await provider.resume();
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
          "--wait-for-stdin-stop",
          "--system-output",
          "C:/meetings/1/audio/system.wav",
          "--microphone-output",
          "C:/meetings/1/audio/microphone.wav"
        ],
        { windowsHide: true }
      ]
    ]);
    expect(child.stdinWrites).toEqual(["pause\n", "resume\n", "stop\n"]);
  });

  test("emits provider errors when native capture exits before stop", async () => {
    const child = new FakeChildProcess();
    const errors: Error[] = [];
    const provider = createWindowsAudioCaptureProvider({
      helperPath: "native.csproj",
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

  test("starts native capture with only the requested track", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: Parameters<WindowsAudioCaptureSpawn>[] = [];
    const statCalls: string[] = [];
    const provider = createWindowsAudioCaptureProvider({
      helperPath: "native.csproj",
      spawn(command, args, options) {
        spawnCalls.push([command, args, options]);
        return child;
      },
      async stat(filePath) {
        statCalls.push(filePath);
        return { size: 44 };
      }
    });

    await provider.start(systemOnlyRequest());
    const stop = provider.stop();
    child.emit("exit", 0, null);

    await expect(stop).resolves.toEqual({
      tracks: {
        system: {
          id: "system",
          filePath: "C:/meetings/1/audio/system.wav",
          format: "wav",
          hasAudio: false,
          durationMs: expect.any(Number),
          byteLength: 44
        },
        microphone: undefined
      }
    });
    expect(spawnCalls[0][1]).toEqual([
      "run",
      "--project",
      "native.csproj",
      "--",
      "--wait-for-stdin-stop",
      "--system-output",
      "C:/meetings/1/audio/system.wav"
    ]);
    expect(statCalls).toEqual(["C:/meetings/1/audio/system.wav"]);
  });

  test("lists microphone devices from the native helper", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: Parameters<WindowsAudioCaptureSpawn>[] = [];
    const provider = createWindowsAudioCaptureProvider({
      helperPath: "C:/repo/native/windows-audio/src/bin/Release/net8.0-windows/win-x64/publish/meetmap-windows-audio.exe",
      spawn(command, args, options) {
        spawnCalls.push([command, args, options]);
        return child;
      }
    });

    const devices = provider.listDevices();
    child.stdout.emit("data", Buffer.from("DEVICE\tmicrophone\t0\tRealtek Microphone\r\n"));
    child.stdout.emit("data", Buffer.from("DEVICE\tmicrophone\t1\tUSB Audio Mic\r\n"));
    child.emit("exit", 0, null);

    await expect(devices).resolves.toEqual([
      {
        id: "windows-default-system",
        label: "Default Windows system audio",
        track: "system",
        isDefault: true
      },
      {
        id: "microphone:0",
        label: "Realtek Microphone",
        track: "microphone",
        isDefault: true
      },
      {
        id: "microphone:1",
        label: "USB Audio Mic",
        track: "microphone"
      }
    ]);
    expect(spawnCalls).toEqual([
      [
        "C:/repo/native/windows-audio/src/bin/Release/net8.0-windows/win-x64/publish/meetmap-windows-audio.exe",
        ["--list-devices"],
        { windowsHide: true }
      ]
    ]);
  });

  test("passes selected microphone device number to the native helper", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: Parameters<WindowsAudioCaptureSpawn>[] = [];
    const provider = createWindowsAudioCaptureProvider({
      helperPath: "native.csproj",
      spawn(command, args, options) {
        spawnCalls.push([command, args, options]);
        return child;
      },
      async stat() {
        return { size: 44 };
      }
    });

    await provider.start({
      meetingId: "meeting-1",
      tracks: {
        microphone: {
          filePath: "C:/meetings/1/audio/microphone.wav",
          deviceId: "microphone:1"
        }
      }
    });

    expect(spawnCalls[0][1]).toEqual([
      "run",
      "--project",
      "native.csproj",
      "--",
      "--wait-for-stdin-stop",
      "--microphone-output",
      "C:/meetings/1/audio/microphone.wav",
      "--microphone-device",
      "1"
    ]);
  });

  test("maps native RMS level lines to perceptual meter levels", async () => {
    const child = new FakeChildProcess();
    const levels: Array<{ track: string; level: number }> = [];
    const provider = createWindowsAudioCaptureProvider({
      helperPath: "native.csproj",
      spawn() {
        return child;
      },
      async stat() {
        return { size: 44 };
      }
    });
    provider.onLevel((update) => levels.push({ track: update.track, level: update.level }));

    await provider.start(systemOnlyRequest());
    child.stdout.emit("data", Buffer.from("LEVEL system 0.0600\r\n"));
    child.stdout.emit("data", Buffer.from("LEVEL system 0.0000\r\n"));

    expect(levels).toEqual([
      { track: "system", level: expect.closeTo(0.59, 2) },
      { track: "system", level: 0 }
    ]);
  });

  test("maps the reported peak alongside the RMS level", async () => {
    const child = new FakeChildProcess();
    const levels: Array<{ level: number; peak?: number }> = [];
    const provider = createWindowsAudioCaptureProvider({
      helperPath: "native.csproj",
      spawn() {
        return child;
      },
      async stat() {
        return { size: 44 };
      }
    });
    provider.onLevel((update) => levels.push({ level: update.level, peak: update.peak }));

    await provider.start(systemOnlyRequest());
    child.stdout.emit("data", Buffer.from("LEVEL system 0.0600 0.2000\r\n"));
    child.stdout.emit("data", Buffer.from("LEVEL system 0.0600\r\n"));

    expect(levels[0].peak).toBeGreaterThan(levels[0].level);
    expect(levels[1].peak).toBe(levels[1].level);
  });

  test("starts published helper directly when an exe path is configured", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: Parameters<WindowsAudioCaptureSpawn>[] = [];
    const provider = createWindowsAudioCaptureProvider({
      helperPath: "C:/Program Files/MeetMap/resources/native/windows-audio/meetmap-windows-audio.exe",
      spawn(command, args, options) {
        spawnCalls.push([command, args, options]);
        return child;
      },
      async stat() {
        return { size: 44 };
      }
    });

    await provider.start(systemOnlyRequest());

    expect(spawnCalls[0]).toEqual([
      "C:/Program Files/MeetMap/resources/native/windows-audio/meetmap-windows-audio.exe",
      [
        "--wait-for-stdin-stop",
        "--system-output",
        "C:/meetings/1/audio/system.wav"
      ],
      { windowsHide: true }
    ]);
  });
});
