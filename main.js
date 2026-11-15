const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const fs = require("fs");
const path = require("path");
const { analyzeReplays, cancelAnalysis } = require("./src/backend/statsProcessor");
const { listGamesInFolder, getGameSummary } = require("./src/backend/gameIndex");
const { generateClip, previewClipRange } = require("./src/backend/clipGenerator");
const { autoUpdater, AppUpdater } = require("electron-updater");

const isDev = process.env.NODE_ENV === "development";

let mainWindow;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "assets/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  console.log("🔥 [MAIN] BrowserWindow created. WebPreferences:", mainWindow.webContents.getLastWebPreferences());
  const distPath = path.join(__dirname, "dist", "index.html");

  if (isDev || process.env.NODE_ENV === "development") {
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("isDev:", isDev);
    console.log("CWD:", process.cwd());
    console.log("DIST PATH:", path.join(__dirname, "dist", "index.html"));
    mainWindow.loadURL("http://localhost:5173");
  } else if (fs.existsSync(distPath)) {
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("isDev:", isDev);
    console.log("CWD:", process.cwd());
    console.log("DIST PATH:", path.join(__dirname, "dist", "index.html"));
    mainWindow.loadFile(distPath);
  } else {
    console.error("Dist files missing. Did you run npm run build?");
    console.log("NODE_ENV:", process.env.NODE_ENV);
    console.log("isDev:", isDev);
    console.log("CWD:", process.cwd());
    console.log("DIST PATH:", path.join(__dirname, "dist", "index.html"));
    mainWindow.loadURL("data:text/html,<h2>Build missing</h2><p>Please run npm run build before packaging.</p>");
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}


app.whenReady().then(() => {
  createWindow();
  Menu.setApplicationMenu(null);

  autoUpdater.on("update-available", () => {
    if (mainWindow) {
      mainWindow.webContents.send("update-available");
    }
  });

  autoUpdater.on("update-downloaded", () => {
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded");
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("Update error:", err);
  });

  autoUpdater.checkForUpdatesAndNotify();

  ipcMain.handle("select-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("analyze-replays", async (event, folderPath, options) => {
    try {
      const results = await analyzeReplays(folderPath, options);
      return results;
    } catch (err) {
      console.error("Error analyzing replays:", err);
      return { error: err.message };
    }
  });

  ipcMain.handle("cancel-analysis", () => {
    cancelAnalysis();
  });

  ipcMain.handle("quit-and-install", () => {
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle("download-update", () => {
    console.log("🔥 [MAIN] Downloading update...");
    return autoUpdater.downloadUpdate();
  });
  ipcMain.handle("get-version", () => {
    console.log("🔥 [MAIN] get-version IPC called!");
    return app.getVersion();
  });

  ipcMain.handle("select-file", async (_event, options = {}) => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: options.filters || undefined,
      title: options.title || "Select file",
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("select-path", async (_event, options = {}) => {
    const properties = options.directory ? ["openDirectory"] : ["openFile"];
    const result = await dialog.showOpenDialog({
      properties,
      filters: options.filters || undefined,
      title: options.title || "Select path",
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("list-clip-games", async (_event, folderPath, playerTag) => {
    try {
      return await listGamesInFolder(folderPath, playerTag || "");
    } catch (err) {
      console.error("list-clip-games error:", err);
      return { error: err.message, games: [] };
    }
  });

  ipcMain.handle("get-game-summary", async (_event, filePath, playerTag) => {
    try {
      return await getGameSummary(filePath, playerTag || "");
    } catch (err) {
      console.error("get-game-summary error:", err);
      return { error: err.message };
    }
  });

  ipcMain.handle("preview-clip", async (_event, payload) => {
    try {
      return await previewClipRange(payload);
    } catch (err) {
      console.error("preview-clip error:", err);
      return { error: err.message };
    }
  });

  ipcMain.handle("export-clip", async (_event, payload) => {
    try {
      return await generateClip(payload);
    } catch (err) {
      console.error("export-clip error:", err);
      return { error: err.message };
    }
  });

});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
