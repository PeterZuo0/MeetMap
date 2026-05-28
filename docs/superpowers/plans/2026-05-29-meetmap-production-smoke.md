# MeetMap Production Post-Meeting Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded production smoke command that proves real WAV inputs can flow through cloud transcription, meeting structure extraction, and Word/HTML export generation.

**Architecture:** Keep the normal app workflow unchanged and build a small CLI smoke runner around the existing `MeetingStore`, provider config, OpenAI clients, production workflow services, and `processMeeting`. Add a lightweight WAV probe before upload so invalid input is rejected locally.

**Tech Stack:** TypeScript, Node.js ESM, Vitest, Electron main build output, existing OpenAI REST requesters, existing workflow/export modules.

---

## File Structure

- Create `src/features/audio-analysis/wavFile.ts`: read and validate minimal RIFF/WAVE metadata.
- Create `src/features/audio-analysis/wavFile.test.ts`: header parsing and invalid-file tests.
- Create `src/features/workflow/productionSmokeRunner.ts`: pure smoke-runner orchestration with injectable services for tests.
- Create `src/features/workflow/productionSmokeRunner.test.ts`: temp-directory smoke tests using fake workflow services.
- Create `scripts/productionSmoke.ts`: CLI wrapper that loads `.env`, parses args, wires real providers, and calls the runner.
- Create `scripts/productionSmoke.test.ts`: CLI argument parsing and consent-gate tests if parser is exported from the script module; otherwise keep parser in `productionSmokeRunner.ts`.
- Modify `tsconfig.electron.json`: include `scripts` so the smoke CLI compiles to `dist-electron/scripts`.
- Modify `package.json`: add `smoke:production`.
- Modify `README.md`: document the guarded production smoke command, inputs, expected artifacts, and privacy warning.

## Task 1: WAV File Probe

**Files:**
- Create: `src/features/audio-analysis/wavFile.ts`
- Create: `src/features/audio-analysis/wavFile.test.ts`

- [ ] **Step 1: Write failing tests for valid WAV metadata**

Create a tiny in-memory WAV fixture in the test and write it to a temp file.

Expected assertion:

```ts
await expect(readWavFileInfo(path)).resolves.toEqual({
  byteLength: expect.any(Number),
  channelCount: 1,
  durationMs: 1000,
  format: "wav",
  sampleRateHz: 16000
});
```

Run:

```powershell
pnpm.CMD vitest run src/features/audio-analysis/wavFile.test.ts
```

Expected: FAIL because `wavFile.ts` does not exist.

- [ ] **Step 2: Write failing tests for invalid input**

Cover:

- missing file bubbles the filesystem error
- non-RIFF file throws `Input audio is not a RIFF/WAVE file`
- WAV with no `data` chunk throws `Input WAV has no audio data`

- [ ] **Step 3: Implement minimal WAV parser**

Implementation rules:

- use `readFile`
- use `Buffer`
- parse RIFF chunk id, WAVE format id, `fmt ` chunk, and `data` chunk
- compute duration from `dataSize / byteRate * 1000`
- do not decode audio samples

- [ ] **Step 4: Re-run targeted tests**

Run:

```powershell
pnpm.CMD vitest run src/features/audio-analysis/wavFile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/features/audio-analysis/wavFile.ts src/features/audio-analysis/wavFile.test.ts
git commit -m "feat: add wav input validation"
```

## Task 2: Production Smoke Runner Core

**Files:**
- Create: `src/features/workflow/productionSmokeRunner.ts`
- Create: `src/features/workflow/productionSmokeRunner.test.ts`

- [ ] **Step 1: Write failing consent-gate test**

Test API shape:

```ts
await expect(
  runProductionSmoke({
    allowCloudUpload: false,
    dataDir,
    meetingId: "manual-smoke",
    outputLanguage: "en",
    title: "Manual smoke"
  }, dependencies)
).rejects.toThrow("Production smoke requires --allow-cloud-upload.");
```

Run:

```powershell
pnpm.CMD vitest run src/features/workflow/productionSmokeRunner.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 2: Write failing no-audio test**

Expected:

```ts
await expect(runProductionSmoke(inputWithoutAudio, dependencies))
  .rejects.toThrow("No audio source was provided.");
```

- [ ] **Step 3: Write failing artifact persistence test**

Use temp WAV fixtures and fake `PostMeetingWorkflowServices`.

Expected after success:

- copied `audio/system.wav` exists when `systemAudioPath` is provided
- copied `audio/microphone.wav` exists when `microphoneAudioPath` is provided
- `metadata.status` is `completed`
- `transcript.json`, `structure.json`, Word export, and HTML map exist
- returned report includes absolute artifact paths

- [ ] **Step 4: Implement runner types**

Add:

```ts
export type ProductionSmokeInput = {
  allowCloudUpload: boolean;
  dataDir: string;
  meetingId: string;
  microphoneAudioPath?: string;
  outputLanguage: "zh" | "en" | "bilingual" | "auto";
  summaryStyle?: "decisions_actions" | "topic_outline" | "qa" | "highlights";
  systemAudioPath?: string;
  title: string;
};

