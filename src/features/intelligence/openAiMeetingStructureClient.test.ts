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
    summary: "The team kept export workflow in scope.",
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
    expect(calls[0][0].input).toContain('"summaryStyle":"highlights"');
    expect(calls[0][0].input).toContain('"id":"seg-1"');
    expect(calls[0][0].input).toContain("We decided to keep the export workflow in scope.");
  });

  test("requests Chinese and English generated fields for bilingual output", async () => {
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
      "For bilingual output, include both Chinese and English in every generated summary field"
    );
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
      "For bilingual output, include both Chinese and English in every generated summary field"
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
