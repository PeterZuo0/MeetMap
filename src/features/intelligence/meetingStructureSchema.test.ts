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

test("accepts and validates paragraph-based localized analysis", () => {
  const structure: MeetingStructure = {
    ...validStructure(),
    analysisByLanguage: {
      zh: {
        overview: ["团队确认了 MVP 范围。"],
        purpose: ["明确发布优先级。"],
        topics: [{ title: "MVP 范围", paragraphs: ["团队讨论了首个版本的范围。"] }],
        technicalSummary: ["优先完成 Word 导出。"]
      },
      en: {
        overview: ["The team confirmed the MVP scope."],
        purpose: ["The meeting clarified release priorities."],
        topics: [{ title: "MVP scope", paragraphs: ["The team discussed the first release scope."] }],
        technicalSummary: ["Word export is the first implementation priority."]
      }
    }
  };

  expect(validateMeetingStructure(structure)).toEqual({ success: true, errors: [] });

  structure.analysisByLanguage!.en.topics[0].paragraphs = [""];
  expect(validateMeetingStructure(structure)).toEqual({
    success: false,
    errors: ["analysisByLanguage.en.topics[0].paragraphs[0] must be a non-empty string"]
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

test("rejects topic references that do not point to existing topics", () => {
  const structure = validStructure();
  structure.decisions[0] = { ...structure.decisions[0], topicId: "missing-topic" };
  structure.actionItems[0] = { ...structure.actionItems[0], topicId: "missing-topic" };
  structure.openQuestions[0] = { ...structure.openQuestions[0], topicId: "missing-topic" };
  structure.risks[0] = { ...structure.risks[0], topicId: "missing-topic" };

  expect(validateMeetingStructure(structure)).toEqual({
    success: false,
    errors: [
      "decisions[0].topicId must reference an existing topic",
      "actionItems[0].topicId must reference an existing topic",
      "openQuestions[0].topicId must reference an existing topic",
      "risks[0].topicId must reference an existing topic"
    ]
  });
});

test("rejects duplicate node ids across collections", () => {
  const structure = validStructure();
  structure.topics.push({
    id: "decision-1",
    type: "topic",
    title: "Duplicate decision id",
    summary: "This topic reuses the decision node id.",
    sourceRefs: [{ segmentId: "seg-6", startTimeMs: 20_000, endTimeMs: 21_000 }]
  });
  structure.risks.push({
    id: "action-1",
    type: "risk",
    text: "This risk reuses the action node id.",
    severity: "low",
    topicId: "topic-1",
    sourceRefs: [{ segmentId: "seg-7", startTimeMs: 21_000, endTimeMs: 22_000 }]
  });

  expect(validateMeetingStructure(structure)).toEqual({
    success: false,
    errors: [
      "decisions[0].id must be unique across meeting nodes",
      "risks[1].id must be unique across meeting nodes"
    ]
  });
});

test("rejects duplicate relation ids", () => {
  const structure = validStructure();
  structure.relations[1] = { ...structure.relations[1], id: "rel-1" };

  expect(validateMeetingStructure(structure)).toEqual({
    success: false,
    errors: ["relations[1].id must be unique across relations"]
  });
});

test("accepts point nodes and allows relations to reference them", () => {
  const structure = {
    ...validStructure(),
    points: [
      {
        id: "point-1",
        type: "point",
        text: "HTML map needs standalone supporting points.",
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-6", startTimeMs: 20_000, endTimeMs: 24_000 }]
      }
    ],
    relations: [
      ...validStructure().relations,
      { id: "rel-6", type: "supports", fromId: "point-1", toId: "decision-1" }
    ]
  };

  expect(validateMeetingStructure(structure)).toEqual({
    success: true,
    errors: []
  });
});