export type ProductionSmokeReport = {
  meetingId: string;
  meetingDir: string;
  transcriptPath: string;
  structurePath: string;
  wordExportPath: string;
  htmlMapExportPath: string;
};
```

- [ ] **Step 5: Implement runner orchestration**

Use:

- `createMeetingStore(dataDir)`
- `readWavFileInfo`
- `copyFile`
- `processMeeting`

Inject workflow services in tests:

```ts
type ProductionSmokeDependencies = {
  workflowServices: PostMeetingWorkflowServices;
};
```

- [ ] **Step 6: Re-run targeted tests**

Run:

```powershell
pnpm.CMD vitest run src/features/workflow/productionSmokeRunner.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/features/workflow/productionSmokeRunner.ts src/features/workflow/productionSmokeRunner.test.ts
git commit -m "feat: add production smoke runner"
```

## Task 3: CLI Wrapper

**Files:**
- Create: `scripts/productionSmoke.ts`
- Modify: `tsconfig.electron.json`
- Modify: `package.json`

- [ ] **Step 1: Write failing CLI parser tests**

Prefer keeping parser functions in `src/features/workflow/productionSmokeRunner.ts` for easy unit testing.

Cover:

- `--allow-cloud-upload` maps to `allowCloudUpload: true`
- missing `--allow-cloud-upload` remains false
- `--system-audio` and `--microphone-audio` map to paths
- unsupported `--output-language` throws a clear error

Run:

```powershell
pnpm.CMD vitest run src/features/workflow/productionSmokeRunner.test.ts
```

Expected: FAIL until parser exists.

- [ ] **Step 2: Implement parser**

Support:

```text
--meeting-id
--title
--data-dir
--system-audio
--microphone-audio
--output-language
--summary-style
--allow-cloud-upload
```

- [ ] **Step 3: Implement CLI wrapper**

The CLI should:

1. load `.env` from `process.cwd()`
2. parse provider config with `parseProviderConfig`
3. build OpenAI requesters, transcription client, structure client, and production workflow services
4. call `runProductionSmoke`
5. print a concise report

Do not print API keys.

- [ ] **Step 4: Compile scripts**

Modify `tsconfig.electron.json`:

```json
"include": ["electron", "src/features", "scripts"]
```

Modify `package.json`:

```json
"smoke:production": "pnpm build && node dist-electron/scripts/productionSmoke.js"
```

- [ ] **Step 5: Re-run tests and build**

Run:

```powershell
pnpm.CMD vitest run src/features/workflow/productionSmokeRunner.test.ts
pnpm.CMD build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scripts/productionSmoke.ts tsconfig.electron.json package.json src/features/workflow/productionSmokeRunner.test.ts src/features/workflow/productionSmokeRunner.ts
git commit -m "feat: add production smoke cli"
```

## Task 4: README Smoke Instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add guarded production smoke section**

Add a section after the Windows audio POC smoke test:

```markdown
## Production Post-Meeting Smoke Test

Use only non-sensitive test audio. This command uploads provided audio to the configured cloud provider.

pnpm smoke:production -- ...
```

- [ ] **Step 2: Document expected artifacts**

List:

- `meetings/manual-smoke/metadata.json`
- `meetings/manual-smoke/transcript.json`
- `meetings/manual-smoke/structure.json`
- `meetings/manual-smoke/exports/meeting-summary.docx`
- `meetings/manual-smoke/exports/meeting-map.html`

- [ ] **Step 3: Document failure behavior**

Explain:

- transcript remains if structure extraction fails
- structure remains if export fails
- `.env` and `meetings/` must not be committed

- [ ] **Step 4: Commit**

```powershell
git add README.md
git commit -m "docs: add production smoke instructions"
```

## Task 5: Guarded Manual Smoke

**Files:**
- No source edits expected unless the smoke reveals a bug.

- [ ] **Step 1: Build native capture helper or use existing WAV files**

Option A, capture new non-sensitive test audio:

```powershell
dotnet run --project native/windows-audio/src/MeetMap.WindowsAudio.csproj -- `
  --system-output "$PWD/meetings/manual-smoke-input/system.wav" `
  --microphone-output "$PWD/meetings/manual-smoke-input/microphone.wav" `
  --duration-seconds 10
```

Option B, use known non-sensitive WAV files.

- [ ] **Step 2: Run guarded production smoke**

```powershell
pnpm.CMD smoke:production -- `
  --meeting-id manual-smoke `
  --title "Manual smoke test" `
  --data-dir "$PWD/meetings" `
  --system-audio "$PWD/meetings/manual-smoke-input/system.wav" `
  --microphone-audio "$PWD/meetings/manual-smoke-input/microphone.wav" `
  --output-language bilingual `
  --allow-cloud-upload
```

Expected:

- command prints artifact paths
- `metadata.json` status is `completed`
- `transcript.json` has at least one segment
- `structure.json` validates
- Word and HTML export files exist

- [ ] **Step 3: If smoke fails, preserve artifacts and fix via TDD**

If a bug appears, write a failing automated test before changing production code.

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

- [ ] **Step 5: Run Windows package smoke**

```powershell
pnpm.CMD package:win
```

Expected: PASS and `out/win-unpacked/resources/native/windows-audio/meetmap-windows-audio.exe` exists.

- [ ] **Step 6: Final commit**

If prior tasks were not committed individually:

```powershell
git add scripts src README.md package.json tsconfig.electron.json
git commit -m "feat: add guarded production smoke path"
```
