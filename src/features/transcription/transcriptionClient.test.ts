import {
  createTranscriptionError,
  transcribeChunks,
  type TranscriptionChunkRequest,
  type TranscriptionClient,
  type TranscriptionError
} from "./transcriptionClient";
import type { TranscriptSegment } from "./transcriptionTypes";

function chunk(
  id: string,
  index: number,
  trackId: TranscriptionChunkRequest["trackId"],
  startOffsetMs: number
): TranscriptionChunkRequest {
  return {
    id,
    index,
    trackId,
    filePath: `meetings/meeting-1/audio/chunks/${id}.wav`,
    startOffsetMs,
    durationMs: 10_000
  };
}

class FakeTranscriptionClient implements TranscriptionClient {
  readonly requests: TranscriptionChunkRequest[] = [];

  async transcribeChunk(
    request: TranscriptionChunkRequest
  ): Promise<TranscriptSegment[]> {
    this.requests.push(request);

    return [
      {
        id: `${request.id}-segment-1`,
        trackId: request.trackId,
        startTimeMs: request.startOffsetMs,
        endTimeMs: request.startOffsetMs + 2_500,
        text: `Transcript for ${request.id}`,
        language: "en",
        confidence: 0.9
      }
    ];
  }
}

test("maps chunk requests to transcript segment responses in request order", async () => {
  const client = new FakeTranscriptionClient();
  const requests = [
    chunk("system-0001", 0, "system", 0),
    chunk("microphone-0001", 1, "microphone", 10_000)
  ];

  await expect(transcribeChunks(client, requests)).resolves.toEqual([
    {
      id: "system-0001-segment-1",
      trackId: "system",
      startTimeMs: 0,
      endTimeMs: 2_500,
      text: "Transcript for system-0001",
      language: "en",
      confidence: 0.9
    },
    {
      id: "microphone-0001-segment-1",
      trackId: "microphone",
      startTimeMs: 10_000,
      endTimeMs: 12_500,
      text: "Transcript for microphone-0001",
      language: "en",
      confidence: 0.9
    }
  ]);

  expect(client.requests).toEqual(requests);
});

test("propagates retryable transcription errors with provider-neutral shape", async () => {
  const rateLimitError = createTranscriptionError({
    kind: "rate-limit",
    message: "Provider asked the client to slow down.",
    retryable: true,
    providerCode: "too_many_requests",
    retryAfterMs: 30_000
  });
  const client: TranscriptionClient = {
    async transcribeChunk(): Promise<TranscriptSegment[]> {
      throw rateLimitError;
    }
  };
  const expectedError: Partial<TranscriptionError> = {
    name: "TranscriptionError",
    kind: "rate-limit",
    message: "Provider asked the client to slow down.",
    retryable: true,
    providerCode: "too_many_requests",
    retryAfterMs: 30_000
  };

  await expect(
    transcribeChunks(client, [chunk("system-0001", 0, "system", 0)])
  ).rejects.toMatchObject(expectedError);
});

test("creates provider-neutral errors for each transcription failure kind", () => {
  const kinds: TranscriptionError["kind"][] = [
    "upload",
    "rate-limit",
    "provider",
    "invalid-audio"
  ];

  expect(
    kinds.map((kind) =>
      createTranscriptionError({
        kind,
        message: `${kind} failed`,
        retryable: kind !== "invalid-audio"
      })
    )
  ).toEqual([
    expect.objectContaining({
      name: "TranscriptionError",
      kind: "upload",
      message: "upload failed",
      retryable: true
    }),
    expect.objectContaining({
      name: "TranscriptionError",
      kind: "rate-limit",
      message: "rate-limit failed",
      retryable: true
    }),
    expect.objectContaining({
      name: "TranscriptionError",
      kind: "provider",
      message: "provider failed",
      retryable: true
    }),
    expect.objectContaining({
      name: "TranscriptionError",
      kind: "invalid-audio",
      message: "invalid-audio failed",
      retryable: false
    })
  ]);
});
