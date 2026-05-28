import { describe, expect, test } from "vitest";

import type { MeetingStructure } from "../intelligence/meetingStructure";
import type { MeetingStructureClient } from "../intelligence/meetingStructureClient";
import type { MeetingMetadata } from "../meetings/meetingTypes";
import type { TranscriptionClient } from "../transcription/transcriptionClient";
import type { TranscriptSegment } from "../transcription/transcriptionTypes";
import { createProductionWorkflowServices } from "./productionWorkflowServices";

function metadata(): MeetingMetadata {
  return {
    id: "meeting-1",
    title: "Roadmap review",
    status: "recorded",
    outputLanguage: "bilingual",
    timestamps: {
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      recordingStartedAt: "2026-05-28T00:01:00.000Z",
      recordingEndedAt: "2026-05-28T00:11:00.000Z"
    },
    audioTracks: {
      system: {
        id: "system",
        filePath: "C:/meetings/1/audio/system.wav",
        format: "wav",
        hasAudio: true,
        durationMs: 6000
      },
      microphone: {
        id: "microphone",
        filePath: "C:/meetings/1/audio/microphone.wav",
        format: "wav",
        hasAudio: false,
        durationMs: 6000
      }
    },
    transcriptPath: null,
    structurePath: null,
    exportPaths: {
      wordSummaryPath: null,
      htmlMeetingMapPath: null
    }
  };
}

function segment(trackId: "system" | "microphone"): TranscriptSegment {
  return {
    id: `${trackId}-seg-1`,
    trackId,
    startTimeMs: 0,
    endTimeMs: 1000,
    text: "We kept export workflow in scope.",
    language: "en",
    confidence: 0.98
  };
}

function validStructure(): MeetingStructure {
  return {
    metadata: {
      meetingId: "meeting-1",
      title: "Roadmap review",
      startedAt: "2026-05-28T00:01:00.000Z",
      endedAt: "2026-05-28T00:11:00.000Z",
      sourceLanguage: "en",
      outputLanguage: "bilingual"
    },
    summary: "The team kept export workflow in scope.",
    topics: [
      {
        id: "topic-1",
        type: "topic",
        title: "Export workflow",
        summary: "The export workflow remains in scope.",
        sourceRefs: [{ segmentId: "system-seg-1", startTimeMs: 0, endTimeMs: 1000 }]
      }
    ],
    points: [],
    decisions: [],
    actionItems: [],
    openQuestions: [],
    risks: [],
    relations: []
  };
}

describe("createProductionWorkflowServices", () => {
  test("detects active tracks from recorded audio metadata", async () => {
    const services = createProductionWorkflowServices({
      transcriptionClient: { async transcribeChunk() { return []; } },
      structureClient: { async extractStructure() { return validStructure(); } }
    });

    await expect(services.detectActivity(metadata().audioTracks)).resolves.toEqual({
      tracksToProcess: ["system"],
      outcome: "system-only",
      reason: "system-track-contains-speech",
      message: "System audio speech was detected without microphone speech."
    });
  });

  test("transcribes each selected track as a whole-file chunk", async () => {
    const calls: Parameters<TranscriptionClient["transcribeChunk"]>[] = [];
    const services = createProductionWorkflowServices({
      transcriptionClient: {
        async transcribeChunk(request) {
          calls.push([request]);
          return [segment(request.trackId)];
        }
      },
      structureClient: { async extractStructure() { return validStructure(); } }
    });

    await expect(
      services.transcribe(["system", "microphone"], metadata())
    ).resolves.toEqual([segment("system"), segment("microphone")]);

    expect(calls).toEqual([
      [
        {
          id: "meeting-1-system-0001",
          index: 0,
          trackId: "system",
          filePath: "C:/meetings/1/audio/system.wav",
          startOffsetMs: 0,
          durationMs: 6000
        }
      ],
      [
        {
          id: "meeting-1-microphone-0001",
          index: 1,
          trackId: "microphone",
          filePath: "C:/meetings/1/audio/microphone.wav",
          startOffsetMs: 0,
          durationMs: 6000
        }
      ]
    ]);
  });

  test("extracts a validated meeting structure through the configured client", async () => {
    const calls: Parameters<MeetingStructureClient["extractStructure"]>[] = [];
    const services = createProductionWorkflowServices({
      transcriptionClient: { async transcribeChunk() { return []; } },
      structureClient: {
        async extractStructure(request) {
          calls.push([request]);
          return validStructure();
        }
      }
    });

    await expect(
      services.extractStructure([segment("system")], metadata())
    ).resolves.toEqual(validStructure());

    expect(calls).toEqual([
      [
        {
          meetingId: "meeting-1",
          title: "Roadmap review",
          startedAt: "2026-05-28T00:01:00.000Z",
          endedAt: "2026-05-28T00:11:00.000Z",
          outputLanguage: "bilingual",
          summaryStyle: "decisions_actions",
          transcript: [segment("system")]
        }
      ]
    ]);
  });
});
