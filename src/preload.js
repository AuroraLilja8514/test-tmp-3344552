'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eulerWorkbench', {
  getState: () => ipcRenderer.invoke('ui:get-state'),
  back: () => ipcRenderer.invoke('nav:back'),
  forward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  home: () => ipcRenderer.invoke('nav:home'),
  setSplitRatio: (ratio) => ipcRenderer.send('layout:set-split', ratio),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('ui:state', listener);
    return () => ipcRenderer.removeListener('ui:state', listener);
  },
});
