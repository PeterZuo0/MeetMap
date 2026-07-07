import { mergeTranscriptSegments } from "./transcriptMerge";
import type { TranscriptSegment } from "./transcriptionTypes";

function segment(
  id: string,
  trackId: TranscriptSegment["trackId"],
  startTimeMs: number,
  text: string
): TranscriptSegment {
  return {
    id,
    trackId,
    startTimeMs,
    endTimeMs: startTimeMs + 1_000,
    text,
    language: "en",
    confidence: 0.95
  };
}

test("merges mixed track transcript segments by ascending start time", () => {
  const segments = [
    segment("mic-2", "microphone", 4_000, "I agree."),
    segment("sys-1", "system", 1_000, "Welcome everyone."),
    segment("mic-1", "microphone", 2_500, "Thanks for having me."),
    segment("sys-2", "system", 3_000, "Let's begin.")
  ];

  expect(mergeTranscriptSegments(segments).map((item) => item.id)).toEqual([
    "sys-1",
    "mic-1",
    "sys-2",
    "mic-2"
  ]);
});

test("orders same-timestamp system segments before microphone segments", () => {
  const segments = [
    segment("mic-1", "microphone", 2_000, "Microphone at the same time."),
    segment("sys-1", "system", 2_000, "System at the same time."),
    segment("mic-2", "microphone", 3_000, "Later microphone."),
    segment("sys-2", "system", 3_000, "Later system.")
  ];

  expect(mergeTranscriptSegments(segments).map((item) => item.id)).toEqual([
    "sys-1",
    "mic-1",
    "sys-2",
    "mic-2"
  ]);
});

test("preserves original input order within the same timestamp and track", () => {
  const segments = [
    segment("mic-1", "microphone", 2_000, "First microphone phrase."),
    segment("sys-1", "system", 2_000, "First system phrase."),
    segment("mic-2", "microphone", 2_000, "Second microphone phrase."),
    segment("sys-2", "system", 2_000, "Second system phrase.")
  ];

  expect(mergeTranscriptSegments(segments).map((item) => item.id)).toEqual([
    "sys-1",
    "sys-2",
    "mic-1",
    "mic-2"
  ]);
});

test("drops duplicate transcript segments from overlapped chunks", () => {
  const segments = [
    {
      ...segment("sys-1", "system", 294_000, "We should confirm the launch date."),
      endTimeMs: 300_500
    },
    {
      ...segment("sys-dup", "system", 295_000, "We should confirm the launch date."),
      endTimeMs: 301_000
    },
    {
      ...segment("sys-2", "system", 301_500, "The next topic is support coverage."),
      endTimeMs: 305_000
    }
  ];

  expect(mergeTranscriptSegments(segments).map((item) => item.id)).toEqual([
    "sys-1",
    "sys-2"
  ]);
});

test("keeps different content even when timestamps overlap", () => {
  const segments = [
    {
      ...segment("sys-1", "system", 10_000, "The launch date is confirmed."),
      endTimeMs: 14_000
    },
    {
      ...segment("sys-2", "system", 12_000, "Budget approval is still open."),
      endTimeMs: 16_000
    }
  ];

  expect(mergeTranscriptSegments(segments).map((item) => item.id)).toEqual([
    "sys-1",
    "sys-2"
  ]);
});