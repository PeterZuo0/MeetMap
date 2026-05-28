import { decideVoiceActivity } from "../audio-analysis/voiceActivity";
import type { MeetingStructureClient } from "../intelligence/meetingStructureClient";
import { extractValidatedMeetingStructure } from "../intelligence/meetingStructureClient";
import type { AudioTrackId, MeetingMetadata } from "../meetings/meetingTypes";
import {
  transcribeChunks,
  type TranscriptionChunkRequest,
  type TranscriptionClient
} from "../transcription/transcriptionClient";
import type { PostMeetingWorkflowServices } from "./postMeetingWorkflow";

export type ProductionWorkflowServicesOptions = {
  transcriptionClient: TranscriptionClient;
  structureClient: MeetingStructureClient;
};

export function createProductionWorkflowServices({
  transcriptionClient,
  structureClient
}: ProductionWorkflowServicesOptions): PostMeetingWorkflowServices {
  return {
    async detectActivity(tracks) {
      return decideVoiceActivity({
        tracks: {
          system: tracks.system
            ? {
                id: "system",
                hasSpeech: tracks.system.hasAudio,
                durationMs: tracks.system.durationMs
              }
            : undefined,
          microphone: tracks.microphone
            ? {
                id: "microphone",
                hasSpeech: tracks.microphone.hasAudio,
                durationMs: tracks.microphone.durationMs
              }
            : undefined
        }
      });
    },

    async transcribe(tracksToProcess, metadata) {
      return transcribeChunks(
        transcriptionClient,
        tracksToProcess.map((trackId, index) =>
          createWholeFileChunkRequest({ trackId, index, metadata })
        )
      );
    },

    async extractStructure(transcript, metadata) {
      return extractValidatedMeetingStructure(structureClient, {
        metadata,
        transcript
      });
    }
  };
}

function createWholeFileChunkRequest({
  trackId,
  index,
  metadata
}: {
  trackId: AudioTrackId;
  index: number;
  metadata: MeetingMetadata;
}): TranscriptionChunkRequest {
  const track = metadata.audioTracks[trackId];

  if (!track) {
    throw new Error(`Cannot transcribe missing ${trackId} audio track`);
  }

  return {
    id: `${metadata.id}-${trackId}-0001`,
    index,
    trackId,
    filePath: track.filePath,
    startOffsetMs: 0,
    durationMs: track.durationMs
  };
}
