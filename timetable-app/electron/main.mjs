import { app, BrowserWindow } from 'electron';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.TIMETABLE_DEV === '1';
const PORT = Number(process.env.PORT) || 3879;

let serverProcess;
let mainWindow;

function serverEntry() {
  return path.join(__dirname, '../server/index.js');
}

function startBackend() {
  const userData = app.getPath('userData');
  const staticDir = path.join(__dirname, '../frontend/dist');

  serverProcess = spawn(process.execPath, [serverEntry()], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      TIMETABLE_DATA_DIR: path.join(userData, 'data'),
      STATIC_DIR: staticDir,
      API_PREFIX: '/api',
      PORT: String(PORT),
    },
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start timetable server:', err);
  });
}

function waitForServer(port, retries = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const tryOnce = () => {
      http
        .get(`http://127.0.0.1:${port}/health`, (res) => {
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on('error', retry);
    };

    const retry = () => {
      if (attempts >= retries) {
        reject(new Error('Timetable server did not start in time'));
        return;
      }
      attempts += 1;
      setTimeout(tryOnce, 200);
    };

    tryOnce();
  });
}

async function createWindow() {
  if (!isDev) {
    startBackend();
    await waitForServer(PORT);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'Timetable Manager',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = isDev ? 'http://localhost:5175' : `http://localhost:${PORT}`;
  try {
    await mainWindow.loadURL(url);
  } catch (err) {
    console.error(`Failed to load ${url}:`, err);
    app.quit();
    return;
  }

  if (isDev && process.env.ELECTRON_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
