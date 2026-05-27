# MeetMap UI Migration Design

Date: 2026-05-28
Status: Draft v1

## Goal

Replace the current minimal MeetMap workflow screen with the provided UI prototype from `C:\Users\peter.z\Downloads\MeetMAp`, and connect the existing MVP workflow to that interface.

This migration is not the real cloud transcription or real LLM integration phase. It should make the current app usable through the new product UI first. After this work is integrated and verified, the next implementation phase is real cloud transcription and LLM-backed meeting intelligence.

## Source UI

The source prototype contains:

- `MeetMap.html`
- `app.jsx`
- `shell.jsx`
- `icons.jsx`
- `screen-library.jsx`
- `screen-pre-recording.jsx`
- `screen-recording.jsx`
- `screen-processing.jsx`
- `screen-detail.jsx`
- `screen-settings.jsx`
- `tweaks-panel.jsx`
- `.thumbnail`

The prototype is a static React/Babel design. The production app must migrate it into the existing Vite, React, TypeScript, and Electron codebase rather than loading Babel or CDN React at runtime.

## User Flow

The migrated UI should use the real application workflow instead of the prototype state picker:

```text
Library
-> Pre-recording
-> Recording
-> Processing
-> Meeting detail
-> Export actions
```

The app should still be able to run in demo mode through the existing `pnpm dev:demo` path. Demo mode should use the existing demo audio capture and demo processing services, but through the migrated UI.

## Prototype Controls to Remove

Remove the prototype-only debugging controls:

- Top `state-strip` screen/state switcher.
- Floating `TweaksPanel`.

These controls must not appear in normal, demo, or production UI.

## Settings > General

Move useful tweak controls into Settings under a General section:

- Theme: Light or Dark.
- Accent color.
- UI language.
- Default output language.

The default UI language should be bilingual Chinese/English. The default output language setting should only provide an initial value for new meetings; the user must still be able to choose the output language before each recording.

Theme, accent color, UI language, and default output language can be local React state in this phase. Persistence can be added later unless it is cheap and isolated.

## MVP Workflow Integration

Use the existing preload API exposed as `window.meetMap`:

- `createMeeting({ title, outputLanguage })`
- `startRecording(meetingId)`
- `stopRecording()`
- `processMeeting(meetingId)`
- `openExport({ meetingId, kind })`

### Pre-recording

The pre-recording screen should collect or derive:

- Meeting title.
- Output language for this meeting.

When the user starts recording:

1. Validate the meeting title.
2. Call `createMeeting`.
3. Call `startRecording`.
4. Store the returned meeting metadata in UI state.
5. Navigate to the recording screen.

Audio device selectors and live level controls from the prototype may remain visually present as non-blocking UI, but they should not claim production device behavior until the real adapter is connected.

### Recording

The recording screen should show:

- Meeting title when available.
- Recording duration.
- Audio track state using the best available metadata.
- Stop action.

When the user stops recording:

1. Call `stopRecording`.
2. Store returned meeting metadata.
3. Navigate to processing.

### Processing

The processing screen should run `processMeeting(meetingId)` and reflect the known processing phases:

- Activity detection.
- Transcription.
- Transcript merge.
- Structure extraction.
- Word export.
- HTML map export.
- Completed.

The current IPC returns only after processing completes, so this phase can show deterministic staged UI while the call is pending. Fine-grained progress events can be added later.

On success, navigate to meeting detail. On failure, show a clear error and allow the user to return to library or retry when a retry path exists.

### Meeting Detail

The meeting detail screen should become the destination after processing. In this phase:

- Export buttons must call `openExport`.
- If real transcript or structure data is not loaded into renderer state, existing sample transcript, summary, and structure-map UI can remain as visual placeholders.
- The screen should make the current meeting status visible.

This phase should not pretend that sample transcript content came from the processed meeting. If placeholder content remains, keep it clearly isolated in code so it can be replaced by real artifact loading later.

### Library

The library can remain sample-backed in this phase, with one important addition:

- The meeting just created or processed during the current app session should be reachable from the UI state.

Persistent meeting history, search, folders, tags, pinning, and sharing are out of scope for this migration.

## Error Handling

The migrated UI should handle these cases:

- Desktop preload API missing.
- Empty meeting title.
- `startRecording` fails because production audio provider is not configured.
- `stopRecording` fails.
- `processMeeting` fails because production workflow services are not configured.
- Export is not available yet.

In demo mode, the happy path should complete through export generation using existing demo providers.

## Scope Boundaries

In scope:

- Migrate the provided UI into typed React components.
- Preserve the visual direction of the provided prototype.
- Connect the primary MVP actions to existing Electron IPC.
- Remove prototype debug controls.
- Move tweak settings into Settings > General.
- Update tests for the new primary UI workflow.

Out of scope for this phase:

- Real Windows audio provider wiring.
- Real cloud transcription provider.
- Real LLM provider.
- Persistent settings storage.
- Persistent library indexing.
- Real search, folders, tags, pinning, sharing, and team workflows.
- Speaker diarization and audio playback backed by real recorded audio.

## Next Phase

After this UI migration is connected and verified, implement real cloud transcription and LLM-backed meeting intelligence:

1. Add production transcription provider configuration.
2. Add production LLM/meeting-structure provider configuration.
3. Keep provider-specific logic behind existing client interfaces.
4. Update processing UI to show real progress, provider errors, and retry affordances.
