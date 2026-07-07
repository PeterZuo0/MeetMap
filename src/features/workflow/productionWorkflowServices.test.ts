import { describe, expect, test } from "vitest";

import type { MeetingStructure } from "../intelligence/meetingStructure";
import type { MeetingStructureClient } from "../intelligence/meetingStructureClient";
import type { MeetingMetadata } from "../meetings/meetingTypes";
import type { ProcessingPreferences } from "../settings/processingPreferences";
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

function processingPreferences(overrides: Partial<ProcessingPreferences> = {}): ProcessingPreferences {
  return {
    autoDeleteCloudCopies: true,
    preserveTranscriptLanguage: true,
    recognitionLanguages: {
      cantonese: false,
      englishGB: false,
      englishUS: true,
      mandarin: true,
      mixedCodeSwitching: true
    },
    speakerDiarization: true,
    uploadRecordedAudio: true,
    uploadSeparateTracks: true,
    useOutputLanguage: true,
    ...overrides
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

  test("chunks long audio before transcription", async () => {
    const calls: Parameters<TranscriptionClient["transcribeChunk"]>[] = [];
    const largeMeeting = metadata();
    largeMeeting.audioTracks.system = {
      id: "system",
      filePath: "C:/meetings/1/audio/system.m4a",
      format: "m4a",
      hasAudio: true,
      byteLength: 25_000_000,
      durationMs: 1_528_821
    };
    const services = createProductionWorkflowServices({
      audioChunker: {
        async createChunks(input) {
          expect(input.chunksDir.replaceAll("\\", "/")).toBe("C:/meetings/1/audio/chunks");
          expect(input.maxChunkDurationMs).toBe(300_000);
          expect(input.track.filePath).toBe("C:/meetings/1/audio/system.m4a");
          return [
            {
              ...input.baseRequest,
              id: "meeting-1-system-0001",
              index: 0,
              trackId: "system",
              filePath: "C:/meetings/1/audio/chunks/system-1/system-0000.m4a",
              startOffsetMs: 0,
              durationMs: 300_000
            },
            {
              ...input.baseRequest,
              id: "meeting-1-system-0002",
              index: 1,
              trackId: "system",
              filePath: "C:/meetings/1/audio/chunks/system-1/system-0001.m4a",
              startOffsetMs: 300_000,
              durationMs: 300_000
            }
          ];
        }
      },
      maxTranscriptionChunkDurationMs: 300_000,
      transcriptionClient: {
        async transcribeChunk(request) {
          calls.push([request]);
          return [
            {
              id: `${request.id}-seg`,
              trackId: request.trackId,
              startTimeMs: request.startOffsetMs,
              endTimeMs: request.startOffsetMs + 1000,
              text: request.filePath,
              language: "en",
              confidence: 0.99
            }
          ];
        }
      },
      structureClient: { async extractStructure() { return validStructure(); } }
    });

    await expect(services.transcribe(["system"], largeMeeting)).resolves.toEqual([
      expect.objectContaining({ id: "meeting-1-system-0001-seg", startTimeMs: 0 }),
      expect.objectContaining({ id: "meeting-1-system-0002-seg", startTimeMs: 300_000 })
    ]);

    expect(calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        id: "meeting-1-system-0001",
        filePath: "C:/meetings/1/audio/chunks/system-1/system-0000.m4a",
        startOffsetMs: 0
      }),
      expect.objectContaining({
        id: "meeting-1-system-0002",
        filePath: "C:/meetings/1/audio/chunks/system-1/system-0001.m4a",
        startOffsetMs: 300_000
      })
    ]);
  });
  test("blocks production transcription when cloud audio upload is disabled", async () => {
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
      services.transcribe(["system"], metadata(), processingPreferences({ uploadRecordedAudio: false }))
    ).rejects.toThrow("Cloud audio upload is disabled");
    expect(calls).toEqual([]);
  });

  test("passes transcription preferences to the provider request", async () => {
    const calls: Parameters<TranscriptionClient["transcribeChunk"]>[] = [];
    const preferences = processingPreferences({
      speakerDiarization: false,
      uploadSeparateTracks: false,
      recognitionLanguages: {
        cantonese: true,
        englishGB: true,
        englishUS: false,
        mandarin: true,
        mixedCodeSwitching: false
      }
    });
    const services = createProductionWorkflowServices({
      transcriptionClient: {
        async transcribeChunk(request) {
          calls.push([request]);
          return [segment(request.trackId)];
        }
      },
      structureClient: { async extractStructure() { return validStructure(); } }
    });

    await services.transcribe(["system"], metadata(), preferences);

    expect(calls[0]?.[0]).toMatchObject({
      autoDeleteCloudCopies: true,
      recognitionLanguages: preferences.recognitionLanguages,
      speakerDiarization: false,
      uploadSeparateTracks: false
    });
  });

  test("does not upload both tracks separately when separate track upload is disabled", async () => {
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
      services.transcribe(
        ["system", "microphone"],
        metadata(),
        processingPreferences({ uploadSeparateTracks: false })
      )
    ).rejects.toThrow("Separate track upload is disabled");
    expect(calls).toEqual([]);
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

  test("uses the configured local diarization client when provided", async () => {
    const services = createProductionWorkflowServices({
      diarizationClient: {
        async diarize() {
          return {
            engine: "test-diarizer",
            device: "cpu",
            speakers: [{ id: "speaker-1", label: "Speaker 1" }],
            segments: []
          };
        }
      },
      transcriptionClient: { async transcribeChunk() { return []; } },
      structureClient: { async extractStructure() { return validStructure(); } }
    });

    await expect(
      services.diarize?.({
        meeting: metadata(),
        tracksToProcess: ["system"],
        audioTracks: metadata().audioTracks
      })
    ).resolves.toMatchObject({
      engine: "test-diarizer",
      device: "cpu"
    });
  });

  test("passes structure preferences to the meeting intelligence provider", async () => {
    const calls: Parameters<MeetingStructureClient["extractStructure"]>[] = [];
    const preferences = processingPreferences({
      preserveTranscriptLanguage: false,
      useOutputLanguage: false
    });
    const services = createProductionWorkflowServices({
      transcriptionClient: { async transcribeChunk() { return []; } },
      structureClient: {
        async extractStructure(request) {
          calls.push([request]);
          return validStructure();
        }
      }
    });

    await services.extractStructure([segment("system")], metadata(), preferences);

    expect(calls[0]?.[0]).toMatchObject({
      preserveTranscriptLanguage: false,
      useOutputLanguage: false
    });
  });
});
