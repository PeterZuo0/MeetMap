import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { vi } from "vitest";
import { createMeetingStore } from "../meetings/meetingStore";
import type { MeetingMetadata } from "../meetings/meetingTypes";
import type { TranscriptSegment } from "../transcription/transcriptionTypes";
import { processMeeting, type PostMeetingWorkflowServices } from "./postMeetingWorkflow";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

test("processes a recorded meeting with demo services and persists recoverable progress", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workflow-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "workflow-demo",
      title: "Workflow Demo",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);

    await store.writeMetadata({
      ...meeting,
      status: "recorded",
      audioTracks: {
        system: {
          id: "system",
          filePath: join(paths.audioDir, "system.wav"),
          format: "wav",
          hasAudio: true
        },
        microphone: {
          id: "microphone",
          filePath: join(paths.audioDir, "microphone.wav"),
          format: "wav",
          hasAudio: true
        }
      }
    });

    const observedSteps: string[] = [];
    const result = await processMeeting({
      store,
      meetingId: meeting.id,
      mode: "demo",
      onStepChange: (step) => observedSteps.push(step)
    });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.processingStep).toBe("completed");
    expect(result.metadata.transcriptPath).toBe(paths.transcriptPath);
    expect(result.metadata.structurePath).toBe(paths.structurePath);
    expect(result.metadata.exportPaths).toEqual({
      wordSummaryPath: paths.wordExportPath,
      htmlMeetingMapPath: null
    });
    expect(observedSteps).toEqual([
      "activity_detection",
      "transcription",
      "merge",
      "structure_extraction",
      "word_export",
      "completed"
    ]);
    await expect(pathExists(paths.transcriptPath)).resolves.toBe(true);
    await expect(pathExists(paths.structurePath)).resolves.toBe(true);
    await expect(pathExists(paths.wordExportPath)).resolves.toBe(true);
    await expect(pathExists(paths.htmlMapExportPath)).resolves.toBe(false);
    await expect(store.readMetadata(meeting.id)).resolves.toMatchObject({
      status: "completed",
      processingStep: "completed"
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("completes after saving the transcript when transcript-only mode is enabled", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workflow-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "workflow-transcript-only",
      title: "Transcript Only",
      outputLanguage: "zh"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await store.writeMetadata({
      ...meeting,
      status: "recorded",
      audioTracks: {
        system: {
          id: "system",
          filePath: join(paths.audioDir, "system.wav"),
          format: "wav",
          hasAudio: true
        }
      }
    });

    const observedSteps: string[] = [];
    const result = await processMeeting({
      store,
      meetingId: meeting.id,
      mode: "demo",
      preferences: {
        autoDeleteCloudCopies: true,
        preserveTranscriptLanguage: true,
        recognitionLanguages: {
          cantonese: false,
          englishGB: false,
          englishUS: true,
          mandarin: true,
          mixedCodeSwitching: true
        },
        speakerDiarization: false,
        transcriptOnly: true,
        uploadRecordedAudio: true,
        uploadSeparateTracks: true,
        useOutputLanguage: true
      },
      onStepChange: (step) => observedSteps.push(step)
    });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.transcriptPath).toBe(paths.transcriptPath);
    expect(result.metadata.structurePath).toBeNull();
    expect(result.metadata.exportPaths).toEqual({
      wordSummaryPath: null,
      htmlMeetingMapPath: null
    });
    expect(observedSteps).toEqual([
      "activity_detection",
      "transcription",
      "merge",
      "completed"
    ]);
    await expect(pathExists(paths.transcriptPath)).resolves.toBe(true);
    await expect(pathExists(paths.structurePath)).resolves.toBe(false);
    await expect(pathExists(paths.htmlMapExportPath)).resolves.toBe(false);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("analyzes an existing transcript without detecting or transcribing audio again", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workflow-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "workflow-manual-analysis",
      title: "Manual Analysis",
      outputLanguage: "zh"
    });
    const paths = store.getMeetingPaths(meeting.id);
    const savedSegments: TranscriptSegment[] = [{
      id: "seg-existing",
      trackId: "system",
      startTimeMs: 0,
      endTimeMs: 4_200,
      text: "先完成文字稿，再由用户决定是否进行分析。",
      language: "zh",
      confidence: 0.94
    }];
    await writeFile(paths.transcriptPath, JSON.stringify({ segments: savedSegments }), "utf8");
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      transcriptPath: paths.transcriptPath
    });

    const detectActivity = vi.fn();
    const transcribe = vi.fn();
    const extractStructure = vi.fn(async (_transcript: TranscriptSegment[], metadata: MeetingMetadata) => ({
      metadata: {
        meetingId: metadata.id,
        title: metadata.title,
        startedAt: metadata.timestamps.createdAt,
        sourceLanguage: "zh",
        outputLanguage: "zh"
      },
      summary: "文字稿与分析被拆分为两个手动步骤。",
      purposeAnalysis: "验证用户控制的分析流程。",
      technicalSummary: "分析直接读取 transcript.json，不重新执行语音识别。",
      topics: [],
      decisions: [],
      actionItems: [],
      openQuestions: [],
      risks: [],
      relations: []
    }));
    const observedSteps: string[] = [];
    const result = await processMeeting({
      store,
      meetingId: meeting.id,
      preferences: {
        analysisOnly: true,
        autoDeleteCloudCopies: true,
        preserveTranscriptLanguage: true,
        recognitionLanguages: {
          cantonese: false,
          englishGB: false,
          englishUS: false,
          mandarin: true,
          mixedCodeSwitching: true
        },
        speakerDiarization: false,
        transcriptOnly: false,
        uploadRecordedAudio: true,
        uploadSeparateTracks: true,
        useOutputLanguage: true
      },
      services: {
        detectActivity,
        transcribe,
        extractStructure
      },
      onStepChange: (step) => observedSteps.push(step)
    });

    expect(detectActivity).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(extractStructure).toHaveBeenCalledWith(savedSegments, expect.anything(), expect.objectContaining({
      analysisOnly: true
    }));
    expect(observedSteps).toEqual(["structure_extraction", "word_export", "completed"]);
    expect(result.metadata.transcriptPath).toBe(paths.transcriptPath);
    expect(result.metadata.structurePath).toBe(paths.structurePath);
    await expect(pathExists(paths.structurePath)).resolves.toBe(true);
    await expect(pathExists(paths.wordExportPath)).resolves.toBe(true);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("requires explicit workflow services unless demo mode is enabled", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workflow-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "workflow-production",
      title: "Workflow Production",
      outputLanguage: "en"
    });

    await expect(
      processMeeting({
        store,
        meetingId: meeting.id
      })
    ).rejects.toThrow("Post-meeting workflow services must be configured");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("runs speaker diarization when enabled and persists speaker labels in transcript", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workflow-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "workflow-diarization",
      title: "Workflow Diarization",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    const diarize = vi.fn(async () => ({
      engine: "test-diarizer",
      device: "cpu",
      speakers: [{ id: "speaker-1", label: "Speaker 1" }],
      segments: [
        {
          id: "speaker-segment-1",
          speakerId: "speaker-1",
          speakerLabel: "Speaker 1",
          startTimeMs: 900,
          endTimeMs: 4_200,
          confidence: 0.88
        }
      ]
    }));

    await store.writeMetadata({
      ...meeting,
      status: "recorded",
      audioTracks: {
        system: {
          id: "system",
          filePath: join(paths.audioDir, "system.wav"),
          format: "wav",
          hasAudio: true
        }
      }
    });

    const services: PostMeetingWorkflowServices = {
      async detectActivity() {
        return {
          tracksToProcess: ["system"],
          outcome: "system-only",
          reason: "system-track-contains-speech",
          message: "System audio speech was detected without microphone speech."
        };
      },
      async transcribe() {
        return [
          {
            id: "seg-1",
            trackId: "system",
            startTimeMs: 1_000,
            endTimeMs: 4_000,
            text: "This segment should get a speaker label.",
            language: "en",
            confidence: 0.95
          }
        ];
      },
      diarize,
      async extractStructure(transcript: TranscriptSegment[], metadata: MeetingMetadata) {
        return {
          metadata: {
            meetingId: metadata.id,
            title: metadata.title,
            startedAt: metadata.timestamps.createdAt,
            endedAt: metadata.timestamps.updatedAt,
            sourceLanguage: "en",
            outputLanguage: "en"
          },
          summary: transcript.map((segment) => `${segment.speakerLabel}: ${segment.text}`).join(" "),
          topics: [],
          decisions: [],
          actionItems: [],
          openQuestions: [],
          risks: [],
          relations: []
        };
      }
    };

    await processMeeting({
      store,
      meetingId: meeting.id,
      preferences: {
        autoDeleteCloudCopies: true,
        preserveTranscriptLanguage: true,
        recognitionLanguages: {
          cantonese: false,
          englishGB: false,
          englishUS: true,
          mandarin: true,
          mixedCodeSwitching: false
        },
        speakerDiarization: true,
        uploadRecordedAudio: true,
        uploadSeparateTracks: true,
        useOutputLanguage: true
      },
      services
    });

    expect(diarize).toHaveBeenCalledWith(
      expect.objectContaining({
        meeting: expect.objectContaining({ id: meeting.id }),
        tracksToProcess: ["system"]
      })
    );
    await expect(pathExists(join(paths.meetingDir, "diarization.json"))).resolves.toBe(true);
    await expect(store.readMetadata(meeting.id)).resolves.toMatchObject({
      diarizationPath: join(paths.meetingDir, "diarization.json")
    });
    const transcript = JSON.parse(await readFile(paths.transcriptPath, "utf8"));
    expect(transcript.segments[0]).toMatchObject({
      speakerId: "speaker-1",
      speakerLabel: "Speaker 1"
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
