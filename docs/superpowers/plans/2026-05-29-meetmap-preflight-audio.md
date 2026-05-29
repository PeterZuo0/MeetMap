# MeetMap Preflight Audio Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real pre-recording audio preflight check to the `New recording` page so system audio and microphone levels are measured before recording starts.

**Architecture:** Keep decision logic pure in `src/features/audio-analysis/audioPreflight.ts`, expose preflight start/stop through the existing Electron recording IPC boundary, and let `App` manage probe lifecycle while `PreRecordingScreen` renders computed state. Reuse the existing native helper level protocol and `AudioCaptureProvider` abstraction; do not add cloud upload or real-time transcription.

**Tech Stack:** TypeScript, React, Electron IPC, Vitest, Testing Library, existing Windows audio helper stdout `LEVEL` events.

---

## File Structure

- Create `src/features/audio-analysis/audioPreflight.ts`: pure status calculation and start-gating rules.
- Create `src/features/audio-analysis/audioPreflight.test.ts`: unit tests for detected/quiet/stale/off/unavailable and start gating.
- Modify `src/app/meetMapApi.ts`: add preflight API methods and source-marked level event type.
- Modify `electron/preload.ts`: expose `startAudioProbe` and `stopAudioProbe`.
- Modify `electron/ipc/recordingIpc.ts`: add probe lifecycle, mutual exclusion, temp paths, and source-marked level forwarding.
- Modify `electron/ipc/recordingIpc.test.ts`: cover probe start/stop, forwarding, cleanup/mutual exclusion.
- Modify `electron/ipc/demoAudioCaptureProvider.ts` only if needed for deterministic probe behavior; likely existing level timer is enough once probe uses provider.start.
- Modify `src/app/App.tsx`: manage preflight probe lifecycle on the `pre` phase, maintain preflight samples, stop probe before recording, and pass computed preflight state to UI.
- Modify `src/app/App.test.tsx`: cover setup page live levels, start gating, probe lifecycle, and recording/source event separation.
- Modify `src/app/ui/PreRecordingScreen.tsx`: remove hard-coded levels, render preflight statuses/messages, and disable start based on preflight state.
- Modify `src/app/ui/meetMapStyles.css`: add/adjust status warning/stale/unavailable styles if current classes are insufficient.

## Task 1: Pure Preflight Decision Rules

**Files:**
- Create: `src/features/audio-analysis/audioPreflight.ts`
- Create: `src/features/audio-analysis/audioPreflight.test.ts`

- [ ] **Step 1: Write failing tests for detected sources allowing start**

Create tests that call `createAudioPreflightState` with both sources enabled and recent levels above threshold.

Expected assertions:

```ts
expect(state.canStart).toBe(true);
expect(state.summary).toBe("both-detected");
expect(state.tracks.system.status).toBe("detected");
expect(state.tracks.microphone.status).toBe("detected");
```

Run:

```powershell
pnpm.CMD vitest run src/features/audio-analysis/audioPreflight.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Write failing tests for start gating**

Cover:

- no sources selected -> `canStart: false`, summary `none-selected`
- selected sources with no samples -> `canStart: false`, status `detecting`
- selected sources with stale samples -> `canStart: false`, status `stale`
- one detected and one quiet -> `canStart: true`, quiet track status `quiet`
- unavailable probe -> selected track status `unavailable` and blocked when no other track is detected

- [ ] **Step 3: Implement types and constants**

Add:

```ts
export type AudioPreflightTrackStatus =
  | "detecting"
  | "detected"
  | "quiet"
  | "stale"
  | "off"
  | "unavailable";

export type AudioPreflightLevelSample = {
  level: number;
  occurredAt: string;
};

