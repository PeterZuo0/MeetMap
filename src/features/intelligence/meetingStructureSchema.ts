import type {
  ActionItemStatus,
  MeetingRelationType,
  MeetingStructure,
  RiskSeverity
} from "./meetingStructure";

export type MeetingStructureValidationResult = {
  success: boolean;
  errors: string[];
};

const RELATION_TYPES = [
  "contains",
  "leads_to",
  "supports",
  "blocks",
  "decides",
  "creates_action",
  "raises_question",
  "depends_on"
] satisfies MeetingRelationType[];

const ACTION_ITEM_STATUSES = ["open", "in_progress", "done"] satisfies ActionItemStatus[];
const RISK_SEVERITIES = ["low", "medium", "high"] satisfies RiskSeverity[];

export function validateMeetingStructure(input: unknown): MeetingStructureValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { success: false, errors: ["structure must be an object"] };
  }

  requireRecord(input, "metadata", errors);
  requireString(input, "summary", errors);
  requireArray(input, "topics", errors);
  requireArray(input, "decisions", errors);
  requireArray(input, "actionItems", errors);
  requireArray(input, "openQuestions", errors);
  requireArray(input, "risks", errors);
  requireArray(input, "relations", errors);
  requireOptionalArray(input, "points", errors);

  if (isRecord(input.metadata)) {
    validateMetadata(input.metadata, errors);
  }

  if (Array.isArray(input.topics)) {
    input.topics.forEach((topic, index) => validateTopic(topic, `topics[${index}]`, errors));
  }

  const topicIds = collectTopicIds(input as Partial<MeetingStructure>);

  if (Array.isArray(input.points)) {
    input.points.forEach((point, index) =>
      validatePoint(point, `points[${index}]`, topicIds, errors)
    );
  }

  if (Array.isArray(input.decisions)) {
    input.decisions.forEach((decision, index) =>
      validateDecision(decision, `decisions[${index}]`, topicIds, errors)
    );
  }

  if (Array.isArray(input.actionItems)) {
    input.actionItems.forEach((actionItem, index) =>
      validateActionItem(actionItem, `actionItems[${index}]`, topicIds, errors)
    );
  }

  if (Array.isArray(input.openQuestions)) {
    input.openQuestions.forEach((question, index) =>
      validateOpenQuestion(question, `openQuestions[${index}]`, topicIds, errors)
    );
  }

  if (Array.isArray(input.risks)) {
    input.risks.forEach((risk, index) => validateRisk(risk, `risks[${index}]`, topicIds, errors));
  }

  validateUniqueNodeIds(input as Partial<MeetingStructure>, errors);
  validateUniqueRelationIds(input.relations, errors);

  if (Array.isArray(input.relations)) {
    const nodeIds = collectNodeIds(input as Partial<MeetingStructure>);
    input.relations.forEach((relation, index) =>
      validateRelation(relation, `relations[${index}]`, nodeIds, errors)
    );
  }

  return { success: errors.length === 0, errors };
}

function validateMetadata(input: Record<string, unknown>, errors: string[]) {
  requireString(input, "meetingId", errors, "metadata.meetingId");
  requireString(input, "title", errors, "metadata.title");
  requireString(input, "startedAt", errors, "metadata.startedAt");
  requireOptionalString(input, "endedAt", errors, "metadata.endedAt");
  requireString(input, "sourceLanguage", errors, "metadata.sourceLanguage");
  requireString(input, "outputLanguage", errors, "metadata.outputLanguage");
}

function validateTopic(input: unknown, path: string, errors: string[]) {
  if (!requireItemRecord(input, path, errors)) {
    return;
  }

  requireString(input, "id", errors, `${path}.id`);
  requireLiteral(input, "type", "topic", errors, `${path}.type`);
  requireString(input, "title", errors, `${path}.title`);
  requireString(input, "summary", errors, `${path}.summary`);
  validateSourceRefs(input.sourceRefs, `${path}.sourceRefs`, errors);
}

function validatePoint(input: unknown, path: string, topicIds: Set<string>, errors: string[]) {
  if (!requireItemRecord(input, path, errors)) {
    return;
  }

  requireString(input, "id", errors, `${path}.id`);
  requireLiteral(input, "type", "point", errors, `${path}.type`);
  requireString(input, "text", errors, `${path}.text`);
  requireOptionalTopicId(input, topicIds, errors, `${path}.topicId`);
  validateSourceRefs(input.sourceRefs, `${path}.sourceRefs`, errors);
}

