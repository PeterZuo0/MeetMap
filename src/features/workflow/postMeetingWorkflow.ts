import { mkdir, writeFile } from "node:fs/promises";
import type {
  MeetingAudioTracks,
  MeetingId,
  MeetingMetadata,
  ProcessingStep
} from "../meetings/meetingTypes.js";
import type { MeetingStore } from "../meetings/meetingStore.js";
import type { TranscriptSegment } from "../transcription/transcriptionTypes.js";
import { mergeTranscriptSegments } from "../transcription/transcriptMerge.js";
import { decideVoiceActivity, type VoiceActivityDecision } from "../audio-analysis/voiceActivity.js";
import type { MeetingStructure, SourceReference } from "../intelligence/meetingStructure.js";
import { validateMeetingStructure } from "../intelligence/meetingStructureSchema.js";
import { createWordSummaryDocx } from "../exports/word/wordExport.js";
import { createHtmlMeetingMap } from "../exports/html-map/htmlMapExport.js";

export type PostMeetingWorkflowServices = {
  detectActivity(tracks: MeetingAudioTracks): Promise<VoiceActivityDecision>;
  transcribe(
    tracksToProcess: VoiceActivityDecision["tracksToProcess"],
    metadata: MeetingMetadata
  ): Promise<TranscriptSegment[]>;
  extractStructure(
    transcript: TranscriptSegment[],
    metadata: MeetingMetadata
  ): Promise<MeetingStructure>;
};

export type ProcessMeetingInput = {
  store: MeetingStore;
  meetingId: MeetingId;
  services?: Partial<PostMeetingWorkflowServices>;
  onStepChange?: (step: ProcessingStep) => void;
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
  onStepChange
}: ProcessMeetingInput): Promise<ProcessMeetingResult> {
  const workflowServices = {
    ...createDemoWorkflowServices(),
    ...services
  };
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
  }

  try {
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
    const transcript = await workflowServices.transcribe(activity.tracksToProcess, metadata);
    await writeFile(paths.transcriptPath, `${JSON.stringify({ segments: transcript }, null, 2)}\n`);

    await persist("merge", {
      transcriptPath: paths.transcriptPath
    });
    const mergedTranscript = mergeTranscriptSegments(transcript);
    await writeFile(
      paths.transcriptPath,
      `${JSON.stringify({ segments: mergedTranscript }, null, 2)}\n`
    );

    await persist("structure_extraction");
    const structure = await workflowServices.extractStructure(mergedTranscript, metadata);
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

    await persist("html_map_export", {
      exportPaths: {
        ...metadata.exportPaths,
        wordSummaryPath: paths.wordExportPath
      }
    });
    await writeFile(paths.htmlMapExportPath, createHtmlMeetingMap(structure), "utf8");

    await persist("completed", {
      status: "completed",
      exportPaths: {
        wordSummaryPath: paths.wordExportPath,
        htmlMeetingMapPath: paths.htmlMapExportPath
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

export function createDemoWorkflowServices(): PostMeetingWorkflowServices {
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
