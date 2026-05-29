# MeetMap Preflight Audio Check Design

Date: 2026-05-29
Status: Draft v1

## Goal

Make the `New recording` setup page functional as a real pre-recording control surface, with automatic live checks for system audio and microphone volume before the user starts a meeting recording.

This is the next UI and capture workflow step after the guarded production smoke path. The page already has a strong visual shell; the missing piece is that several controls are static or backed by hard-coded audio levels.

## Current State

The repository already has the important foundations:

- `PreRecordingScreen` renders the setup page with title, folder selector, audio source cards, device selectors, output language, summary style, privacy link, cancel, and start controls.
- `App` can create meetings, start recordings, list audio devices, subscribe to `recording:level`, and pass selected audio sources/device ids into recording startup.
- `recordingIpc` starts and stops real recording sessions and forwards native `recording:level` events while recording is active.
- `windowsAudioCaptureProvider` launches the native Windows helper, parses `LEVEL system|microphone <number>` stdout lines, and exposes `onLevel`.
- The native Windows helper already computes audio levels while capturing.

The setup page currently uses hard-coded level values (`0.62` and `0.34`) instead of measuring input before recording starts. Audio level events only flow while an actual recording session is active.

## User Experience

When the user enters `New recording`, MeetMap starts a preflight audio probe in the background. The probe is not a meeting recording and should not create a meeting, transcript, summary, or export.

Each enabled audio source card shows:

- current level meter using live audio data
- peak level percentage over a short rolling window
- status label:
  - `Detecting`: probe is starting or no sample has arrived yet
  - `Detected`: recent level is above the speech/audio threshold
  - `Quiet`: samples are arriving but the level is below threshold
  - `Stale`: no recent sample arrived within the freshness window
  - `Off`: source toggle is disabled
  - `Unavailable`: probe failed for that source or the runtime cannot provide it
- short guidance:
  - system audio: play meeting audio or any desktop sound to test
  - microphone: speak now to test input

The top status pill summarizes enabled sources:

- `Both detected`
- `System audio only`
- `Microphone only`
- `Waiting for audio`
- `No sources selected`
- `Audio probe unavailable`

## Start Recording Rule

The approved behavior is:

- If no source is selected, block start.
- If at least one selected source has recent audio above threshold, allow start.
- If a selected source is quiet while another selected source is detected, allow start but show a warning on the quiet source.
- If all selected sources are quiet, stale, or unavailable, block start and show a clear message.

This avoids false blocking when only one side of a meeting is currently speaking, while still protecting users from starting a fully silent recording.

## Data Model

Add a renderer-facing preflight status shape:

```ts
export type AudioPreflightTrackStatus =
  | "detecting"
  | "detected"
  | "quiet"
  | "stale"
  | "off"
  | "unavailable";

export type AudioPreflightTrackState = {
  track: "system" | "microphone";
  enabled: boolean;
  status: AudioPreflightTrackStatus;
  level: number;
  peakLevel: number;
  lastHeardAt: string | null;
  message: string;
};

export type AudioPreflightState = {
  canStart: boolean;
  blockingReason: string | null;
  summary:
    | "both-detected"
    | "system-only"
    | "microphone-only"
    | "waiting"
    | "none-selected"
    | "unavailable";
  tracks: {
    system: AudioPreflightTrackState;
    microphone: AudioPreflightTrackState;
  };
};
```

Keep the calculation pure and testable in `src/features/audio-analysis/audioPreflight.ts`. The UI should consume the computed state rather than duplicating threshold logic.

Suggested constants:

- detected threshold: `0.02`
- freshness window: `2000ms`
- quiet warning delay: `5000ms`
- rolling peak window: keep recent samples in renderer state for about `5000ms`

These values are small and conservative; they can be tuned later without changing the UI contract.

## Capture and IPC Design

Add a preflight probe API separate from real recording:

- `recording:probe-start`
- `recording:probe-stop`

Renderer API additions:

```ts
startAudioProbe(options: RecordingStartOptions): Promise<void>;
stopAudioProbe(): Promise<void>;
```

The probe should:

