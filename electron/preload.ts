import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("meetMap", {
  platform: process.platform,
  createMeeting: (input: { title: string; outputLanguage: string; summaryStyle?: string }) =>
    ipcRenderer.invoke("meeting:create", input),
  startRecording: (
    meetingId: string,
    options?: {
      audioSources: { system: boolean; microphone: boolean };
      deviceIds?: { system?: string; microphone?: string };
    }
  ) => ipcRenderer.invoke("recording:start", meetingId, options),
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
  openExport: (input: { meetingId: string; kind: "word" | "html"; options?: unknown }) =>
    ipcRenderer.invoke("meeting:open-export", input)
});
