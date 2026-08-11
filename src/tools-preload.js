'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbenchTools', {
  context: () => ipcRenderer.invoke('tools:context'),
  dashboard: () => ipcRenderer.invoke('tools:dashboard'),
  setStatus: (problemId, status) => ipcRenderer.invoke('tools:set-status', problemId, status),
  saveSolution: (details) => ipcRenderer.invoke('tools:save-solution', details),
  snippets: () => ipcRenderer.invoke('tools:snippets'),
  saveSnippet: (details) => ipcRenderer.invoke('tools:save-snippet', details),
  insertSnippet: (id) => ipcRenderer.invoke('tools:insert-snippet', id),
  removeSnippet: (id) => ipcRenderer.invoke('tools:remove-snippet', id),
  search: (query) => ipcRenderer.invoke('tools:search', query),
  statistics: () => ipcRenderer.invoke('tools:statistics'),
  packages: () => ipcRenderer.invoke('tools:packages'),
  installPackage: (spec) => ipcRenderer.invoke('tools:package-install', spec),
  uninstallPackage: (name) => ipcRenderer.invoke('tools:package-uninstall', name),
  restartKernel: () => ipcRenderer.invoke('tools:kernel-restart'),
  aiConfig: () => ipcRenderer.invoke('tools:ai-config'),
  saveAI: (config) => ipcRenderer.invoke('tools:ai-save', config),
  testAI: (config) => ipcRenderer.invoke('tools:ai-test', config),
  generateArticle: (options) => ipcRenderer.invoke('tools:article-generate', options),
  articles: (problemId) => ipcRenderer.invoke('tools:articles', problemId),
  readArticle: (problemId, articleId) => ipcRenderer.invoke('tools:article-read', problemId, articleId),
  updateArticle: (problemId, articleId, update) => ipcRenderer.invoke('tools:article-update', problemId, articleId, update),
  onSection: (callback) => {
    const listener = (_event, section) => callback(section);
    ipcRenderer.on('tools:section', listener);
    return () => ipcRenderer.removeListener('tools:section', listener);
  },
});
