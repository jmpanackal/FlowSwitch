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
  const filePath = path.join(__dirname, '../../mock-data/profile-work.json');

  try {
    const profileJson = fs.readFileSync(filePath, 'utf-8');
    const profile = JSON.parse(profileJson);

    console.log('🧠 Loaded profile data:', profile);

    // Send profile back to React
    event.reply('profile-loaded', profile);

    // Require node modules for launching things
    const { spawn } = require('child_process');
    const { shell } = require('electron');

    // Loop through each action in the profile
    for (const action of profile.actions) {
      if (action.type === 'app') {
        // 🟢 Launch an executable app

        console.log(`🟦 Launching app: ${action.name} -> ${action.path}`);

        // Use spawn to run the app. `{ detached: true }` means it won’t block Electron.
        spawn(action.path, {
          detached: true,
          stdio: 'ignore' // prevent Electron from listening to output
        }).unref(); // allow child process to live on its own

      } else if (action.type === 'browserTab') {
        // 🌐 Open a browser URL

        console.log(`🌐 Opening URL in browser: ${action.url}`);

        // Open the URL in the user's default browser
        shell.openExternal(action.url);
      }
    }

  } catch (err) {
    console.error('❌ Failed to load or launch profile:', err);
    event.reply('profile-loaded', { error: 'Failed to load profile' });
  }
});


// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
