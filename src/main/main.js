const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const ws = require('windows-shortcuts');
const crypto = require('crypto');
const { scanForExeFiles } = require('./scanExeFiles');
const { getRegistryInstalledApps } = require('./registryApps');
const { getAppIconDir, extractIconToIco } = require('./services/icon-service');
const {
  hiddenProcessNamePatterns,
  hiddenWindowTitlePatterns,
  getRunningWindowProcesses,
} = require('./services/windows-process-service');

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

    // Send profile back to React
    event.reply('profile-loaded', profile);

    // Require node modules for launching things
    const { spawn } = require('child_process');
    const { shell } = require('electron');

    // Loop through each action in the profile
    for (const action of profile.actions) {
      if (action.type === 'app') {
        // 🟢 Launch an executable app

        // Use spawn to run the app. `{ detached: true }` means it won’t block Electron.
        spawn(action.path, {
          detached: true,
          stdio: 'ignore' // prevent Electron from listening to output
        }).unref(); // allow child process to live on its own

      } else if (action.type === 'browserTab') {
        // 🌐 Open a browser URL

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

    const runWithConcurrencyLimit = async (tasks, limit) => {
      const safeLimit = Math.max(1, Math.min(limit || 1, tasks.length || 1));
      let nextIndex = 0;

      const worker = async () => {
        while (true) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          if (currentIndex >= tasks.length) return;
          try {
            await tasks[currentIndex]();
          } catch (e) {
            // Keep discovery resilient: one failing shortcut/icon extraction
            // should not fail the whole installed-app scan.
          }
        }
      };

      const workers = Array.from({ length: safeLimit }, () => worker());
      await Promise.all(workers);
    };

    const normalizeWsIconFile = (rawIcon) => {
      if (!rawIcon) return null;
      const iconParts = String(rawIcon).split(',');
      const iconFileRaw = iconParts[0];
      if (!iconFileRaw) return null;

      // ws icon often comes like: `"C:\Path\App.exe",0` or without quotes.
      const iconFile = String(iconFileRaw)
        .replace(/^"(.*)"$/, '$1')
        .trim();

      if (!iconFile || !fs.existsSync(iconFile)) return null;
      if (!iconFile.toLowerCase().endsWith('.exe')) return null;
      return iconFile;
    };

    // 1. Start Menu Shortcuts (.lnk files pointing to .exe only)
    const startMenuDirs = [
      path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
    ];
    const shortcutTasks = [];
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
                shortcutTasks.push(() => new Promise((resolve) => {
                  ws.query(fullPath, async (err, info) => {
                    try {
                      const normalizedIconSource = !err && info && info.icon
                        ? normalizeWsIconFile(info.icon)
                        : null;

                      // If we already discovered this app with an icon, skip expensive rework.
                      const existing = appMap.get(name);
                      if (existing?.iconPath) return resolve();

                      let iconPath = null;
                      if (normalizedIconSource) {
                        try {
                          const hash = crypto.createHash('md5').update(normalizedIconSource).digest('hex');
                          const icoFile = `${hash}.ico`;
                          const icoPath = path.join(iconDir, icoFile);
                          if (!fs.existsSync(icoPath)) {
                            await extractIconToIco(normalizedIconSource, icoPath);
                          }
                          if (fs.existsSync(icoPath)) {
                            iconPath = `appicon://${icoFile}`;
                          } else {
                            iconPath = null;
                          }
                        } catch {
                          iconPath = null;
                        }
                      }

                      if (normalizedIconSource && !appMap.has(name)) {
                        appMap.set(name, { name, iconPath });
                      }
                    } finally {
                      resolve();
                    }
                  });
                }));
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
        continue;
      }
      const normalizedIconSource = String(app.iconSource).replace(/^"(.*)"$/, '$1');
      if (!fs.existsSync(normalizedIconSource) || !normalizedIconSource.toLowerCase().endsWith('.exe')) {
        if (!appMap.has(app.name)) {
          appMap.set(app.name, { name: app.name, iconPath: null });
        }
        continue;
      }
      let iconPath = null;
      try {
        const hash = crypto.createHash('md5').update(normalizedIconSource).digest('hex');
        const icoFile = `${hash}.ico`;
        const icoPath = path.join(iconDir, icoFile);
        if (!fs.existsSync(icoPath)) {
          await extractIconToIco(normalizedIconSource, icoPath);
        }
        if (fs.existsSync(icoPath)) {
          iconPath = `appicon://${icoFile}`;
        } else {
          console.warn(`[Registry] Icon extraction failed for '${app.name}' from '${normalizedIconSource}'. .ico not created.`);
        }
      } catch (e) {
        console.warn(`[Registry] Error extracting icon for '${app.name}' from '${normalizedIconSource}':`, e);
      }
      if (!appMap.has(app.name)) {
        appMap.set(app.name, { name: app.name, iconPath });
      }
    }
    // 3. Optional Program Files .exe scan (very expensive; disabled by default).
    // Enable only for deep discovery troubleshooting:
    //   FLOWSWITCH_ENABLE_EXE_SCAN=1 npm run dev
    if (process.env.FLOWSWITCH_ENABLE_EXE_SCAN === '1') {
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
    }
    await runWithConcurrencyLimit(shortcutTasks, 6);
    return Array.from(appMap.values());
  } catch (err) {
    console.error('Error in get-installed-apps handler:', err);
    return [];
  }
});

