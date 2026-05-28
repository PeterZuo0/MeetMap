import { parseProviderConfig } from "../src/features/config/providerConfig.js";
import { createOpenAiMeetingStructureClient } from "../src/features/intelligence/openAiMeetingStructureClient.js";
import { createOpenAiRequesters } from "../src/features/providers/openAiRequesters.js";
import { createOpenAiTranscriptionClient } from "../src/features/transcription/openAiTranscriptionClient.js";
import { createProductionWorkflowServices } from "../src/features/workflow/productionWorkflowServices.js";
import { createDemoWorkflowServices } from "../src/features/workflow/postMeetingWorkflow.js";
import { createDemoAudioCaptureProvider } from "./ipc/demoAudioCaptureProvider.js";
import { createWindowsAudioCaptureProvider } from "./ipc/windowsAudioCaptureProvider.js";
import type { RecordingIpcContext } from "./ipc/recordingIpc.js";
import type { MeetingIpcContext } from "./ipc/meetingIpc.js";

export type MainRuntimeConfigInput = {
  env: NodeJS.ProcessEnv;
  argv: string[];
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
  argv
}: MainRuntimeConfigInput): MainRuntimeConfig {
  const demoMode =
    env.MEETMAP_DEMO_MODE === "1" || argv.includes("--meetmap-demo");

  if (!demoMode) {
    const productionRecordingIpc: MainRuntimeConfig["recordingIpc"] = {
      audioCaptureMode: "production",
      createAudioCaptureProvider: createWindowsAudioCaptureProvider
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
              transcriptionClient: createOpenAiTranscriptionClient({
                apiKey: providerConfig.transcription.apiKey,
                model: providerConfig.transcription.model,
                requestTranscription: requesters.requestTranscription
              }),
              structureClient: createOpenAiMeetingStructureClient({
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

function shouldConfigureCloudWorkflow(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.OPENAI_API_KEY ||
      env.MEETMAP_TRANSCRIPTION_PROVIDER ||
      env.MEETMAP_LLM_PROVIDER
  );
}
