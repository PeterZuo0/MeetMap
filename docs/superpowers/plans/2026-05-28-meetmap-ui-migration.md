# MeetMap UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the provided MeetMap UI prototype into the Electron React app and connect the current MVP recording, processing, and export workflow.

**Architecture:** Convert the prototype from global Babel scripts into typed React modules under `src/app`. Keep workflow state in the renderer and call the existing preload API for meeting creation, recording, processing, and export opening. Keep sample library/detail content isolated from real current-session meeting metadata so it can be replaced by artifact-backed data later.

**Tech Stack:** Electron, React 19, TypeScript, Vite, Vitest, Testing Library, existing MeetMap IPC preload API.

---

## File Structure

- Modify `src/app/App.tsx`: app shell composition, workflow state machine, preload API calls, settings state.
- Modify `src/app/App.test.tsx`: primary renderer workflow tests against the migrated UI.
- Create `src/app/meetMapApi.ts`: shared renderer-side API and workflow types.
- Create `src/app/ui/copy.tsx`: bilingual label helper and option labels.
- Create `src/app/ui/icons.tsx`: typed icon component migrated from `icons.jsx`.
- Create `src/app/ui/theme.ts`: theme defaults, accent options, language settings.
- Create `src/app/ui/MeetMapShell.tsx`: Windows chrome, sidebar, topbar.
- Create `src/app/ui/LibraryScreen.tsx`: prototype library screen with current-session meeting entry support.
- Create `src/app/ui/PreRecordingScreen.tsx`: meeting title, output language, visual audio cards, start action.
- Create `src/app/ui/RecordingScreen.tsx`: recording state, timer, stop action, one-sided audio display.
- Create `src/app/ui/ProcessingScreen.tsx`: processing phases and pending/success/error display.
- Create `src/app/ui/DetailScreen.tsx`: meeting detail, placeholder transcript/summary/map, export actions.
- Create `src/app/ui/SettingsScreen.tsx`: Settings > General controls for theme, accent, UI language, and default output language.
- Create `src/app/ui/meetMapStyles.css`: migrated CSS from `MeetMap.html`, adjusted for the existing Vite app.
- Modify `src/main.tsx`: import migrated CSS.

## Task 1: Renderer Types and Settings Model

**Files:**
- Create: `src/app/meetMapApi.ts`
- Create: `src/app/ui/theme.ts`
- Create: `src/app/ui/copy.tsx`

- [ ] **Step 1: Write renderer model tests**

Add focused tests in `src/app/App.test.tsx` for default bilingual UI and output-language selection visibility.

Run: `pnpm vitest src/app/App.test.tsx`

Expected: FAIL because the migrated UI is not present yet.

- [ ] **Step 2: Add renderer API types**

Move the renderer `MeetMapApi` type out of `App.tsx` into `src/app/meetMapApi.ts`. Include `WorkflowPhase`, `UiLanguage`, `ThemeMode`, `AccentOption`, and app settings types.

- [ ] **Step 3: Add theme and copy helpers**

Implement theme defaults and a `label(lang, en, zh)` helper that returns bilingual copy by default.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest src/app/App.test.tsx`

Expected: tests still fail until screens are migrated, but TypeScript imports should compile.

## Task 2: Migrate Shell, Icons, and Styles

**Files:**
- Create: `src/app/ui/icons.tsx`
- Create: `src/app/ui/MeetMapShell.tsx`
- Create: `src/app/ui/meetMapStyles.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Convert icons**

Convert the prototype `Icon` component from `C:\Users\peter.z\Downloads\MeetMAp\icons.jsx` into a typed React component.

- [ ] **Step 2: Convert shell**

Convert `WinChrome`, `Sidebar`, and `Topbar` from `shell.jsx`. Remove state picker behavior. Sidebar navigation should expose `library`, `pre`, and `settings`.

- [ ] **Step 3: Migrate global styles**

