import type { MeetingMetadata } from "../meetings/meetingTypes.js";
import type { ProcessingPreferences } from "../settings/processingPreferences.js";
import type { TranscriptSegment } from "../transcription/transcriptionTypes.js";
import type { MeetingStructure } from "./meetingStructure.js";
import { validateMeetingStructure } from "./meetingStructureSchema.js";

export type MeetingStructureRequest = {
  customVocabulary?: string[];
  meetingId: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  outputLanguage: MeetingMetadata["outputLanguage"];
  preserveTranscriptLanguage?: boolean;
  summaryStyle: NonNullable<MeetingMetadata["summaryStyle"]>;
  summaryInstructions?: string;
  transcript: TranscriptSegment[];
  useOutputLanguage?: boolean;
};

export type MeetingStructureClient = {
  extractStructure(request: MeetingStructureRequest): Promise<MeetingStructure>;
};

export function createMeetingStructureRequest({
  metadata,
  preferences,
  transcript
}: {
  metadata: MeetingMetadata;
  preferences?: ProcessingPreferences;
  transcript: TranscriptSegment[];
}): MeetingStructureRequest {
  return {
    ...(preferences?.customVocabulary?.length
      ? { customVocabulary: preferences.customVocabulary }
      : {}),
    meetingId: metadata.id,
    title: metadata.title,
    startedAt:
      metadata.timestamps.recordingStartedAt ?? metadata.timestamps.createdAt,
    endedAt: metadata.timestamps.recordingEndedAt,
    outputLanguage: metadata.outputLanguage,
    preserveTranscriptLanguage: preferences?.preserveTranscriptLanguage,
    summaryStyle: metadata.summaryStyle ?? "decisions_actions",
    ...(preferences?.summaryInstructions
      ? { summaryInstructions: preferences.summaryInstructions }
      : {}),
    transcript,
    useOutputLanguage: preferences?.useOutputLanguage
  };
}

export async function extractValidatedMeetingStructure(
  client: MeetingStructureClient,
  input: {
    metadata: MeetingMetadata;
    preferences?: ProcessingPreferences;
    transcript: TranscriptSegment[];
  }
): Promise<MeetingStructure> {
  const structure = await client.extractStructure(
    createMeetingStructureRequest(input)
  );
  const validation = validateMeetingStructure(structure);

  if (!validation.success) {
    throw new Error(`Invalid meeting structure: ${validation.errors.join("; ")}`);
  }

  return structure;
}
