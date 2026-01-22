/**
 * Nimbus AI Agent - Electron Main Process
 * Handles window creation and app lifecycle
 */

import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

const isDev = process.env.NODE_ENV === 'development';
const __dirname_current = import.meta.dirname || path.dirname(new URL(import.meta.url).pathname);

// Global references
let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;

/**
 * Start the backend server
 */
function startServer(): void {
  if (serverProcess) {
    console.log('[Main] Server already running');
    return;
  }

  const serverPath = isDev
    ? path.join(__dirname_current, '..', '..', 'server', 'server.js')
    : path.join(__dirname_current, '..', 'server', 'index.js');

  console.log('[Main] Starting server:', serverPath);

  serverProcess = spawn('node', [serverPath], {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: isDev ? 'development' : 'production' },
  });

  serverProcess.stdout?.on('data', (data) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    console.error(`[Server Error] ${data.toString().trim()}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`[Main] Server exited with code ${code}`);
    serverProcess = null;
  });
}

/**
 * Stop the backend server
 */
function stopServer(): void {
  if (serverProcess) {
    console.log('[Main] Stopping server');
    serverProcess.kill();
    serverProcess = null;
  }
}

/**
 * Create the main application window
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Nimbus',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname_current, '..', '..', 'Logo', 'transparent-logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname_current, 'preload.js'),
    },
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built renderer
    mainWindow.loadFile(path.join(__dirname_current, '..', 'renderer', 'index.html'));
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Only allow navigation within our app
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

// IPC handlers
ipcMain.handle('get-platform', () => process.platform);
ipcMain.handle('get-version', () => app.getVersion());

// App lifecycle
app.on('ready', async () => {
  console.log('[Main] Nimbus starting...');

  // Start the backend server
  startServer();

  // Wait a bit for server to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Create the main window
  createWindow();
});

app.on('window-all-closed', () => {
  // On macOS, apps stay active until user explicitly quits
  if (process.platform !== 'darwin') {
    stopServer();
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  stopServer();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[Main] Unhandled rejection:', error);
});

export { mainWindow, serverProcess };
