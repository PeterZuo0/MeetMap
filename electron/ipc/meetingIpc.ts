import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, parse } from "node:path";
import { pathToFileURL } from "node:url";
import { dialog, ipcMain, shell } from "electron";
import { readWavFileInfo } from "../../src/features/audio-analysis/wavFile.js";
import { createHtmlMeetingMap } from "../../src/features/exports/html-map/htmlMapExport.js";
import { createWordSummaryDocx } from "../../src/features/exports/word/wordExport.js";
import { createAudioPlaybackTrack, type AudioPlaybackTrack } from "../audioWaveform.js";
import type { ExportOptions } from "../../src/features/exports/exportOptions.js";
import type { MeetingStructure } from "../../src/features/intelligence/meetingStructure.js";
import type { AudioTrackMetadata, MeetingMetadata, MeetingPaths, SummaryStyle } from "../../src/features/meetings/meetingTypes.js";
import { AUDIO_TRACK_ID_VALUES } from "../../src/features/meetings/meetingTypes.js";
import { SUMMARY_STYLE_VALUES } from "../../src/features/meetings/meetingTypes.js";
import type { MeetingStore } from "../../src/features/meetings/meetingStore.js";
import { parseLanguageOption } from "../../src/features/settings/languageOptions.js";
import type { ProcessingPreferences } from "../../src/features/settings/processingPreferences.js";
import type { TranscriptSegment } from "../../src/features/transcription/transcriptionTypes.js";
import {
  processMeeting,
  type PostMeetingWorkflowServices
} from "../../src/features/workflow/postMeetingWorkflow.js";

export type CreateMeetingIpcInput = {
  title: string;
  outputLanguage: string;
  summaryStyle?: string;
};

export type ImportAudioIpcInput = {
  outputLanguage: string;
  summaryStyle?: string;
};

export type OpenExportIpcInput = {
  meetingId: string;
  kind: "word" | "html";
  options?: unknown;
};

export type MeetingDetailData = {
  transcript: { segments: TranscriptSegment[] } | null;
  structure: MeetingStructure | null;
  audio: { tracks: AudioPlaybackTrack[] } | null;
};

export type TaggedMomentInput = {
  time: string;
  elapsedMs: number;
  text: string;
  level: number;
  track: "system" | "microphone" | "none";
};

