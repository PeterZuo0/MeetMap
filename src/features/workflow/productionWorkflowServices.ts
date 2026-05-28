import { decideVoiceActivity } from "../audio-analysis/voiceActivity.js";
import type { MeetingStructureClient } from "../intelligence/meetingStructureClient.js";
import { extractValidatedMeetingStructure } from "../intelligence/meetingStructureClient.js";
import type { AudioTrackId, MeetingMetadata } from "../meetings/meetingTypes.js";
import {
  transcribeChunks,
  type TranscriptionChunkRequest,
  type TranscriptionClient
} from "../transcription/transcriptionClient.js";
import type { PostMeetingWorkflowServices } from "./postMeetingWorkflow.js";

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
