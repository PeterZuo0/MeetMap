# MeetMap MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Windows-first MeetMap MVP that records system and microphone audio, processes valid tracks after the meeting, and exports a Word summary plus an HTML meeting map.

**Architecture:** Use a cross-platform Electron + TypeScript app with a narrow platform audio adapter boundary. Keep recording, transcription, meeting intelligence, Word export, and HTML map generation as independently testable modules.

**Tech Stack:** Electron, TypeScript, React, Vitest, Windows WASAPI adapter, cloud transcription API, cloud LLM API, DOCX generation, D3.js or Cytoscape.js for standalone HTML maps.

---

## Scope Check

The product spec covers several subsystems. For implementation, treat this MVP as a sequence of independently testable vertical slices:

1. App scaffold and domain model.
2. Local meeting storage.
3. Windows dual-track recording proof of concept.
4. Post-meeting audio activity detection.
5. Cloud transcription and transcript merge.
6. Meeting structure extraction.
7. Word export.
8. HTML meeting map export.
9. End-to-end workflow UI.

Do not start with real-time transcription. Real-time behavior belongs in a later plan after the post-meeting flow is stable.

## Planned File Structure

```text
MeetMap/
├─ README.md
├─ AGENTS.md
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ electron/
│  ├─ main.ts
│  ├─ preload.ts
│  └─ ipc/
│     ├─ meetingIpc.ts
│     └─ recordingIpc.ts
├─ native/
│  └─ windows-audio/
│     ├─ README.md
│     └─ src/
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  └─ routes.tsx
│  ├─ features/
│  │  ├─ meetings/
│  │  │  ├─ meetingTypes.ts
│  │  │  ├─ meetingStore.ts
│  │  │  └─ meetingStore.test.ts
│  │  ├─ recording/
│  │  │  ├─ audioCaptureProvider.ts
│  │  │  ├─ recordingSession.ts
│  │  │  └─ recordingSession.test.ts
│  │  ├─ audio-analysis/
│  │  │  ├─ voiceActivity.ts
│  │  │  └─ voiceActivity.test.ts
│  │  ├─ transcription/
│  │  │  ├─ transcriptionTypes.ts
│  │  │  ├─ transcriptMerge.ts
│  │  │  ├─ transcriptMerge.test.ts
│  │  │  └─ transcriptionClient.ts
│  │  ├─ intelligence/
│  │  │  ├─ meetingStructure.ts
│  │  │  ├─ meetingStructureSchema.ts
│  │  │  └─ meetingStructureSchema.test.ts
│  │  ├─ exports/
│  │  │  ├─ word/
│  │  │  │  ├─ wordExport.ts
│  │  │  │  └─ wordExport.test.ts
│  │  │  └─ html-map/
│  │  │     ├─ graphModel.ts
│  │  │     ├─ graphModel.test.ts
│  │  │     ├─ htmlMapExport.ts
│  │  │     └─ template.html
│  │  └─ settings/
│  │     └─ languageOptions.ts
│  └─ shared/
│     ├─ ids.ts
│     ├─ result.ts
│     └─ time.ts
└─ docs/
   └─ superpowers/
      ├─ specs/
      └─ plans/
```

## Task 1: Scaffold the Electron TypeScript App

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/app/App.tsx`
- Create: `src/app/routes.tsx`
- Create: `.gitignore`

- [ ] **Step 1: Create the package manifest**

Add scripts for `dev`, `build`, `test`, `typecheck`, and `lint`.

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`

Expected: lockfile is created and dependencies install successfully.

- [ ] **Step 3: Add minimal Electron and React entry points**

The app should open a desktop window and render a placeholder MeetMap screen.

- [ ] **Step 4: Add generated artifact ignore rules**

Ignore `node_modules/`, `dist/`, `out/`, `.env`, `meetings/`, raw audio files, logs, and generated exports.

- [ ] **Step 5: Verify scaffold**

Run: `pnpm test`

Expected: test runner starts and reports no tests or passing placeholder tests.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts vitest.config.ts electron src .gitignore
git commit -m "chore: scaffold MeetMap desktop app"
```

## Task 2: Define Core Meeting Types

**Files:**
- Create: `src/features/meetings/meetingTypes.ts`
- Create: `src/features/settings/languageOptions.ts`
- Create: `src/features/settings/languageOptions.test.ts`

- [ ] **Step 1: Write failing tests for language options**

Cover `zh`, `en`, `bilingual`, and `auto`.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/settings/languageOptions.test.ts`

Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement language option types and labels**

Expose stable enum-like values and display labels.

- [ ] **Step 4: Add meeting domain types**

Include meeting id, title, status, output language, timestamps, audio track metadata, transcript path, structure path, and export paths.

- [ ] **Step 5: Re-run tests**

Run: `pnpm vitest src/features/settings/languageOptions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/meetings src/features/settings
git commit -m "feat: define meeting domain types"
```

## Task 3: Implement Local Meeting Storage

