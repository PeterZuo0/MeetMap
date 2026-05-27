import type { MeetingStructure } from "../../intelligence/meetingStructure";
import { buildWordExportSections, createWordSummaryDocx } from "./wordExport";

function meetingStructure(): MeetingStructure {
  return {
    metadata: {
      meetingId: "meeting-1",
      title: "Product planning",
      startedAt: "2026-05-27T09:00:00.000Z",
      endedAt: "2026-05-27T10:00:00.000Z",
      sourceLanguage: "en",
      outputLanguage: "en"
    },
    summary: "The team aligned on MVP priorities and follow-up actions.",
    topics: [
      {
        id: "topic-1",
        type: "topic",
        title: "MVP scope",
        summary: "The team reviewed scope for the first release.",
        sourceRefs: [{ segmentId: "seg-1", startTimeMs: 1_000, endTimeMs: 5_000 }]
      },
      {
        id: "topic-2",
        type: "topic",
        title: "Export workflow",
        summary: "Word output should use the structured meeting JSON.",
        sourceRefs: [{ segmentId: "seg-2", startTimeMs: 5_000, endTimeMs: 8_000 }]
      }
    ],
    decisions: [
      {
        id: "decision-1",
        type: "decision",
        text: "Ship Word export before HTML map export.",
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-3", startTimeMs: 8_000, endTimeMs: 12_000 }]
      }
    ],
    actionItems: [
      {
        id: "action-1",
        type: "action",
        text: "Draft the Word export mapper.",
        owner: "Peter",
        dueDate: "2026-06-03",
        status: "open",
        topicId: "topic-2",
        sourceRefs: [{ segmentId: "seg-4", startTimeMs: 12_000, endTimeMs: 16_000 }]
      }
    ],
    openQuestions: [
      {
        id: "question-1",
        type: "question",
        text: "Which HTML graph layout should the MVP use?",
        topicId: "topic-2",
        sourceRefs: [{ segmentId: "seg-5", startTimeMs: 16_000, endTimeMs: 20_000 }]
      }
    ],
    risks: [
      {
        id: "risk-1",
        type: "risk",
        text: "Export rendering may drift between Word and HTML outputs.",
        severity: "medium",
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-6", startTimeMs: 20_000, endTimeMs: 24_000 }]
      }
    ],
    relations: [
      { id: "rel-1", type: "contains", fromId: "meeting-1", toId: "topic-1" },
      { id: "rel-2", type: "contains", fromId: "meeting-1", toId: "topic-2" }
    ]
  };
}

test("maps meeting structure JSON to ordered Word summary sections", () => {
  expect(buildWordExportSections(meetingStructure())).toEqual([
    {
      title: "Meeting Overview",
      items: [
        "Title: Product planning",
        "Started: 2026-05-27T09:00:00.000Z",
        "Ended: 2026-05-27T10:00:00.000Z",
        "Source language: en",
        "Output language: en"
      ]
    },
    {
      title: "Executive Summary",
      items: ["The team aligned on MVP priorities and follow-up actions."]
    },
    {
      title: "Key Topics",
      items: [
        "MVP scope: The team reviewed scope for the first release.",
        "Export workflow: Word output should use the structured meeting JSON."
      ]
    },
    {
      title: "Decisions",
      items: ["Ship Word export before HTML map export."]
    },
    {
      title: "Action Items",
      items: ["Draft the Word export mapper. Owner: Peter. Due: 2026-06-03. Status: open."]
    },
    {
      title: "Open Questions",
      items: ["Which HTML graph layout should the MVP use?"]
    },
    {
      title: "Risks and Follow-ups",
      items: ["Export rendering may drift between Word and HTML outputs. Severity: medium."]
    }
  ]);
});

test("creates renderer-safe DOCX bytes from meeting structure sections", async () => {
  const bytes = await createWordSummaryDocx(meetingStructure());

  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes).not.toBeInstanceOf(Buffer);
  expect(bytes.byteLength).toBeGreaterThan(0);
  expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
});