function validateDecision(input: unknown, path: string, topicIds: Set<string>, errors: string[]) {
  if (!requireItemRecord(input, path, errors)) {
    return;
  }

  requireString(input, "id", errors, `${path}.id`);
  requireLiteral(input, "type", "decision", errors, `${path}.type`);
  requireString(input, "text", errors, `${path}.text`);
  requireOptionalTopicId(input, topicIds, errors, `${path}.topicId`);
  validateSourceRefs(input.sourceRefs, `${path}.sourceRefs`, errors);
}

function validateActionItem(input: unknown, path: string, topicIds: Set<string>, errors: string[]) {
  if (!requireItemRecord(input, path, errors)) {
    return;
  }

  requireString(input, "id", errors, `${path}.id`);
  requireLiteral(input, "type", "action", errors, `${path}.type`);
  requireString(input, "text", errors, `${path}.text`);
  requireOptionalString(input, "owner", errors, `${path}.owner`);
  requireOptionalString(input, "dueDate", errors, `${path}.dueDate`);
  requireOneOf(input, "status", ACTION_ITEM_STATUSES, errors, `${path}.status`);
  requireOptionalTopicId(input, topicIds, errors, `${path}.topicId`);
  validateSourceRefs(input.sourceRefs, `${path}.sourceRefs`, errors);
}

function validateOpenQuestion(input: unknown, path: string, topicIds: Set<string>, errors: string[]) {
  if (!requireItemRecord(input, path, errors)) {
    return;
  }

  requireString(input, "id", errors, `${path}.id`);
  requireLiteral(input, "type", "question", errors, `${path}.type`);
  requireString(input, "text", errors, `${path}.text`);
  requireOptionalTopicId(input, topicIds, errors, `${path}.topicId`);
  validateSourceRefs(input.sourceRefs, `${path}.sourceRefs`, errors);
}

function validateRisk(input: unknown, path: string, topicIds: Set<string>, errors: string[]) {
  if (!requireItemRecord(input, path, errors)) {
    return;
  }

  requireString(input, "id", errors, `${path}.id`);
  requireLiteral(input, "type", "risk", errors, `${path}.type`);
  requireString(input, "text", errors, `${path}.text`);
  requireOneOf(input, "severity", RISK_SEVERITIES, errors, `${path}.severity`);
  requireOptionalTopicId(input, topicIds, errors, `${path}.topicId`);
  validateSourceRefs(input.sourceRefs, `${path}.sourceRefs`, errors);
}

function validateRelation(
  input: unknown,
  path: string,
  nodeIds: Set<string>,
  errors: string[]
) {
  if (!requireItemRecord(input, path, errors)) {
    return;
  }

  requireString(input, "id", errors, `${path}.id`);
  requireOneOf(input, "type", RELATION_TYPES, errors, `${path}.type`);
  requireString(input, "fromId", errors, `${path}.fromId`);
  requireString(input, "toId", errors, `${path}.toId`);

  if (typeof input.fromId === "string" && !nodeIds.has(input.fromId)) {
    errors.push(`${path}.fromId must reference an existing node`);
  }

  if (typeof input.toId === "string" && !nodeIds.has(input.toId)) {
    errors.push(`${path}.toId must reference an existing node`);
  }
}

function validateSourceRefs(input: unknown, path: string, errors: string[]) {
  if (!Array.isArray(input)) {
    errors.push(`${path} is required`);
    return;
  }

  input.forEach((sourceRef, index) => {
    const sourceRefPath = `${path}[${index}]`;

    if (!requireItemRecord(sourceRef, sourceRefPath, errors)) {
      return;
    }

    requireString(sourceRef, "segmentId", errors, `${sourceRefPath}.segmentId`);
    requireNumber(sourceRef, "startTimeMs", errors, `${sourceRefPath}.startTimeMs`);
    requireNumber(sourceRef, "endTimeMs", errors, `${sourceRefPath}.endTimeMs`);
  });
}

function collectNodeIds(input: Partial<MeetingStructure>): Set<string> {
  const nodeIds = new Set<string>();

  if (isRecord(input.metadata) && typeof input.metadata.meetingId === "string") {
    nodeIds.add(input.metadata.meetingId);
  }

  addNodeIds(nodeIds, input.topics);
  addNodeIds(nodeIds, input.points);
  addNodeIds(nodeIds, input.decisions);
  addNodeIds(nodeIds, input.actionItems);
  addNodeIds(nodeIds, input.openQuestions);
  addNodeIds(nodeIds, input.risks);

  return nodeIds;
}

