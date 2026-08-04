const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const HOST = '127.0.0.1';
const DEFAULT_PORT = 2333;
const DEFAULT_WINDOW_SIZE = Object.freeze({ width: 1920, height: 1080 });
const MIN_WINDOW_SIZE = Object.freeze({ width: 900, height: 600 });

let mainWindow = null;
let server = null;
let serverPort = DEFAULT_PORT;
let authorizedImportFolder = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.commandLine.appendSwitch('disable-features', 'ServiceWorker');

function getAppConfigPath() {
  return path.join(app.getPath('userData'), 'app-config.json');
}

function sanitizeFilename(name) {
  const value = String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return value || 'book.txt';
}

function normalizeWindowSize(windowSize) {
  const width = Math.round(Number(windowSize?.width));
  const height = Math.round(Number(windowSize?.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ...DEFAULT_WINDOW_SIZE };
  }
  return {
    width: Math.max(MIN_WINDOW_SIZE.width, width),
    height: Math.max(MIN_WINDOW_SIZE.height, height),
  };
}

function readAppConfig() {
  const configPath = getAppConfigPath();
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content);
    return {
      windowSize: normalizeWindowSize(parsed?.windowSize),
      windowMaximized: Boolean(parsed?.windowMaximized),
    };
  } catch (_ignore) {
    return {
      windowSize: { ...DEFAULT_WINDOW_SIZE },
      windowMaximized: false,
    };
  }
}

function writeAppConfig(config) {
  const prev = readAppConfig();
  const nextConfig = {
    windowSize: normalizeWindowSize(config?.windowSize ?? prev.windowSize),
    windowMaximized:
      typeof config?.windowMaximized === 'boolean' ? config.windowMaximized : prev.windowMaximized,
  };
  const configPath = getAppConfigPath();
  try {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('[writeAppConfig failed]', configPath, err);
  }
  return nextConfig;
}

/** 在关闭前把当前窗口尺寸（及最大化状态）写入配置，供下次启动恢复 */
function persistWindowStateFromBrowserWindow(win) {
  if (!win || win.isDestroyed()) return;
  const maximized = win.isMaximized();
  let width;
  let height;
  if (maximized && typeof win.getNormalBounds === 'function') {
    const nb = win.getNormalBounds();
    width = nb.width;
    height = nb.height;
  } else {
    [width, height] = win.getSize();
  }
  writeAppConfig({
    windowSize: { width, height },
    windowMaximized: maximized,
  });
}

