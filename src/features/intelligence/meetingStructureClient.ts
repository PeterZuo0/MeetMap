import type { MeetingMetadata } from "../meetings/meetingTypes.js";
import type { TranscriptSegment } from "../transcription/transcriptionTypes.js";
import type { MeetingStructure } from "./meetingStructure.js";
import { validateMeetingStructure } from "./meetingStructureSchema.js";

export type MeetingStructureRequest = {
  meetingId: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  outputLanguage: MeetingMetadata["outputLanguage"];
  transcript: TranscriptSegment[];
};

export type MeetingStructureClient = {
  extractStructure(request: MeetingStructureRequest): Promise<MeetingStructure>;
};

export function createMeetingStructureRequest({
  metadata,
  transcript
}: {
  metadata: MeetingMetadata;
  transcript: TranscriptSegment[];
}): MeetingStructureRequest {
  return {
    meetingId: metadata.id,
    title: metadata.title,
    startedAt:
      metadata.timestamps.recordingStartedAt ?? metadata.timestamps.createdAt,
    endedAt: metadata.timestamps.recordingEndedAt,
    outputLanguage: metadata.outputLanguage,
    transcript
  };
}

export async function extractValidatedMeetingStructure(
  client: MeetingStructureClient,
  input: {
    metadata: MeetingMetadata;
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