export type AudioPreflightInput = {
  enabledSources: { system: boolean; microphone: boolean };
  now: string;
  samples: {
    system?: AudioPreflightLevelSample[];
    microphone?: AudioPreflightLevelSample[];
  };
  unavailableTracks?: Partial<Record<"system" | "microphone", string>>;
};
```

Use constants:

```ts
const DETECTED_LEVEL_THRESHOLD = 0.02;
const FRESHNESS_WINDOW_MS = 2000;
const QUIET_WARNING_DELAY_MS = 5000;
const PEAK_WINDOW_MS = 5000;
```

- [ ] **Step 4: Implement `createAudioPreflightState`**

Rules:

- disabled track -> `off`, level `0`, peak `0`
- unavailable selected track -> `unavailable`
- enabled with no samples -> `detecting`
- latest sample older than freshness window -> `stale`
- recent level >= threshold -> `detected`
- recent level < threshold -> `quiet`
- `canStart` true only if at least one enabled track is `detected`
- `blockingReason` is direct and user-facing when blocked

- [ ] **Step 5: Re-run targeted tests**

Run:

```powershell
pnpm.CMD vitest run src/features/audio-analysis/audioPreflight.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/features/audio-analysis/audioPreflight.ts src/features/audio-analysis/audioPreflight.test.ts
git commit -m "feat: add audio preflight rules"
```

## Task 2: IPC Probe Lifecycle

**Files:**
- Modify: `src/app/meetMapApi.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/ipc/recordingIpc.ts`
- Modify: `electron/ipc/recordingIpc.test.ts`

- [ ] **Step 1: Write failing IPC test for probe start**

In `electron/ipc/recordingIpc.test.ts`, register IPC with a capturing provider and call:

```ts
await getHandler("recording:probe-start")(
  createIpcEvent() as never,
  {
    audioSources: { system: true, microphone: false },
    deviceIds: { system: "speaker-1" }
  } as never
);
```

Assert the provider received one start request with:

- `meetingId: "preflight"`
- `tracks.system.filePath` containing `.preflight`
- `tracks.microphone` undefined
- system `deviceId: "speaker-1"`

Run:

```powershell
pnpm.CMD vitest run electron/ipc/recordingIpc.test.ts
```

Expected: FAIL because `recording:probe-start` is not registered.

- [ ] **Step 2: Write failing IPC test for source-marked level forwarding**

Create a provider that captures its `onLevel` callback. Use an event stub:

```ts
const sent: unknown[] = [];
const event = { sender: { send: (_channel: string, update: unknown) => sent.push(update) } };
```

After probe start, invoke the level callback with `{ track: "microphone", level: 0.4, occurredAt: "..." }`.

Expected forwarded update includes:

```ts
{ track: "microphone", level: 0.4, source: "preflight" }
```

- [ ] **Step 3: Write failing IPC tests for mutual exclusion**

Cover:

- starting recording while probe is active rejects unless the renderer stopped the probe first
- starting probe while recording is active rejects with `Cannot start audio probe while recording is active`
- probe stop calls provider `stop`, unsubscribes levels, and allows later recording start

- [ ] **Step 4: Implement API types and preload**

In `src/app/meetMapApi.ts`:

```ts
export type RecordingAudioLevel = {
  track: AudioTrackId;
  level: number;
  occurredAt: string;
  source?: "preflight" | "recording";
};

startAudioProbe?(options?: RecordingStartOptions): Promise<void>;
stopAudioProbe?(): Promise<void>;
```

In `electron/preload.ts`:

```ts
startAudioProbe: (options?: RecordingStartOptions) =>
  ipcRenderer.invoke("recording:probe-start", options),
