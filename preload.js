console.log("💫 [PRELOAD] Preload script running inside sandbox.");

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  selectFile: (options) => ipcRenderer.invoke("select-file", options),
  selectPath: (options) => ipcRenderer.invoke("select-path", options),
  analyzeReplays: (folderPath, options) =>
    ipcRenderer.invoke("analyze-replays", folderPath, options),
  cancelAnalysis: () => ipcRenderer.invoke("cancel-analysis"),
  listClipGames: (folderPath, playerTag) =>
    ipcRenderer.invoke("list-clip-games", folderPath, playerTag),
  getGameSummary: (filePath, playerTag) =>
    ipcRenderer.invoke("get-game-summary", filePath, playerTag),
  previewClip: (payload) => ipcRenderer.invoke("preview-clip", payload),
  exportClip: (payload) => ipcRenderer.invoke("export-clip", payload),
  onProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("progress-update", handler);
    return () => ipcRenderer.removeListener("progress-update", handler);
  },
  onMatchLog: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("match-log", handler);
    return () => ipcRenderer.removeListener("match-log", handler);
  },
  onClipProgress: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("clip-progress", handler);
    return () => ipcRenderer.removeListener("clip-progress", handler);
  },
  onClipListProgress: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on("clip-list-progress", handler);
    return () => ipcRenderer.removeListener("clip-list-progress", handler);
  },
  update: {
    onAvailable: (cb) => ipcRenderer.on("update-available", cb),
    onDownloaded: (cb) => ipcRenderer.on("update-downloaded", cb),
    downloadUpdate: () => ipcRenderer.invoke("download-update"),
    install: () => ipcRenderer.invoke("quit-and-install"),
  },
  getVersion: () => ipcRenderer.invoke("get-version"),
});
