const { app, BrowserWindow, ipcMain } = require('electron'); // Electron modules for app lifecycle, window management, and IPC
const path = require('path'); // Node.js module for file path operations
const fs = require('fs'); // Node.js module for file system operations

// Function to create the main application window
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'), // Preload script for secure IPC
    },
  });

  win.loadURL('http://localhost:5173'); // Load the frontend (usually a dev server)
};

app.disableHardwareAcceleration();

// When Electron is ready, create the window
app.whenReady().then(() => {
  createWindow();

  // On macOS, re-create a window when the dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Listen for 'launch-profile' IPC events from the renderer process
ipcMain.on('launch-profile', (event, profileId) => {
  // Path to the mock profile data JSON file
  const filePath = path.join(__dirname, '../../mock-data/profile-work.json');
  try {
    // Read and parse the profile data
    const profileJson = fs.readFileSync(filePath, 'utf-8');
    const profile = JSON.parse(profileJson);
    console.log('Loaded profile data:', profile);

    // Send profile back to renderer
    event.reply('profile-loaded', profile);
  } catch (err) {
    // If loading fails, log the error and send an error message to the renderer
    console.error('Failed to load profile:', err);
    event.reply('profile-loaded', { error: 'Failed to load profile' });
  }
});


// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
