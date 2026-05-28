import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import type { MeetingStructure } from "../../intelligence/meetingStructure.js";
import { resolveExportOptions, type ExportOptions } from "../exportOptions.js";

export type WordExportSection = {
  title: string;
  items: string[];
};

export async function createWordSummaryDocx(
  structure: MeetingStructure,
  options?: ExportOptions
): Promise<Uint8Array> {
  const document = new Document({
    title: structure.metadata.title,
    creator: "MeetMap",
    sections: [
      {
        children: [
          new Paragraph({ text: structure.metadata.title, heading: HeadingLevel.TITLE }),
          ...buildWordExportSections(structure, options).flatMap((section) => [
            new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
            ...section.items.map((item) => new Paragraph({ text: item }))
          ])
        ]
      }
    ]
  });

  return new Uint8Array(await Packer.toArrayBuffer(document));
}

export function buildWordExportSections(
  structure: MeetingStructure,
  options?: ExportOptions
): WordExportSection[] {
  const resolvedOptions = resolveExportOptions(options);
  const sections: WordExportSection[] = [
    {
      title: "Meeting Overview",
      items: [
        `Title: ${structure.metadata.title}`,
        ...(resolvedOptions.timestamps
          ? [
              `Started: ${structure.metadata.startedAt}`,
              ...(structure.metadata.endedAt ? [`Ended: ${structure.metadata.endedAt}`] : [])
            ]
          : []),
        `Source language: ${structure.metadata.sourceLanguage}`,
        `Output language: ${structure.metadata.outputLanguage}`
      ]
    },
    {
      title: "Executive Summary",
      items: [structure.summary]
    }
  ];

  if (resolvedOptions.map) {
    sections.push({
      title: "Key Topics",
      items: structure.topics.map((topic) => `${topic.title}: ${topic.summary}`)
    });
  }

  if (resolvedOptions.decisions) {
    sections.push({
      title: "Decisions",
      items: structure.decisions.map((decision) => decision.text)
    });
  }

  if (resolvedOptions.actions) {
    sections.push({
      title: "Action Items",
      items: structure.actionItems.map((actionItem) =>
        [
          trimTrailingSentencePunctuation(actionItem.text),
          actionItem.owner ? `Owner: ${actionItem.owner}` : undefined,
          actionItem.dueDate ? `Due: ${actionItem.dueDate}` : undefined,
          `Status: ${actionItem.status}`
        ]
          .filter((item): item is string => Boolean(item))
          .join(". ")
          .concat(".")
      )
    });
  }

  sections.push(
    {
      title: "Open Questions",
      items: structure.openQuestions.map((question) => question.text)
    },
    {
      title: "Risks and Follow-ups",
      items: structure.risks.map((risk) => `${risk.text} Severity: ${risk.severity}.`)
    }
  );

  if (resolvedOptions.transcript) {
    const sourceReferenceItems = buildSourceReferenceItems(structure);

    if (sourceReferenceItems.length > 0) {
      sections.push({
        title: "Source References",
        items: sourceReferenceItems
      });
    }
  }

  return sections;
}

function trimTrailingSentencePunctuation(text: string): string {
  return text.replace(/[.!?]+$/, "");
}

function buildSourceReferenceItems(structure: MeetingStructure): string[] {
  return [
    ...structure.topics.map((topic) => sourceReferenceItem(topic.title, topic.sourceRefs)),
    ...(structure.points ?? []).map((point) => sourceReferenceItem(point.text, point.sourceRefs)),
    ...structure.decisions.map((decision) => sourceReferenceItem(decision.text, decision.sourceRefs)),
    ...structure.actionItems.map((actionItem) => sourceReferenceItem(actionItem.text, actionItem.sourceRefs)),
    ...structure.openQuestions.map((question) => sourceReferenceItem(question.text, question.sourceRefs)),
    ...structure.risks.map((risk) => sourceReferenceItem(risk.text, risk.sourceRefs))
  ].filter((item): item is string => Boolean(item));
}

function sourceReferenceItem(
  label: string,
  sourceRefs: MeetingStructure["topics"][number]["sourceRefs"]
): string | undefined {
  if (sourceRefs.length === 0) {
    return undefined;
  }

  return `${label}: ${sourceRefs
    .map((ref) => `${ref.segmentId} ${formatTimestamp(ref.startTimeMs)}-${formatTimestamp(ref.endTimeMs)}`)
    .join(", ")}`;
}

function formatTimestamp(timeMs: number): string {
  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
