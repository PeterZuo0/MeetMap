import { validateMeetingStructure } from "./meetingStructureSchema";
import type { MeetingStructure } from "./meetingStructure";

function validStructure(): MeetingStructure {
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
      }
    ],
    decisions: [
      {
        id: "decision-1",
        type: "decision",
        text: "Ship Word export before HTML map export.",
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-2", startTimeMs: 5_000, endTimeMs: 8_000 }]
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
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-3", startTimeMs: 8_000, endTimeMs: 12_000 }]
      }
    ],
    openQuestions: [
      {
        id: "question-1",
        type: "question",
        text: "Which HTML graph layout should the MVP use?",
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-4", startTimeMs: 12_000, endTimeMs: 16_000 }]
      }
    ],
    risks: [
      {
        id: "risk-1",
        type: "risk",
        text: "Export rendering may drift between Word and HTML outputs.",
        severity: "medium",
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-5", startTimeMs: 16_000, endTimeMs: 20_000 }]
      }
    ],
    relations: [
      { id: "rel-1", type: "contains", fromId: "meeting-1", toId: "topic-1" },
      { id: "rel-2", type: "decides", fromId: "topic-1", toId: "decision-1" },
      { id: "rel-3", type: "creates_action", fromId: "decision-1", toId: "action-1" },
      { id: "rel-4", type: "raises_question", fromId: "topic-1", toId: "question-1" },
      { id: "rel-5", type: "blocks", fromId: "risk-1", toId: "action-1" }
    ]
  };
}

test("accepts a complete valid meeting structure", () => {
  expect(validateMeetingStructure(validStructure())).toEqual({
    success: true,
    errors: []
  });
});

test("rejects missing required top-level fields", () => {
  const structure = validStructure() as Partial<MeetingStructure>;
  delete structure.summary;

  expect(validateMeetingStructure(structure)).toEqual({
    success: false,
    errors: ["summary is required"]
  });
});

test("rejects invalid node types", () => {
  const structure = validStructure();
  structure.topics[0] = { ...structure.topics[0], type: "point" as never };

  expect(validateMeetingStructure(structure)).toEqual({
    success: false,
    errors: ["topics[0].type must be topic"]
  });
});

test("rejects invalid relation types", () => {
  const structure = validStructure();
  structure.relations[0] = { ...structure.relations[0], type: "mentions" as never };

  expect(validateMeetingStructure(structure)).toEqual({
    success: false,
    errors: [
      "relations[0].type must be one of contains, leads_to, supports, blocks, decides, creates_action, raises_question, depends_on"
    ]
  });
});

test("rejects relations that reference unknown nodes", () => {
  const structure = validStructure();
  structure.relations[0] = { ...structure.relations[0], toId: "missing-topic" };

  expect(validateMeetingStructure(structure)).toEqual({
    success: false,
    errors: ["relations[0].toId must reference an existing node"]
  });
});
