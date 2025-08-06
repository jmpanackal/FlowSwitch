const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const ws = require('windows-shortcuts');
const os = require('os');
const crypto = require('crypto');
const iconExtractor = require('icon-extractor');

// Helper to write base64 icon data to .ico file
function writeBase64IconToFile(base64, filePath) {
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filePath, buffer);
}

// Helper to get the app icon directory (in userData)
function getAppIconDir() {
  const dir = path.join(app.getPath('userData'), 'app-icons');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Helper to extract icon and return .ico path (returns a Promise)
function extractIconToIco(exePath, icoPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(icoPath)) return resolve(icoPath);
    const handler = (data) => {
      if (data && data.Context === icoPath && data.Base64ImageData) {
        writeBase64IconToFile(data.Base64ImageData, icoPath);
        iconExtractor.emitter.removeListener('icon', handler);
        resolve(icoPath);
      }
    };
    const errorHandler = (err) => {
      iconExtractor.emitter.removeListener('icon', handler);
      iconExtractor.emitter.removeListener('error', errorHandler);
      reject(err);
    };
    iconExtractor.emitter.on('icon', handler);
    iconExtractor.emitter.on('error', errorHandler);
    iconExtractor.getIcon(icoPath, exePath);
  });
}
const { scanForExeFiles } = require('./scanExeFiles');
const { getRegistryInstalledApps } = require('./registryApps');

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

// Register custom protocol for app icons
app.whenReady().then(() => {
  protocol.registerFileProtocol('appicon', (request, callback) => {
    const url = request.url.substr('appicon://'.length);
    const iconPath = path.join(getAppIconDir(), url);
    callback({ path: iconPath });
  });
});

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

ipcMain.handle('get-installed-apps', async () => {
  // IPC handler: get-installed-apps (Start Menu, Registry, Program Files)
  try {
    const iconDir = getAppIconDir();
    const appMap = new Map();
    // 1. Start Menu Shortcuts (.lnk files pointing to .exe only)
    const startMenuDirs = [
      path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ];
    const shortcutPromises = [];
    for (const dir of startMenuDirs) {
      if (fs.existsSync(dir)) {
        const walk = (folder) => {
          const entries = fs.readdirSync(folder, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(folder, entry.name);
            if (entry.isDirectory()) {
              walk(fullPath);
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
              try {
                const name = entry.name.replace(/\.lnk$/i, '');
                const p = new Promise((resolve) => {
                  ws.query(fullPath, async (err, info) => {
                    let iconPath = null;
                    let iconSource = null;
                    if (!err && info && info.icon) {
                      const iconParts = info.icon.split(',');
                      const iconFile = iconParts[0];
                      if (iconFile && fs.existsSync(iconFile) && iconFile.toLowerCase().endsWith('.exe')) {
                        iconSource = iconFile;
                      }
                    }
                    if (!iconSource) {
                      console.log(`[StartMenu] Skipping shortcut '${name}': No .exe target found.`);
                    }
                    // Only use .exe targets for icon extraction
                    if (iconSource) {
                      try {
                        const hash = crypto.createHash('md5').update(iconSource).digest('hex');
                        const icoFile = `${hash}.ico`;
                        const icoPath = path.join(iconDir, icoFile);
                        if (!fs.existsSync(icoPath)) {
                          console.log(`[StartMenu] Extracting icon for '${name}' from '${iconSource}' to '${icoPath}'`);
                          await extractIconToIco(iconSource, icoPath);
                        }
                        if (fs.existsSync(icoPath)) {
                          iconPath = `appicon://${icoFile}`;
                        } else {
                          console.warn(`[StartMenu] Icon extraction failed for '${name}' from '${iconSource}'. .ico not created.`);
                          iconPath = null;
                        }
                      } catch (e) {
                        console.warn(`[StartMenu] Error extracting icon for '${name}' from '${iconSource}':`, e);
                        iconPath = null;
                      }
                    }
                    if (iconSource && !appMap.has(name)) {
                      appMap.set(name, { name, iconPath });
                    }
                    resolve();
                  });
                });
                shortcutPromises.push(p);
              } catch (e) {
                console.warn(`[StartMenu] Exception handling shortcut '${entry.name}':`, e);
              }
            }
          }
        };
        walk(dir);
      }
    }
    // 2. Registry Apps
    const registryApps = await getRegistryInstalledApps();
    for (const app of registryApps) {
      if (!app.name || !app.iconSource) {
        console.log(`[Registry] Skipping app: missing name or iconSource`, app);
        continue;
      }
      let iconPath = null;
      try {
        const hash = crypto.createHash('md5').update(app.iconSource).digest('hex');
        const icoFile = `${hash}.ico`;
        const icoPath = path.join(iconDir, icoFile);
        if (!fs.existsSync(icoPath)) {
          console.log(`[Registry] Extracting icon for '${app.name}' from '${app.iconSource}' to '${icoPath}'`);
          await extractIconToIco(app.iconSource, icoPath);
        }
        if (fs.existsSync(icoPath)) {
          iconPath = `appicon://${icoFile}`;
        } else {
          console.warn(`[Registry] Icon extraction failed for '${app.name}' from '${app.iconSource}'. .ico not created.`);
        }
      } catch (e) {
        console.warn(`[Registry] Error extracting icon for '${app.name}' from '${app.iconSource}':`, e);
      }
      if (!appMap.has(app.name)) {
        appMap.set(app.name, { name: app.name, iconPath });
      }
    }
    // 3. Program Files .exe scan
    const exeDirs = [
      'C:/Program Files',
      'C:/Program Files (x86)'
    ];
    const exeFiles = scanForExeFiles(exeDirs, 3); // limit depth for perf
    for (const exePath of exeFiles) {
      const name = path.basename(exePath, '.exe');
      if (!appMap.has(name)) {
        let iconPath = null;
        try {
          const hash = crypto.createHash('md5').update(exePath).digest('hex');
          const icoFile = `${hash}.ico`;
          const icoPath = path.join(iconDir, icoFile);
          if (!fs.existsSync(icoPath)) {
            console.log(`[ExeScan] Extracting icon for '${name}' from '${exePath}' to '${icoPath}'`);
            await extractIconToIco(exePath, icoPath);
          }
          if (fs.existsSync(icoPath)) {
            iconPath = `appicon://${icoFile}`;
          } else {
            console.warn(`[ExeScan] Icon extraction failed for '${name}' from '${exePath}'. .ico not created.`);
          }
        } catch (e) {
          console.warn(`[ExeScan] Error extracting icon for '${name}' from '${exePath}':`, e);
        }
        appMap.set(name, { name, iconPath });
      }
    }
    await Promise.all(shortcutPromises);
    return Array.from(appMap.values());
  } catch (err) {
    return [];
  }
});
// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
