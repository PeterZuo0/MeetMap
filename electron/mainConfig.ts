import { createDemoWorkflowServices } from "../src/features/workflow/postMeetingWorkflow.js";
import { createDemoAudioCaptureProvider } from "./ipc/demoAudioCaptureProvider.js";
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
    return {
      demoMode: false,
      meetingIpc: {},
      recordingIpc: {}
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
