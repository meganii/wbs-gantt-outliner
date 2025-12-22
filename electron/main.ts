import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─ dist
// │ ├─ index.html
// │ ├─ assets
// │ └─ ...
// ├─┬─ dist-electron
// │ ├─ main.js
// │ └─ preload.js
//
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public");

let win: BrowserWindow | null;
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC!, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
    },
  });

  // Test active push message to Electron-Renderer.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  // Platform-specific shortcuts via before-input-event
  win.webContents.on('before-input-event', (event, input) => {
    // Shortcuts handled in renderer via keydown to avoid conflicts with browser defaults
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST!, "index.html"));
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  createWindow()

  // IPC Handlers
  ipcMain.handle('save-file', async (_event, content: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      filters: [{ name: 'Project JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return false;
    
    fs.writeFileSync(filePath, content);
    return true;
  });

  ipcMain.handle('load-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Project JSON', extensions: ['json'] }]
    });
    if (canceled || filePaths.length === 0) return null;
    
    // Read file
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    return content;
  });
});
