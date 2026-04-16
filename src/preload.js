// Import safe IPC APIs from Electron
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the frontend through `window.electron`
contextBridge.exposeInMainWorld('electron', {
  // Launch profile actions in main process (apps + tabs)
  launchProfile: (profileId) => ipcRenderer.invoke('launch-profile', profileId),
  getLaunchProfileStatus: (profileId) => ipcRenderer.invoke('launch-profile-status', profileId),

  // Fetch installed apps from main process (returns Promise<{ name, iconPath }[]>)
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),

  // Capture running app layout from main process
  captureRunningAppLayout: () => ipcRenderer.invoke('capture-running-app-layout'),
  getSystemMonitors: () => ipcRenderer.invoke('get-system-monitors'),

  // Profile persistence API
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfiles: (profiles) => ipcRenderer.invoke('profiles:save-all', profiles),

  // Zone placement history (main-process stats)
  getZoneHistoryStats: () => ipcRenderer.invoke('zone-history:stats'),
});
