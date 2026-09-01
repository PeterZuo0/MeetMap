import { mkdir, readFile, writeFile } from "node:fs/promises";
import type {
  MeetingAudioTracks,
  MeetingId,
  MeetingMetadata,
  ProcessingProgressUpdate,
  ProcessingStep
} from "../meetings/meetingTypes.js";
import type { MeetingStore } from "../meetings/meetingStore.js";
import type { TranscriptSegment } from "../transcription/transcriptionTypes.js";
import { mergeTranscriptSegments } from "../transcription/transcriptMerge.js";
import { decideVoiceActivity, type VoiceActivityDecision } from "../audio-analysis/voiceActivity.js";
import type { MeetingStructure, SourceReference } from "../intelligence/meetingStructure.js";
import { validateMeetingStructure } from "../intelligence/meetingStructureSchema.js";
import { createWordSummaryDocx } from "../exports/word/wordExport.js";
import type { ProcessingPreferences } from "../settings/processingPreferences.js";
import type { DiarizationClient, DiarizationResult } from "../diarization/diarizationTypes.js";
import { applyDiarizationToTranscript } from "../diarization/transcriptDiarization.js";
import { createTrackDiarizationClient } from "../diarization/trackDiarizationClient.js";

export type PostMeetingTranscriptionContext = {
  onTranscriptionProgress?: (progress: { completedChunks: number; totalChunks: number }) => void;
};

export type PostMeetingWorkflowServices = {
  detectActivity(tracks: MeetingAudioTracks): Promise<VoiceActivityDecision>;
  transcribe(
    tracksToProcess: VoiceActivityDecision["tracksToProcess"],
    metadata: MeetingMetadata,
    preferences?: ProcessingPreferences,
    context?: PostMeetingTranscriptionContext
  ): Promise<TranscriptSegment[]>;
  extractStructure(
    transcript: TranscriptSegment[],
    metadata: MeetingMetadata,
    preferences?: ProcessingPreferences
  ): Promise<MeetingStructure>;
  diarize?: DiarizationClient["diarize"];
};

export type ProcessMeetingInput = {
  store: MeetingStore;
  meetingId: MeetingId;
  services?: PostMeetingWorkflowServices;
  mode?: "production" | "demo";
  onStepChange?: (step: ProcessingStep) => void;
  onProgress?: (progress: ProcessingProgressUpdate) => void;
  preferences?: ProcessingPreferences;
};

export type ProcessMeetingResult = {
  metadata: MeetingMetadata;
  transcript: TranscriptSegment[];
  structure: MeetingStructure | null;
};

