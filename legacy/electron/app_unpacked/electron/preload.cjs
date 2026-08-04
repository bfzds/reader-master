try {
  const { contextBridge, ipcRenderer } = require('electron');
  contextBridge.exposeInMainWorld('treaderWindow', {
    setSize(width, height) {
      return ipcRenderer.invoke('window:set-size', { width, height });
    },
  });
  contextBridge.exposeInMainWorld('treaderImportFolder', {
    pick() {
      return ipcRenderer.invoke('import-folder:pick');
    },
    authorize(folderPath) {
      return ipcRenderer.invoke('import-folder:authorize', { folderPath });
    },
    saveFile(folderPath, name, bytes) {
      return ipcRenderer.invoke('import-folder:save-file', { folderPath, name, bytes });
    },
    saveConfig(name, bytes) {
      return ipcRenderer.invoke('config:save-file', { name, bytes });
    },
    listFiles(folderPath) {
      return ipcRenderer.invoke('import-folder:list-files', { folderPath });
    },
    readFile(folderPath, name) {
      return ipcRenderer.invoke('import-folder:read-file', { folderPath, name });
    },
    deleteFile(folderPath, name) {
      return ipcRenderer.invoke('import-folder:delete-file', { folderPath, name });
    },
  });
} catch (_error) {
  // Ignore preload bridge failures to avoid blocking renderer startup.
}
