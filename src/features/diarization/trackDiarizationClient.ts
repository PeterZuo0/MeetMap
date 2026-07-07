import type { DiarizationClient, DiarizationResult } from "./diarizationTypes.js";

export function createTrackDiarizationClient(): DiarizationClient {
  return {
    async diarize(input): Promise<DiarizationResult> {
      const activeTracks = input.tracksToProcess.filter((trackId) => input.audioTracks[trackId]?.hasAudio);
      const speakers = activeTracks.map((trackId, index) => ({
        id: `speaker-${trackId}`,
        label: `Speaker ${index + 1}`
      }));

      return {
        engine: "meetmap-track-fallback",
        device: "cpu",
        speakers,
        segments: activeTracks.map((trackId, index) => {
          const track = input.audioTracks[trackId];
          const speaker = speakers[index];
          return {
            id: `speaker-${trackId}-turn-1`,
            trackId,
            speakerId: speaker.id,
            speakerLabel: speaker.label,
            startTimeMs: 0,
            endTimeMs: inferTrackDurationMs(track?.durationMs, input.meeting),
            confidence: 0.5
          };
        })
      };
    }
  };
}

function inferTrackDurationMs(
  trackDurationMs: number | undefined,
  meeting: Parameters<DiarizationClient["diarize"]>[0]["meeting"]
): number {
  if (trackDurationMs !== undefined) {
    return Math.max(0, trackDurationMs);
  }

  const startedAt = meeting.timestamps.recordingStartedAt ? Date.parse(meeting.timestamps.recordingStartedAt) : NaN;
  const endedAt = meeting.timestamps.recordingEndedAt ? Date.parse(meeting.timestamps.recordingEndedAt) : NaN;
  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt) {
    return endedAt - startedAt;
  }

  return 0;
}
