const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktopScore', {
  exportPDF: output => ipcRenderer.invoke('export-pdf', output), listFonts: () => ipcRenderer.invoke('list-fonts'),
  saveProject: params => ipcRenderer.invoke('save-project', params),
  registerOpenedProject: (key, file) => ipcRenderer.invoke('register-opened-project', key, webUtils.getPathForFile(file))
});