ipcMain.handle('capture-running-app-layout', async () => {
  try {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    const processes = await getRunningWindowProcesses();

    const monitors = displays.map((display, idx) => ({
      id: `monitor-${display.id}`,
      name: `Monitor ${idx + 1}`,
      primary: display.id === screen.getPrimaryDisplay().id,
      scaleFactor: display.scaleFactor,
      // Use physical pixel resolution so it matches our pixel-space normalization.
      resolution: `${Math.round(display.bounds.width * display.scaleFactor)}x${Math.round(display.bounds.height * display.scaleFactor)}`,
      orientation: (
        display.rotation === 90
        || display.rotation === 270
        || display.bounds.height > display.bounds.width
      ) ? 'portrait' : 'landscape',
      layoutPosition: { x: display.bounds.x, y: display.bounds.y },
      // Full display bounds (DIP) for monitor assignment.
      bounds: display.bounds,
      // Work area bounds (DIP) for optional dock-aware normalization.
      workArea: display.workArea,
      // Keep these fields for potential future heuristics/debug,
      // but current geometry uses DIP to avoid scaling mismatches.
      pixelBounds: {
        x: Math.round(display.bounds.x * display.scaleFactor),
        y: Math.round(display.bounds.y * display.scaleFactor),
        width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor),
      },
      pixelWorkArea: {
        x: Math.round(display.workArea.x * display.scaleFactor),
        y: Math.round(display.workArea.y * display.scaleFactor),
        width: Math.round(display.workArea.width * display.scaleFactor),
        height: Math.round(display.workArea.height * display.scaleFactor),
      },
      apps: [],
    }));

    const targetMonitors = monitors.length > 0 ? monitors : [{
      id: 'monitor-1',
      name: 'Monitor 1',
      primary: true,
      scaleFactor: 1,
      resolution: '1920x1080',
      orientation: 'landscape',
      layoutPosition: { x: 0, y: 0 },
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      pixelBounds: { x: 0, y: 0, width: 1920, height: 1080 },
      pixelWorkArea: { x: 0, y: 0, width: 1920, height: 1080 },
      apps: [],
    }];
    const minimizedApps = [];

    const uniqueWindows = [];
    const seen = new Set();
    for (const p of processes) {
      if (!p?.name || !p?.bounds) continue;
      if (hiddenProcessNamePatterns.some((pattern) => pattern.test(p.name))) continue;
      if (p?.title && hiddenWindowTitlePatterns.some((pattern) => pattern.test(p.title))) continue;
      const dedupeKey = `${p.id}::${p.title.toLowerCase()}::${p.bounds.x},${p.bounds.y},${p.bounds.width},${p.bounds.height}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      uniqueWindows.push(p);
      if (uniqueWindows.length >= 120) break;
    }

    const debugEnabled = process.env.FLOWSWITCH_CAPTURE_DEBUG === '1';
    let spotifyDebugData = null;
    let nvidiaDebugData = null;
    for (const windowInfo of uniqueWindows) {
      const bounds = (
        windowInfo.isMinimized
        && windowInfo.normalBounds
        && windowInfo.normalBounds.width > 0
        && windowInfo.normalBounds.height > 0
      ) ? windowInfo.normalBounds : windowInfo.bounds;
      const windowRect = {
        left: bounds.x,
        top: bounds.y,
        right: bounds.x + bounds.width,
        bottom: bounds.y + bounds.height,
      };

      const overlapArea = (monitorBounds) => {
        const mLeft = monitorBounds.x;
        const mTop = monitorBounds.y;
        const mRight = monitorBounds.x + monitorBounds.width;
        const mBottom = monitorBounds.y + monitorBounds.height;
        const overlapW = Math.max(0, Math.min(windowRect.right, mRight) - Math.max(windowRect.left, mLeft));
        const overlapH = Math.max(0, Math.min(windowRect.bottom, mBottom) - Math.max(windowRect.top, mTop));
        return overlapW * overlapH;
      };

      let monitor = targetMonitors[0];
      let bestArea = -1;
      for (const m of targetMonitors) {
        // Normalize/overlap math must use the same coordinate space as GetWindowRect /
        // GetWindowPlacement output. In practice those values align with Electron's
        // DIP `bounds`, so use DIP for overlap selection.
        const area = overlapArea(m.bounds);
        if (area > bestArea) {
          bestArea = area;
          monitor = m;
        }
      }

      // Compute candidate geometry in 4 space variants:
      // DIP: bounds + workArea, and physical px: pixelBounds + pixelWorkArea.
      // We don't assume which unit GetWindowRect is in; instead we score
      // candidates and choose the one that looks most fullscreen-like.
      const snapRatio = 0.93;

      const candidates = [];

      const sf = monitor.scaleFactor || 1;
      const windowRectDip = {
        // PowerShell's GetWindowRect output is already effectively in DIP
        // for the monitor we captured on. Dividing by scaleFactor shrinks
        // fullscreen windows (~78%).
        left: windowRect.left,
        top: windowRect.top,
        right: windowRect.right,
        bottom: windowRect.bottom,
      };
      const windowRectPx = {
        left: windowRect.left * sf,
        top: windowRect.top * sf,
        right: windowRect.right * sf,
        bottom: windowRect.bottom * sf,
      };

      const pushCandidateWithWindow = (base, windowForCalc, spaceLabel) => {
        if (!base) return;
        const denomW = base.width;
        const denomH = base.height;
        if (!Number.isFinite(denomW) || !Number.isFinite(denomH) || denomW <= 0 || denomH <= 0) return;

        const visibleLeft = Math.max(windowForCalc.left, base.x);
        const visibleTop = Math.max(windowForCalc.top, base.y);
        const visibleRight = Math.min(windowForCalc.right, base.x + base.width);
        const visibleBottom = Math.min(windowForCalc.bottom, base.y + base.height);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        const relLeft = ((visibleLeft - base.x) / denomW) * 100;
        const relTop = ((visibleTop - base.y) / denomH) * 100;
        const relW = (visibleWidth / denomW) * 100;
        const relH = (visibleHeight / denomH) * 100;

        candidates.push({
          relLeft,
          relTop,
          relW,
          relH,
          score: relW * relH,
          fullscreenError: Math.abs(relW - 100) + Math.abs(relH - 100),
          spaceLabel,
        });
      };

      pushCandidateWithWindow(monitor.bounds || null, windowRectDip, 'dip-bounds');
      pushCandidateWithWindow(monitor.workArea || null, windowRectDip, 'dip-workArea');
      pushCandidateWithWindow(monitor.pixelBounds || null, windowRectPx, 'px-bounds');
      pushCandidateWithWindow(monitor.pixelWorkArea || null, windowRectPx, 'px-workArea');

      // Default if somehow we couldn't compute candidates.
      let best = candidates[0] || {
        relLeft: 0,
        relTop: 0,
        relW: 100,
        relH: 100,
        fullscreenError: 0,
        score: 0,
      };

      const fullscreenCandidates = candidates.filter(
        (c) => c.relW >= snapRatio * 100 && c.relH >= snapRatio * 100
      );
      if (fullscreenCandidates.length > 0) {
        best = fullscreenCandidates.reduce(
          (a, b) => (b.fullscreenError < a.fullscreenError ? b : a),
          fullscreenCandidates[0]
        );
      } else {
        // Otherwise choose the candidate with the largest area.
        for (const c of candidates) {
          if (c.score > best.score) best = c;
        }
      }

      let relLeft = best.relLeft;
      let relTop = best.relTop;
      let relW = best.relW;
      let relH = best.relH;

      // Edge-based fullscreen detection:
      // If a window is truly maximized/fullscreen, its edges should line up with
      // the monitor or workArea edges. On some portrait/mixed-DPI setups, our
      // relative-size computation can still under-measure (e.g. ~78%), so we
      // override based on edge alignment instead of only relW/relH.
      const windowDip = {
        left: windowRect.left,
        top: windowRect.top,
        right: windowRect.right,
        bottom: windowRect.bottom,
      };
      const windowPx = {
        left: windowRect.left * sf,
        top: windowRect.top * sf,
        right: windowRect.right * sf,
        bottom: windowRect.bottom * sf,
      };

      const nearlyWithin = (a, b, tol) => Math.abs(a - b) <= tol;
      const alignToBase = (base, win) => {
        if (!base) return false;
        const baseLeft = base.x;
        const baseTop = base.y;
        const baseRight = base.x + base.width;
        const baseBottom = base.y + base.height;
        const tolX = Math.max(3, base.width * 0.01);
        const tolY = Math.max(3, base.height * 0.01);
        return (
          nearlyWithin(win.left, baseLeft, tolX)
          && nearlyWithin(win.top, baseTop, tolY)
          && nearlyWithin(win.right, baseRight, tolX)
          && nearlyWithin(win.bottom, baseBottom, tolY)
        );
      };

      const isFullscreenAligned = (
        alignToBase(monitor.workArea, windowDip)
        || alignToBase(monitor.bounds, windowDip)
        || alignToBase(monitor.pixelWorkArea, windowPx)
        || alignToBase(monitor.pixelBounds, windowPx)
      );

      if (isFullscreenAligned) {
        relLeft = 0;
        relTop = 0;
        relW = 100;
        relH = 100;
      }

      if (debugEnabled) {
        const nameLc = String(windowInfo.name || '').toLowerCase();
        if (nameLc.includes('spotify') && !spotifyDebugData) {
          spotifyDebugData = {
            app: windowInfo.name,
            sf,
            windowW: windowRect.right - windowRect.left,
            windowH: windowRect.bottom - windowRect.top,
            edgeAligned: isFullscreenAligned,
            chosen: {
              relW,
              relH,
              relLeft,
              relTop,
              score: best.score,
              spaceLabel: best.spaceLabel,
            },
          };
        } else if (nameLc.includes('nvidia overlay') && !nvidiaDebugData) {
          nvidiaDebugData = {
            app: windowInfo.name,
            sf,
            windowW: windowRect.right - windowRect.left,
            windowH: windowRect.bottom - windowRect.top,
            edgeAligned: isFullscreenAligned,
            chosen: {
              relW,
              relH,
              relLeft,
              relTop,
              score: best.score,
              spaceLabel: best.spaceLabel,
            },
          };
        }
      }

      // Windows decorations/titlebars/shadows can cause us to measure slightly smaller than 100%.
      // Snap near-maximized/fullscreen windows to eliminate systematic under-sizing.
      if (relW >= snapRatio * 100) {
        relW = 100;
        relLeft = 0;
      }
      if (relH >= snapRatio * 100) {
        relH = 100;
        relTop = 0;
      }

      // Portrait fullscreen heuristic:
      // In some DPI/rotation combos, width can be under-measured badly while
      // height still comes in as fullscreen (e.g. ~25%x100%).
      // If height is ~fullscreen on a portrait monitor, force width to fullscreen too.
      if (
        monitor.orientation === 'portrait'
        && relH >= snapRatio * 100
        && relW < 60
      ) {
        relW = 100;
        relLeft = 0;
      }
      // Renderer positions are center-based, so convert top-left to center.
      const relX = relLeft + (relW / 2);
      const relY = relTop + (relH / 2);

      // Keep capture fast: avoid per-window icon extraction here.
      // Memory capture prioritizes layout correctness and responsiveness.
      const iconPath = null;

      const round1 = (n) => Math.round(n * 10) / 10;
      const mappedWindow = {
        name: windowInfo.name,
        iconPath,
        position: {
          x: Math.max(0, Math.min(100, round1(relX))),
          y: Math.max(0, Math.min(100, round1(relY))),
        },
        size: {
          width: Math.max(1, Math.min(100, round1(relW))),
          height: Math.max(1, Math.min(100, round1(relH))),
        },
      };

      if (windowInfo.isMinimized) {
        minimizedApps.push({
          ...mappedWindow,
          targetMonitor: monitor.id,
          sourcePosition: mappedWindow.position,
          sourceSize: mappedWindow.size,
        });
      } else {
        monitor.apps.push(mappedWindow);
      }
    }

    if (debugEnabled) {
      const debug = spotifyDebugData || nvidiaDebugData;
      if (debug) console.warn('[capture-debug]', debug);
    }

    const orderedMonitors = targetMonitors
      .slice()
      .sort((a, b) => (
        a.bounds.y - b.bounds.y
        || a.bounds.x - b.bounds.x
        || Number(b.primary) - Number(a.primary)
      ));

    return {
      capturedAt: Date.now(),
      appCount: uniqueWindows.length,
      monitors: orderedMonitors.map(({ bounds, workArea, pixelBounds, pixelWorkArea, ...rest }) => rest),
      minimizedApps,
    };
  } catch (err) {
    console.error('Error in capture-running-app-layout handler:', err);
    return {
      capturedAt: Date.now(),
      appCount: 0,
      monitors: [],
      error: 'Failed to capture running app layout',
    };
  }
});
// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