export type MeetingSearchResult = {
  meetingId: string;
  title: string;
  status: MeetingMetadata["status"];
  updatedAt: string;
  matches: Array<{
    kind: "meeting" | "transcript" | "topic" | "decision" | "action" | "question" | "risk";
    label: string;
    snippet: string;
    startTimeMs?: number;
  }>;
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
        services: workflowServices,
        onProgress(progress) {
          sendProcessingProgress(_event, progress);
        }
      });
      return result.metadata;
    }
  );

  ipcMain.handle("meeting:list", async (): Promise<MeetingMetadata[]> => {
    return store.listMeetings();
  });

  ipcMain.handle("meeting:search", async (_event, query: unknown): Promise<MeetingSearchResult[]> => {
    if (typeof query !== "string") {
      throw new Error("Invalid search query");
    }

    return searchMeetings(store, query);
  });

  ipcMain.handle(
    "meeting:import-audio",
    async (_event, input: unknown): Promise<MeetingMetadata | null> => {
      const request = parseImportAudioInput(input);
      const language = parseLanguageOption(request.outputLanguage);

      if (!language) {
        throw new Error("Unsupported output language");
      }

      const result = await dialog.showOpenDialog({
        filters: [{ extensions: ["wav", "m4a"], name: "Audio files" }],
        properties: ["openFile"],
        title: "Import meeting audio"
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return importAudioAsMeeting({
        sourcePath: result.filePaths[0],
        outputLanguage: language.value,
        summaryStyle: parseSummaryStyle(request.summaryStyle),
        store
      });
    }
  );

  ipcMain.handle(
    "meeting:detail-data",
    async (_event, meetingId: unknown): Promise<MeetingDetailData> => {
      const parsedMeetingId = parseMeetingId(meetingId);
      const metadata = await store.readMetadata(parsedMeetingId);
      const paths = store.getMeetingPaths(parsedMeetingId);

      return {
        transcript: await readOptionalJson<{ segments: TranscriptSegment[] }>(
          paths.transcriptPath,
          metadata.transcriptPath !== null
        ),
        structure: await readOptionalJson<MeetingStructure>(
          paths.structurePath,
          metadata.structurePath !== null
        ),
        audio: await createMeetingAudioPlaybackData(metadata)
      };
    }
  );
  ipcMain.handle(
    "meeting:save-audio",
    async (_event, meetingId: unknown): Promise<string | null> => {
      const parsedMeetingId = parseMeetingId(meetingId);
      const metadata = await store.readMetadata(parsedMeetingId);
      const paths = store.getMeetingPaths(parsedMeetingId);
      const audioExport = await prepareMeetingAudioExport(metadata, paths.exportsDir);
      const result = await dialog.showSaveDialog({
        defaultPath: createAudioExportDefaultName(metadata.title, audioExport.extension),
        filters: [{ extensions: [audioExport.extension], name: "Meeting audio" }],
        title: "Save meeting audio"
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      await copyFile(audioExport.filePath, result.filePath);
      return result.filePath;
    }
  );

  ipcMain.handle(
    "meeting:save-tagged-moment",
    async (_event, meetingId: unknown, moment: unknown): Promise<void> => {
      const parsedMeetingId = parseMeetingId(meetingId);
      const taggedMoment = parseTaggedMomentInput(moment);
      const paths = store.getMeetingPaths(parsedMeetingId);
      const taggedMomentsPath = join(paths.logsDir, "tagged-moments.json");
      const existing = await readOptionalJson<Array<TaggedMomentInput & { id: string; createdAt: string }>>(
        taggedMomentsPath,
        true
      ) ?? [];

      await mkdir(paths.logsDir, { recursive: true });
      await writeFile(
        taggedMomentsPath,
        `${JSON.stringify([
          ...existing,
          {
            ...taggedMoment,
            id: `${Date.now()}-${existing.length}`,
            createdAt: new Date().toISOString()
          }
        ], null, 2)}\n`,
        "utf8"
      );
    }
  );

  ipcMain.handle("meeting:reveal-folder", async (_event, meetingId: unknown): Promise<void> => {
    const parsedMeetingId = parseMeetingId(meetingId);
    const paths = store.getMeetingPaths(parsedMeetingId);
    const openResult = await shell.openPath(paths.meetingDir);
    if (openResult) {
      throw new Error(openResult);
    }
  });

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
      await regenerateExportWithOptions(request.kind, metadata, paths, filePath, options);
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

function sendProcessingProgress(event: unknown, progress: unknown): void {
  if (!isRecord(event) || !isRecord(event.sender) || typeof event.sender.send !== "function") {
    return;
  }

  event.sender.send("meeting:processing-progress", progress);
}
async function readOptionalJson<T>(filePath: string, shouldExist: boolean): Promise<T | null> {
  if (!shouldExist) {
    return null;
  }

  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function prepareMeetingAudioExport(
  metadata: MeetingMetadata,
  exportsDir: string
): Promise<{ filePath: string; extension: "m4a" | "wav" }> {
  const tracks = AUDIO_TRACK_ID_VALUES
    .map((trackId) => metadata.audioTracks[trackId])
    .filter((track): track is AudioTrackMetadata => Boolean(track?.hasAudio));

  if (tracks.length === 0) {
    throw new Error("No meeting audio is available to save");
  }

  if (tracks.length === 1) {
    return {
      filePath: tracks[0].filePath,
      extension: getAudioFileExtension(tracks[0])
    };
  }

  await mkdir(exportsDir, { recursive: true });
  const mixedPath = join(exportsDir, "meeting-audio.wav");
  await runFfmpegAudioMix(tracks.map((track) => track.filePath), mixedPath);
  return { filePath: mixedPath, extension: "wav" };
}

async function createEmbeddedHtmlAudioTracks(
  metadata: MeetingMetadata,
  exportsDir: string
): Promise<Array<{ label: string; mimeType: string; dataUrl: string }>> {
  const audioExport = await prepareMeetingAudioExport(metadata, exportsDir);
  const bytes = await readFile(audioExport.filePath);
  const mimeType = audioExport.extension === "m4a" ? "audio/mp4" : "audio/wav";
  return [
    {
      label: `${metadata.title || "Meeting"} audio`,
      mimeType,
      dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`
    }
  ];
}

function getAudioFileExtension(track: AudioTrackMetadata): "m4a" | "wav" {
  const extension = extname(track.filePath).toLowerCase();
  return track.format === "m4a" || extension === ".m4a" ? "m4a" : "wav";
}

function createAudioExportDefaultName(title: string, extension: "m4a" | "wav"): string {
  const baseName = replaceAllUnsafeFileNameCharacters(title)
    .replace(/\s+/g, " ")
    .trim() || "meeting-audio";

  return `${baseName}-audio.${extension}`;
}

function replaceAllUnsafeFileNameCharacters(value: string): string {
  const reservedCharacters = '<>:"/\\|?*';
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || reservedCharacters.includes(character) ? " " : character;
  }).join("");
}

function runFfmpegAudioMix(inputPaths: string[], outputPath: string): Promise<void> {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const inputPath of inputPaths) {
    args.push("-i", inputPath);
  }
  args.push(
    "-filter_complex",
    `amix=inputs=${inputPaths.length}:duration=longest:dropout_transition=0`,
    "-ac",
    "2",
    "-ar",
    "48000",
    outputPath
  );

  return runProcess("ffmpeg", args, "Meeting audio mix");
}

function runProcess(command: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new Error(`${label} failed to start ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with ${command} exit code ${code}: ${stderr.trim()}`));
    });
  });
}
async function importAudioAsMeeting({
  outputLanguage,
  sourcePath,
  store,
  summaryStyle
}: {
  outputLanguage: MeetingMetadata["outputLanguage"];
  sourcePath: string;
  store: MeetingStore;
  summaryStyle: SummaryStyle;
}): Promise<MeetingMetadata> {
  const audioInfo = await readImportedAudioInfo(sourcePath);
  const meeting = await store.createMeeting({
    title: parse(sourcePath).name || "Imported audio",
    outputLanguage,
    summaryStyle
  });
  const paths = store.getMeetingPaths(meeting.id);
  const destinationPath = join(paths.audioDir, `system.${audioInfo.format}`);

  await mkdir(paths.audioDir, { recursive: true });
  await copyFile(sourcePath, destinationPath);
  const now = new Date().toISOString();
  const importedMeeting: MeetingMetadata = {
    ...meeting,
    status: "recorded",
    timestamps: {
      ...meeting.timestamps,
      recordingStartedAt: meeting.timestamps.createdAt,
      recordingEndedAt: now,
      updatedAt: now
    },
    audioTracks: {
      system: {
        ...audioInfo,
        id: "system",
        filePath: destinationPath
      }
    }
  };

  await store.writeMetadata(importedMeeting);
  return importedMeeting;
}

async function readImportedAudioInfo(sourcePath: string): Promise<Omit<AudioTrackMetadata<"system">, "filePath" | "id">> {
  const extension = extname(sourcePath).toLowerCase();

  if (extension === ".wav") {
    const wavInfo = await readWavFileInfo(sourcePath);
    return {
      ...wavInfo,
      hasAudio: wavInfo.durationMs > 0
    };
  }

  if (extension === ".m4a") {
    const stats = await stat(sourcePath);
    return {
      byteLength: stats.size,
      format: "m4a",
      hasAudio: stats.size > 0
    };
  }

  throw new Error(`Unsupported audio import format: ${basename(sourcePath)}`);
}
async function createMeetingAudioPlaybackData(
  metadata: MeetingMetadata
): Promise<MeetingDetailData["audio"]> {
  const audioTrackPromises: Array<Promise<AudioPlaybackTrack>> = [];
  for (const trackId of AUDIO_TRACK_ID_VALUES) {
    const track = metadata.audioTracks[trackId];
    if (track?.hasAudio) {
      audioTrackPromises.push(
        track.format === "wav"
          ? createAudioPlaybackTrack(track.id, track.filePath)
          : Promise.resolve({
              track: track.id,
              audioUrl: pathToFileURL(track.filePath).toString(),
              durationMs: track.durationMs ?? 0,
              peaks: []
            })
      );
    }
  }

  const tracks = await Promise.all(audioTrackPromises);

  return tracks.length > 0 ? { tracks } : null;
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

function parseImportAudioInput(value: unknown): ImportAudioIpcInput {
  if (!isRecord(value) || typeof value.outputLanguage !== "string") {
    throw new Error("Invalid import audio request");
  }

  if (value.summaryStyle !== undefined && typeof value.summaryStyle !== "string") {
    throw new Error("Invalid import audio request");
  }

  return {
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
  metadata: MeetingMetadata,
  paths: MeetingPaths,
  filePath: string,
  options: ExportOptions
): Promise<void> {
  let structure: MeetingStructure;

  try {
    structure = JSON.parse(await readFile(paths.structurePath, "utf8")) as MeetingStructure;
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

  const audioTracks = options.audio
    ? await createEmbeddedHtmlAudioTracks(metadata, paths.exportsDir)
    : [];
  await writeFile(filePath, createHtmlMeetingMap(structure, options, audioTracks), "utf8");
}

async function searchMeetings(store: MeetingStore, query: string): Promise<MeetingSearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const meetings = await store.listMeetings();
  const results = await Promise.all(meetings.map(async (meeting) => {
    const paths = store.getMeetingPaths(meeting.id);
    const transcript = await readOptionalJson<{ segments: TranscriptSegment[] }>(paths.transcriptPath, meeting.transcriptPath !== null);
    const structure = await readOptionalJson<MeetingStructure>(paths.structurePath, meeting.structurePath !== null);
    const matches: MeetingSearchResult["matches"] = [];

    addMatchIfContains(matches, normalizedQuery, "meeting", "Meeting", `${meeting.title} ${meeting.status} ${meeting.outputLanguage}`);

    for (const segment of transcript?.segments ?? []) {
      addMatchIfContains(matches, normalizedQuery, "transcript", segment.speakerLabel ?? segment.trackId, segment.text, segment.startTimeMs);
    }

    for (const topic of structure?.topics ?? []) {
      addMatchIfContains(matches, normalizedQuery, "topic", topic.title, `${topic.title}: ${topic.summary}`, topic.sourceRefs[0]?.startTimeMs);
    }

    for (const decision of structure?.decisions ?? []) {
      addMatchIfContains(matches, normalizedQuery, "decision", "Decision", decision.text, decision.sourceRefs[0]?.startTimeMs);
    }

    for (const action of structure?.actionItems ?? []) {
      addMatchIfContains(matches, normalizedQuery, "action", action.owner ? `Action - ${action.owner}` : "Action", action.text, action.sourceRefs[0]?.startTimeMs);
    }

    for (const question of structure?.openQuestions ?? []) {
      addMatchIfContains(matches, normalizedQuery, "question", "Question", question.text, question.sourceRefs[0]?.startTimeMs);
    }

    for (const risk of structure?.risks ?? []) {
      addMatchIfContains(matches, normalizedQuery, "risk", `Risk - ${risk.severity}`, risk.text, risk.sourceRefs[0]?.startTimeMs);
    }

    return matches.length > 0
      ? {
          meetingId: meeting.id,
          title: meeting.title,
          status: meeting.status,
          updatedAt: meeting.timestamps.updatedAt,
          matches: matches.slice(0, 8)
        }
      : null;
  }));

  return results.filter((result): result is MeetingSearchResult => result !== null);
}

function addMatchIfContains(
  matches: MeetingSearchResult["matches"],
  query: string,
  kind: MeetingSearchResult["matches"][number]["kind"],
  label: string,
  value: string,
  startTimeMs?: number
): void {
  if (!value.toLowerCase().includes(query)) {
    return;
  }

  matches.push({
    kind,
    label,
    snippet: createSearchSnippet(value, query),
    ...(startTimeMs !== undefined ? { startTimeMs } : {})
  });
}

function createSearchSnippet(value: string, query: string): string {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  const index = normalizedValue.toLowerCase().indexOf(query);
  if (index < 0) {
    return normalizedValue.slice(0, 180);
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(normalizedValue.length, index + query.length + 120);
  return `${start > 0 ? "..." : ""}${normalizedValue.slice(start, end)}${end < normalizedValue.length ? "..." : ""}`;
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

function parseTaggedMomentInput(value: unknown): TaggedMomentInput {
  if (
    !isRecord(value) ||
    typeof value.time !== "string" ||
    typeof value.elapsedMs !== "number" ||
    typeof value.text !== "string" ||
    typeof value.level !== "number" ||
    (value.track !== "system" && value.track !== "microphone" && value.track !== "none")
  ) {
    throw new Error("Invalid tagged moment");
  }

  return {
    time: value.time,
    elapsedMs: value.elapsedMs,
    text: value.text,
    level: value.level,
    track: value.track
  };
}
