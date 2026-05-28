# MeetMap

MeetMap is a Windows-first desktop meeting assistant that captures system audio and microphone input, transcribes bilingual conversations, and turns meetings into structured Word summaries and standalone HTML meeting maps.

## Status

MeetMap is in MVP implementation. The current app is an Electron, React, and TypeScript desktop scaffold with the Phase 1 workflow boundaries in place. Windows is the first supported target; macOS and Linux audio capture adapters are planned for later.

## Phase 1 Scope

- Windows desktop app.
- Dual audio capture:
  - system audio from the computer
  - microphone input from the user
- Post-meeting processing rather than real-time transcription.
- Speech detection for each audio track.
- One-sided meeting handling:
  - system-only audio
  - microphone-only audio
  - both tracks
  - no useful audio
- Chinese, English, and mixed Chinese-English meeting support.
- User-selected output language:
  - Chinese
  - English
  - bilingual Chinese and English
  - automatic
- Cloud transcription and summarization APIs.
- Word meeting summary export.
- Standalone HTML meeting structure map export.

## Setup

Install dependencies:

```powershell
pnpm install
```

Run the desktop app in normal MVP mode:

```powershell
pnpm dev
```

Normal MVP mode uses the Windows audio provider. To enable real cloud post-meeting processing, set an OpenAI API key before starting the app:

```powershell
$env:OPENAI_API_KEY = "..."
pnpm dev
```

For local testing, you can also create a `.env` file in the repository root. `.env` is ignored by git:

```text
OPENAI_API_KEY=...
```

Run the desktop app with explicit demo providers:

```powershell
pnpm dev:demo
```

You can also pass demo mode directly to Electron after a build:

```powershell
$env:MEETMAP_DEMO_MODE = "1"
pnpm dev
```

or:

```powershell
pnpm build
pnpm exec electron . --meetmap-demo
```

Demo mode uses fake local workflow and audio providers. It creates local demo artifacts so the UI and post-meeting flow can be exercised without recording real audio or uploading data to cloud providers.

## Development Commands

```powershell
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

Build output is written to `dist/` and `dist-electron/`.

## Windows Packaging

The MVP uses `electron-builder` for Windows packaging. Create an unpacked Windows desktop build:

```powershell
pnpm package:win
```

The packaged app is written to `out/win-unpacked/`. The current MVP packaging target is deliberately unpacked so the Windows build can be smoke-tested without installer signing or update infrastructure.

## Windows Audio POC Smoke Test

The native Windows audio proof of concept is documented in `native/windows-audio/README.md`. From the repository root, run:

```powershell
dotnet run --project native/windows-audio/src/MeetMap.WindowsAudio.csproj -- `
  --system-output "$PWD/meetings/manual-smoke/audio/system.wav" `
  --microphone-output "$PWD/meetings/manual-smoke/audio/microphone.wav" `
  --duration-seconds 10
```

Expected result when both sources are available:

- `meetings/manual-smoke/audio/system.wav` exists and contains captured system output.
- `meetings/manual-smoke/audio/microphone.wav` exists and contains captured microphone input.

## Privacy

Treat meeting audio, transcripts, summaries, maps, and logs as sensitive data.

Phase 1 is designed to use cloud APIs for transcription and summarization. Once real providers are configured, valid audio and transcript text will be uploaded to those providers for processing after the user starts a meeting and consents to cloud processing.

The current MVP can still run with explicit demo services through `MEETMAP_DEMO_MODE=1`, `--meetmap-demo`, or `pnpm dev:demo`. Demo mode uses fake local providers and does not represent the production cloud-processing privacy model.

## Planned Architecture

```text
MeetMap Desktop App
|-- Shared UI
|-- Meeting workflow
|-- Recording session manager
|-- Cloud transcription client
|-- Meeting intelligence pipeline
|-- Word export generator
|-- HTML meeting map generator
`-- Audio Capture Adapter
    |-- Windows: WASAPI loopback + microphone
    |-- macOS: later
    `-- Linux: later
```

The shared application should remain platform-neutral. Operating-system-specific audio capture must live behind a small adapter boundary.

## Documents

- Product and technical design: `docs/superpowers/specs/2026-05-27-meetmap-design.md`
- MVP implementation plan: `docs/superpowers/plans/2026-05-27-meetmap-mvp.md`
