import { describe, expect, test } from "vitest";

import type { MeetingStructure } from "./meetingStructure";
import type { MeetingStructureRequest } from "./meetingStructureClient";
import {
  createOpenAiMeetingStructureClient,
  type OpenAiMeetingStructureRequester
} from "./openAiMeetingStructureClient";

const request: MeetingStructureRequest = {
  meetingId: "meeting-1",
  title: "Roadmap review",
  startedAt: "2026-05-28T00:01:00.000Z",
  endedAt: "2026-05-28T00:11:00.000Z",
  outputLanguage: "bilingual",
  summaryStyle: "highlights",
  transcript: [
    {
      id: "seg-1",
      trackId: "system" as const,
      startTimeMs: 0,
      endTimeMs: 1100,
      text: "We decided to keep the export workflow in scope.",
      language: "en",
      confidence: 0.97
    }
  ]
};

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
    summary: "团队决定继续保留导出流程。",
    purposeAnalysis: "确认导出流程的范围。",
    technicalSummary: "当前实现继续包含导出流程。",
    analysisByLanguage: {
      zh: {
        overview: ["团队决定继续保留导出流程。"],
        purpose: ["确认导出流程的范围。"],
        topics: [{ title: "导出流程", paragraphs: ["导出功能仍在当前范围内。"] }],
        technicalSummary: ["当前实现继续包含导出流程。"]
      },
      en: {
        overview: ["The team kept the export workflow in scope."],
        purpose: ["The meeting confirmed the scope of the export workflow."],
        topics: [{ title: "Export workflow", paragraphs: ["Export remains in the current scope."] }],
        technicalSummary: ["The current implementation continues to include the export workflow."]
      }
    },
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