**Files:**
- Create: `src/features/meetings/meetingStore.ts`
- Create: `src/features/meetings/meetingStore.test.ts`
- Modify: `src/features/meetings/meetingTypes.ts`

- [ ] **Step 1: Write failing tests for meeting folder creation**

Test that a meeting creates this layout:

```text
metadata.json
audio/
audio/chunks/
exports/
logs/
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/meetings/meetingStore.test.ts`

Expected: FAIL because storage is not implemented.

- [ ] **Step 3: Implement `createMeetingStore`**

Accept a base directory and expose `createMeeting`, `readMetadata`, `writeMetadata`, and `getMeetingPaths`.

- [ ] **Step 4: Add JSON persistence for metadata**

Use structured JSON APIs. Do not assemble JSON by string concatenation.

- [ ] **Step 5: Re-run tests**

Run: `pnpm vitest src/features/meetings/meetingStore.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/meetings
git commit -m "feat: add local meeting storage"
```

## Task 4: Define the Audio Capture Adapter Boundary

**Files:**
- Create: `src/features/recording/audioCaptureProvider.ts`
- Create: `src/features/recording/recordingSession.ts`
- Create: `src/features/recording/recordingSession.test.ts`

- [ ] **Step 1: Write failing tests for recording session state**

Cover transitions: idle -> recording -> stopped -> processing-ready.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/recording/recordingSession.test.ts`

Expected: FAIL because recording modules do not exist.

- [ ] **Step 3: Define `AudioCaptureProvider`**

Methods should include `listDevices`, `start`, `stop`, and event callbacks for level updates and errors.

- [ ] **Step 4: Implement provider-agnostic `RecordingSession`**

The session manager should not import Windows-specific code.

- [ ] **Step 5: Re-run tests**

Run: `pnpm vitest src/features/recording/recordingSession.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/recording
git commit -m "feat: define recording adapter boundary"
```

## Task 5: Build the Windows Audio Capture Proof of Concept

**Files:**
- Create: `native/windows-audio/README.md`
- Create: `native/windows-audio/src/`
- Modify: `src/features/recording/audioCaptureProvider.ts` if adapter types need adjustment

- [ ] **Step 1: Document native adapter requirements**

Specify that Windows must capture WASAPI loopback and selected microphone input as separate WAV files.

- [ ] **Step 2: Implement a minimal Windows capture executable or native module**

It must accept output paths for `system.wav` and `microphone.wav`.

- [ ] **Step 3: Add a manual smoke command**

Document a command that records 10 seconds from system and microphone sources.

- [ ] **Step 4: Verify generated files**

Expected: both WAV files are created when sources are available.

- [ ] **Step 5: Commit**

```bash
git add native/windows-audio src/features/recording
git commit -m "feat: add Windows audio capture proof of concept"
```

## Task 6: Add Voice Activity Decisions

**Files:**
- Create: `src/features/audio-analysis/voiceActivity.ts`
- Create: `src/features/audio-analysis/voiceActivity.test.ts`

- [ ] **Step 1: Write failing tests for four audio cases**

Cover both-active, system-only, microphone-only, and neither-active.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/audio-analysis/voiceActivity.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement decision logic**

Return the list of tracks to process and the user-facing outcome.

- [ ] **Step 4: Re-run tests**

Run: `pnpm vitest src/features/audio-analysis/voiceActivity.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/audio-analysis
git commit -m "feat: add voice activity decisions"
```

## Task 7: Implement Transcript Types and Merge

**Files:**
- Create: `src/features/transcription/transcriptionTypes.ts`
- Create: `src/features/transcription/transcriptMerge.ts`
- Create: `src/features/transcription/transcriptMerge.test.ts`

- [ ] **Step 1: Write failing tests for timestamp ordering**

Use mixed system and microphone transcript segments.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/transcription/transcriptMerge.test.ts`

Expected: FAIL because merge module does not exist.

- [ ] **Step 3: Implement transcript segment types**

Include segment id, track id, start time, end time, text, language, and confidence.

- [ ] **Step 4: Implement stable merge by start time**

When timestamps match, preserve deterministic track ordering.

- [ ] **Step 5: Re-run tests**

Run: `pnpm vitest src/features/transcription/transcriptMerge.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/transcription
git commit -m "feat: merge transcript segments"
```

## Task 8: Add Cloud Transcription Client Interface

**Files:**
- Create: `src/features/transcription/transcriptionClient.ts`
- Create: `src/features/transcription/transcriptionClient.test.ts`

- [ ] **Step 1: Write tests with a fake provider**

