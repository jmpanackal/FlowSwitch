const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');


const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
    },
  });

  win.loadURL('http://localhost:5173');
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.on('launch-profile', (event, profileId) => {
  const filePath = path.join(__dirname, '../../mock-data/profile-work.json');
  try {
    const profileJson = fs.readFileSync(filePath, 'utf-8');
    const profile = JSON.parse(profileJson);
    console.log('🧠 Loaded profile data:', profile);
  } catch (err) {
    console.error('❌ Failed to load profile:', err);
  }
});





app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