export async function processMeeting({
  store,
  meetingId,
  services,
  mode = "production",
  onStepChange,
  onProgress,
  preferences
}: ProcessMeetingInput): Promise<ProcessMeetingResult> {
  const workflowServices = resolveWorkflowServices({ mode, services });
  const paths = store.getMeetingPaths(meetingId);
  let metadata = await store.readMetadata(meetingId);

  async function persist(
    step: ProcessingStep,
    patch: Partial<MeetingMetadata> = {}
  ): Promise<void> {
    const now = new Date().toISOString();
    metadata = {
      ...metadata,
      ...patch,
      processingStep: step,
      timestamps: {
        ...metadata.timestamps,
        ...patch.timestamps,
        updatedAt: now
      }
    };
    await store.writeMetadata(metadata);
    onStepChange?.(step);
    onProgress?.(createProcessingProgressUpdate({
      meetingId,
      step
    }));
  }

  try {
    if (preferences?.analysisOnly) {
      if (!metadata.transcriptPath) {
        throw new Error("A saved transcript is required before GPT analysis");
      }

      const storedTranscript = await readStoredTranscript(paths.transcriptPath);
      await persist("structure_extraction", {
        status: "processing",
        timestamps: {
          ...metadata.timestamps,
          processingStartedAt: metadata.timestamps.processingStartedAt ?? new Date().toISOString()
        }
      });
      const structure = await workflowServices.extractStructure(storedTranscript, metadata, preferences);
      const validation = validateMeetingStructure(structure);
      if (!validation.success) {
        throw new Error(`Invalid meeting structure: ${validation.errors.join("; ")}`);
      }
      await writeFile(paths.structurePath, `${JSON.stringify(structure, null, 2)}\n`);

      await mkdir(paths.exportsDir, { recursive: true });
      await persist("word_export", {
        structurePath: paths.structurePath
      });
      await writeFile(paths.wordExportPath, await createWordSummaryDocx(structure));

      await persist("completed", {
        status: "completed",
        exportPaths: {
          wordSummaryPath: paths.wordExportPath,
          htmlMeetingMapPath: null
        },
        timestamps: {
          ...metadata.timestamps,
          completedAt: new Date().toISOString()
        }
      });

      return { metadata, transcript: storedTranscript, structure };
    }

    await persist("activity_detection", {
      status: "processing",
      timestamps: {
        ...metadata.timestamps,
        processingStartedAt: metadata.timestamps.processingStartedAt ?? new Date().toISOString()
      }
    });
    const activity = await workflowServices.detectActivity(metadata.audioTracks);

    if (activity.tracksToProcess.length === 0) {
      await persist("no_audio", {
        status: "no_audio",
        timestamps: {
          ...metadata.timestamps,
          completedAt: new Date().toISOString()
        }
      });
      return { metadata, transcript: [], structure: null };
    }

    await persist("transcription");
    const transcript = await workflowServices.transcribe(activity.tracksToProcess, metadata, preferences, {
      onTranscriptionProgress(progress) {
        onProgress?.(createProcessingProgressUpdate({
          meetingId,
          step: "transcription",
          transcription: progress
        }));
      }
    });
    const diarization = await maybeRunDiarization({
      activity,
      metadata,
      preferences,
      services: workflowServices
    });
    if (diarization) {
      await writeFile(paths.diarizationPath, `${JSON.stringify(diarization, null, 2)}\n`, "utf8");
    }
    const speakerLabeledTranscript = applyDiarizationToTranscript(transcript, diarization);
    await writeFile(paths.transcriptPath, `${JSON.stringify({ segments: speakerLabeledTranscript }, null, 2)}\n`);

    await persist("merge", {
      transcriptPath: paths.transcriptPath,
      diarizationPath: diarization ? paths.diarizationPath : metadata.diarizationPath
    });
    const mergedTranscript = mergeTranscriptSegments(speakerLabeledTranscript);
    await writeFile(
      paths.transcriptPath,
      `${JSON.stringify({ segments: mergedTranscript }, null, 2)}\n`
    );

    if (preferences?.transcriptOnly) {
      await persist("completed", {
        status: "completed",
        structurePath: null,
        exportPaths: {
          wordSummaryPath: null,
          htmlMeetingMapPath: null
        },
        timestamps: {
          ...metadata.timestamps,
          completedAt: new Date().toISOString()
        }
      });
      return { metadata, transcript: mergedTranscript, structure: null };
    }

    await persist("structure_extraction");
    const structure = await workflowServices.extractStructure(mergedTranscript, metadata, preferences);
    const validation = validateMeetingStructure(structure);
    if (!validation.success) {
      throw new Error(`Invalid meeting structure: ${validation.errors.join("; ")}`);
    }
    await writeFile(paths.structurePath, `${JSON.stringify(structure, null, 2)}\n`);

    await mkdir(paths.exportsDir, { recursive: true });
    await persist("word_export", {
      structurePath: paths.structurePath
    });
    await writeFile(paths.wordExportPath, await createWordSummaryDocx(structure));

    await persist("completed", {
      status: "completed",
      exportPaths: {
        wordSummaryPath: paths.wordExportPath,
        htmlMeetingMapPath: null
      },
      timestamps: {
        ...metadata.timestamps,
        completedAt: new Date().toISOString()
      }
    });

    return { metadata, transcript: mergedTranscript, structure };
  } catch (error) {
    await persist("failed", {
      status: "failed",
      timestamps: {
        ...metadata.timestamps,
        failedAt: new Date().toISOString()
      }
    });
    throw error;
  }
}

async function readStoredTranscript(filePath: string): Promise<TranscriptSegment[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error("Saved transcript could not be read for GPT analysis", { cause: error });
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.segments)) {
    throw new Error("Saved transcript is invalid");
  }

  return parsed.segments as TranscriptSegment[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PROGRESS_STEPS: ProcessingStep[] = [
  "activity_detection",
  "transcription",
  "merge",
  "structure_extraction",
  "word_export"
];

function createProcessingProgressUpdate({
  meetingId,
  step,
  transcription
}: {
  meetingId: MeetingId;
  step: ProcessingStep;
  transcription?: { completedChunks: number; totalChunks: number };
}): ProcessingProgressUpdate {
  const stepIndex = PROGRESS_STEPS.includes(step)
    ? PROGRESS_STEPS.indexOf(step)
    : step === "completed"
      ? PROGRESS_STEPS.length
      : 0;
  const stepFraction = transcription && transcription.totalChunks > 0
    ? transcription.completedChunks / transcription.totalChunks
    : step === "completed"
      ? 0
      : 0;
  const rawPercent = step === "completed"
    ? 100
    : ((stepIndex + stepFraction) / PROGRESS_STEPS.length) * 100;

  return {
    meetingId,
    step,
    currentStep: Math.min(PROGRESS_STEPS.length, stepIndex + 1),
    totalSteps: PROGRESS_STEPS.length,
    percent: Math.max(0, Math.min(100, Math.round(rawPercent))),
    updatedAt: new Date().toISOString(),
    transcription
  };
}
function resolveWorkflowServices({
  mode,
  services
}: {
  mode: ProcessMeetingInput["mode"];
  services: ProcessMeetingInput["services"];
}): PostMeetingWorkflowServices {
  if (services) {
    return services;
  }

  if (mode === "demo") {
    return createDemoWorkflowServices();
  }

  throw new Error("Post-meeting workflow services must be configured");
}

async function maybeRunDiarization({
  activity,
  metadata,
  preferences,
  services
}: {
  activity: VoiceActivityDecision;
  metadata: MeetingMetadata;
  preferences: ProcessingPreferences | undefined;
  services: PostMeetingWorkflowServices;
}): Promise<DiarizationResult | null> {
  if (!preferences?.speakerDiarization || !services.diarize) {
    return null;
  }

  return services.diarize({
    meeting: metadata,
    tracksToProcess: activity.tracksToProcess,
    audioTracks: metadata.audioTracks
  });
}

export function createDemoWorkflowServices(): PostMeetingWorkflowServices {
  const diarizationClient = createTrackDiarizationClient();

  return {
    diarize: diarizationClient.diarize,

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
      return tracksToProcess.map((trackId, index) => ({
        id: `${metadata.id}-${trackId}-demo-segment`,
        trackId,
        startTimeMs: index * 1000,
        endTimeMs: index * 1000 + 900,
        text:
          trackId === "system"
            ? "The team reviewed the roadmap and confirmed the MVP export workflow."
            : "We agreed to validate the smoke path and capture follow-up actions.",
        language: metadata.outputLanguage === "zh" ? "zh" : "en",
        confidence: 0.99
      }));
    },

    async extractStructure(transcript, metadata) {
      return createDemoMeetingStructure(transcript, metadata);
    }
  };
}

