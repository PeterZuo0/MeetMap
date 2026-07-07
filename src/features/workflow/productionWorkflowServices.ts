import { dirname, join } from "node:path";
import { decideVoiceActivity } from "../audio-analysis/voiceActivity.js";
import type { MeetingStructureClient } from "../intelligence/meetingStructureClient.js";
import { extractValidatedMeetingStructure } from "../intelligence/meetingStructureClient.js";
import type { DiarizationClient } from "../diarization/diarizationTypes.js";
import type { AudioTrackId, AudioTrackMetadata, MeetingMetadata } from "../meetings/meetingTypes.js";
import type { ProcessingPreferences } from "../settings/processingPreferences.js";
import {
  DEFAULT_TRANSCRIPTION_CHUNK_DURATION_MS,
  DEFAULT_WHOLE_FILE_TRANSCRIPTION_BYTE_LIMIT,
  createFfmpegAudioChunker,
  shouldChunkAudioTrack,
  type AudioChunker
} from "../transcription/audioChunking.js";
import {
  transcribeChunks,
  type TranscriptionChunkRequest,
  type TranscriptionClient
} from "../transcription/transcriptionClient.js";
import type { PostMeetingWorkflowServices } from "./postMeetingWorkflow.js";

export type ProductionWorkflowServicesOptions = {
  audioChunker?: AudioChunker;
  diarizationClient?: DiarizationClient;
  maxTranscriptionChunkDurationMs?: number;
  maxWholeFileTranscriptionBytes?: number;
  transcriptionClient: TranscriptionClient;
  structureClient: MeetingStructureClient;
};

export function createProductionWorkflowServices({
  audioChunker = createFfmpegAudioChunker(),
  diarizationClient,
  maxTranscriptionChunkDurationMs = DEFAULT_TRANSCRIPTION_CHUNK_DURATION_MS,
  maxWholeFileTranscriptionBytes = DEFAULT_WHOLE_FILE_TRANSCRIPTION_BYTE_LIMIT,
  transcriptionClient,
  structureClient
}: ProductionWorkflowServicesOptions): PostMeetingWorkflowServices {
  return {
    diarize: diarizationClient?.diarize,

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

    async transcribe(tracksToProcess, metadata, preferences, context) {
      if (preferences?.uploadRecordedAudio === false) {
        throw new Error("Cloud audio upload is disabled in privacy settings");
      }

      if (preferences?.uploadSeparateTracks === false && tracksToProcess.length > 1) {
        throw new Error("Separate track upload is disabled and combined audio upload is not available yet");
      }

      const requests: TranscriptionChunkRequest[] = [];
      for (const trackId of tracksToProcess) {
        requests.push(
          ...(await createTranscriptionRequestsForTrack({
            audioChunker,
            maxTranscriptionChunkDurationMs,
            maxWholeFileTranscriptionBytes,
            metadata,
            preferences,
            startIndex: requests.length,
            trackId
          }))
        );
      }

      return transcribeChunks(transcriptionClient, requests, ({ completedChunks, totalChunks }) => {
        context?.onTranscriptionProgress?.({ completedChunks, totalChunks });
      });
    },

    async extractStructure(transcript, metadata, preferences) {
      return extractValidatedMeetingStructure(structureClient, {
        metadata,
        preferences,
        transcript
      });
    }
  };
}

async function createTranscriptionRequestsForTrack({
  audioChunker,
  maxTranscriptionChunkDurationMs,
  maxWholeFileTranscriptionBytes,
  metadata,
  preferences,
  startIndex,
  trackId
}: {
  audioChunker: AudioChunker;
  maxTranscriptionChunkDurationMs: number;
  maxWholeFileTranscriptionBytes: number;
  metadata: MeetingMetadata;
  preferences?: ProcessingPreferences;
  startIndex: number;
  trackId: AudioTrackId;
}): Promise<TranscriptionChunkRequest[]> {
  const track = metadata.audioTracks[trackId];

  if (!track) {
    throw new Error(`Cannot transcribe missing ${trackId} audio track`);
  }

  const baseRequest = createBaseChunkRequest({ preferences, trackId });
  if (!shouldChunkAudioTrack(track, maxTranscriptionChunkDurationMs, maxWholeFileTranscriptionBytes)) {
    return [
      createWholeFileChunkRequest({
        baseRequest,
        index: startIndex,
        metadata,
        track,
        trackId
      })
    ];
  }

  const chunkRequests = await audioChunker.createChunks({
    baseRequest,
    chunksDir: join(dirname(track.filePath), "chunks"),
    maxChunkDurationMs: maxTranscriptionChunkDurationMs,
    meetingId: metadata.id,
    track,
    trackId
  });

  return chunkRequests.map((request, offset) => ({
    ...request,
    index: startIndex + offset
  }));
}

function createBaseChunkRequest({
  preferences,
  trackId
}: {
  preferences?: ProcessingPreferences;
  trackId: AudioTrackId;
}): Omit<TranscriptionChunkRequest, "durationMs" | "filePath" | "id" | "index" | "startOffsetMs"> {
  return {
    trackId,
    autoDeleteCloudCopies: preferences?.autoDeleteCloudCopies,
    recognitionLanguages: preferences?.recognitionLanguages,
    speakerDiarization: preferences?.speakerDiarization,
    uploadSeparateTracks: preferences?.uploadSeparateTracks
  };
}

function createWholeFileChunkRequest({
  baseRequest,
  index,
  metadata,
  track,
  trackId
}: {
  baseRequest: Omit<TranscriptionChunkRequest, "durationMs" | "filePath" | "id" | "index" | "startOffsetMs">;
  index: number;
  metadata: MeetingMetadata;
  track: AudioTrackMetadata;
  trackId: AudioTrackId;
}): TranscriptionChunkRequest {
  return {
    ...baseRequest,
    id: `${metadata.id}-${trackId}-0001`,
    index,
    trackId,
    filePath: track.filePath,
    startOffsetMs: 0,
    durationMs: track.durationMs
  };
}
