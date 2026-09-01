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
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  void window.loadFile(path.join(__dirname, "../../dist/index.html"));
}

app.whenReady().then(async () => {
  await loadDotEnvFile({
    filePath: path.join(process.cwd(), ".env"),
    env: process.env
  });

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
  await providerManager.load();
  const structureClient = createConfigurableMeetingStructureClient({
    providerManager,
    fallbackProvider: process.env.OPENAI_API_KEY
      ? {
          id: "environment-openai",
          name: "OpenAI（环境变量）",
          baseUrl: "https://api.openai.com/v1",
          model: process.env.OPENAI_STRUCTURE_MODEL ?? "gpt-4.1-mini",
          apiStyle: "responses",
          apiKeyRequired: true,
          apiKey: process.env.OPENAI_API_KEY
        }
      : undefined
  });
  const runtimeConfig = resolveMainRuntimeConfig({
    env: process.env,
    argv: process.argv,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
    structureClient
  });

  if (runtimeConfig.demoMode) {
    console.warn(
      "MeetMap demo mode is enabled; demo workflow and audio providers will create fake local artifacts."
    );
  }

  const workspaceManager = createWorkspaceManager({
    configPath: path.join(app.getPath("userData"), "workspace.json")
  });
  await workspaceManager.load();
  const settingsManager = createSettingsManager({
    applyOpenAtStartup: (openAtStartup) => app.setLoginItemSettings({ openAtLogin: openAtStartup }),
    configPath: path.join(app.getPath("userData"), "settings.json"),
    env: process.env
  });
  await settingsManager.load();
  const meetingStore = createWorkspaceMeetingStore(workspaceManager);

  registerSettingsIpc({ settingsManager });
  registerLlmProviderIpc({ providerManager });
  registerWorkspaceIpc({ workspaceManager });
  registerMeetingIpc({
    store: meetingStore,
    ...runtimeConfig.meetingIpc
  });
  registerRecordingIpc({
    store: meetingStore,
    ...runtimeConfig.recordingIpc
  });
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
