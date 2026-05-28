import { expect, test } from "vitest";
import {
  resolveMainRuntimeConfig,
  resolveNativeAudioHelperPath
} from "./mainConfig";

test("uses production providers unless demo mode is explicitly enabled", () => {
  const config = resolveMainRuntimeConfig({
    env: {},
    argv: ["electron", "."]
  });

  expect(config.demoMode).toBe(false);
  expect(config.meetingIpc).toEqual({});
  expect(config.recordingIpc.audioCaptureMode).toBe("production");
  expect(config.recordingIpc.createAudioCaptureProvider).toBeDefined();
});

test("configures production cloud workflow services when OpenAI credentials are present", () => {
  const config = resolveMainRuntimeConfig({
    env: {
      OPENAI_API_KEY: "test-key"
    },
    argv: ["electron", "."]
  });

  expect(config.demoMode).toBe(false);
  expect(config.meetingIpc.workflowMode).toBe("production");
  expect(config.meetingIpc.workflowServices).toBeDefined();
  expect(config.recordingIpc.audioCaptureMode).toBe("production");
  expect(config.recordingIpc.createAudioCaptureProvider).toBeDefined();
});

test("enables demo providers with an explicit environment flag", () => {
  const config = resolveMainRuntimeConfig({
    env: {
      MEETMAP_DEMO_MODE: "1"
    },
    argv: ["electron", "."]
  });

  expect(config.demoMode).toBe(true);
  expect(config.meetingIpc.workflowMode).toBe("demo");
  expect(config.meetingIpc.workflowServices).toBeDefined();
  expect(config.recordingIpc.audioCaptureMode).toBe("demo");
  expect(config.recordingIpc.createAudioCaptureProvider).toBeDefined();
});

test("enables demo providers with an explicit command-line flag", () => {
  const config = resolveMainRuntimeConfig({
    env: {},
    argv: ["electron", ".", "--meetmap-demo"]
  });

  expect(config.demoMode).toBe(true);
  expect(config.meetingIpc.workflowMode).toBe("demo");
  expect(config.recordingIpc.audioCaptureMode).toBe("demo");
});

test("resolves native audio project from app path in development", () => {
  expect(
    resolveNativeAudioHelperPath({
      appPath: "C:/repo/MeetMap",
      resourcesPath: "C:/repo/MeetMap/resources",
      isPackaged: false
    })
  ).toBe("C:\\repo\\MeetMap\\native\\windows-audio\\src\\MeetMap.WindowsAudio.csproj");
});

test("resolves native audio project from resources in packaged app", () => {
  expect(
    resolveNativeAudioHelperPath({
      appPath: "C:/Program Files/MeetMap/resources/app.asar",
      resourcesPath: "C:/Program Files/MeetMap/resources",
      isPackaged: true
    })
  ).toBe("C:\\Program Files\\MeetMap\\resources\\native\\windows-audio\\meetmap-windows-audio.exe");
});
