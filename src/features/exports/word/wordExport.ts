import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import type { MeetingStructure } from "../../intelligence/meetingStructure.js";

export type WordExportSection = {
  title: string;
  items: string[];
};

export async function createWordSummaryDocx(structure: MeetingStructure): Promise<Uint8Array> {
  const document = new Document({
    title: structure.metadata.title,
    creator: "MeetMap",
    sections: [
      {
        children: [
          new Paragraph({ text: structure.metadata.title, heading: HeadingLevel.TITLE }),
          ...buildWordExportSections(structure).flatMap((section) => [
            new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }),
            ...section.items.map((item) => new Paragraph({ text: item }))
          ])
        ]
      }
    ]
  });

  return new Uint8Array(await Packer.toArrayBuffer(document));
}

export function buildWordExportSections(structure: MeetingStructure): WordExportSection[] {
  return [
    {
      title: "Meeting Overview",
      items: [
        `Title: ${structure.metadata.title}`,
        `Started: ${structure.metadata.startedAt}`,
        ...(structure.metadata.endedAt ? [`Ended: ${structure.metadata.endedAt}`] : []),
        `Source language: ${structure.metadata.sourceLanguage}`,
        `Output language: ${structure.metadata.outputLanguage}`
      ]
    },
    {
      title: "Executive Summary",
      items: [structure.summary]
    },
    {
      title: "Key Topics",
      items: structure.topics.map((topic) => `${topic.title}: ${topic.summary}`)
    },
    {
      title: "Decisions",
      items: structure.decisions.map((decision) => decision.text)
    },
    {
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
    },
    {
      title: "Open Questions",
      items: structure.openQuestions.map((question) => question.text)
    },
    {
      title: "Risks and Follow-ups",
      items: structure.risks.map((risk) => `${risk.text} Severity: ${risk.severity}.`)
    }
  ];
}

function trimTrailingSentencePunctuation(text: string): string {
  return text.replace(/[.!?]+$/, "");
}