function collectTopicIds(input: Partial<MeetingStructure>): Set<string> {
  const topicIds = new Set<string>();

  addNodeIds(topicIds, input.topics);

  return topicIds;
}

function addNodeIds(nodeIds: Set<string>, nodes: unknown) {
  if (!Array.isArray(nodes)) {
    return;
  }

  nodes.forEach((node) => {
    if (isRecord(node) && typeof node.id === "string") {
      nodeIds.add(node.id);
    }
  });
}

function validateUniqueNodeIds(input: Partial<MeetingStructure>, errors: string[]) {
  const seenIds = new Set<string>();

  validateNodeCollectionIds(input.topics, "topics", seenIds, errors);
  validateNodeCollectionIds(input.points, "points", seenIds, errors);
  validateNodeCollectionIds(input.decisions, "decisions", seenIds, errors);
  validateNodeCollectionIds(input.actionItems, "actionItems", seenIds, errors);
  validateNodeCollectionIds(input.openQuestions, "openQuestions", seenIds, errors);
  validateNodeCollectionIds(input.risks, "risks", seenIds, errors);
}

function validateNodeCollectionIds(
  nodes: unknown,
  collectionName: string,
  seenIds: Set<string>,
  errors: string[]
) {
  if (!Array.isArray(nodes)) {
    return;
  }

  nodes.forEach((node, index) => {
    if (!isRecord(node) || typeof node.id !== "string" || node.id.trim().length === 0) {
      return;
    }

    if (seenIds.has(node.id)) {
      errors.push(`${collectionName}[${index}].id must be unique across meeting nodes`);
      return;
    }

    seenIds.add(node.id);
  });
}

function validateUniqueRelationIds(relations: unknown, errors: string[]) {
  if (!Array.isArray(relations)) {
    return;
  }

  const seenIds = new Set<string>();

  relations.forEach((relation, index) => {
    if (
      !isRecord(relation) ||
      typeof relation.id !== "string" ||
      relation.id.trim().length === 0
    ) {
      return;
    }

    if (seenIds.has(relation.id)) {
      errors.push(`relations[${index}].id must be unique across relations`);
      return;
    }

    seenIds.add(relation.id);
  });
}

function requireOptionalTopicId(
  input: Record<string, unknown>,
  topicIds: Set<string>,
  errors: string[],
  path: string
) {
  requireOptionalString(input, "topicId", errors, path);

  if (typeof input.topicId === "string" && !topicIds.has(input.topicId)) {
    errors.push(`${path} must reference an existing topic`);
  }
}

function requireRecord(input: Record<string, unknown>, key: string, errors: string[]) {
  if (!isRecord(input[key])) {
    errors.push(`${key} is required`);
  }
}

function requireItemRecord(
  input: unknown,
  path: string,
  errors: string[]
): input is Record<string, unknown> {
  if (!isRecord(input)) {
    errors.push(`${path} must be an object`);
    return false;
  }

  return true;
}

function requireArray(input: Record<string, unknown>, key: string, errors: string[]) {
  if (!Array.isArray(input[key])) {
    errors.push(`${key} is required`);
  }
}

function requireOptionalArray(input: Record<string, unknown>, key: string, errors: string[]) {
  if (input[key] !== undefined && !Array.isArray(input[key])) {
    errors.push(`${key} must be an array`);
  }
}

function requireString(
  input: Record<string, unknown>,
  key: string,
  errors: string[],
  path = key
) {
  if (typeof input[key] !== "string" || input[key].trim().length === 0) {
    errors.push(`${path} is required`);
  }
}

function requireOptionalString(
  input: Record<string, unknown>,
  key: string,
  errors: string[],
  path = key
) {
  if (input[key] !== undefined && typeof input[key] !== "string") {
    errors.push(`${path} must be a string`);
  }
}

function requireNumber(
  input: Record<string, unknown>,
  key: string,
  errors: string[],
  path = key
) {
  if (typeof input[key] !== "number" || !Number.isFinite(input[key])) {
    errors.push(`${path} is required`);
  }
}

function requireLiteral<T extends string>(
  input: Record<string, unknown>,
  key: string,
  expected: T,
  errors: string[],
  path = key
) {
  if (input[key] !== expected) {
    errors.push(`${path} must be ${expected}`);
  }
}

function requireOneOf<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowedValues: readonly T[],
  errors: string[],
  path = key
) {
  if (!allowedValues.includes(input[key] as T)) {
    errors.push(`${path} must be one of ${allowedValues.join(", ")}`);
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
