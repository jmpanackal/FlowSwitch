// Import safe IPC APIs from Electron
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the frontend through `window.electron`
contextBridge.exposeInMainWorld('electron', {
  // Launch profile actions in main process (apps + tabs)
  launchProfile: (profileId, options) => ipcRenderer.invoke('launch-profile', profileId, options || {}),

  /** Main → renderer when a profile launch starts outside the Launch button (hotkey, task list, dock). */
  subscribeProfileLaunchExternal: (callback) => {
    const channel = 'profile-launch-external';
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  cancelProfileLaunch: (profileId, runId) => (
    ipcRenderer.invoke('cancel-profile-launch', { profileId, runId })
  ),
  getLaunchProfileStatus: (profileId) => ipcRenderer.invoke('launch-profile-status', profileId),

  // Fetch installed apps from main process (returns Promise<{ name, iconPath }[]>)
  getInstalledApps: (opts) => ipcRenderer.invoke('get-installed-apps', opts ?? {}),

  // Capture running app layout from main process
  captureRunningAppLayout: () => ipcRenderer.invoke('capture-running-app-layout'),
  getSystemMonitors: () => ipcRenderer.invoke('get-system-monitors'),

  // Profile persistence API
  listProfiles: () => ipcRenderer.invoke('profiles:list'),
  saveProfiles: (payload) => ipcRenderer.invoke('profiles:save-all', payload),
  pickContentLibraryPaths: (opts) => ipcRenderer.invoke('content-library:pick-paths', opts ?? {}),

  /** Reveal a file in Explorer (shortcut or executable path). */
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

  /** Open a directory in the system file manager, or reveal a file in its parent folder. */
  openPathInExplorer: (targetPath) => ipcRenderer.invoke('open-path-in-explorer', targetPath),

  /** List immediate children of a directory (names + isDirectory), capped in main. */
  browseFolderList: (dirPath) => ipcRenderer.invoke('browse-folder-list', dirPath),

  // Zone placement history (main-process stats)
  getZoneHistoryStats: () => ipcRenderer.invoke('zone-history:stats'),

  getAppPreferences: () => ipcRenderer.invoke('app-preferences:get'),
  setAppPreferences: (patch) => ipcRenderer.invoke('app-preferences:set', patch ?? {}),
});
