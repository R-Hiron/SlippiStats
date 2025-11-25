console.log("🔥 [MAIN] Loaded main.js from:", __dirname);
console.log("🔥 [MAIN] Timestamp:", new Date().toISOString());

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { analyzeReplays, cancelAnalysis } = require("./src/backend/statsProcessor");
const { autoUpdater, AppUpdater } = require("electron-updater");

const isDev = process.env.NODE_ENV === "development";

let mainWindow;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  ipcMain.handle("get-version", () => {
    console.log("🔥 [MAIN] get-version IPC called!");
    return app.getVersion();
  });


});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
