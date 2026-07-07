import { createMeetingStore, type CreateMeetingInput, type MeetingStore } from "../src/features/meetings/meetingStore.js";
import type { MeetingId, MeetingMetadata } from "../src/features/meetings/meetingTypes.js";
import type { WorkspaceManager } from "./workspaceManager.js";

export function createWorkspaceMeetingStore(workspaceManager: WorkspaceManager): MeetingStore {
  function currentStore(): MeetingStore {
    return createMeetingStore(workspaceManager.getMeetingsDirectory());
  }

  return {
    createMeeting(input: CreateMeetingInput): Promise<MeetingMetadata> {
      return currentStore().createMeeting(input);
    },
    listMeetings(): Promise<MeetingMetadata[]> {
      return currentStore().listMeetings();
    },
    readMetadata(id: MeetingId): Promise<MeetingMetadata> {
      return currentStore().readMetadata(id);
    },
    writeMetadata(metadata: MeetingMetadata): Promise<void> {
      return currentStore().writeMetadata(metadata);
    },
    getMeetingPaths(id: MeetingId) {
      return currentStore().getMeetingPaths(id);
    }
  };
}
