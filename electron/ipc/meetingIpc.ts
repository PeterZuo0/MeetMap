import { ipcMain, shell } from "electron";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes.js";
import type { MeetingStore } from "../../src/features/meetings/meetingStore.js";
import { parseLanguageOption } from "../../src/features/settings/languageOptions.js";
import { processMeeting } from "../../src/features/workflow/postMeetingWorkflow.js";

export type CreateMeetingIpcInput = {
  title: string;
  outputLanguage: string;
};

export type OpenExportIpcInput = {
  meetingId: string;
  kind: "word" | "html";
};

export type MeetingIpcContext = {
  store: MeetingStore;
};

export function registerMeetingIpc({ store }: MeetingIpcContext): void {
  ipcMain.handle(
    "meeting:create",
    async (_event, input: CreateMeetingIpcInput): Promise<MeetingMetadata> => {
      const title = input.title.trim();
      const language = parseLanguageOption(input.outputLanguage);

      if (title.length === 0) {
        throw new Error("Meeting title is required");
      }

      if (!language) {
        throw new Error("Unsupported output language");
      }

      return store.createMeeting({
        title,
        outputLanguage: language.value
      });
    }
  );

  ipcMain.handle(
    "meeting:process",
    async (_event, meetingId: string): Promise<MeetingMetadata> => {
      const result = await processMeeting({ store, meetingId });
      return result.metadata;
    }
  );

  ipcMain.handle("meeting:open-export", async (_event, input: OpenExportIpcInput) => {
    const metadata = await store.readMetadata(input.meetingId);
    const filePath =
      input.kind === "word"
        ? metadata.exportPaths.wordSummaryPath
        : metadata.exportPaths.htmlMeetingMapPath;

    if (!filePath) {
      throw new Error("Export is not available yet");
    }

    const openResult = await shell.openPath(filePath);
    if (openResult) {
      throw new Error(openResult);
    }
  });
}
