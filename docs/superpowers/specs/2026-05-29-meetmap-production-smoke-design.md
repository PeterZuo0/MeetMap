# MeetMap Production Post-Meeting Smoke Design

Date: 2026-05-29
Status: Draft v1

## Goal

Create a guarded production smoke path that proves MeetMap can take explicit non-sensitive WAV files, run the real post-meeting processing workflow, and produce the expected local artifacts:

- `metadata.json`
- `audio/system.wav` and/or `audio/microphone.wav`
- `transcript.json`
- `structure.json`
- `exports/meeting-summary.docx`
- `exports/meeting-map.html`

This is the next step after UI migration and provider wiring. The purpose is to validate the real MVP path before adding more UI polish or new product features.

## Current State

The repository already has the main building blocks:

- `processMeeting` persists progress and writes transcript, structure, Word, and HTML artifacts.
- `createProductionWorkflowServices` bridges voice activity, transcription, and meeting structure extraction.
- OpenAI transcription and meeting-structure clients exist behind provider-neutral interfaces.
- Electron main config can wire OpenAI production providers when `OPENAI_API_KEY` is present.
- Demo mode can exercise the UI without uploading real data.

The missing piece is a repeatable, guarded way to run the production post-meeting path against known local WAV files without driving the whole UI manually.

## Design Principles

- Do not upload audio unless the user explicitly chooses the production smoke command and passes an explicit cloud-upload consent flag.
- Keep secrets in `.env` or the shell environment; never expose keys to renderer code or commit them.
- Use the standard local meeting directory layout.
- Validate input audio before starting cloud processing.
- Preserve intermediate artifacts so failed transcription or structure extraction can be retried.
- Keep the smoke runner separate from normal app UI code.
- Keep production provider logic behind the existing transcription and structure client interfaces.

## User Flow

The guarded smoke command should look like this:

```powershell
pnpm smoke:production -- `
  --meeting-id manual-smoke `
  --title "Manual smoke test" `
  --data-dir "$PWD/meetings" `
  --system-audio "$PWD/meetings/manual-smoke/audio/system.wav" `
  --microphone-audio "$PWD/meetings/manual-smoke/audio/microphone.wav" `
  --output-language bilingual `
  --allow-cloud-upload
```

The command must refuse to run if:

- `--allow-cloud-upload` is missing.
- `OPENAI_API_KEY` is missing.
- neither `--system-audio` nor `--microphone-audio` is provided.
- an input file does not exist.
- an input file is not a readable RIFF/WAVE file.
- dual-track input is provided while settings request non-separate upload before mixed upload is supported.

## Data Flow

1. Load `.env` into `process.env` without overwriting explicit shell variables.
2. Parse CLI arguments into a typed production smoke input.
3. Validate cloud consent and provider config.
4. Create a meeting in `data-dir/{meetingId}` using `createMeetingStore`.
5. Copy provided WAV files into the standard meeting audio paths.
6. Probe WAV metadata for sample rate, channel count, duration, and byte length.
7. Mark the meeting as `recorded` with accurate audio track metadata.
8. Build production workflow services from configured OpenAI providers.
9. Call `processMeeting`.
10. Print a concise artifact report with absolute paths.

## Audio Validation

Add a small local WAV probe that reads only the file header and required chunks. It should return:

```ts
export type WavFileInfo = {
  byteLength: number;
  channelCount: number;
  durationMs: number;
  format: "wav";
  sampleRateHz: number;
};
```

Minimum validation:

- file begins with `RIFF`
- file format is `WAVE`
- has a `fmt ` chunk
- has a `data` chunk
- channel count and sample rate are positive
- data length is greater than zero

This is not a full audio decoder. It is a fast guardrail before upload.

## Privacy and Safety

The smoke runner must print a clear warning before processing:

- which local files will be uploaded
- which provider key source is being used without printing the key
- where local artifacts will be written

The command must not upload anything unless `--allow-cloud-upload` is present.

Generated meeting artifacts stay under the configured `data-dir`. The repository `.gitignore` already excludes `meetings/`, but the runner should still avoid writing outside the requested data directory.

## Error Handling

Failures should leave useful local state:

- If audio validation fails, do not create a completed meeting.
- If transcription fails, preserve copied audio and failed metadata.
- If structure extraction fails, preserve `transcript.json`.
- If export generation fails, preserve `structure.json`.

Errors should be direct and actionable, for example:

- `Production smoke requires --allow-cloud-upload.`
- `OPENAI_API_KEY is required for production OpenAI providers.`
- `Input audio is not a RIFF/WAVE file: <path>`
- `No audio source was provided.`

## Acceptance Criteria

- A guarded CLI command can process at least one real WAV file through production services.
- The command writes the standard meeting layout.
- `transcript.json` contains merged transcript segments.
- `structure.json` validates against the meeting structure schema.
- Word and HTML exports are generated from `structure.json`.
- Unit tests cover CLI parsing, consent gating, WAV validation, and smoke runner persistence with fake providers.
- Network calls remain mocked in automated tests.
- README documents the guarded production smoke command and privacy constraints.

## Out of Scope

- Real-time transcription.
- Mixed-track upload when separate upload is disabled.
- Speaker diarization beyond passing current preferences to the provider boundary.
- Cloud provider cleanup APIs.
- A graphical smoke-test UI.
- Committing real audio, transcripts, summaries, maps, or logs.
