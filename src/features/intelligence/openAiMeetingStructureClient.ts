import type { MeetingStructure } from "./meetingStructure";
import type {
  MeetingStructureClient,
  MeetingStructureRequest
} from "./meetingStructureClient";
import { validateMeetingStructure } from "./meetingStructureSchema";

export type OpenAiJsonSchemaFormat = {
  type: "json_schema";
  name: "meeting_structure";
  strict: true;
  schema: Record<string, unknown>;
};

export type OpenAiMeetingStructureRequest = {
  apiKey: string;
  model: string;
  instructions: string;
  input: string;
  text: {
    format: OpenAiJsonSchemaFormat;
  };
};

export type OpenAiMeetingStructureResponse = {
  outputJson?: unknown;
  outputText?: string;
};

export type OpenAiMeetingStructureRequester = (
  request: OpenAiMeetingStructureRequest
) => Promise<OpenAiMeetingStructureResponse>;

export type OpenAiMeetingStructureClientOptions = {
  apiKey: string;
  model: string;
  requestStructure: OpenAiMeetingStructureRequester;
};

export function createOpenAiMeetingStructureClient({
  apiKey,
  model,
  requestStructure
}: OpenAiMeetingStructureClientOptions): MeetingStructureClient {
  return {
    async extractStructure(request) {
      const response = await requestStructure({
        apiKey,
        model,
        instructions: createInstructions(request),
        input: createInput(request),
        text: {
          format: {
            type: "json_schema",
            name: "meeting_structure",
            strict: true,
            schema: MEETING_STRUCTURE_JSON_SCHEMA
          }
        }
      });

      const structure = normalizeProviderStructureOutput(parseProviderOutput(response));
      const validation = validateMeetingStructure(structure);

      if (!validation.success) {
        throw new Error(`Invalid meeting structure: ${validation.errors.join("; ")}`);
      }

      return structure as MeetingStructure;
    }
  };
}

function createInstructions(request: MeetingStructureRequest): string {
  return [
    "Extract a structured meeting summary from the transcript.",
    `Write the final summary, topic titles, decisions, action items, questions, and risks in ${request.outputLanguage}.`,
    "Preserve transcript source references by using the provided segment ids and timestamps.",
    "Return only JSON that matches the meeting_structure schema."
  ].join(" ");
}

function createInput(request: MeetingStructureRequest): string {
  return JSON.stringify({
    meeting: {
      meetingId: request.meetingId,
      title: request.title,
      startedAt: request.startedAt,
      endedAt: request.endedAt,
      outputLanguage: request.outputLanguage
    },
    transcript: request.transcript
  });
}

function parseProviderOutput(
  response: OpenAiMeetingStructureResponse
): unknown {
  if (response.outputJson !== undefined) {
    return response.outputJson;
  }

  if (response.outputText !== undefined) {
    try {
      return JSON.parse(response.outputText);
    } catch (error) {
      throw new Error("Invalid meeting structure: provider returned invalid JSON", {
        cause: error
      });
    }
  }

  throw new Error("Invalid meeting structure: provider returned no structured output");
}

const SOURCE_REF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["segmentId", "startTimeMs", "endTimeMs"],
  properties: {
    segmentId: { type: "string" },
    startTimeMs: { type: "number" },
    endTimeMs: { type: "number" }
  }
};

const NULLABLE_STRING_SCHEMA = {
  type: ["string", "null"]
};

const NODE_BASE_PROPERTIES = {
  id: { type: "string" },
  sourceRefs: {
    type: "array",
    items: SOURCE_REF_SCHEMA
  }
};

const MEETING_STRUCTURE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "metadata",
    "summary",
    "topics",
    "points",
    "decisions",
    "actionItems",
    "openQuestions",
    "risks",
    "relations"
  ],
  properties: {
    metadata: {
      type: "object",
      additionalProperties: false,
      required: [
        "meetingId",
        "title",
        "startedAt",
        "endedAt",
        "sourceLanguage",
        "outputLanguage"
      ],
      properties: {
        meetingId: { type: "string" },
        title: { type: "string" },
        startedAt: { type: "string" },
        endedAt: NULLABLE_STRING_SCHEMA,
        sourceLanguage: { type: "string" },
        outputLanguage: { type: "string" }
      }
    },
    summary: { type: "string" },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "title", "summary", "sourceRefs"],
        properties: {
          ...NODE_BASE_PROPERTIES,
          type: { enum: ["topic"] },
          title: { type: "string" },
          summary: { type: "string" }
        }
      }
    },
    points: {
      type: "array",
      items: textNodeSchema("point", ["topicId"])
    },
    decisions: {
      type: "array",
      items: textNodeSchema("decision", ["topicId"])
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "type",
          "text",
          "owner",
          "dueDate",
          "status",
          "topicId",
          "sourceRefs"
        ],
        properties: {
          ...NODE_BASE_PROPERTIES,
          type: { enum: ["action"] },
          text: { type: "string" },
          owner: NULLABLE_STRING_SCHEMA,
          dueDate: NULLABLE_STRING_SCHEMA,
          status: { enum: ["open", "in_progress", "done"] },
          topicId: NULLABLE_STRING_SCHEMA
        }
      }
    },
    openQuestions: {
      type: "array",
      items: textNodeSchema("question", ["topicId"])
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "text", "severity", "topicId", "sourceRefs"],
        properties: {
          ...NODE_BASE_PROPERTIES,
          type: { enum: ["risk"] },
          text: { type: "string" },
          severity: { enum: ["low", "medium", "high"] },
          topicId: NULLABLE_STRING_SCHEMA
        }
      }
    },
    relations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "type", "fromId", "toId"],
        properties: {
          id: { type: "string" },
          type: {
            enum: [
              "contains",
              "leads_to",
              "supports",
              "blocks",
              "decides",
              "creates_action",
              "raises_question",
              "depends_on"
            ]
          },
          fromId: { type: "string" },
          toId: { type: "string" }
        }
      }
    }
  }
};

function textNodeSchema(
  type: "point" | "decision" | "question",
  optionalKeys: string[]
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "type", "text", ...optionalKeys, "sourceRefs"],
    properties: {
      ...NODE_BASE_PROPERTIES,
      type: { enum: [type] },
      text: { type: "string" },
      ...Object.fromEntries(
        optionalKeys.map((key) => [key, NULLABLE_STRING_SCHEMA])
      )
    }
  };
}

function normalizeProviderStructureOutput(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const structure = { ...input };

  if (isRecord(structure.metadata)) {
    const metadata = { ...structure.metadata };
    deleteNullFields(metadata, ["endedAt"]);
    structure.metadata = metadata;
  }

  normalizeNodeCollection(structure.points, ["topicId"]);
  normalizeNodeCollection(structure.decisions, ["topicId"]);
  normalizeNodeCollection(structure.actionItems, [
    "owner",
    "dueDate",
    "topicId"
  ]);
  normalizeNodeCollection(structure.openQuestions, ["topicId"]);
  normalizeNodeCollection(structure.risks, ["topicId"]);

  return structure;
}

function normalizeNodeCollection(nodes: unknown, optionalKeys: string[]): void {
  if (!Array.isArray(nodes)) {
    return;
  }

  nodes.forEach((node, index) => {
    if (!isRecord(node)) {
      return;
    }

    const normalizedNode = { ...node };
    deleteNullFields(normalizedNode, optionalKeys);
    nodes[index] = normalizedNode;
  });
}

function deleteNullFields(
  input: Record<string, unknown>,
  keys: string[]
): void {
  keys.forEach((key) => {
    if (input[key] === null) {
      delete input[key];
    }
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
