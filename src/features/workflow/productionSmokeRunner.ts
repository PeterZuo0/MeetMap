import { copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readWavFileInfo } from "../audio-analysis/wavFile.js";
import { createMeetingStore } from "../meetings/meetingStore.js";
import type {
  AudioTrackId,
  MeetingAudioTracks,
  SummaryStyle
} from "../meetings/meetingTypes.js";
import type { ProcessingPreferences } from "../settings/processingPreferences.js";
import type { LanguageOptionValue } from "../settings/languageOptions.js";
import {
  processMeeting,
  type PostMeetingWorkflowServices
} from "./postMeetingWorkflow.js";

export type ProductionSmokeInput = {
  allowCloudUpload: boolean;
  dataDir: string;
  meetingId: string;
  microphoneAudioPath?: string;
  outputLanguage: LanguageOptionValue;
  summaryStyle?: SummaryStyle;
  systemAudioPath?: string;
  title: string;
};

export type ProductionSmokeReport = {
  meetingId: string;
  meetingDir: string;
  transcriptPath: string;
  structurePath: string;
  wordExportPath: string;
  htmlMapExportPath: string;
};

export type ProductionSmokeDependencies = {
  workflowServices: PostMeetingWorkflowServices;
};

const DEFAULT_PRODUCTION_SMOKE_PREFERENCES: ProcessingPreferences = {
  autoDeleteCloudCopies: false,
  preserveTranscriptLanguage: true,
  recognitionLanguages: {
    cantonese: true,
    englishGB: true,
    englishUS: true,
    mandarin: true,
    mixedCodeSwitching: true
  },
  speakerDiarization: false,
  uploadRecordedAudio: true,
  uploadSeparateTracks: true,
  useOutputLanguage: true
};

export async function runProductionSmoke(
  input: ProductionSmokeInput,
  dependencies: ProductionSmokeDependencies
): Promise<ProductionSmokeReport> {
  if (!input.allowCloudUpload) {
    throw new Error("Production smoke requires --allow-cloud-upload.");
  }

  if (!input.systemAudioPath && !input.microphoneAudioPath) {
    throw new Error("No audio source was provided.");
  }

  const store = createMeetingStore(input.dataDir);
  const meeting = await store.createMeeting({
    id: input.meetingId,
    outputLanguage: input.outputLanguage,
    summaryStyle: input.summaryStyle,
    title: input.title
  });
  const paths = store.getMeetingPaths(meeting.id);
  const audioTracks: MeetingAudioTracks = {};

  await copyInputAudioTrack({
    audioTracks,
    destinationPath: join(paths.audioDir, "system.wav"),
    sourcePath: input.systemAudioPath,
    trackId: "system"
  });
  await copyInputAudioTrack({
    audioTracks,
    destinationPath: join(paths.audioDir, "microphone.wav"),
    sourcePath: input.microphoneAudioPath,
    trackId: "microphone"
  });

  const now = new Date().toISOString();
  await store.writeMetadata({
    ...meeting,
    status: "recorded",
    timestamps: {
      ...meeting.timestamps,
      recordingStartedAt: meeting.timestamps.recordingStartedAt ?? meeting.timestamps.createdAt,
      recordingEndedAt: now,
      updatedAt: now
    },
    audioTracks
  });

  await processMeeting({
    meetingId: meeting.id,
    mode: "production",
    preferences: DEFAULT_PRODUCTION_SMOKE_PREFERENCES,
    services: dependencies.workflowServices,
    store
  });

  return {
    htmlMapExportPath: resolve(paths.htmlMapExportPath),
    meetingDir: resolve(paths.meetingDir),
    meetingId: meeting.id,
    structurePath: resolve(paths.structurePath),
    transcriptPath: resolve(paths.transcriptPath),
    wordExportPath: resolve(paths.wordExportPath)
  };
}

async function copyInputAudioTrack({
  audioTracks,
  destinationPath,
  sourcePath,
  trackId
}: {
  audioTracks: MeetingAudioTracks;
  destinationPath: string;
  sourcePath: string | undefined;
  trackId: AudioTrackId;
}): Promise<void> {
  if (!sourcePath) {
    return;
  }

  await copyFile(sourcePath, destinationPath);
  const wavInfo = await readWavFileInfo(destinationPath);

  audioTracks[trackId] = {
    id: trackId,
    filePath: destinationPath,
    format: "wav",
    hasAudio: wavInfo.durationMs > 0,
    ...wavInfo
  };
}
