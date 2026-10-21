'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');

const isDev = process.argv.includes('--dev');

app.setName('墨笺');

let mainWindow = null;
let forceClose = false;
let pendingFilePath = null;

const windowIconPath = path.join(__dirname, 'assets', 'icon.png');

const OPEN_FILTERS = [
  { name: 'Markdown 文档', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
  { name: '文本文件', extensions: ['txt'] },
  { name: '所有文件', extensions: ['*'] }
];

/* ---------------- 单实例与命令行文件参数 ---------------- */

function extractFileArg(argv) {
  if (!Array.isArray(argv)) return null;
  for (let i = argv.length - 1; i >= 1; i--) {
    const arg = argv[i];
    if (typeof arg !== 'string' || arg.startsWith('-')) continue;
    if (/\.(md|markdown|mdown|mkd|mdx|txt)$/i.test(arg)) return arg;
  }
  return null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const file = extractFileArg(argv);
    focusWindow();
    if (file) loadFileIntoWindow(file);
  });
}

function focusWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

async function loadFileIntoWindow(filePath) {
  if (!mainWindow) return;
  try {
    const content = await fs.readFile(filePath, 'utf8');
    mainWindow.webContents.send('file:load', { filePath, content });
  } catch (err) {
    dialog.showErrorBox('打开失败', `无法读取文件：\n${filePath}\n\n${err.message}`);
  }
}

/* ---------------- 窗口 ---------------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 560,
    minHeight: 400,
    show: false,
    frame: false,
    backgroundColor: '#16181d',
    icon: windowIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      spellcheck: false
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const sendWindowState = () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('win:state', {
      maximized: mainWindow.isMaximized(),
      fullscreen: mainWindow.isFullScreen()
    });
  };
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.on('enter-full-screen', sendWindowState);
  mainWindow.on('leave-full-screen', sendWindowState);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 拦截 http(s) 导航，统一用系统浏览器打开
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.on('close', (event) => {
    if (forceClose) return;
    // 交给渲染进程检查所有标签页的未保存更改
    event.preventDefault();
    if (mainWindow) mainWindow.webContents.send('app:query-close');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingFilePath) {
      const file = pendingFilePath;
      pendingFilePath = null;
      loadFileIntoWindow(file);
    }
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  pendingFilePath = extractFileArg(process.argv);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

/* ---------------- AI 助手：OpenAI 兼容接口流式请求 ---------------- */

const aiRequests = new Map();

ipcMain.on('ai:chat', (event, payload) => {
  const { id, baseUrl, apiKey, model, messages } = payload || {};
  const reply = (data) => {
    if (!event.sender.isDestroyed()) event.sender.send('ai:stream', Object.assign({ id }, data));
  };

  let url;
  try {
    url = new URL(String(baseUrl || '').replace(/\/+$/, '') + '/chat/completions');
  } catch {
    reply({ type: 'error', message: '接口地址不合法' });
    return;
  }
  if (!model) {
    reply({ type: 'error', message: '请先填写模型名称' });
    return;
  }

  const body = JSON.stringify({ model, messages, stream: true });
  const lib = url.protocol === 'http:' ? http : https;
  const req = lib.request(
    {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname + url.search,
      headers: Object.assign(
        {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Content-Length': Buffer.byteLength(body)
        },
        apiKey ? { Authorization: 'Bearer ' + apiKey } : {}
      )
    },
    (res) => {
      const isStream = String(res.headers['content-type'] || '').includes('event-stream');

      if (res.statusCode >= 400) {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          aiRequests.delete(id);
          let msg = raw;
          try {
            const j = JSON.parse(raw);
            msg = (j.error && j.error.message) || j.message || raw;
          } catch {}
          reply({ type: 'error', message: 'HTTP ' + res.statusCode + '：' + msg });
        });
        return;
      }

      if (!isStream) {
        // 少数网关不返回 SSE，按普通 JSON 处理
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          aiRequests.delete(id);
          let text = '';
          try {
            const j = JSON.parse(raw);
            text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
          } catch {}
          if (text) reply({ type: 'delta', text });
          reply({ type: 'done' });
        });
        return;
      }

      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        const lines = buf.split(/\r?\n/);
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (delta) reply({ type: 'delta', text: delta });
          } catch {}
        }
      });
      res.on('end', () => {
        aiRequests.delete(id);
        reply({ type: 'done' });
      });
      res.on('error', (err) => {
        aiRequests.delete(id);
        reply({ type: 'error', message: err.message });
      });
    }
  );

  aiRequests.set(id, req);
  req.on('error', (err) => {
    aiRequests.delete(id);
    reply({ type: 'error', message: err.message });
  });
  req.write(body);
  req.end();
});

ipcMain.on('ai:abort', (_event, id) => {
  const req = aiRequests.get(id);
  if (!req) return;
  aiRequests.delete(id);
  if (mainWindow) mainWindow.webContents.send('ai:stream', { id, type: 'done' });
  req.destroy();
});

/* ---------------- 窗口控制 ---------------- */

