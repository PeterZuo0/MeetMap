import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("meetMap", {
  platform: process.platform
});
