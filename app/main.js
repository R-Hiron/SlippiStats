const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { analyzeReplays, cancelAnalysis } = require("./src/backend/statsProcessor");


const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
},

  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('analyze-replays', async (event, folderPath, options) => {
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});