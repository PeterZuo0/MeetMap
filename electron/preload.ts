import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("meetMap", {
  platform: process.platform,
  createMeeting: (input: { title: string; outputLanguage: string }) =>
    ipcRenderer.invoke("meeting:create", input),
  startRecording: (meetingId: string) =>
    ipcRenderer.invoke("recording:start", meetingId),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  processMeeting: (meetingId: string) =>
    ipcRenderer.invoke("meeting:process", meetingId),
  openExport: (input: { meetingId: string; kind: "word" | "html" }) =>
    ipcRenderer.invoke("meeting:open-export", input)
});
