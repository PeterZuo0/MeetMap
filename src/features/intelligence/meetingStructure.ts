export type MeetingNodeType =
  | "meeting"
  | "topic"
  | "point"
  | "decision"
  | "action"
  | "question"
  | "risk";

export type MeetingRelationType =
  | "contains"
  | "leads_to"
  | "supports"
  | "blocks"
  | "decides"
  | "creates_action"
  | "raises_question"
  | "depends_on";

export type SourceReference = {
  segmentId: string;
  startTimeMs: number;
  endTimeMs: number;
};

export type MeetingMetadata = {
  meetingId: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  sourceLanguage: string;
  outputLanguage: string;
};

export type MeetingTopic = {
  id: string;
  type: "topic";
  title: string;
  summary: string;
  sourceRefs: SourceReference[];
};

export type MeetingDecision = {
  id: string;
  type: "decision";
  text: string;
  topicId?: string;
  sourceRefs: SourceReference[];
};

export type ActionItemStatus = "open" | "in_progress" | "done";

export type MeetingActionItem = {
  id: string;
  type: "action";
  text: string;
  owner?: string;
  dueDate?: string;
  status: ActionItemStatus;
  topicId?: string;
  sourceRefs: SourceReference[];
};

export type MeetingOpenQuestion = {
  id: string;
  type: "question";
  text: string;
  topicId?: string;
  sourceRefs: SourceReference[];
};

export type RiskSeverity = "low" | "medium" | "high";

export type MeetingRisk = {
  id: string;
  type: "risk";
  text: string;
  severity: RiskSeverity;
  topicId?: string;
  sourceRefs: SourceReference[];
};

export type MeetingRelation = {
  id: string;
  type: MeetingRelationType;
  fromId: string;
  toId: string;
};

export type MeetingStructure = {
  metadata: MeetingMetadata;
  summary: string;
  topics: MeetingTopic[];
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  openQuestions: MeetingOpenQuestion[];
  risks: MeetingRisk[];
  relations: MeetingRelation[];
};
