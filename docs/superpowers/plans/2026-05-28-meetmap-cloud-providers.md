# MeetMap Cloud Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production cloud transcription and LLM-backed meeting structure extraction behind provider-neutral interfaces.

**Architecture:** Keep `processMeeting` provider-neutral by constructing production `PostMeetingWorkflowServices` in Electron main configuration. Implement OpenAI as the first adapter through small client wrappers with fake-client unit tests, while preserving demo mode and local artifact persistence.

**Tech Stack:** Electron main process, TypeScript, Vitest, OpenAI REST/SDK adapter, existing transcription and meeting-structure schemas.

---

## File Structure

- Create `src/features/config/providerConfig.ts`: parse provider env vars and expose production config.
- Create `src/features/config/providerConfig.test.ts`: config parsing tests.
- Create `src/features/intelligence/meetingStructureClient.ts`: provider-neutral LLM structure client interface.
- Create `src/features/intelligence/meetingStructureClient.test.ts`: fake-client and validation tests.
- Create `src/features/transcription/openAiTranscriptionClient.ts`: OpenAI transcription adapter.
- Create `src/features/transcription/openAiTranscriptionClient.test.ts`: fake OpenAI client tests.
- Create `src/features/intelligence/openAiMeetingStructureClient.ts`: OpenAI Responses/Structured Outputs adapter.
- Create `src/features/intelligence/openAiMeetingStructureClient.test.ts`: fake OpenAI response tests.
- Create `src/features/workflow/productionWorkflowServices.ts`: build `PostMeetingWorkflowServices` from configured clients.
- Create `src/features/workflow/productionWorkflowServices.test.ts`: service wiring tests.
- Modify `electron/mainConfig.ts`: resolve demo vs production providers.
- Modify `electron/mainConfig.test.ts`: config mode tests.
- Modify `package.json`: add OpenAI SDK only if the adapter uses the SDK instead of native `fetch`.

## Task 1: Provider Configuration

**Files:**
- Create: `src/features/config/providerConfig.ts`
- Create: `src/features/config/providerConfig.test.ts`

- [ ] **Step 1: Write failing config tests**

Cover:

- demo mode does not require credentials
- production OpenAI mode requires `OPENAI_API_KEY`
- default transcription model is `gpt-4o-mini-transcribe`
- missing provider values return clear errors

Run: `pnpm vitest src/features/config/providerConfig.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 2: Implement config parser**

Implement pure parsing from `NodeJS.ProcessEnv` into typed config. Do not read `process.env` inside feature code.

- [ ] **Step 3: Re-run tests**

Run: `pnpm vitest src/features/config/providerConfig.test.ts`

Expected: PASS.

## Task 2: Meeting Structure Client Boundary

**Files:**
- Create: `src/features/intelligence/meetingStructureClient.ts`
- Create: `src/features/intelligence/meetingStructureClient.test.ts`

- [ ] **Step 1: Write failing interface/helper tests**

Cover request shape with transcript segments and metadata, plus validation failure behavior.

- [ ] **Step 2: Implement provider-neutral types**

Add `MeetingStructureClient`, `MeetingStructureRequest`, and a helper that validates returned structures.

- [ ] **Step 3: Re-run tests**

Run: `pnpm vitest src/features/intelligence/meetingStructureClient.test.ts`

Expected: PASS.

## Task 3: OpenAI Transcription Adapter

**Files:**
- Create: `src/features/transcription/openAiTranscriptionClient.ts`
- Create: `src/features/transcription/openAiTranscriptionClient.test.ts`

- [ ] **Step 1: Write fake-client tests**

Test that a `TranscriptionChunkRequest` maps to an OpenAI transcription request with file path, model, and requested response fields.

- [ ] **Step 2: Write error mapping tests**

Cover rate limit, upload failure, provider failure, and invalid audio.

- [ ] **Step 3: Implement adapter**

Use dependency injection for the OpenAI client or request function so tests do not call the network.

- [ ] **Step 4: Re-run tests**

Run: `pnpm vitest src/features/transcription/openAiTranscriptionClient.test.ts`

Expected: PASS.

## Task 4: OpenAI Meeting Structure Adapter

**Files:**
- Create: `src/features/intelligence/openAiMeetingStructureClient.ts`
- Create: `src/features/intelligence/openAiMeetingStructureClient.test.ts`

- [ ] **Step 1: Write fake-response tests**

Cover transcript segment input mapping, selected output language, source refs, and schema-valid parsed output.

- [ ] **Step 2: Write refusal/invalid-output tests**

The adapter should fail clearly and not return unvalidated structure.

- [ ] **Step 3: Implement adapter**

Use Responses API Structured Outputs semantics behind an injected client/request function.

- [ ] **Step 4: Re-run tests**

Run: `pnpm vitest src/features/intelligence/openAiMeetingStructureClient.test.ts`

Expected: PASS.

## Task 5: Production Workflow Services

**Files:**
- Create: `src/features/workflow/productionWorkflowServices.ts`
- Create: `src/features/workflow/productionWorkflowServices.test.ts`

- [ ] **Step 1: Write wiring tests**

Verify active tracks become transcription chunk requests, transcription results are returned, and structure extraction delegates to the configured structure client.

- [ ] **Step 2: Implement service builder**

Build `PostMeetingWorkflowServices` from activity decision logic, transcription client, and structure client.

- [ ] **Step 3: Re-run tests**

Run: `pnpm vitest src/features/workflow/productionWorkflowServices.test.ts`

Expected: PASS.

## Task 6: Electron Main Wiring

**Files:**
- Modify: `electron/mainConfig.ts`
- Modify: `electron/mainConfig.test.ts`

- [ ] **Step 1: Write failing main config tests**

Cover:

- demo mode still uses demo providers
- production with missing OpenAI key creates no upload-capable services and returns clear config error
- production with valid env wires production workflow services

- [ ] **Step 2: Wire config resolution**

Keep credentials in the main process. Renderer should remain unaware of provider secrets.

- [ ] **Step 3: Re-run tests**

Run: `pnpm vitest electron/mainConfig.test.ts`

Expected: PASS.

## Task 7: Verification

- [ ] **Step 1: Run targeted tests**

Run all new provider tests.

- [ ] **Step 2: Run full tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 5: Run build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 6: Manual guarded production smoke**

Only run with explicit non-sensitive test audio and configured credentials. Confirm `transcript.json`, `structure.json`, `meeting-summary.docx`, and `meeting-map.html` are written.

- [ ] **Step 7: Commit**

```bash
git add src/features electron package.json pnpm-lock.yaml
git commit -m "feat: add cloud meeting processing providers"
```
