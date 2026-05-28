# MeetMap Windows Audio Capture POC

This proof of concept validates the native Windows adapter requirement for the MVP: capture desktop/system audio through WASAPI loopback and the selected microphone input as two separate WAV files.

The executable is intentionally not wired into the Electron UI yet. It is a standalone native adapter experiment that accepts output paths for:

- `system.wav`: WASAPI loopback capture of speaker/system output.
- `microphone.wav`: selected microphone input capture.

## Requirements

- Windows 10 or newer.
- .NET 8 SDK or newer.
- An active playback device for WASAPI loopback.
- An available microphone input device.

The current implementation uses NAudio as a thin .NET wrapper over Windows audio APIs.

## Build

```powershell
dotnet build native/windows-audio/src/MeetMap.WindowsAudio.csproj
```

## Manual Smoke Test

From the repository root, run this command to record 10 seconds from the default system output and default microphone input:

```powershell
dotnet run --project native/windows-audio/src/MeetMap.WindowsAudio.csproj -- `
  --system-output "$PWD/meetings/manual-smoke/audio/system.wav" `
  --microphone-output "$PWD/meetings/manual-smoke/audio/microphone.wav" `
  --duration-seconds 10
```

Expected result when both sources are available:

- `meetings/manual-smoke/audio/system.wav` exists and contains captured system output.
- `meetings/manual-smoke/audio/microphone.wav` exists and contains captured microphone input.

To select a non-default microphone device, pass a zero-based NAudio WaveIn device index:

```powershell
dotnet run --project native/windows-audio/src/MeetMap.WindowsAudio.csproj -- `
  --system-output "$PWD/meetings/manual-smoke/audio/system.wav" `
  --microphone-output "$PWD/meetings/manual-smoke/audio/microphone.wav" `
  --duration-seconds 10 `
  --microphone-device 1
```

The Electron adapter runs the native process until the user stops recording. For that mode, pass `--wait-for-stdin-stop` and write a line containing `stop` to stdin.

## Current Limitations

- This is a proof of concept, not the production adapter.
- Device enumeration is not exposed as a stable JSON API yet.
- The microphone selector currently accepts the NAudio `WaveInEvent` device index.
- The process exits with a non-zero status if either source is unavailable or if either WAV file is not created with audio data.