ipcMain.on('win:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow && mainWindow.close());
ipcMain.on('win:toggle-fullscreen', () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.on('win:always-on-top', (_event, flag) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(Boolean(flag));
});

/* ---------------- 文档状态 ---------------- */

ipcMain.on('doc:close-confirmed', () => {
  forceClose = true;
  if (mainWindow) mainWindow.close();
});

/* ---------------- 文件读写 ---------------- */

ipcMain.handle('file:open-dialog', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '打开 Markdown 文件',
    properties: ['openFile'],
    filters: OPEN_FILTERS
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  const filePath = res.filePaths[0];
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { canceled: false, filePath, content };
  } catch (err) {
    return { canceled: false, error: err.message, filePath };
  }
});

ipcMain.handle('file:read', async (_event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { ok: true, filePath, content };
  } catch (err) {
    return { ok: false, error: err.message, filePath };
  }
});

ipcMain.handle('file:save', async (_event, { filePath, content }) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message, filePath };
  }
});

ipcMain.handle('file:save-as', async (_event, { content, defaultPath }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '另存为',
    defaultPath: defaultPath || '未命名.md',
    filters: [
      { name: 'Markdown 文档', extensions: ['md'] },
      { name: '文本文件', extensions: ['txt'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  try {
    await fs.writeFile(res.filePath, content, 'utf8');
    return { canceled: false, ok: true, filePath: res.filePath };
  } catch (err) {
    return { canceled: false, ok: false, error: err.message, filePath: res.filePath };
  }
});

ipcMain.handle('file:export-html', async (_event, { html, defaultPath }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: '导出 HTML',
    defaultPath: defaultPath || '未命名.html',
    filters: [{ name: 'HTML 文件', extensions: ['html'] }]
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  try {
    await fs.writeFile(res.filePath, html, 'utf8');
    return { canceled: false, ok: true, filePath: res.filePath };
  } catch (err) {
    return { canceled: false, ok: false, error: err.message };
  }
});

ipcMain.handle('file:reveal', (_event, filePath) => {
  if (filePath) shell.showItemInFolder(filePath);
});

ipcMain.handle('file:open-external', (_event, filePath) => {
  if (filePath) shell.openPath(filePath);
});

/* ---------------- 图片导入 ---------------- */

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];
const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif'
};

function sanitizeName(name) {
  const base = path.basename(String(name || '')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return base && base !== '.' ? base : '';
}

/** 在 dir 中为文件名找一个不冲突的路径 */
async function uniqueTarget(dir, filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext) || 'image';
  const taken = new Set(await fs.readdir(dir).catch(() => []));
  let name = filename;
  let i = 1;
  while (taken.has(name)) name = `${stem}-${i++}${ext}`;
  return path.join(dir, name);
}

function toRelative(fromDir, target) {
  return path.relative(fromDir, target).split(path.sep).join('/');
}

/** 选择本地图片（不写入） */
ipcMain.handle('image:pick', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: '插入图片',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: IMAGE_EXTS }, { name: '所有文件', extensions: ['*'] }]
  });
  if (res.canceled) return { canceled: true, files: [] };
  return { canceled: false, files: res.filePaths };
});

/**
 * 把图片写入 <文档目录>/assets，返回相对路径。
 * items: [{ path } | { dataUrl, name }]
 */
ipcMain.handle('image:import', async (_event, { docPath, items }) => {
  try {
    if (!docPath) return { ok: false, error: '文档尚未保存' };
    const docDir = path.dirname(docPath);
    const assetDir = path.join(docDir, 'assets');
    await fs.mkdir(assetDir, { recursive: true });

    const out = [];
    for (const item of Array.isArray(items) ? items : []) {
      let target = null;

      if (item && item.path) {
        const src = item.path;
        try {
          await fs.access(src);
        } catch {
          continue;
        }
        // 图片已经在文档的 assets 目录里 → 直接引用，不复制
        const relExisting = path.relative(assetDir, src);
        if (relExisting && !relExisting.startsWith('..') && !path.isAbsolute(relExisting)) {
          out.push({ name: path.basename(src), rel: toRelative(docDir, src), abs: src });
          continue;
        }
        target = await uniqueTarget(assetDir, sanitizeName(path.basename(src)) || `image${path.extname(src)}`);
        await fs.copyFile(src, target);
      } else if (item && item.dataUrl) {
        const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(item.dataUrl);
        if (!m) continue;
        const mime = m[1].toLowerCase();
        const ext = MIME_EXT[mime] || 'png';
        let name = sanitizeName(item.name) || `image-${Date.now()}.${ext}`;
        if (!path.extname(name)) name += `.${ext}`;
        target = await uniqueTarget(assetDir, name);
        const buf = m[2]
          ? Buffer.from(m[3], 'base64')
          : Buffer.from(decodeURIComponent(m[3]), 'utf8');
        await fs.writeFile(target, buf);
      }

      if (!target) continue;
      out.push({ name: path.basename(target), rel: toRelative(docDir, target), abs: target });
    }

    return { ok: true, files: out };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('doc:print', async () => {
  if (!mainWindow) return;
  return new Promise((resolve) => {
    mainWindow.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
      resolve({ success, reason });
    });
  });
});

ipcMain.handle('dialog:confirm', async (_event, { title, message, buttons, defaultId = 0, cancelId = -1 }) => {
  return dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    noLink: true,
    title: title || '墨笺',
    message: message || '',
    buttons: buttons && buttons.length ? buttons : ['确定', '取消'],
    defaultId,
    cancelId
  });
});
