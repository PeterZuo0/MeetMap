import type { MeetingStructure } from "../../intelligence/meetingStructure";
import { buildMeetingGraph } from "./graphModel";
import { createHtmlMeetingMap, createHtmlMeetingMapFromGraph } from "./htmlMapExport";

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
    points: [
      {
        id: "point-1",
        type: "point",
        text: "The HTML map should be standalone.",
        topicId: "topic-2",
        sourceRefs: [{ segmentId: "seg-3", startTimeMs: 8_000, endTimeMs: 10_000 }]
      }
    ],
    decisions: [
      {
        id: "decision-1",
        type: "decision",
        text: "Ship Word export before HTML map export.",
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-4", startTimeMs: 10_000, endTimeMs: 12_000 }]
      }
    ],
    actionItems: [
      {
        id: "action-1",
        type: "action",
        text: "Draft the HTML export mapper.",
        owner: "Peter",
        dueDate: "2026-06-03",
        status: "open",
        topicId: "topic-2",
        sourceRefs: [{ segmentId: "seg-5", startTimeMs: 12_000, endTimeMs: 16_000 }]
      }
    ],
    openQuestions: [
      {
        id: "question-1",
        type: "question",
        text: "Which HTML graph layout should the MVP use?",
        topicId: "topic-2",
        sourceRefs: [{ segmentId: "seg-6", startTimeMs: 16_000, endTimeMs: 20_000 }]
      }
    ],
    risks: [
      {
        id: "risk-1",
        type: "risk",
        text: "Export rendering may drift between Word and HTML outputs.",
        severity: "medium",
        topicId: "topic-1",
        sourceRefs: [{ segmentId: "seg-7", startTimeMs: 20_000, endTimeMs: 24_000 }]
      }
    ],
    relations: [
      { id: "rel-1", type: "supports", fromId: "point-1", toId: "decision-1" },
      { id: "rel-2", type: "creates_action", fromId: "decision-1", toId: "action-1" },
      { id: "rel-3", type: "blocks", fromId: "risk-1", toId: "action-1" }
    ]
  };
}

test("builds graph nodes for meeting topics points decisions actions questions and risks", () => {
  const graph = buildMeetingGraph(meetingStructure());

  expect(graph.nodes).toEqual([
    expect.objectContaining({
      id: "meeting-1",
      type: "meeting",
      title: "Product planning",
      body: "The team aligned on MVP priorities and follow-up actions."
    }),
    expect.objectContaining({
      id: "topic-1",
      type: "topic",
      title: "MVP scope",
      body: "The team reviewed scope for the first release."
    }),
    expect.objectContaining({
      id: "topic-2",
      type: "topic",
      title: "Export workflow",
      body: "Word output should use the structured meeting JSON."
    }),
    expect.objectContaining({
      id: "point-1",
      type: "point",
      title: "Point",
      body: "The HTML map should be standalone."
    }),
    expect.objectContaining({
      id: "decision-1",
      type: "decision",
      title: "Decision",
      body: "Ship Word export before HTML map export."
    }),
    expect.objectContaining({
      id: "action-1",
      type: "action",
      title: "Action",
      body: "Draft the HTML export mapper.",
      metadata: { owner: "Peter", dueDate: "2026-06-03", status: "open" }
    }),
    expect.objectContaining({
      id: "question-1",
      type: "question",
      title: "Question",
      body: "Which HTML graph layout should the MVP use?"
    }),
    expect.objectContaining({
      id: "risk-1",
      type: "risk",
      title: "Risk",
      body: "Export rendering may drift between Word and HTML outputs.",
      metadata: { severity: "medium" }
    })
  ]);
});

