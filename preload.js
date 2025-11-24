const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  analyzeReplays: (folderPath, options) =>
    ipcRenderer.invoke("analyze-replays", folderPath, options),
  cancelAnalysis: () => ipcRenderer.invoke("cancel-analysis"),
  onProgress: (callback) => {
    ipcRenderer.on("progress-update", (_event, data) => callback(data));
  },
  onMatchLog: (cb) => ipcRenderer.on("match-log", (_, data) => cb(data)),
  update: {
    onAvailable: (cb) => ipcRenderer.on("update-available", cb),
    onDownloaded: (cb) => ipcRenderer.on("update-downloaded", cb),
    quitAndInstall: () => ipcRenderer.invoke("quit-and-install")
  },
  version: process.env.npm_package_version
});
