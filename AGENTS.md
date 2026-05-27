# AGENTS.md

## Project

MeetMap is a desktop meeting assistant. Its first target is a Windows MVP that records system audio and microphone input, sends valid audio to cloud transcription, generates a structured meeting summary, and exports both a Word document and a standalone HTML meeting map.

## Current State

The repository is in the planning stage. Do not assume an app stack exists until package files and source folders are present.

Authoritative planning documents:

- `docs/superpowers/specs/2026-05-27-meetmap-design.md`
- `docs/superpowers/plans/2026-05-27-meetmap-mvp.md`

## Engineering Principles

- Keep the core application platform-neutral.
- Isolate OS-specific system audio capture behind adapter interfaces.
- Keep audio capture, transcription, meeting intelligence, export generation, and UI workflow as separate modules.
- Prefer small files with one clear responsibility.
- Do not hard-code a single cloud provider into business logic; wrap providers behind client interfaces.
- Treat raw meeting audio and transcripts as sensitive data.
- Preserve intermediate artifacts so failed processing steps can be retried.
- Do not upload audio unless the user has explicitly started a meeting and consented to cloud processing.

## Phase 1 Constraints

- Implement Windows first.
- Use post-meeting processing first; do not add real-time transcription until the MVP path works.
- Support four audio cases:
  - system and microphone both active
  - system only
  - microphone only
  - neither active
- Preserve original transcript language.
- Generate final summaries according to the user-selected output language.
- Generate Word output from structured meeting JSON, not directly from raw transcript text.
- Generate HTML meeting maps from the same structured meeting JSON.

## Expected Local Data Shape

Use this local meeting layout unless a later committed design changes it:

```text
meetings/{meetingId}/
├─ metadata.json
├─ audio/
│  ├─ system.wav
│  ├─ microphone.wav
│  └─ chunks/
├─ transcript.json
├─ structure.json
├─ exports/
│  ├─ meeting-summary.docx
│  └─ meeting-map.html
└─ logs/
```

## Testing Expectations

When implementation starts, add tests for:

- output language option mapping
- voice activity decision rules
- transcript segment merge ordering
- meeting structure schema validation
- Word export data mapping
- HTML graph data generation
- one-sided audio scenarios

Run the relevant test command before claiming a change is complete.

## Git Guidance

- Keep commits small and task-focused.
- Do not rewrite user changes.
- Do not commit generated raw audio, transcripts, exports, logs, or local secrets.
- Add ignore rules for generated meeting artifacts when the runtime scaffold is created.

