import type { AudioTrackId } from "../meetings/meetingTypes.js";
import type { TranscriptSegment } from "./transcriptionTypes.js";

const TRACK_SORT_ORDER: Record<AudioTrackId, number> = {
  system: 0,
  microphone: 1
};

const DUPLICATE_TIME_TOLERANCE_MS = 2_000;
const MIN_DUPLICATE_TEXT_LENGTH = 12;
const DUPLICATE_TOKEN_SIMILARITY = 0.85;

export function mergeTranscriptSegments(
  segments: readonly TranscriptSegment[]
): TranscriptSegment[] {
  const sortedSegments = segments
    .map((segment, index) => ({ segment, index }))
    .sort((left, right) => {
      const startTimeDifference =
        left.segment.startTimeMs - right.segment.startTimeMs;

      if (startTimeDifference !== 0) {
        return startTimeDifference;
      }

      const trackDifference =
        TRACK_SORT_ORDER[left.segment.trackId] -
        TRACK_SORT_ORDER[right.segment.trackId];

      if (trackDifference !== 0) {
        return trackDifference;
      }

      return left.index - right.index;
    })
    .map(({ segment }) => segment);

  return removeOverlappingDuplicates(sortedSegments);
}

function removeOverlappingDuplicates(segments: TranscriptSegment[]): TranscriptSegment[] {
  const merged: TranscriptSegment[] = [];

  for (const segment of segments) {
    const previousSameTrack = findPreviousSameTrackSegment(merged, segment.trackId);
    if (previousSameTrack && isLikelyOverlapDuplicate(previousSameTrack, segment)) {
      continue;
    }

    merged.push(segment);
  }

  return merged;
}

function findPreviousSameTrackSegment(
  segments: TranscriptSegment[],
  trackId: AudioTrackId
): TranscriptSegment | undefined {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].trackId === trackId) {
      return segments[index];
    }
  }

  return undefined;
}

function isLikelyOverlapDuplicate(left: TranscriptSegment, right: TranscriptSegment): boolean {
  const temporalGapMs = right.startTimeMs - left.endTimeMs;
  const overlapMs = Math.min(left.endTimeMs, right.endTimeMs) - Math.max(left.startTimeMs, right.startTimeMs);
  const temporallyRelated = overlapMs > 0 || Math.abs(temporalGapMs) <= DUPLICATE_TIME_TOLERANCE_MS;

  if (!temporallyRelated) {
    return false;
  }

  const leftText = normalizeTranscriptText(left.text);
  const rightText = normalizeTranscriptText(right.text);
  if (leftText.length < MIN_DUPLICATE_TEXT_LENGTH || rightText.length < MIN_DUPLICATE_TEXT_LENGTH) {
    return false;
  }

  if (leftText === rightText) {
    return true;
  }

  if (leftText.includes(rightText) || rightText.includes(leftText)) {
    return true;
  }

  return tokenSimilarity(leftText, rightText) >= DUPLICATE_TOKEN_SIMILARITY;
}

function normalizeTranscriptText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSimilarity(leftText: string, rightText: string): number {
  const leftTokens = new Set(leftText.split(" ").filter(Boolean));
  const rightTokens = new Set(rightText.split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(leftTokens.size, rightTokens.size);
}