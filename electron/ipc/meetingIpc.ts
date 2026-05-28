import { readFile, stat, writeFile } from "node:fs/promises";
import { ipcMain, shell } from "electron";
import { createHtmlMeetingMap } from "../../src/features/exports/html-map/htmlMapExport.js";
import { createWordSummaryDocx } from "../../src/features/exports/word/wordExport.js";
import type { ExportOptions } from "../../src/features/exports/exportOptions.js";
import type { MeetingStructure } from "../../src/features/intelligence/meetingStructure.js";
import type { MeetingMetadata, SummaryStyle } from "../../src/features/meetings/meetingTypes.js";
import { SUMMARY_STYLE_VALUES } from "../../src/features/meetings/meetingTypes.js";
import type { MeetingStore } from "../../src/features/meetings/meetingStore.js";
import { parseLanguageOption } from "../../src/features/settings/languageOptions.js";
import type { ProcessingPreferences } from "../../src/features/settings/processingPreferences.js";
import {
  processMeeting,
  type PostMeetingWorkflowServices
} from "../../src/features/workflow/postMeetingWorkflow.js";

export type CreateMeetingIpcInput = {
  title: string;
  outputLanguage: string;
  summaryStyle?: string;
};

export type OpenExportIpcInput = {
  meetingId: string;
  kind: "word" | "html";
  options?: unknown;
};

export type MeetingIpcContext = {
  store: MeetingStore;
  workflowMode?: "production" | "demo";
  workflowServices?: PostMeetingWorkflowServices;
};

export function registerMeetingIpc({
  store,
  workflowMode = "production",
  workflowServices
}: MeetingIpcContext): void {
  ipcMain.handle(
    "meeting:create",
    async (_event, input: unknown): Promise<MeetingMetadata> => {
      const request = parseCreateMeetingInput(input);
      const title = request.title.trim();
      const language = parseLanguageOption(request.outputLanguage);

      if (title.length === 0) {
        throw new Error("Meeting title is required");
      }

      if (!language) {
        throw new Error("Unsupported output language");
      }

      return store.createMeeting({
        title,
        outputLanguage: language.value,
        summaryStyle: parseSummaryStyle(request.summaryStyle)
      });
    }
  );

  ipcMain.handle(
    "meeting:process",
    async (
      _event,
      meetingId: unknown,
      preferences?: unknown
    ): Promise<MeetingMetadata> => {
      const parsedMeetingId = parseMeetingId(meetingId);
      const result = await processMeeting({
        store,
        meetingId: parsedMeetingId,
        mode: workflowMode,
        preferences: parseProcessingPreferences(preferences),
        services: workflowServices
      });
      return result.metadata;
    }
  );

  ipcMain.handle("meeting:open-export", async (_event, input: unknown) => {
    const request = parseOpenExportInput(input);
    const options = parseExportOptions(request.options);
    const metadata = await store.readMetadata(request.meetingId);
    const paths = store.getMeetingPaths(request.meetingId);
    const exportPath =
      request.kind === "word"
        ? metadata.exportPaths.wordSummaryPath
        : metadata.exportPaths.htmlMeetingMapPath;
    const filePath =
      request.kind === "word" ? paths.wordExportPath : paths.htmlMapExportPath;

    if (!exportPath) {
      throw new Error("Export is not available yet");
    }

    if (options) {
      await regenerateExportWithOptions(request.kind, paths.structurePath, filePath, options);
    }

    try {
      await stat(filePath);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error("Export file is not available");
      }

      throw error;
    }

    const openResult = await shell.openPath(filePath);
    if (openResult) {
      throw new Error(openResult);
    }
  });
}

function parseCreateMeetingInput(value: unknown): CreateMeetingIpcInput {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.outputLanguage !== "string") {
    throw new Error("Invalid create meeting request");
  }

  if (value.summaryStyle !== undefined && typeof value.summaryStyle !== "string") {
    throw new Error("Invalid create meeting request");
  }

  return {
    title: value.title,
    outputLanguage: value.outputLanguage,
    summaryStyle: value.summaryStyle
  };
}

function parseMeetingId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Invalid meeting id");
  }

  return value;
}

async function regenerateExportWithOptions(
  kind: OpenExportIpcInput["kind"],
  structurePath: string,
  filePath: string,
  options: ExportOptions
): Promise<void> {
  let structure: MeetingStructure;

  try {
    structure = JSON.parse(await readFile(structurePath, "utf8")) as MeetingStructure;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error("Meeting structure is not available");
    }

    throw error;
  }

  if (kind === "word") {
    await writeFile(filePath, await createWordSummaryDocx(structure, options));
    return;
  }

  await writeFile(filePath, createHtmlMeetingMap(structure, options), "utf8");
}

function parseSummaryStyle(value: string | undefined): SummaryStyle {
  if (!value) {
    return "decisions_actions";
  }

  if (SUMMARY_STYLE_VALUES.includes(value as SummaryStyle)) {
    return value as SummaryStyle;
  }

  throw new Error(`Unsupported summary style: ${value}`);
}

function parseProcessingPreferences(value: unknown): ProcessingPreferences | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value) || !isRecord(value.recognitionLanguages)) {
    throw new Error("Invalid processing preferences");
  }

  const preferences = {
    autoDeleteCloudCopies: value.autoDeleteCloudCopies,
    preserveTranscriptLanguage: value.preserveTranscriptLanguage,
    recognitionLanguages: {
      cantonese: value.recognitionLanguages.cantonese,
      englishGB: value.recognitionLanguages.englishGB,
      englishUS: value.recognitionLanguages.englishUS,
      mandarin: value.recognitionLanguages.mandarin,
      mixedCodeSwitching: value.recognitionLanguages.mixedCodeSwitching
    },
    speakerDiarization: value.speakerDiarization,
    uploadRecordedAudio: value.uploadRecordedAudio,
    uploadSeparateTracks: value.uploadSeparateTracks,
    useOutputLanguage: value.useOutputLanguage
  };

  if (
    !allBooleans([
      preferences.autoDeleteCloudCopies,
      preferences.preserveTranscriptLanguage,
      preferences.recognitionLanguages.cantonese,
      preferences.recognitionLanguages.englishGB,
      preferences.recognitionLanguages.englishUS,
      preferences.recognitionLanguages.mandarin,
      preferences.recognitionLanguages.mixedCodeSwitching,
      preferences.speakerDiarization,
      preferences.uploadRecordedAudio,
      preferences.uploadSeparateTracks,
      preferences.useOutputLanguage
    ])
  ) {
    throw new Error("Invalid processing preferences");
  }

  return preferences as ProcessingPreferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allBooleans(values: unknown[]): boolean {
  return values.every((item) => typeof item === "boolean");
}

function parseOpenExportInput(value: unknown): OpenExportIpcInput {
  if (!isRecord(value) || typeof value.meetingId !== "string" || value.meetingId.trim().length === 0) {
    throw new Error("Invalid export request");
  }

  if (value.kind !== "word" && value.kind !== "html") {
    throw new Error("Unsupported export kind");
  }

  return {
    meetingId: value.meetingId,
    kind: value.kind,
    options: value.options
  };
}

function parseExportOptions(value: unknown): ExportOptions | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid export options");
  }

  if (
    !allBooleans([
      value.actions,
      value.audio,
      value.decisions,
      value.map,
      value.timestamps,
      value.transcript
    ])
  ) {
    throw new Error("Invalid export options");
  }

  return {
    actions: value.actions,
    audio: value.audio,
    decisions: value.decisions,
    map: value.map,
    timestamps: value.timestamps,
    transcript: value.transcript
  } as ExportOptions;
}
