import type { DiarizationResult, DiarizationSegment } from "./diarizationTypes.js";
import type { TranscriptSegment } from "../transcription/transcriptionTypes.js";

export function applyDiarizationToTranscript(
  transcript: TranscriptSegment[],
  diarization: DiarizationResult | null
): TranscriptSegment[] {
  if (!diarization || diarization.segments.length === 0) {
    return transcript;
  }

  return transcript.map((segment) => {
    const speakerSegment = findBestSpeakerSegment(segment, diarization.segments);
    if (!speakerSegment) {
      return segment;
    }

    return {
      ...segment,
      speakerId: speakerSegment.speakerId,
      speakerLabel: speakerSegment.speakerLabel
    };
  });
}

function findBestSpeakerSegment(
  transcriptSegment: TranscriptSegment,
  speakerSegments: DiarizationSegment[]
): DiarizationSegment | null {
  const sameTrackSegments = speakerSegments.filter(
    (speakerSegment) => speakerSegment.trackId === transcriptSegment.trackId
  );
  const candidateSegments = sameTrackSegments.length > 0 ? sameTrackSegments : speakerSegments;
  let bestSegment: DiarizationSegment | null = null;
  let bestOverlapMs = 0;

  for (const speakerSegment of candidateSegments) {
    const overlapMs = calculateOverlapMs(
      transcriptSegment.startTimeMs,
      transcriptSegment.endTimeMs,
      speakerSegment.startTimeMs,
      speakerSegment.endTimeMs
    );

    if (overlapMs > bestOverlapMs) {
      bestSegment = speakerSegment;
      bestOverlapMs = overlapMs;
    }
  }

  return bestSegment;
}

function calculateOverlapMs(
  leftStartMs: number,
  leftEndMs: number,
  rightStartMs: number,
  rightEndMs: number
): number {
  return Math.max(0, Math.min(leftEndMs, rightEndMs) - Math.max(leftStartMs, rightStartMs));
}
