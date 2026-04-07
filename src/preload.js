// Import safe IPC APIs from Electron
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the frontend through `window.electron`
contextBridge.exposeInMainWorld('electron', {
  // Call this to request a profile load
  launchProfile: (profileId) => {
    ipcRenderer.send('launch-profile', profileId);
  },

  // Subscribe to the loaded profile sent back from the main process
  onProfileLoaded: (callback) => {
    ipcRenderer.on('profile-loaded', (_event, profileData) => {
      // Call the React-side handler with the profile data
      callback(profileData);
    });
  },

  // Fetch installed apps from main process (returns Promise<{ name, iconPath }[]>)
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),

  // Capture running app layout from main process
  captureRunningAppLayout: () => ipcRenderer.invoke('capture-running-app-layout'),
  getSystemMonitors: () => ipcRenderer.invoke('get-system-monitors'),

  // Profile persistence API
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfiles: (profiles) => ipcRenderer.invoke('profiles:save-all', profiles),
});
