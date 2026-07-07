import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
      htmlMeetingMapPath: paths.htmlMapExportPath
    });
    expect(observedSteps).toEqual([
      "activity_detection",
      "transcription",
      "merge",
      "structure_extraction",
      "word_export",
      "html_map_export",
      "completed"
    ]);
    await expect(pathExists(paths.transcriptPath)).resolves.toBe(true);
    await expect(pathExists(paths.structurePath)).resolves.toBe(true);
    await expect(pathExists(paths.wordExportPath)).resolves.toBe(true);
    await expect(pathExists(paths.htmlMapExportPath)).resolves.toBe(true);
    await expect(store.readMetadata(meeting.id)).resolves.toMatchObject({
      status: "completed",
      processingStep: "completed"
    });
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
