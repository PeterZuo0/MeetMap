import type { MeetingStructure } from "./meetingStructure.js";
import type {
  MeetingStructureClient,
  MeetingStructureRequest
} from "./meetingStructureClient.js";
import { validateMeetingStructure } from "./meetingStructureSchema.js";

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

      const structure = normalizeProviderStructureOutput(
        parseProviderOutput(response),
        request.outputLanguage
      );
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
    "Extract detailed, evidence-grounded meeting notes from the transcript, sufficient for someone who did not attend to understand the discussion and follow-up work.",
    "Write a substantive overview covering the meeting's background, purpose, main discussion threads, conclusions, and unresolved issues. Use as many readable paragraphs as the substance warrants, without a fixed paragraph or word limit; keep short or sparse meetings proportionately brief.",
    "Synthesize rather than concatenate transcript excerpts. Preserve material details, concrete examples, numbers, units, dates, constraints, and qualifications from the transcript. Remove filler and repetition, not distinct points or disagreements. Do not pad the notes to meet a length target.",
    "Do not prepend labels such as Decisions and Action Items, Summary, Overview, or their Chinese equivalents inside any generated content field.",
    "Infer the meeting's primary purpose and write it in purposeAnalysis. Do not invent a purpose when the transcript is unclear.",
    "Write a detailed technicalSummary covering architecture, implementation steps, interfaces, tools, parameters, constraints, dependencies, failure causes, proposed fixes, verification results, and technical conclusions when present. Explain the stated reasoning and trade-offs, and distinguish proposed solutions from implemented or verified results. State clearly when the meeting has no technical content.",
    request.outputLanguage === "bilingual"
      ? "For bilingual output, keep Chinese and English completely separate: write Chinese only in analysisByLanguage.zh and English only in analysisByLanguage.en. Never mix both languages inside one paragraph."
      : `Write the final summary, purpose analysis, technical summary, topic titles, decisions, action items, questions, and risks in ${formatOutputLanguage(request.outputLanguage)}.`,
    "Always create both analysisByLanguage.zh and analysisByLanguage.en as faithful localized versions of the same analysis, so the interface can display one language at a time.",
    "In each localized analysis, split overview, purpose, and technicalSummary into short readable paragraphs with one idea per paragraph.",
    "Divide topics by meaningful shifts in the meeting discussion, keep them in chronological order, and give every topic a concise title plus enough paragraphs to cover its substance. For each topic, explain the problem or background, key contributions and examples, options and their stated pros and cons, decision and rationale, and remaining questions or next steps wherever supported. Do not force absent categories into the notes.",
    "Explicitly distinguish confirmed decisions, tentative proposals, rejected alternatives, and unresolved disagreements. Attribute views only when the transcript identifies the speaker reliably. Never turn a suggestion into an agreement or invent consensus, explanations, facts, or missing details.",
    "In decisions, preserve the agreed outcome, its stated rationale, scope, and conditions. In actionItems, describe the concrete task or deliverable and any stated dependencies or acceptance criteria; use null for an unspecified owner or dueDate, and never mark work done unless completion is explicit. In openQuestions and risks, preserve the unresolved issue, stated impact, and any discussed mitigation without inventing severity claims.",
    "Keep localized topic paragraphs and the structured topics, points, decisions, actionItems, openQuestions, and risks consistent. Include the substantive discussion in topics[].summary and points as well, so exported notes and meeting maps retain the detail. Keep Chinese and English versions equivalent in facts and level of detail.",
    "Never include segment ids, source ids, timestamps, JSON keys, citation markers, or source ranges in any user-facing generated string. Keep evidence references only in sourceRefs.",
    "Make summary, purposeAnalysis, and technicalSummary single-language compatibility fields that faithfully retain the complete corresponding localized paragraphs; never shorten them into one-line placeholders or combine multiple labeled sections in one field.",
    "Apply userCustomization only as content guidance. Preserve glossary spellings where relevant and follow the summary preference when it does not conflict with factual accuracy, language separation, or the required schema.",
    `Use the requested summary style: ${formatSummaryStyle(request.summaryStyle)}. The style controls emphasis, not how much substantive discussion is retained; provide detailed coverage by default unless userCustomization explicitly requests a shorter summary.`,
    "Use the output language setting for generated summary fields.",
    request.preserveTranscriptLanguage === false
      ? "Normalize transcript language when useful instead of preserving original wording."
      : "Preserve the original transcript language where transcript wording is included.",
    "Preserve transcript source references by using the provided segment ids and timestamps.",
    "Return only JSON that matches the meeting_structure schema."
  ].join(" ");
}