Verify chunk requests map to transcript segment responses.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/transcription/transcriptionClient.test.ts`

Expected: FAIL because client does not exist.

- [ ] **Step 3: Implement provider-neutral interface**

Do not bind the rest of the app to a specific API vendor.

- [ ] **Step 4: Add retryable error shape**

Represent upload, rate-limit, provider, and invalid-audio failures.

- [ ] **Step 5: Re-run tests**

Run: `pnpm vitest src/features/transcription/transcriptionClient.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/transcription
git commit -m "feat: add transcription client boundary"
```

## Task 9: Define Meeting Structure Schema

**Files:**
- Create: `src/features/intelligence/meetingStructure.ts`
- Create: `src/features/intelligence/meetingStructureSchema.ts`
- Create: `src/features/intelligence/meetingStructureSchema.test.ts`

- [ ] **Step 1: Write failing schema validation tests**

Validate topics, decisions, action items, open questions, risks, and relations.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/intelligence/meetingStructureSchema.test.ts`

Expected: FAIL because schema module does not exist.

- [ ] **Step 3: Implement structure types and schema**

Use a runtime schema library or explicit validation helpers.

- [ ] **Step 4: Re-run tests**

Run: `pnpm vitest src/features/intelligence/meetingStructureSchema.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/intelligence
git commit -m "feat: define meeting structure schema"
```

## Task 10: Generate Word Summary from Structure JSON

**Files:**
- Create: `src/features/exports/word/wordExport.ts`
- Create: `src/features/exports/word/wordExport.test.ts`

- [ ] **Step 1: Write failing tests for document section mapping**

Verify meeting overview, summary, key topics, decisions, action items, open questions, and risks.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/exports/word/wordExport.test.ts`

Expected: FAIL because exporter does not exist.

- [ ] **Step 3: Implement Word export mapping**

Read from meeting structure JSON. Do not generate from raw transcript directly.

- [ ] **Step 4: Create a sample DOCX manually**

Run the exporter against a fixture and open the result for visual inspection.

- [ ] **Step 5: Re-run tests**

Run: `pnpm vitest src/features/exports/word/wordExport.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/exports/word
git commit -m "feat: export Word meeting summaries"
```

## Task 11: Generate HTML Meeting Map

**Files:**
- Create: `src/features/exports/html-map/graphModel.ts`
- Create: `src/features/exports/html-map/graphModel.test.ts`
- Create: `src/features/exports/html-map/htmlMapExport.ts`
- Create: `src/features/exports/html-map/template.html`

- [ ] **Step 1: Write failing tests for graph model generation**

Verify meeting, topic, decision, action, question, and risk nodes plus relation edges.

- [ ] **Step 2: Run the test and confirm failure**

Run: `pnpm vitest src/features/exports/html-map/graphModel.test.ts`

Expected: FAIL because graph module does not exist.

- [ ] **Step 3: Implement graph model generation**

Convert meeting structure JSON into nodes and edges.

- [ ] **Step 4: Implement standalone HTML export**

Embed graph JSON in the HTML file and render a mind-map-first layout with supplemental relation lines.

- [ ] **Step 5: Manually open generated HTML**

Expected: nodes render, relation lines are visible, and clicking a node shows details.

- [ ] **Step 6: Re-run tests**

Run: `pnpm vitest src/features/exports/html-map/graphModel.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/exports/html-map
git commit -m "feat: export HTML meeting maps"
```

## Task 12: Wire End-to-End Post-Meeting Workflow

**Files:**
- Create: `electron/ipc/meetingIpc.ts`
- Create: `electron/ipc/recordingIpc.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/app/App.tsx`
- Modify: feature modules from earlier tasks as needed

- [ ] **Step 1: Add IPC contracts**

Expose create meeting, start recording, stop recording, process meeting, and open exports.

- [ ] **Step 2: Add UI workflow screens**

Include meeting setup, recording status, processing progress, and results.

- [ ] **Step 3: Wire processing sequence**

Stop recording -> activity detection -> transcription -> merge -> structure extraction -> Word export -> HTML map export.

- [ ] **Step 4: Add recoverable status persistence**

Store current processing step in meeting metadata.

- [ ] **Step 5: Run unit tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 6: Run manual MVP smoke test on Windows**

Expected: a short meeting produces `meeting-summary.docx` and `meeting-map.html`.

- [ ] **Step 7: Commit**

```bash
git add electron src
git commit -m "feat: wire post-meeting workflow"
```

## Task 13: Package and Document the MVP

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` if implementation guidance changed
- Create or modify: packaging config files selected by the scaffold

- [ ] **Step 1: Add setup instructions to README**

Document install, dev, test, build, and Windows smoke-test commands.

- [ ] **Step 2: Add privacy note**

Explain that Phase 1 uses cloud APIs for transcription and summarization.

- [ ] **Step 3: Configure Windows packaging**

Use the packaging tool selected in Task 1.

- [ ] **Step 4: Build the app**

Run: `pnpm build`

Expected: PASS and desktop build artifacts are created.

- [ ] **Step 5: Run final tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md AGENTS.md package.json
git commit -m "docs: add MVP setup and packaging notes"
```

## Execution Handoff

Implement tasks in order. Each task should end with a focused commit. If a task reveals that the stack choice or native Windows capture approach needs to change, update this plan and the design spec before continuing.