function createDemoMeetingStructure(
  transcript: TranscriptSegment[],
  metadata: MeetingMetadata
): MeetingStructure {
  const refs = createSourceRefs(transcript);
  const topicId = `${metadata.id}-topic-workflow`;

  return {
    metadata: {
      meetingId: metadata.id,
      title: metadata.title,
      startedAt:
        metadata.timestamps.recordingStartedAt ?? metadata.timestamps.createdAt,
      endedAt: metadata.timestamps.recordingEndedAt,
      sourceLanguage: transcript[0]?.language ?? "en",
      outputLanguage: metadata.outputLanguage
    },
    summary:
      transcript.map((segment) => segment.text).join(" ") ||
      "Demo processing completed without transcript content.",
    purposeAnalysis: "Validate the meeting transcription and analysis workflow.",
    technicalSummary: "The demo validates audio detection, transcript generation, structured GPT analysis, and local persistence.",
    analysisByLanguage: {
      zh: {
        overview: ["团队完成了会后语音转写与分析流程的演示验证。"],
        purpose: ["验证会议录音能否稳定生成文字稿，并在用户确认后生成结构化分析。"],
        topics: [{
          title: "会后处理流程",
          paragraphs: ["会议确认了录音、转写、分析与本地保存之间的处理顺序。"]
        }],
        technicalSummary: ["演示覆盖音频检测、文字稿生成、结构化 GPT 分析以及本地持久化。"]
      },
      en: {
        overview: ["The team completed a demo validation of the post-meeting transcription and analysis workflow."],
        purpose: ["The meeting validated that recorded audio can produce a reliable transcript and a structured analysis after user confirmation."],
        topics: [{
          title: "Post-meeting workflow",
          paragraphs: ["The discussion confirmed the processing order for recording, transcription, analysis, and local persistence."]
        }],
        technicalSummary: ["The demo covers audio detection, transcript generation, structured GPT analysis, and local persistence."]
      }
    },
    topics: [
      {
        id: topicId,
        type: "topic",
        title: "Post-meeting workflow",
        summary: "Recording, processing, and export generation were validated.",
        sourceRefs: refs
      }
    ],
    points: [
      {
        id: `${metadata.id}-point-export`,
        type: "point",
        text: "The workflow produces a Word summary and standalone HTML meeting map.",
        topicId,
        sourceRefs: refs
      }
    ],
    decisions: [
      {
        id: `${metadata.id}-decision-demo`,
        type: "decision",
        text: "Use the local demo processing path until real providers are configured.",
        topicId,
        sourceRefs: refs
      }
    ],
    actionItems: [
      {
        id: `${metadata.id}-action-smoke`,
        type: "action",
        text: "Run the Windows smoke path with real capture when the adapter is connected.",
        status: "open",
        topicId,
        sourceRefs: refs
      }
    ],
    openQuestions: [],
    risks: [],
    relations: []
  };
}

function createSourceRefs(transcript: TranscriptSegment[]): SourceReference[] {
  return transcript.length > 0
    ? transcript.map((segment) => ({
        segmentId: segment.id,
        startTimeMs: segment.startTimeMs,
        endTimeMs: segment.endTimeMs
      }))
    : [
        {
          segmentId: "demo",
          startTimeMs: 0,
          endTimeMs: 0
        }
      ];
}
