import { describe, expect, test } from "vitest";

import type { MeetingMetadata } from "../meetings/meetingTypes";
import type { TranscriptSegment } from "../transcription/transcriptionTypes";
import type { MeetingStructure } from "./meetingStructure";
import {
  createMeetingStructureRequest,
  extractValidatedMeetingStructure,
  type MeetingStructureClient
} from "./meetingStructureClient";

const metadata: MeetingMetadata = {
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
  audioTracks: {},
  transcriptPath: null,
  structurePath: null,
  exportPaths: {
    wordSummaryPath: null,
    htmlMeetingMapPath: null
  }
};

const transcript: TranscriptSegment[] = [
  {
    id: "seg-1",
    trackId: "system",
    startTimeMs: 0,
    endTimeMs: 1100,
    text: "We decided to keep the export workflow in scope.",
    language: "en",
    confidence: 0.97
  }
];

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
        sourceRefs: [{ segmentId: "seg-1", startTimeMs: 0, endTimeMs: 1100 }]
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

describe("createMeetingStructureRequest", () => {
  test("builds a provider-neutral request from metadata and transcript segments", () => {
    expect(createMeetingStructureRequest({ metadata, transcript })).toEqual({
      meetingId: "meeting-1",
      title: "Roadmap review",
      startedAt: "2026-05-28T00:01:00.000Z",
      endedAt: "2026-05-28T00:11:00.000Z",
      outputLanguage: "bilingual",
      transcript
    });
  });
});

describe("extractValidatedMeetingStructure", () => {
  test("returns the client structure when it passes runtime validation", async () => {
    const client: MeetingStructureClient = {
      async extractStructure() {
        return validStructure();
      }
    };

    await expect(
      extractValidatedMeetingStructure(client, {
        metadata,
        transcript
      })
    ).resolves.toEqual(validStructure());
  });

  test("rejects schema-invalid client output", async () => {
    const client: MeetingStructureClient = {
      async extractStructure() {
        return {
          ...validStructure(),
          topics: [
            {
              ...validStructure().topics[0],
              sourceRefs: undefined
            }
          ]
        } as unknown as MeetingStructure;
      }
    };

    await expect(
      extractValidatedMeetingStructure(client, {
        metadata,
        transcript
      })
    ).rejects.toThrow("Invalid meeting structure");
  });
});
