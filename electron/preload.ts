import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("meetMap", {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings: unknown) => ipcRenderer.invoke("settings:update", settings),
  getSettingsRuntimeStatus: () => ipcRenderer.invoke("settings:runtime-status"),
  getWorkspace: () => ipcRenderer.invoke("workspace:get"),
  chooseWorkspaceFolder: () => ipcRenderer.invoke("workspace:choose-folder"),
  useWorkspaceFolder: (folderPath: string) => ipcRenderer.invoke("workspace:use-folder", folderPath),
  revealWorkspaceFolder: () => ipcRenderer.invoke("workspace:reveal-folder"),
  listMeetings: () => ipcRenderer.invoke("meeting:list"),
  createMeeting: (input: { title: string; outputLanguage: string; summaryStyle?: string }) =>
    ipcRenderer.invoke("meeting:create", input),
  importAudio: (input: { outputLanguage: string; summaryStyle?: string }) =>
    ipcRenderer.invoke("meeting:import-audio", input),
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
    ipcRenderer.invoke("meeting:detail-data", meetingId),
  openExport: (input: { meetingId: string; kind: "word" | "html"; options?: unknown }) =>
    ipcRenderer.invoke("meeting:open-export", input)
});
