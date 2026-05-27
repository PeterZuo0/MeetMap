# MeetMap

MeetMap is a cross-platform meeting assistant that captures both system audio and microphone input, transcribes bilingual conversations, and turns meetings into structured Word summaries and interactive visual meeting maps.

## Status

MeetMap is currently in product and technical planning. The first implementation target is a Windows desktop MVP, with the architecture kept ready for macOS and Linux audio capture adapters later.

## Phase 1 Scope

- Windows-first desktop app.
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

## Planned Architecture

```text
MeetMap Desktop App
├─ Shared UI
├─ Meeting workflow
├─ Recording session manager
├─ Cloud transcription client
├─ Meeting intelligence pipeline
├─ Word export generator
├─ HTML meeting map generator
└─ Audio Capture Adapter
   ├─ Windows: WASAPI loopback + microphone
   ├─ macOS: later
   └─ Linux: later
```

The shared application should remain platform-neutral. Operating-system-specific audio capture must live behind a small adapter boundary.

## Documents

- Product and technical design: `docs/superpowers/specs/2026-05-27-meetmap-design.md`
- MVP implementation plan: `docs/superpowers/plans/2026-05-27-meetmap-mvp.md`

## Development Notes

No runtime stack has been scaffolded yet. The current recommended stack is:

- Electron
- TypeScript
- React
- Windows native audio capture adapter using WASAPI loopback
- Cloud transcription API
- Cloud LLM API for meeting structure and summary generation
- DOCX generation library
- D3.js or Cytoscape.js for the HTML meeting map

