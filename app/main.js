const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const { analyzeReplays, cancelAnalysis } = require("./src/backend/statsProcessor");

const isDev = process.env.NODE_ENV === "development";

let mainWindow;

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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
