# MeetMap Cloud Transcription and LLM Design

Date: 2026-05-28
Status: Draft v1

## Goal

Replace the demo post-meeting processing services with real cloud transcription and LLM-backed meeting structure extraction while preserving MeetMap's provider-neutral business logic.

The first production adapter can target OpenAI because its current API supports audio transcription models such as `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, and `whisper-1`, and its Responses API supports Structured Outputs for JSON-schema-constrained model responses.

Sources checked:

- OpenAI Audio guide: `https://platform.openai.com/docs/guides/audio`
- OpenAI Audio transcription API reference: `https://platform.openai.com/docs/api-reference/audio/createTranscription`
- OpenAI Responses API reference: `https://platform.openai.com/docs/api-reference/responses/create`
- OpenAI Structured Outputs guide: `https://platform.openai.com/docs/guides/structured-outputs`

## Design Principles

- Keep transcription and LLM providers behind interfaces.
- Do not hard-code OpenAI into the post-meeting workflow.
- Do not upload audio unless the user has explicitly started a meeting and processing has begun.
- Preserve original transcript language.
- Generate meeting structure and final summary in the user-selected output language.
- Persist intermediate artifacts so failed steps can be retried.
- Validate model output against the existing meeting structure schema before writing `structure.json`.

## Configuration

Add production provider configuration in the Electron main process only:

- `MEETMAP_TRANSCRIPTION_PROVIDER`
- `MEETMAP_LLM_PROVIDER`
- `OPENAI_API_KEY`
- `OPENAI_TRANSCRIPTION_MODEL`
- `OPENAI_STRUCTURE_MODEL`

Initial defaults:

- `MEETMAP_TRANSCRIPTION_PROVIDER=openai`
- `MEETMAP_LLM_PROVIDER=openai`
- `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe`
- `OPENAI_STRUCTURE_MODEL` should default to the repo's selected current text model after implementation verifies available model support.

Renderer code must not read or expose provider API keys.

## Transcription Adapter

Create an OpenAI transcription adapter that implements the existing `TranscriptionClient` boundary:

```ts
export type TranscriptionClient = {
  transcribeChunk(request: TranscriptionChunkRequest): Promise<TranscriptSegment[]>;
};
```

The adapter should:

- Read WAV chunks or whole valid track files from local disk.
- Send audio to the configured transcription model.
- Request segment/timestamp details when supported by the model/API response format.
- Map provider output into `TranscriptSegment`.
- Preserve the provider-reported language when available.
- Mark retryable errors for upload, rate-limit, and transient provider failures.
- Mark invalid audio failures as non-retryable unless the local chunking step can recover.

The first implementation can process each valid full track as one chunk if chunking is not yet implemented. It should still use `TranscriptionChunkRequest` so later chunking does not change workflow code.

## LLM Structure Adapter

Add a provider-neutral meeting intelligence client:

```ts
export type MeetingStructureClient = {
  extractStructure(input: MeetingStructureRequest): Promise<MeetingStructure>;
};
```

The OpenAI implementation should:

- Use the Responses API.
- Use Structured Outputs with a JSON schema equivalent to `MeetingStructure`.
- Include transcript segments with ids and timestamps so source refs can point back to transcript evidence.
- Instruct the model to preserve transcript source language in transcript-derived fields where appropriate.
- Generate summary, topics, decisions, action items, open questions, risks, and relations in the selected output language.
- Return only validated structured JSON to the workflow.

If the model refuses or returns schema-invalid output, the adapter should fail the processing step and preserve transcript artifacts for retry.

## Workflow Wiring

Add production workflow service resolution in `electron/mainConfig.ts`:

- Demo mode continues to use `createDemoWorkflowServices`.
- Production mode builds services from configured providers.
- Missing provider credentials should produce a clear error before upload.

The production `PostMeetingWorkflowServices` should:

1. Run existing voice activity decision logic.
2. Build transcription chunk requests from active audio track metadata.
3. Call the configured `TranscriptionClient`.
4. Merge transcript segments using existing merge logic.
5. Call the configured `MeetingStructureClient`.
6. Validate the returned structure with `validateMeetingStructure`.

## Tests

Add tests for:

- OpenAI transcription request mapping using a fake OpenAI client.
- Provider error mapping to retryable and non-retryable `TranscriptionError`.
- Transcript-to-structure prompt/input mapping.
- Structured output validation before writing `structure.json`.
- Production config resolution:
  - missing API key fails clearly
  - demo mode does not require cloud credentials
  - production mode wires configured services

Network calls must be mocked in unit tests.

## Out of Scope

- Real-time transcription.
- Streaming progress events to renderer.
- Speaker diarization.
- Multi-provider UI settings.
- Persistent encrypted credential storage.
- Automatic audio chunking for large files if whole-track uploads stay within provider limits.

## Implementation Order

1. Add provider config types and tests.
2. Add `MeetingStructureClient` interface and tests.
3. Add OpenAI transcription adapter with fake-client tests.
4. Add OpenAI structure adapter with fake-client tests.
5. Wire production services in Electron main config.
6. Verify demo mode still works.
7. Run a guarded manual production smoke only when credentials and non-sensitive test audio are available.
