import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("meetMap", {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings: unknown) => ipcRenderer.invoke("settings:update", settings),
  getSettingsRuntimeStatus: () => ipcRenderer.invoke("settings:runtime-status"),
  onOpenSettings: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("app:open-settings", listener);
    return () => ipcRenderer.off("app:open-settings", listener);
  },
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  chooseWorkspaceFolder: () => ipcRenderer.invoke("workspace:choose-folder"),
  useWorkspaceFolder: (folderPath: string) => ipcRenderer.invoke("workspace:use-folder", folderPath),
  revealWorkspaceFolder: () => ipcRenderer.invoke("workspace:reveal-folder"),
  listMeetings: () => ipcRenderer.invoke("meeting:list"),
  createMeeting: (input: { title: string; outputLanguage: string; summaryStyle?: string }) =>
    ipcRenderer.invoke("meeting:create", input),
  renameMeeting: (meetingId: string, title: string) =>
    ipcRenderer.invoke("meeting:rename", { meetingId, title }),
  deleteMeeting: (meetingId: string) => ipcRenderer.invoke("meeting:delete", meetingId),
  getLlmProviders: () => ipcRenderer.invoke("llm-provider:get"),
  saveLlmProvider: (input: unknown) => ipcRenderer.invoke("llm-provider:save", input),
  deleteLlmProvider: (providerId: string) => ipcRenderer.invoke("llm-provider:delete", providerId),
  setActiveLlmProvider: (providerId: string | null) =>
    ipcRenderer.invoke("llm-provider:set-active", providerId),
  importAudio: (input: { outputLanguage: string; summaryStyle?: string }) =>
    ipcRenderer.invoke("meeting:import-audio", input),
  importDroppedAudio: (
    file: File,
    input: { outputLanguage: string; summaryStyle?: string }
  ) => ipcRenderer.invoke("meeting:import-audio-path", {
    ...input,
    sourcePath: webUtils.getPathForFile(file)
  }),
  startRecording: (
    meetingId: string,
    options?: {
      audioSources: { system: boolean; microphone: boolean };
      deviceIds?: { system?: string; microphone?: string };
    }
  ) => ipcRenderer.invoke("recording:start", meetingId, options),
  startAudioProbe: (options?: {
    audioSources: { system: boolean; microphone: boolean };
    deviceIds?: { system?: string; microphone?: string };
  }) => ipcRenderer.invoke("recording:probe-start", options),
  stopAudioProbe: () => ipcRenderer.invoke("recording:probe-stop"),
  pauseRecording: () => ipcRenderer.invoke("recording:pause"),
  resumeRecording: () => ipcRenderer.invoke("recording:resume"),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  listAudioDevices: () => ipcRenderer.invoke("recording:list-devices"),
  onAudioLevel: (callback: (update: unknown) => void) => {
    const listener = (_event: unknown, update: unknown) => callback(update);
    ipcRenderer.on("recording:level", listener);
    return () => ipcRenderer.off("recording:level", listener);
  },
  processMeeting: (meetingId: string, preferences?: unknown) =>
    ipcRenderer.invoke("meeting:process", meetingId, preferences),
  analyzeMeeting: (meetingId: string, preferences?: unknown) =>
    ipcRenderer.invoke("meeting:analyze", meetingId, preferences),
  onProcessingProgress: (callback: (update: unknown) => void) => {
    const listener = (_event: unknown, update: unknown) => callback(update);
    ipcRenderer.on("meeting:processing-progress", listener);
    return () => ipcRenderer.off("meeting:processing-progress", listener);
  },
  saveMeetingAudio: (meetingId: string) => ipcRenderer.invoke("meeting:save-audio", meetingId),
  saveTaggedMoment: (meetingId: string, moment: unknown) =>
    ipcRenderer.invoke("meeting:save-tagged-moment", meetingId, moment),
  searchMeetings: (query: string) => ipcRenderer.invoke("meeting:search", query),
  revealMeetingFolder: (meetingId: string) => ipcRenderer.invoke("meeting:reveal-folder", meetingId),
  getMeetingDetailData: (meetingId: string) =>
    ipcRenderer.invoke("meeting:detail-data", meetingId)
});