- use the same `AudioCaptureProvider` boundary as real recording
- subscribe to provider level updates and forward them to the renderer with a source marker so setup preflight levels and active recording levels cannot be confused
- write temporary WAV output under an ignored runtime directory
- stop and dispose cleanly when leaving the setup page
- stop before starting a real recording
- never call `store.createMeeting`
- never mark metadata as recording/recorded
- never upload audio

Probe and real recording are mutually exclusive. If a real recording is active, probe start should fail with a clear error. If a probe is active and the user starts recording, the app should stop the probe first, then create the meeting and start the real recording.

## Temporary Audio Artifacts

The Windows helper currently reports levels while writing WAV files. The preflight probe may therefore need temporary WAV paths. Those files must not be treated as meeting artifacts.

Use an ignored local directory such as:

```text
meetings/.preflight/
```

or an OS temp directory. If using `meetings/.preflight`, generated files remain covered by the existing `meetings/` gitignore rule.

Cleanup should be best-effort. Failure to delete temporary probe WAV files should not block recording startup, but the error should be logged or surfaced in development logs.

## UI Behavior

Prefer extending `RecordingAudioLevel` with a `source: "preflight" | "recording"` field, defaulting old/missing values to `recording` in renderer code for compatibility. `App` should use preflight-sourced levels on the setup page and recording-sourced levels on the active recording page.

`PreRecordingScreen` should receive:

- live `AudioPreflightState`
- source toggle callbacks
- device select callbacks
- start/cancel/privacy callbacks

The component should:

- remove hard-coded levels
- render per-track status and guidance from preflight state
- disable start when `canStart` is false
- show `blockingReason` when blocked
- keep folder selector present, but treat folder persistence as out of scope unless the app already has a real folder model
- keep output language and summary style controls wired to existing settings

Device selection remains MVP-level:

- system device: default Windows system audio
- microphone device: default Windows microphone, plus any provider-listed microphone entries if available

Full Windows endpoint enumeration and active application/session labeling are explicitly deferred.

## Demo Mode

Demo mode should simulate preflight levels so the setup page is testable without native audio. The fake provider can emit deterministic or simple interval-based level updates for enabled tracks.

Demo behavior should still exercise:

- both detected
- one-sided audio
- all quiet/no detected source

## Error Handling

If preflight probe start fails:

- the page should remain usable
- affected tracks should show `Unavailable`
- start should still be allowed only if another selected track has recent detected audio, otherwise blocked
- the user should see a direct message, for example:
  - `Audio probe is unavailable. Check Windows audio permissions or device availability.`
  - `No microphone input detected yet.`
  - `No system audio detected yet.`

If probe stop fails while starting a real recording:

- try to stop/dispose it once
- if still active, block recording startup with a direct error rather than running two captures concurrently

## Privacy and Safety

Preflight probing is local only. It must not create cloud processing jobs and must not upload audio.

The setup page should continue to state that cloud APIs receive audio only after the user stops and processes the recording according to privacy settings.

Temporary probe audio must not be committed and should not be surfaced as a meeting artifact.

## Acceptance Criteria

- The setup page no longer uses hard-coded system/microphone level values.
- Entering the setup page starts a local preflight audio probe when the API is available.
- Leaving the setup page stops the probe.
- Starting a recording stops the probe before creating the meeting and starting real recording.
- Live system and microphone levels update the setup page meters.
- Per-track statuses distinguish detecting, detected, quiet, stale, off, and unavailable states.
- Start is blocked when no source is selected.
- Start is blocked when all selected sources are quiet, stale, or unavailable.
- Start is allowed when at least one selected source is detected.
- Quiet selected sources show warnings when another selected source is detected.
- Demo mode exercises preflight levels without native audio.
- Unit tests cover pure preflight decision rules.
- Component tests cover UI level rendering, warnings, and start gating.
- IPC/provider tests cover probe start/stop, probe-recording mutual exclusion, and event forwarding.
- Full verification runs `pnpm.CMD test`, `pnpm.CMD typecheck`, `pnpm.CMD lint`, and `pnpm.CMD build`.

## Out of Scope

- Full Windows endpoint enumeration beyond current provider-listed devices.
- Per-application audio session detection such as Zoom or Teams labels.
- Automatic gain control, noise suppression implementation, or device calibration.
- Real-time transcription during recording.
- Cloud upload during preflight.
- Persisting folder organization beyond the current setup page selector unless an existing folder model is already present.
