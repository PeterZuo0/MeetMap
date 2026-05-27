import type { AudioTrackId } from "../meetings/meetingTypes";
import type { TranscriptSegment } from "./transcriptionTypes";

const TRACK_SORT_ORDER: Record<AudioTrackId, number> = {
  system: 0,
  microphone: 1
};

export function mergeTranscriptSegments(
  segments: readonly TranscriptSegment[]
): TranscriptSegment[] {
  return segments
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
}
