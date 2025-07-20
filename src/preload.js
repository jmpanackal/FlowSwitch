const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  launchProfile: (profileId) => {
    ipcRenderer.send('launch-profile', profileId);
  }
});