function createStaticHandler() {
  const root = path.join(__dirname, '..', 'src');
  const contentTypes = {
    '.css': 'text/css; charset=UTF-8',
    '.html': 'text/html; charset=UTF-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json; charset=UTF-8',
    '.woff': 'font/woff',
  };
  return (req, res) => {
    let requestPath;
    try {
      requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch (_error) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const rootPath = path.resolve(root);
    const filePath = path.resolve(root, relativePath);
    if (filePath !== rootPath && !filePath.startsWith(rootPath + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.stat(filePath, (statError, stat) => {
      const target = !statError && stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
      fs.readFile(target, (error, data) => {
        if (error) {
          res.writeHead(error.code === 'ENOENT' ? 404 : 500);
          res.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
          return;
        }
        res.writeHead(200, {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': contentTypes[path.extname(target).toLowerCase()] || 'application/octet-stream',
        });
        res.end(data);
      });
    });
  };
}

function startLocalServer() {
  const requestHandler = createStaticHandler();

  return new Promise((resolve, reject) => {
    const httpServer = http.createServer(requestHandler);

    httpServer.on('error', reject);

    // Use a fixed port so IndexedDB/localStorage keep the same origin.
    httpServer.listen(DEFAULT_PORT, HOST, () => {
      const address = httpServer.address();
      const port = typeof address === 'object' && address ? address.port : DEFAULT_PORT;
      server = httpServer;
      serverPort = port;
      resolve({ port });
    });
  });
}

async function createWindow() {
  if (!server) {
    await startLocalServer();
  }

  const appConfig = readAppConfig();
  const windowSize = appConfig.windowSize;
  const startMaximized = appConfig.windowMaximized;

  mainWindow = new BrowserWindow({
    width: windowSize.width,
    height: windowSize.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'src', 'icon', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (startMaximized) {
    mainWindow.maximize();
  }

  // 必须在 loadURL 之前注册：若在首屏加载完成前关闭窗口，否则不会写入 app-config.json
  mainWindow.on('close', () => {
    persistWindowStateFromBrowserWindow(mainWindow);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(`http://${HOST}:${serverPort}`);
}

ipcMain.handle('window:set-size', (event, payload) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow || !payload || typeof payload !== 'object') return false;
  const width = Number(payload.width);
  const height = Number(payload.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  const normalizedWidth = Math.max(MIN_WINDOW_SIZE.width, Math.floor(width));
  const normalizedHeight = Math.max(MIN_WINDOW_SIZE.height, Math.floor(height));
  targetWindow.setSize(normalizedWidth, normalizedHeight);
  writeAppConfig({
    windowSize: { width: normalizedWidth, height: normalizedHeight },
    windowMaximized: false,
  });
  return true;
});

ipcMain.handle('config:save-file', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') return false;
  const filename = sanitizeFilename(payload.name || 'tReader-config.json');
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  const bytes = payload.bytes;
  if (!Array.isArray(bytes) && !(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) return false;
  await fs.promises.writeFile(result.filePath, Buffer.from(bytes));
  return true;
});

ipcMain.handle('import-folder:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const folderPath = await fs.promises.realpath(result.filePaths[0]);
  authorizedImportFolder = folderPath;
  return {
    name: path.basename(folderPath),
    path: folderPath,
  };
});

ipcMain.handle('import-folder:authorize', async (_event, payload) => {
  const folderPath = String(payload?.folderPath || '');
  if (!folderPath) throw new Error('导入文件夹路径为空');
  const resolvedFolder = await fs.promises.realpath(folderPath);
  const stat = await fs.promises.stat(resolvedFolder);
  if (!stat.isDirectory()) throw new Error('导入文件夹路径无效');
  authorizedImportFolder = resolvedFolder;
  return true;
});

ipcMain.handle('import-folder:save-file', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') return false;
  const folderPath = String(payload.folderPath || '');
  const filename = sanitizeFilename(payload.name);
  const bytes = payload.bytes;
  const validBytes = Array.isArray(bytes) || bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes);
  if (!folderPath || !validBytes) return false;

  const resolvedFolder = await fs.promises.realpath(folderPath);
  if (resolvedFolder !== authorizedImportFolder) throw new Error('导入文件夹未授权，请重新选择文件夹');
  const targetPath = path.join(resolvedFolder, filename);
  await fs.promises.mkdir(resolvedFolder, { recursive: true });
  await fs.promises.writeFile(targetPath, Buffer.from(bytes));
  return true;
});

ipcMain.handle('import-folder:list-files', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') return [];
  const folderPath = String(payload.folderPath || '');
  if (!folderPath) return [];
  const resolvedFolder = path.resolve(folderPath);
  if (resolvedFolder !== authorizedImportFolder) return [];
  const entries = await fs.promises.readdir(resolvedFolder, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(txt|gz|epub)$/i.test(entry.name)) continue;
    const fullPath = path.join(resolvedFolder, entry.name);
    const stat = await fs.promises.stat(fullPath);
    result.push({
      name: entry.name,
      size: stat.size,
      lastModified: stat.mtimeMs,
    });
  }
  return result;
});

ipcMain.handle('import-folder:read-file', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const folderPath = String(payload.folderPath || '');
  const filename = sanitizeFilename(payload.name);
  if (!folderPath || !filename) return null;
  const resolvedFolder = await fs.promises.realpath(folderPath);
  if (resolvedFolder !== authorizedImportFolder) throw new Error('导入文件夹未授权，请重新选择文件夹');
  const targetPath = path.join(resolvedFolder, filename);
  const bytes = await fs.promises.readFile(targetPath);
  const stat = await fs.promises.stat(targetPath);
  return { name: filename, bytes: Array.from(bytes), lastModified: stat.mtimeMs };
});

ipcMain.handle('import-folder:delete-file', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') return false;
  const folderPath = String(payload.folderPath || '');
  const filename = sanitizeFilename(payload.name);
  if (!folderPath || !filename) return false;
  const resolvedFolder = await fs.promises.realpath(folderPath);
  if (resolvedFolder !== authorizedImportFolder) throw new Error('导入文件夹未授权，请重新选择文件夹');
  const targetPath = path.join(resolvedFolder, filename);
  try {
    await fs.promises.unlink(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return true;
    throw error;
  }
});

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
}).catch(error => {
  console.error('[startup failed]', error);
  const message = error?.code === 'EADDRINUSE'
    ? `无法启动 tReader：固定本地端口 ${HOST}:${DEFAULT_PORT} 已被占用。请关闭占用该端口的程序后重试。`
    : `无法启动 tReader：${error?.message || error}`;
  dialog.showErrorBox('tReader 启动失败', message);
  app.quit();
});

app.on('window-all-closed', () => {
  if (server) {
    server.close();
    server = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
