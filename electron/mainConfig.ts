import path from "node:path";
import { existsSync } from "node:fs";
import { parseProviderConfig } from "../src/features/config/providerConfig.js";
import { createOpenAiMeetingStructureClient } from "../src/features/intelligence/openAiMeetingStructureClient.js";
import { createOpenAiRequesters } from "../src/features/providers/openAiRequesters.js";
import { createTrackDiarizationClient } from "../src/features/diarization/trackDiarizationClient.js";
import { createOpenAiTranscriptionClient } from "../src/features/transcription/openAiTranscriptionClient.js";
import { createProductionWorkflowServices } from "../src/features/workflow/productionWorkflowServices.js";
import { createDemoWorkflowServices } from "../src/features/workflow/postMeetingWorkflow.js";
import { createDemoAudioCaptureProvider } from "./ipc/demoAudioCaptureProvider.js";
import { createWindowsAudioCaptureProvider } from "./ipc/windowsAudioCaptureProvider.js";
import type { RecordingIpcContext } from "./ipc/recordingIpc.js";
import type { MeetingIpcContext } from "./ipc/meetingIpc.js";
import type { MeetingStructureClient } from "../src/features/intelligence/meetingStructureClient.js";
import type { TranscriptionClient } from "../src/features/transcription/transcriptionClient.js";

export type MainRuntimeConfigInput = {
  env: NodeJS.ProcessEnv;
  argv: string[];
  appPath?: string;
  resourcesPath?: string;
  isPackaged?: boolean;
  structureClient?: MeetingStructureClient;
};

export type MainRuntimeConfig = {
  demoMode: boolean;
  meetingIpc: Pick<MeetingIpcContext, "workflowMode" | "workflowServices">;
  recordingIpc: Pick<
    RecordingIpcContext,
    "audioCaptureMode" | "createAudioCaptureProvider"
  >;
};

export function resolveMainRuntimeConfig({
  env,
  argv,
  appPath = process.cwd(),
  resourcesPath = process.cwd(),
  isPackaged = false,
  structureClient
}: MainRuntimeConfigInput): MainRuntimeConfig {
  const demoMode =
    env.MEETMAP_DEMO_MODE === "1" || argv.includes("--meetmap-demo");

  if (!demoMode) {
    const productionRecordingIpc: MainRuntimeConfig["recordingIpc"] = {
      audioCaptureMode: "production",
      createAudioCaptureProvider: () =>
        createWindowsAudioCaptureProvider({
          helperPath: resolveNativeAudioHelperPath({
            appPath,
            resourcesPath,
            isPackaged
          })
        })
    };

    if (shouldConfigureCloudWorkflow(env)) {
      const providerConfig = parseProviderConfig(env);

      if (providerConfig.mode === "production") {
        const requesters = createOpenAiRequesters();
        return {
          demoMode: false,
          meetingIpc: {
            workflowMode: "production",
            workflowServices: createProductionWorkflowServices({
              diarizationClient: createTrackDiarizationClient(),
              transcriptionClient: createOpenAiTranscriptionClient({
                apiKey: providerConfig.transcription.apiKey,
                model: providerConfig.transcription.model,
                requestTranscription: requesters.requestTranscription
              }),
              structureClient: structureClient ?? createOpenAiMeetingStructureClient({
                apiKey: providerConfig.structure.apiKey,
                model: providerConfig.structure.model,
                requestStructure: requesters.requestStructure
              })
            })
          },
          recordingIpc: productionRecordingIpc
        };
      }
    }

    if (structureClient) {
      return {
        demoMode: false,
        meetingIpc: {
          workflowMode: "production",
          workflowServices: createProductionWorkflowServices({
            diarizationClient: createTrackDiarizationClient(),
            transcriptionClient: createUnavailableTranscriptionClient(),
            structureClient
          })
        },
        recordingIpc: productionRecordingIpc
      };
    }

    return {
      demoMode: false,
      meetingIpc: {},
      recordingIpc: productionRecordingIpc
    };
  }

  return {
    demoMode: true,
    meetingIpc: {
      workflowMode: "demo",
      workflowServices: createDemoWorkflowServices()
    },
    recordingIpc: {
      audioCaptureMode: "demo",
      createAudioCaptureProvider: createDemoAudioCaptureProvider
    }
  };
}

export function resolveNativeAudioHelperPath({
  appPath,
  resourcesPath,
  isPackaged,
  fileExists = existsSync
}: {
  appPath: string;
  resourcesPath: string;
  isPackaged: boolean;
  fileExists?: (filePath: string) => boolean;
}): string {
  const nativeRoot = isPackaged
    ? path.join(resourcesPath, "native")
    : path.join(appPath, "native");
  const packagedHelperPath = path.join(nativeRoot, "windows-audio", "meetmap-windows-audio.exe");
  if (isPackaged) {
    return packagedHelperPath;
  }

  const developmentPublishedHelperPath = path.join(
    nativeRoot,
    "windows-audio",
    "src",
    "bin",
    "Release",
    "net8.0-windows",
    "win-x64",
    "publish",
    "meetmap-windows-audio.exe"
  );

  return fileExists(developmentPublishedHelperPath)
    ? developmentPublishedHelperPath
    : path.join(nativeRoot, "windows-audio", "src", "MeetMap.WindowsAudio.csproj");
}

function createUnavailableTranscriptionClient(): TranscriptionClient {
  return {
    async transcribeChunk() {
      throw new Error("音频转写尚未配置。请通过环境变量配置转写服务后再处理音频。");
    }
  };
}

function shouldConfigureCloudWorkflow(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.OPENAI_API_KEY ||
      env.MEETMAP_TRANSCRIPTION_PROVIDER ||
      env.MEETMAP_LLM_PROVIDER
  );
}
