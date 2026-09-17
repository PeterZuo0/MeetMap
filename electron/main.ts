import { app, BrowserWindow, safeStorage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerMeetingIpc } from "./ipc/meetingIpc.js";
import { registerRecordingIpc } from "./ipc/recordingIpc.js";
import { registerSettingsIpc } from "./ipc/settingsIpc.js";
import { registerWorkspaceIpc } from "./ipc/workspaceIpc.js";
import { loadDotEnvFile } from "./envFile.js";
import { resolveMainRuntimeConfig } from "./mainConfig.js";
import { createWorkspaceManager } from "./workspaceManager.js";
import { createWorkspaceMeetingStore } from "./workspaceMeetingStore.js";
import { createSettingsManager } from "./settingsManager.js";
import { installApplicationMenu } from "./appMenu.js";
import { createLlmProviderManager } from "./llmProviderManager.js";
import { registerLlmProviderIpc } from "./ipc/llmProviderIpc.js";
import { createConfigurableMeetingStructureClient } from "./configurableMeetingStructureClient.js";
import { createConfigurableTranscriptionClient } from "./configurableTranscriptionClient.js";
import { registerAudioShutdown } from "./audioShutdown.js";
import { registerRecordingWidget } from "./recordingWidget.js";
import type { LlmProviderWithSecret } from "../src/features/providers/llmProviderConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    title: "MeetMap",
    icon: isDev
      ? path.join(process.cwd(), "build", "meetmap.ico")
      : path.join(process.resourcesPath, "assets", "meetmap.ico"),
    backgroundColor: "#f7f8fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      backgroundThrottling: false,
      nodeIntegration: false,
      sandbox: false
    }
  });

  registerRecordingWidget(window, path.join(__dirname, "preload.js"), path.join(__dirname, "../../dist/index.html"), process.env.VITE_DEV_SERVER_URL);
  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  void window.loadFile(path.join(__dirname, "../../dist/index.html"));
}

app.whenReady().then(async () => {
  const providerManager = createLlmProviderManager({
    configPath: path.join(app.getPath("userData"), "llm-providers.json"),
    encryptSecret(value) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("当前系统无法安全保存 API Key。请使用环境变量配置密钥。");
      }
      return safeStorage.encryptString(value).toString("base64");
    },
    decryptSecret(value) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("当前系统无法解密已保存的 API Key。");
      }
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    }
  });
  const workspaceManager = createWorkspaceManager({
    configPath: path.join(app.getPath("userData"), "workspace.json")
  });
  const settingsManager = createSettingsManager({
    applyOpenAtStartup: (openAtStartup) => app.setLoginItemSettings({ openAtLogin: openAtStartup }),
    configPath: path.join(app.getPath("userData"), "settings.json"),
    env: process.env,
    getConfiguredProvider: () => {
      const provider = providerManager.getState().providers.find(
        (item) => item.id === providerManager.getState().activeProviderId
      );
      return provider
        ? {
            name: provider.name,
            model: provider.model,
            transcriptionModel: provider.transcriptionModel
          }
        : null;
    }
  });
  // Load independent local files together, before exposing saved state via IPC.
  await Promise.all([
    loadDotEnvFile({
      filePath: path.join(process.cwd(), ".env"),
      env: process.env
    }),
    providerManager.load(),
    workspaceManager.load(),
    settingsManager.load()
  ]);
  const environmentProvider: LlmProviderWithSecret | undefined = process.env.OPENAI_API_KEY
    ? {
        id: "environment-openai",
        name: "OpenAI（环境变量）",
        baseUrl: "https://api.openai.com/v1",
        model: process.env.OPENAI_STRUCTURE_MODEL ?? "gpt-4.1-mini",
        transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
        apiStyle: "responses",
        apiKeyRequired: true,
        apiKey: process.env.OPENAI_API_KEY
      }
    : undefined;
  const transcriptionClient = createConfigurableTranscriptionClient({
    providerManager,
    fallbackProvider: environmentProvider
  });
  const structureClient = createConfigurableMeetingStructureClient({
    providerManager,
    fallbackProvider: environmentProvider
  });
  const runtimeConfig = resolveMainRuntimeConfig({
    env: process.env,
    argv: process.argv,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
    structureClient,
    transcriptionClient
  });

  if (runtimeConfig.demoMode) {
    console.warn(
      "MeetMap demo mode is enabled; demo workflow and audio providers will create fake local artifacts."
    );
  }

  const meetingStore = createWorkspaceMeetingStore(workspaceManager);

  registerSettingsIpc({ settingsManager });
  registerLlmProviderIpc({ providerManager });
  registerWorkspaceIpc({ workspaceManager });
  registerMeetingIpc({
    store: meetingStore,
    ...runtimeConfig.meetingIpc
  });
  const recordingController = registerRecordingIpc({
    store: meetingStore,
    ...runtimeConfig.recordingIpc
  });
  registerAudioShutdown(app, () => recordingController.shutdown());
  createMainWindow();
  installApplicationMenu();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
