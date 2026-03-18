const { contextBridge, ipcRenderer } = require('electron');

// Güvenli bir şekilde Electron API'lerini renderer'a açıyoruz
contextBridge.exposeInMainWorld('electronAPI', {
  // Pencere kontrolleri
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // Platform bilgisi
  platform: process.platform,

  // Electron ortamında olduğumuzu belirtmek için
  isElectron: true,

  // İndirme işlemleri
  startDownload: (url) => ipcRenderer.invoke('download:start', url),
  onDownloadProgress: (callback) => ipcRenderer.on('download:progress', (event, data) => callback(data)),
  onDownloadComplete: (callback) => ipcRenderer.on('download:complete', (event, data) => callback(data))
});