describe("createOpenAiMeetingStructureClient", () => {
  test("requests strict structured JSON from the OpenAI Responses API boundary", async () => {
    const calls: Parameters<OpenAiMeetingStructureRequester>[] = [];
    const requester: OpenAiMeetingStructureRequester = async (openAiRequest) => {
      calls.push([openAiRequest]);
      return { outputJson: validStructure() };
    };
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      requestStructure: requester
    });

    await expect(client.extractStructure(request)).resolves.toEqual(validStructure());

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatchObject({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      text: {
        format: {
          type: "json_schema",
          name: "meeting_structure",
          strict: true
        }
      }
    });
    expect(calls[0][0].instructions).toContain("bilingual");
    expect(calls[0][0].instructions).toContain("highlights first");
    expect(calls[0][0].instructions).toContain("purposeAnalysis");
    expect(calls[0][0].instructions).toContain("technicalSummary");
    expect(calls[0][0].instructions).toContain("detailed, evidence-grounded meeting notes");
    expect(calls[0][0].instructions).toContain("Do not prepend labels");
    expect(JSON.stringify(calls[0][0].text.format.schema)).toContain('"purposeAnalysis"');
    expect(JSON.stringify(calls[0][0].text.format.schema)).toContain('"technicalSummary"');
    expect(JSON.stringify(calls[0][0].text.format.schema)).toContain('"analysisByLanguage"');
    expect(JSON.stringify(calls[0][0].text.format.schema)).toContain('"paragraphs"');
    expect(calls[0][0].input).toContain('"summaryStyle":"highlights"');
    expect(calls[0][0].input).toContain('"id":"seg-1"');
    expect(calls[0][0].input).toContain("We decided to keep the export workflow in scope.");
    expect(calls[0][0].input).toContain('"userCustomization"');
  });

  test("passes user glossary and summary preferences as bounded content guidance", async () => {
    const calls: Parameters<OpenAiMeetingStructureRequester>[] = [];
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      async requestStructure(openAiRequest) {
        calls.push([openAiRequest]);
        return { outputJson: validStructure() };
      }
    });

    await client.extractStructure({
      ...request,
      customVocabulary: ["MeetMap", "PowerApps"],
      summaryInstructions: "Prioritize customer feedback and named owners."
    });

    expect(calls[0]?.[0].instructions).toContain("Apply userCustomization only as content guidance");
    expect(calls[0]?.[0].input).toContain('"glossary":["MeetMap","PowerApps"]');
    expect(calls[0]?.[0].input).toContain("Prioritize customer feedback and named owners.");
  });

  test("requests fully separated Chinese and English analysis for bilingual output", async () => {
    const calls: Parameters<OpenAiMeetingStructureRequester>[] = [];
    const requester: OpenAiMeetingStructureRequester = async (openAiRequest) => {
      calls.push([openAiRequest]);
      return { outputJson: validStructure() };
    };
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      requestStructure: requester
    });

    await client.extractStructure(request);

    expect(calls[0]?.[0].instructions).toContain(
      "keep Chinese and English completely separate"
    );
    expect(calls[0]?.[0].instructions).toContain("Never mix both languages inside one paragraph");
    expect(calls[0]?.[0].instructions).toContain("meaningful shifts in the meeting discussion");
    expect(calls[0]?.[0].instructions).toContain("Never include segment ids");
  });

  test("replaces compatibility summary fields with the clean localized LLM analysis", async () => {
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      async requestStructure() {
        return {
          outputJson: {
            ...validStructure(),
            summary: "【决策与行动项】 Decisions and Action Items (Segment seg-1)",
            purposeAnalysis: "Purpose (Segment seg-1)",
            technicalSummary: "Technical Summary (Segment seg-1)"
          }
        };
      }
    });

    await expect(client.extractStructure(request)).resolves.toMatchObject({
      summary: "团队决定继续保留导出流程。",
      purposeAnalysis: "确认导出流程的范围。",
      technicalSummary: "当前实现继续包含导出流程。"
    });
  });

  test("preserves all detailed localized paragraphs for display and export", async () => {
    const structure = validStructure();
    const overview = [
      "The team reviewed the export workflow.",
      "Word output remains in the delivery scope.",
      "The discussion covered the existing implementation.",
      "The team considered the consequences of removing exports.",
      "They decided to retain the workflow.",
      "No owner or deadline was specified."
    ];
    const analysis = {
      overview,
      purpose: ["Confirm the export scope.", "Clarify the delivery boundary."],
      topics: [{ title: "Export scope", paragraphs: overview }],
      technicalSummary: ["Exports use structured data.", "The existing workflow remains in scope."]
    };
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      async requestStructure() {
        return {
          outputJson: {
            ...structure,
            summary: "Short fallback.",
            analysisByLanguage: { ...structure.analysisByLanguage, en: analysis }
          }
        };
      }
    });

    const result = await client.extractStructure({ ...request, outputLanguage: "en" });
    expect(result.summary).toBe(overview.join("\n\n"));
    expect(result.purposeAnalysis).toBe(analysis.purpose.join("\n\n"));
    expect(result.technicalSummary).toBe(analysis.technicalSummary.join("\n\n"));
    expect(result.analysisByLanguage?.en.topics[0].paragraphs).toEqual(overview);
  });

  test("always follows the selected output language for generated summaries", async () => {
    const calls: Parameters<OpenAiMeetingStructureRequester>[] = [];
    const requester: OpenAiMeetingStructureRequester = async (openAiRequest) => {
      calls.push([openAiRequest]);
      return { outputJson: validStructure() };
    };
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      requestStructure: requester
    });

    await client.extractStructure({
      ...request,
      preserveTranscriptLanguage: false,
      useOutputLanguage: false
    });

    expect(calls[0]?.[0].instructions).toContain(
      "keep Chinese and English completely separate"
    );
    expect(calls[0]?.[0].instructions).toContain("Use the output language setting for generated summary fields.");
    expect(calls[0]?.[0].instructions).not.toContain("Do not force generated summary fields into the output language setting.");
    expect(calls[0]?.[0].instructions).toContain("Normalize transcript language when useful instead of preserving original wording.");
    expect(calls[0]?.[0].input).toContain('"preserveTranscriptLanguage":false');
    expect(calls[0]?.[0].input).toContain('"useOutputLanguage":false');
  });

  test("uses explicit English and Chinese instructions for single-language outputs", async () => {
    const calls: Parameters<OpenAiMeetingStructureRequester>[] = [];
    const requester: OpenAiMeetingStructureRequester = async (openAiRequest) => {
      calls.push([openAiRequest]);
      return { outputJson: validStructure() };
    };
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      requestStructure: requester
    });

    await client.extractStructure({ ...request, outputLanguage: "en" });
    await client.extractStructure({ ...request, outputLanguage: "zh" });

    expect(calls[0]?.[0].instructions).toContain("risks in English.");
    expect(calls[1]?.[0].instructions).toContain("risks in Chinese.");
  });

  test("accepts JSON text responses from the provider boundary", async () => {
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      async requestStructure() {
        return { outputText: JSON.stringify(validStructure()) };
      }
    });

    await expect(client.extractStructure(request)).resolves.toEqual(validStructure());
  });

  test("rejects schema-invalid provider output", async () => {
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      async requestStructure() {
        return {
          outputJson: {
            ...validStructure(),
            topics: [{ ...validStructure().topics[0], sourceRefs: undefined }]
          }
        };
      }
    });

    await expect(client.extractStructure(request)).rejects.toThrow(
      "Invalid meeting structure"
    );
  });

  test("normalizes nullable optional fields from strict structured outputs", async () => {
    const client = createOpenAiMeetingStructureClient({
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      async requestStructure() {
        return {
          outputJson: {
            ...validStructure(),
            metadata: {
              ...validStructure().metadata,
              endedAt: null
            },
            points: [
              {
                id: "point-1",
                type: "point",
                text: "The export workflow remains in scope.",
                topicId: null,
                sourceRefs: [
                  { segmentId: "seg-1", startTimeMs: 0, endTimeMs: 1100 }
                ]
              }
            ],
            actionItems: [
              {
                id: "action-1",
                type: "action",
                text: "Run the smoke path.",
                owner: null,
                dueDate: null,
                status: "open",
                topicId: null,
                sourceRefs: [
                  { segmentId: "seg-1", startTimeMs: 0, endTimeMs: 1100 }
                ]
              }
            ]
          }
        };
      }
    });

    await expect(client.extractStructure(request)).resolves.toMatchObject({
      metadata: expect.not.objectContaining({ endedAt: expect.anything() }),
      points: [
        expect.not.objectContaining({ topicId: expect.anything() })
      ],
      actionItems: [
        expect.not.objectContaining({
          owner: expect.anything(),
          dueDate: expect.anything(),
          topicId: expect.anything()
        })
      ]
    });
  });
});