stopAudioProbe: () => ipcRenderer.invoke("recording:probe-stop"),
```

- [ ] **Step 5: Implement probe lifecycle in `recordingIpc.ts`**

Add `activeProbe` alongside `activeSession`.

Probe start:

- reject if `activeSession` exists
- no-op or restart cleanly if a probe already exists; prefer rejecting `Audio probe is already active` for simpler lifecycle
- normalize sources with existing `normalizeAudioSources`
- create provider
- subscribe to levels and forward `{ ...update, source: "preflight" }`
- create a temporary directory with `mkdtemp(join(tmpdir(), "meetmap-preflight-"))`
- start provider with `system.wav` and/or `microphone.wav` inside that temp directory
- keep the temp directory path on `activeProbe` for cleanup

Recording start:

- if `activeProbe` exists, throw `Stop audio probe before starting recording`
- keep existing behavior otherwise
- forward recording levels as `{ ...update, source: "recording" }`

Probe stop:

- if no active probe, return
- call provider stop
- unsubscribe level callback
- dispose if provider later exposes dispose; current boundary has no dispose
- clear `activeProbe`
- best-effort delete the temp directory with `rm(tempDirectory, { recursive: true, force: true })`

- [ ] **Step 6: Re-run targeted IPC tests**

Run:

```powershell
pnpm.CMD vitest run electron/ipc/recordingIpc.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/app/meetMapApi.ts electron/preload.ts electron/ipc/recordingIpc.ts electron/ipc/recordingIpc.test.ts
git commit -m "feat: add audio preflight ipc"
```

## Task 3: App Probe Lifecycle and Start Gating

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [ ] **Step 1: Write failing App test for entering setup starting probe**

Install an API with:

```ts
startAudioProbe: vi.fn(async () => undefined),
stopAudioProbe: vi.fn(async () => undefined)
```

Navigate to New recording.

Expected:

```ts
expect(api.startAudioProbe).toHaveBeenCalledWith({
  audioSources: { system: true, microphone: true },
  deviceIds: {}
});
```

Run:

```powershell
pnpm.CMD vitest run src/app/App.test.tsx
```

Expected: FAIL because App does not start probes.

- [ ] **Step 2: Write failing App test for source-separated level events**

Use `onAudioLevel` callback.

While on setup page, emit:

```ts
{ track: "system", level: 0.4, occurredAt: "...", source: "preflight" }
```

Expected setup status shows system detected. Emit a `source: "recording"` event while still on setup and assert it does not affect setup preflight state.

- [ ] **Step 3: Write failing App test for start gating**

Cases:

- no preflight samples -> Start disabled with waiting message
- one selected source detected -> Start enabled
- both selected sources quiet -> Start disabled
- selected microphone quiet while system detected -> Start enabled and microphone warning visible

Use fake timers or deterministic `occurredAt`/`Date.now` handling so stale logic is testable.

- [ ] **Step 4: Write failing App test for stopping probe before recording**

With a detected source, click Start recording.

Expected order:

```ts
expect(api.stopAudioProbe).toHaveBeenCalledBefore(api.createMeeting);
expect(api.createMeeting).toHaveBeenCalled();
expect(api.startRecording).toHaveBeenCalled();
```

If `toHaveBeenCalledBefore` is unavailable, use a `calls: string[]` array pushed by each mock.

- [ ] **Step 5: Implement preflight sample state**

In `App.tsx` add:

- `preflightLevels: Partial<Record<AudioTrackId, RecordingAudioLevel[]>>`
- `preflightUnavailableTracks`
- a small helper to append samples and prune older than 5 seconds
- source split:
  - `source === "preflight"` updates setup preflight samples
  - `source === "recording"` or missing source updates recording live levels

- [ ] **Step 6: Start/stop probe on phase/source/device changes**

Add effect:

- when `phase === "pre"` and `api.startAudioProbe` exists, call it with `draftAudioSources` and `selectedAudioDeviceIds`
- stop previous probe on cleanup
- reset preflight samples when source/device selection changes
- handle start failure by marking selected tracks unavailable and setting `error`

Keep dependency list stable enough to avoid tight loops.

- [ ] **Step 7: Stop probe before real recording**

In `startRecording`, before `api.createMeeting`, call `api.stopAudioProbe?.()` if available and clear preflight state. If stop fails, surface error and do not create meeting.

- [ ] **Step 8: Compute preflight state and pass to UI**

Use `createAudioPreflightState` with current time. To force UI refresh for stale transitions, add a lightweight interval while `phase === "pre"` that updates a `preflightNow` timestamp every 500ms.

Pass `audioPreflight={preflightState}` to `PreRecordingScreen`.

- [ ] **Step 9: Re-run App tests**

Run:

```powershell
pnpm.CMD vitest run src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: manage preflight audio probe"
```

## Task 4: Setup Page UI Wiring

**Files:**
- Modify: `src/app/ui/PreRecordingScreen.tsx`
- Modify: `src/app/ui/meetMapStyles.css`
- Modify: `src/app/App.test.tsx` if component assertions live there

- [ ] **Step 1: Write failing UI test for real preflight levels**

In `App.test.tsx`, emit a preflight level and assert:

- the relevant meter percentage updates, e.g. `40%`
- hard-coded `62%`/`34%` no longer appears before events

Run:

```powershell
pnpm.CMD vitest run src/app/App.test.tsx
```

Expected: FAIL until UI consumes `audioPreflight`.

- [ ] **Step 2: Write failing UI test for per-track warnings**

With system detected and microphone quiet, assert:

- Start enabled
- microphone card shows `No microphone input detected yet` or equivalent
- top status shows `System audio only`

- [ ] **Step 3: Update `PreRecordingScreen` props**

Add prop:

```ts
audioPreflight: AudioPreflightState;
```

Remove local `getSourceStatus(audioSources)` for preflight summary, or change it to consume `audioPreflight.summary`.

- [ ] **Step 4: Update `AudioSourceCard` props**

Replace `level` with `trackState: AudioPreflightTrackState`.

Render:

- status chip from `trackState.status`
- current level percent from `trackState.level`
- peak percent in text or subcopy
- `trackState.message`
- warning tone for `quiet`, `stale`, and `unavailable`
- `Off` when disabled

- [ ] **Step 5: Wire start disabled state**

Use:

```ts
const canStart = audioPreflight.canStart;
```

Show `audioPreflight.blockingReason` in the existing warning area when present.

- [ ] **Step 6: Update CSS**

Add restrained styles for:

- `.chip.warn`
- `.chip.danger`
- `.pre-audio-card.warning`
- `.pre-audio-card.unavailable`
- stale/quiet guidance text if needed

Avoid nested cards and keep existing page visual language.

- [ ] **Step 7: Re-run targeted UI tests**

Run:

```powershell
pnpm.CMD vitest run src/app/App.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/app/ui/PreRecordingScreen.tsx src/app/ui/meetMapStyles.css src/app/App.test.tsx
git commit -m "feat: show preflight audio status"
```

## Task 5: Browser QA

**Files:**
- No source edits expected unless QA reveals a bug.

- [ ] **Step 1: Start the app in demo mode**

Run:

```powershell
pnpm.CMD dev:demo
```

If a server/app window cannot be used in this environment, run `pnpm.CMD build` and document the limitation.

- [ ] **Step 2: Use Browser plugin when available**

Follow `browser:browser` and `build-web-apps:frontend-testing-debugging`.

Target flow:

```text
app loads -> New recording -> preflight meters render -> source toggle changes start gating -> Start recording transitions to recording
```

Checks:

- page identity
- not blank
- no framework overlay
- console health
- screenshot evidence
- interaction proof

- [ ] **Step 3: Validate desktop and one narrow viewport**

Confirm:

- text does not overlap
- status chips fit
- start button disabled/enabled states are visible
- cards remain readable

- [ ] **Step 4: Fix QA bugs via TDD**

If any behavior bug appears, write a failing unit/component test before production changes.

## Task 6: Full Verification

- [ ] **Step 1: Run full unit tests**

```powershell
pnpm.CMD test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```powershell
pnpm.CMD typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```powershell
pnpm.CMD lint
```

Expected: PASS.

- [ ] **Step 4: Run build**

```powershell
pnpm.CMD build
```

Expected: PASS.

- [ ] **Step 5: Run Windows package smoke if native/IPC files changed**

```powershell
pnpm.CMD package:win
```

Expected: PASS and `out/win-unpacked/resources/native/windows-audio/meetmap-windows-audio.exe` exists.

- [ ] **Step 6: Final commit if needed**

If prior tasks were not committed individually:

```powershell
git add src electron docs package.json tsconfig.electron.json
git commit -m "feat: add preflight audio checks"
```
