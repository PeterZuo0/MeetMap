import type {
  MeetingActionItem,
  MeetingDecision,
  MeetingNodeType,
  MeetingOpenQuestion,
  MeetingPoint,
  MeetingRelationType,
  MeetingRisk,
  MeetingStructure
} from "../../intelligence/meetingStructure.js";

export type MeetingGraphNode = {
  id: string;
  type: MeetingNodeType;
  title: string;
  body: string;
  parentId?: string;
  community?: string;
  degree?: number;
  radius?: number;
  weight?: number;
  metadata?: Record<string, string>;
};

export type MeetingGraphEdge = {
  id: string;
  type: MeetingRelationType;
  fromId: string;
  toId: string;
  explicit: boolean;
  weight?: number;
};

export type MeetingGraph = {
  nodes: MeetingGraphNode[];
  edges: MeetingGraphEdge[];
};

type ChildNode = MeetingPoint | MeetingDecision | MeetingActionItem | MeetingOpenQuestion | MeetingRisk;

export function buildMeetingGraph(structure: MeetingStructure): MeetingGraph {
  const nodes: MeetingGraphNode[] = [
    {
      id: structure.metadata.meetingId,
      type: "meeting",
      title: structure.metadata.title,
      body: structure.summary,
      metadata: {
        startedAt: structure.metadata.startedAt,
        ...(structure.metadata.endedAt ? { endedAt: structure.metadata.endedAt } : {}),
        sourceLanguage: structure.metadata.sourceLanguage,
        outputLanguage: structure.metadata.outputLanguage
      }
    },
    ...structure.topics.map((topic) => ({
      id: topic.id,
      type: topic.type,
      title: topic.title,
      body: topic.summary,
      parentId: structure.metadata.meetingId
    })),
    ...(structure.points ?? []).map((point) => childNode(point, "Point")),
    ...structure.decisions.map((decision) => childNode(decision, "Decision")),
    ...structure.actionItems.map((actionItem) =>
      childNode(actionItem, "Action", {
        ...(actionItem.owner ? { owner: actionItem.owner } : {}),
        ...(actionItem.dueDate ? { dueDate: actionItem.dueDate } : {}),
        status: actionItem.status
      })
    ),
    ...structure.openQuestions.map((question) => childNode(question, "Question")),
    ...structure.risks.map((risk) => childNode(risk, "Risk", { severity: risk.severity }))
  ];

  const edges: MeetingGraphEdge[] = [
    ...structure.topics.map((topic) =>
      hierarchyEdge(structure.metadata.meetingId, topic.id)
    ),
    ...(structure.points ?? []).flatMap((point) => topicHierarchyEdge(point)),
    ...structure.decisions.flatMap((decision) => topicHierarchyEdge(decision)),
    ...structure.actionItems.flatMap((actionItem) => topicHierarchyEdge(actionItem)),
    ...structure.openQuestions.flatMap((question) => topicHierarchyEdge(question)),
    ...structure.risks.flatMap((risk) => topicHierarchyEdge(risk)),
    ...structure.relations.map((relation) => ({
      id: relation.id,
      type: relation.type,
      fromId: relation.fromId,
      toId: relation.toId,
      explicit: true
    }))
  ];

  const graph = enrichMeetingGraph({ nodes, edges });
  assertValidMeetingGraph(graph);
  return graph;
}

export function enrichMeetingGraph(graph: MeetingGraph): MeetingGraph {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const parentById = new Map(graph.nodes.map((node) => [node.id, node.parentId]));
  const degreeById = new Map(graph.nodes.map((node) => [node.id, 0]));
  const edges = graph.edges.map((edge) => {
    degreeById.set(edge.fromId, (degreeById.get(edge.fromId) ?? 0) + 1);
    degreeById.set(edge.toId, (degreeById.get(edge.toId) ?? 0) + 1);
    return {
      ...edge,
      weight: edge.explicit ? 3 : 1
    };
  });

  const nodes = graph.nodes.map((node) => {
    const degree = degreeById.get(node.id) ?? 0;
    return {
      ...node,
      community: resolveCommunity(node, nodeById, parentById),
      degree,
      radius: radiusForNode(node.type, degree),
      weight: weightForNode(node.type, degree)
    };
  });

  return { nodes, edges };
}

export function assertValidMeetingGraph(graph: MeetingGraph): void {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));

  graph.nodes.forEach((node) => {
    if (node.parentId && !nodeIds.has(node.parentId)) {
      throw new Error(
        `Meeting graph contains node "${node.id}" with missing parent "${node.parentId}".`
      );
    }
  });
}

function childNode(
  node: ChildNode,
  title: string,
  metadata?: Record<string, string>
): MeetingGraphNode {
  return {
    id: node.id,
    type: node.type,
    title,
    body: node.text,
    ...(node.topicId ? { parentId: node.topicId } : {}),
    ...(metadata ? { metadata } : {})
  };
}

function hierarchyEdge(fromId: string, toId: string): MeetingGraphEdge {
  return {
    id: `hierarchy:${fromId}->${toId}`,
    type: "contains",
    fromId,
    toId,
    explicit: false
  };
}

function topicHierarchyEdge(node: ChildNode): MeetingGraphEdge[] {
  return node.topicId ? [hierarchyEdge(node.topicId, node.id)] : [];
}

function resolveCommunity(
  node: MeetingGraphNode,
  nodeById: Map<string, MeetingGraphNode>,
  parentById: Map<string, string | undefined>
): string {
  if (node.type === "meeting" || node.type === "topic") {
    return node.id;
  }

  let currentId = node.parentId;
  while (currentId) {
    const currentNode = nodeById.get(currentId);
    if (currentNode?.type === "topic") {
      return currentId;
    }

    const parentId = parentById.get(currentId);
    if (!parentId) {
      return currentId;
    }
    currentId = parentId;
  }

  return node.id;
}

function radiusForNode(type: MeetingNodeType, degree: number): number {
  if (type === "meeting") {
    return 34;
  }

  if (type === "topic") {
    return 24 + Math.min(degree, 4);
  }

  return 17 + Math.min(degree, 3);
}

function weightForNode(type: MeetingNodeType, degree: number): number {
  if (type === "meeting") {
    return 4 + degree;
  }

  if (type === "topic") {
    return 2 + degree;
  }

  return 1 + degree;
}
