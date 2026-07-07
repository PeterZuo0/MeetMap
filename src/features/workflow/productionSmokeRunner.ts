import { copyFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readWavFileInfo } from "../audio-analysis/wavFile.js";
import { createMeetingStore } from "../meetings/meetingStore.js";
import type {
  AudioTrackId,
  MeetingAudioTracks,
  SummaryStyle
} from "../meetings/meetingTypes.js";
import { SUMMARY_STYLE_VALUES } from "../meetings/meetingTypes.js";
import type { ProcessingPreferences } from "../settings/processingPreferences.js";
import type { LanguageOptionValue } from "../settings/languageOptions.js";
import { LANGUAGE_OPTION_VALUES } from "../settings/languageOptions.js";
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
  assertProductionSmokeInputCanStart(input);

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

export function assertProductionSmokeInputCanStart(
  input: Pick<
    ProductionSmokeInput,
    "allowCloudUpload" | "microphoneAudioPath" | "systemAudioPath"
  >
): void {
  if (!input.allowCloudUpload) {
    throw new Error("Production smoke requires --allow-cloud-upload.");
  }

  if (!input.systemAudioPath && !input.microphoneAudioPath) {
    throw new Error("No audio source was provided.");
  }
}

export function parseProductionSmokeArgs(args: string[]): ProductionSmokeInput {
  const parsed: Partial<ProductionSmokeInput> = {
    allowCloudUpload: false,
    outputLanguage: "bilingual"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--":
        break;
      case "--allow-cloud-upload":
        parsed.allowCloudUpload = true;
        break;
      case "--data-dir":
        parsed.dataDir = readFlagValue(args, index, arg);
        index += 1;
        break;
      case "--meeting-id":
        parsed.meetingId = readFlagValue(args, index, arg);
        index += 1;
        break;
      case "--microphone-audio":
        parsed.microphoneAudioPath = readFlagValue(args, index, arg);
        index += 1;
        break;
      case "--output-language":
        parsed.outputLanguage = parseOutputLanguage(readFlagValue(args, index, arg));
        index += 1;
        break;
      case "--summary-style":
        parsed.summaryStyle = parseSummaryStyle(readFlagValue(args, index, arg));
        index += 1;
        break;
      case "--system-audio":
        parsed.systemAudioPath = readFlagValue(args, index, arg);
        index += 1;
        break;
      case "--title":
        parsed.title = readFlagValue(args, index, arg);
        index += 1;
        break;
      default:
        throw new Error(`Unknown production smoke argument: ${arg}`);
    }
  }

  return {
    allowCloudUpload: parsed.allowCloudUpload ?? false,
    dataDir: requireParsedValue(parsed.dataDir, "--data-dir"),
    meetingId: requireParsedValue(parsed.meetingId, "--meeting-id"),
    microphoneAudioPath: parsed.microphoneAudioPath,
    outputLanguage: parsed.outputLanguage ?? "bilingual",
    summaryStyle: parsed.summaryStyle,
    systemAudioPath: parsed.systemAudioPath,
    title: requireParsedValue(parsed.title, "--title")
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

  if (trackId === "system") {
    audioTracks.system = {
      ...wavInfo,
      id: "system",
      filePath: destinationPath,
      hasAudio: wavInfo.durationMs > 0
    };
  } else {
    audioTracks.microphone = {
      ...wavInfo,
      id: "microphone",
      filePath: destinationPath,
      hasAudio: wavInfo.durationMs > 0
    };
  }
}

function readFlagValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function requireParsedValue<T>(value: T | undefined, flag: string): T {
  if (value === undefined) {
    throw new Error(`Missing required argument ${flag}`);
  }

  return value;
}

function parseOutputLanguage(value: string): LanguageOptionValue {
  if ((LANGUAGE_OPTION_VALUES as readonly string[]).includes(value)) {
    return value as LanguageOptionValue;
  }

  throw new Error(`Unsupported output language: ${value}`);
}

function parseSummaryStyle(value: string): SummaryStyle {
  if ((SUMMARY_STYLE_VALUES as readonly string[]).includes(value)) {
    return value as SummaryStyle;
  }

  throw new Error(`Unsupported summary style: ${value}`);
}