Move CSS from `MeetMap.html` into `meetMapStyles.css`. Remove `.state-strip` and tweaks-panel-only styles unless reused inside Settings.

- [ ] **Step 4: Import styles**

Import `./app/ui/meetMapStyles.css` from `src/main.tsx`.

- [ ] **Step 5: Run renderer test**

Run: `pnpm vitest src/app/App.test.tsx`

Expected: still failing until `App.tsx` uses the shell.

## Task 3: Migrate Primary Screens

**Files:**
- Create: `src/app/ui/LibraryScreen.tsx`
- Create: `src/app/ui/PreRecordingScreen.tsx`
- Create: `src/app/ui/RecordingScreen.tsx`
- Create: `src/app/ui/ProcessingScreen.tsx`
- Create: `src/app/ui/DetailScreen.tsx`
- Create: `src/app/ui/SettingsScreen.tsx`

- [ ] **Step 1: Convert library screen**

Convert the prototype library into typed React. Keep sample meetings and add a current-session meeting entry when metadata exists.

- [ ] **Step 2: Convert pre-recording screen**

Convert the prototype setup UI. Wire title and output language to props. Keep audio cards visual-only for this phase.

- [ ] **Step 3: Convert recording screen**

Convert the recording screen. Stop button should call a prop. Timer can remain renderer-local.

- [ ] **Step 4: Convert processing screen**

Convert the processing screen. It should accept `activeStep`, `status`, and `error`.

- [ ] **Step 5: Convert detail screen**

Convert detail, summary, map, audio-player, and export dialog. Export buttons should call props for `word` and `html`.

- [ ] **Step 6: Convert settings screen**

Convert settings and add a General section for theme, accent, UI language, and default output language. Do not render the old floating `TweaksPanel`.

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS after component conversion.

## Task 4: Connect App Workflow to Existing IPC

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [ ] **Step 1: Replace minimal App**

Replace the current single-panel workflow with the migrated shell and screens.

- [ ] **Step 2: Wire start action**

On pre-recording start, validate title, call `createMeeting`, then call `startRecording`, store returned metadata, and navigate to recording.

- [ ] **Step 3: Wire stop action**

On recording stop, call `stopRecording`, store returned metadata, and navigate to processing.

- [ ] **Step 4: Wire processing action**

When processing screen receives a recorded meeting, call `processMeeting`. On success, store metadata and navigate to detail. On failure, show error state.

- [ ] **Step 5: Wire export action**

On detail export actions, call `openExport({ meetingId, kind })`.

- [ ] **Step 6: Wire settings**

Theme, accent, UI language, and default output language should update renderer state. Default UI language should be bilingual. Default output language should seed new pre-recording forms while still being editable per meeting.

- [ ] **Step 7: Update tests**

Mock `window.meetMap` in `src/app/App.test.tsx` and verify:

- library renders by default
- New recording opens setup
- Start recording calls `createMeeting` and `startRecording`
- Stop calls `stopRecording`
- processing calls `processMeeting`
- export calls `openExport`
- Settings > General changes UI language/theme defaults

Run: `pnpm vitest src/app/App.test.tsx`

Expected: PASS.

## Task 5: Verification and Commit

**Files:**
- Modify as needed from previous tasks.

- [ ] **Step 1: Run full tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 4: Run build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 5: Run demo app smoke**

Run: `pnpm dev:demo`

Expected: Electron opens the migrated UI. Manual smoke path: New recording -> Start -> Stop -> Processing -> Detail -> Open Word summary / Open HTML map.

- [ ] **Step 6: Commit**

```bash
git add src/app src/main.tsx docs/superpowers/plans/2026-05-28-meetmap-ui-migration.md
git commit -m "feat: migrate MVP workflow UI"
```

## Follow-up Plan

After this plan passes, create a separate plan for real cloud transcription and LLM integration. That plan should cover provider configuration, credential handling, production transcription client implementation, production meeting-structure extraction, and processing UI progress/error states.