test("builds hierarchy edges and explicit relation edges", () => {
  const graph = buildMeetingGraph(meetingStructure());

  expect(graph.edges).toEqual([
    { id: "hierarchy:meeting-1->topic-1", type: "contains", fromId: "meeting-1", toId: "topic-1", explicit: false },
    { id: "hierarchy:meeting-1->topic-2", type: "contains", fromId: "meeting-1", toId: "topic-2", explicit: false },
    { id: "hierarchy:topic-2->point-1", type: "contains", fromId: "topic-2", toId: "point-1", explicit: false },
    { id: "hierarchy:topic-1->decision-1", type: "contains", fromId: "topic-1", toId: "decision-1", explicit: false },
    { id: "hierarchy:topic-2->action-1", type: "contains", fromId: "topic-2", toId: "action-1", explicit: false },
    { id: "hierarchy:topic-2->question-1", type: "contains", fromId: "topic-2", toId: "question-1", explicit: false },
    { id: "hierarchy:topic-1->risk-1", type: "contains", fromId: "topic-1", toId: "risk-1", explicit: false },
    { id: "rel-1", type: "supports", fromId: "point-1", toId: "decision-1", explicit: true },
    { id: "rel-2", type: "creates_action", fromId: "decision-1", toId: "action-1", explicit: true },
    { id: "rel-3", type: "blocks", fromId: "risk-1", toId: "action-1", explicit: true }
  ]);
});

test("creates standalone HTML with embedded graph data", () => {
  const html = createHtmlMeetingMap(meetingStructure());
  const graph = buildMeetingGraph(meetingStructure());

  expect(html).toContain("<!doctype html>");
  expect(html).toContain("id=\"meetmap-graph-data\"");
  expect(html).toContain(JSON.stringify(graph).replace(/</g, "\\u003c"));
  expect(html).toContain("Product planning");
});

test("creates HTML graph data with disabled export nodes removed", () => {
  const html = createHtmlMeetingMap(meetingStructure(), {
    actions: false,
    audio: false,
    decisions: false,
    map: true,
    timestamps: false,
    transcript: false
  });
  const graphJson = html.match(
    /<script id="meetmap-graph-data" type="application\/json">(.+)<\/script>/
  )?.[1];

  expect(graphJson).toBeDefined();
  const graph = JSON.parse(graphJson ?? "{}") as ReturnType<typeof buildMeetingGraph>;
  expect(graph.nodes.map((node) => node.id)).not.toContain("decision-1");
  expect(graph.nodes.map((node) => node.id)).not.toContain("action-1");
  expect(graph.nodes.find((node) => node.id === "meeting-1")?.metadata).toEqual({
    sourceLanguage: "en",
    outputLanguage: "en"
  });
  expect(graph.edges.some((edge) => edge.fromId === "decision-1" || edge.toId === "action-1")).toBe(false);
});

test("keeps selected non-map nodes valid when the structure map is disabled", () => {
  const html = createHtmlMeetingMap(meetingStructure(), {
    actions: true,
    audio: false,
    decisions: true,
    map: false,
    timestamps: true,
    transcript: false
  });
  const graphJson = html.match(
    /<script id="meetmap-graph-data" type="application\/json">(.+)<\/script>/
  )?.[1];
  const graph = JSON.parse(graphJson ?? "{}") as ReturnType<typeof buildMeetingGraph>;

  expect(graph.nodes.map((node) => node.id)).not.toContain("topic-1");
  expect(graph.nodes.map((node) => node.id)).not.toContain("topic-2");
  expect(graph.nodes.find((node) => node.id === "decision-1")).toEqual(
    expect.not.objectContaining({ parentId: expect.anything() })
  );
  expect(graph.nodes.find((node) => node.id === "action-1")).toEqual(
    expect.not.objectContaining({ parentId: expect.anything() })
  );
});

test("fails clearly when a structure child references a missing topic", () => {
  const structure = meetingStructure();
  structure.decisions[0] = {
    ...structure.decisions[0],
    topicId: "missing-topic"
  };

  expect(() => buildMeetingGraph(structure)).toThrow(
    'Meeting graph contains node "decision-1" with missing parent "missing-topic".'
  );
});

test("fails clearly when HTML export receives a graph with a missing parent", () => {
  const graph = buildMeetingGraph(meetingStructure());
  graph.nodes = graph.nodes.map((node) =>
    node.id === "decision-1" ? { ...node, parentId: "missing-topic" } : node
  );

  expect(() => createHtmlMeetingMapFromGraph(graph)).toThrow(
    'Meeting graph contains node "decision-1" with missing parent "missing-topic".'
  );
});