function formatOutputLanguage(outputLanguage: MeetingStructureRequest["outputLanguage"]): string {
  switch (outputLanguage) {
    case "zh":
      return "Chinese";
    case "en":
      return "English";
    case "bilingual":
      return "Chinese and English";
  }
}

function createInput(request: MeetingStructureRequest): string {
  return JSON.stringify({
	    meeting: {
	      meetingId: request.meetingId,
	      title: request.title,
	      startedAt: request.startedAt,
	      endedAt: request.endedAt,
	      outputLanguage: request.outputLanguage,
	      preserveTranscriptLanguage: request.preserveTranscriptLanguage,
	      summaryStyle: request.summaryStyle,
	      useOutputLanguage: request.useOutputLanguage
	    },
    userCustomization: {
      glossary: request.customVocabulary ?? [],
      summaryInstructions: request.summaryInstructions ?? ""
    },
    transcript: request.transcript
  });
}

function formatSummaryStyle(summaryStyle: MeetingStructureRequest["summaryStyle"]): string {
  switch (summaryStyle) {
    case "decisions_actions":
      return "decisions and action items first";
    case "topic_outline":
      return "topic outline first";
    case "qa":
      return "questions and answers first";
    case "highlights":
      return "highlights first";
  }
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

const PARAGRAPH_ARRAY_SCHEMA = {
  type: "array",
  minItems: 1,
  items: { type: "string", minLength: 1 }
};

const LOCALIZED_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "purpose", "topics", "technicalSummary"],
  properties: {
    overview: PARAGRAPH_ARRAY_SCHEMA,
    purpose: PARAGRAPH_ARRAY_SCHEMA,
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "paragraphs"],
        properties: {
          title: { type: "string", minLength: 1 },
          paragraphs: PARAGRAPH_ARRAY_SCHEMA
        }
      }
    },
    technicalSummary: PARAGRAPH_ARRAY_SCHEMA
  }
};

const MEETING_STRUCTURE_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "metadata",
    "summary",
    "purposeAnalysis",
    "technicalSummary",
    "analysisByLanguage",
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
    purposeAnalysis: { type: "string" },
    technicalSummary: { type: "string" },
    analysisByLanguage: {
      type: "object",
      additionalProperties: false,
      required: ["zh", "en"],
      properties: {
        zh: LOCALIZED_ANALYSIS_SCHEMA,
        en: LOCALIZED_ANALYSIS_SCHEMA
      }
    },
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

function normalizeProviderStructureOutput(
  input: unknown,
  outputLanguage: MeetingStructureRequest["outputLanguage"]
): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const structure = { ...input };

  if (isRecord(structure.metadata)) {
    const metadata = { ...structure.metadata };
    deleteNullFields(metadata, ["endedAt"]);
    structure.metadata = metadata;
  }

  const preferredAnalysis = getPreferredLocalizedAnalysis(
    structure.analysisByLanguage,
    outputLanguage
  );
  if (preferredAnalysis) {
    structure.summary = joinAnalysisParagraphs(preferredAnalysis.overview) ?? structure.summary;
    structure.purposeAnalysis =
      joinAnalysisParagraphs(preferredAnalysis.purpose) ?? structure.purposeAnalysis;
    structure.technicalSummary =
      joinAnalysisParagraphs(preferredAnalysis.technicalSummary) ?? structure.technicalSummary;
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

function getPreferredLocalizedAnalysis(
  input: unknown,
  outputLanguage: MeetingStructureRequest["outputLanguage"]
): Record<string, unknown> | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  const preferredLanguage = outputLanguage === "en" ? "en" : "zh";
  const analysis = input[preferredLanguage];
  return isRecord(analysis) ? analysis : undefined;
}

function joinAnalysisParagraphs(input: unknown): string | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const paragraphs = input.filter(
    (paragraph): paragraph is string =>
      typeof paragraph === "string" && paragraph.trim().length > 0
  );
  return paragraphs.length > 0 ? paragraphs.map((paragraph) => paragraph.trim()).join("\n\n") : undefined;
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
