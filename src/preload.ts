import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  // Add IPC-safe APIs here
});