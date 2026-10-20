'use strict';

const { ipcRenderer, webUtils } = require('electron');

const ALLOWED_INCOMING = new Set([
  'file:load',
  'win:state',
  'app:query-close'
]);

window.api = {
  /* --- 文件 --- */
  openDialog: () => ipcRenderer.invoke('file:open-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', { filePath, content }),
  saveFileAs: (content, defaultPath) => ipcRenderer.invoke('file:save-as', { content, defaultPath }),
  exportHtml: (html, defaultPath) => ipcRenderer.invoke('file:export-html', { html, defaultPath }),
  revealInFolder: (filePath) => ipcRenderer.invoke('file:reveal', filePath),
  openExternal: (filePath) => ipcRenderer.invoke('file:open-external', filePath),
  print: () => ipcRenderer.invoke('doc:print'),
  confirm: (options) => ipcRenderer.invoke('dialog:confirm', options),

  /* --- 图片 --- */
  pickImages: () => ipcRenderer.invoke('image:pick'),
  importImages: (payload) => ipcRenderer.invoke('image:import', payload),

  /* --- 文档状态 --- */
  confirmClose: () => ipcRenderer.send('doc:close-confirmed'),

  /* --- 窗口 --- */
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('win:close'),
  toggleFullScreen: () => ipcRenderer.send('win:toggle-fullscreen'),
  setAlwaysOnTop: (flag) => ipcRenderer.send('win:always-on-top', flag),

  /* --- 工具 --- */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file && file.path ? file.path : '';
    }
  },

  on: (channel, handler) => {
    if (!ALLOWED_INCOMING.has(channel)) return;
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
};
