const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const ws = require('windows-shortcuts');
const { scanForExeFiles } = require('./scanExeFiles');
const { getRegistryInstalledApps } = require('./registryApps');
const {
  hiddenProcessNamePatterns,
  hiddenWindowTitlePatterns,
  getRunningWindowProcesses,
} = require('./services/windows-process-service');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

const iconDataUrlCache = new Map();

const normalizePathForWindows = (value) => (
  String(value || '')
    .replace(/\//g, '\\')
    .trim()
);

const extractPathFromRawValue = (raw, allowedExtensions) => {
  if (!raw) return null;
  const rawValue = String(raw).trim();
  if (!rawValue || rawValue.includes('\0')) return null;

  const extAlternation = allowedExtensions
    .map((ext) => ext.replace('.', '\\.'))
    .join('|');
  const pathRegex = new RegExp(`([a-zA-Z]:\\\\[^,\\r\\n]*?\\.(?:${extAlternation}))`, 'i');
  const quotedRegex = new RegExp(`"([^"]+\\.(?:${extAlternation}))"`, 'i');

  const sanitized = rawValue.replace(/^"(.*)"$/, '$1').trim();
  const withoutIconIndex = sanitized.split(',')[0]?.trim() || '';

  const quotedMatch = rawValue.match(quotedRegex);
  const unquotedMatch = rawValue.match(pathRegex);
  const candidates = [
    quotedMatch?.[1],
    unquotedMatch?.[1],
    withoutIconIndex,
  ].filter(Boolean);

  let resolvedPath = null;
  for (const candidate of candidates) {
    const normalized = normalizePathForWindows(candidate);
    const lower = normalized.toLowerCase();
    const hasAllowedExtension = allowedExtensions.some((ext) => lower.endsWith(ext));
    if (!hasAllowedExtension) continue;
    if (normalized.startsWith('\\\\') || normalized.startsWith('\\\\?\\')) continue;
    if (!path.isAbsolute(normalized) || !fs.existsSync(normalized)) continue;
    try {
      if (!fs.statSync(normalized).isFile()) continue;
    } catch {
      continue;
    }
    resolvedPath = normalized;
    break;
  }

  if (!resolvedPath) return null;
  return resolvedPath;
};

const extractExecutablePath = (raw) => {
  const exePath = extractPathFromRawValue(raw, ['.exe']);
  if (!exePath) return null;
  try {
    if (!fs.statSync(exePath).isFile()) return null;
  } catch {
    return null;
  }
  return exePath;
};

const extractIconSourcePath = (raw) => (
  extractPathFromRawValue(raw, ['.exe', '.ico', '.dll', '.png', '.jpg', '.jpeg', '.webp', '.bmp'])
);

const imageMimeTypeByExt = {
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

const toImageDataUrlFromFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const mime = imageMimeTypeByExt[ext];
  if (!mime) return null;
  try {
    const binary = fs.readFileSync(filePath);
    return `data:${mime};base64,${binary.toString('base64')}`;
  } catch {
    return null;
  }
};

const getSafeIconDataUrl = async (iconSourcePath) => {
  const safePath = extractIconSourcePath(iconSourcePath);
  if (!safePath) return null;

  const cached = iconDataUrlCache.get(safePath);
  if (cached !== undefined) return cached;

  try {
    const directImageDataUrl = toImageDataUrlFromFile(safePath);
    if (directImageDataUrl) {
      iconDataUrlCache.set(safePath, directImageDataUrl);
      return directImageDataUrl;
    }

    const nativeIcon = await app.getFileIcon(safePath, { size: 'normal' });
    if (!nativeIcon || nativeIcon.isEmpty()) {
      // Fallback for files that can be loaded directly as image assets.
      const imageFallback = nativeImage.createFromPath(safePath);
      if (imageFallback && !imageFallback.isEmpty()) {
        const fallbackDataUrl = imageFallback.toDataURL();
        iconDataUrlCache.set(safePath, fallbackDataUrl);
        return fallbackDataUrl;
      }
      iconDataUrlCache.set(safePath, null);
      return null;
    }
    const dataUrl = nativeIcon.toDataURL();
    iconDataUrlCache.set(safePath, dataUrl);
    return dataUrl;
  } catch {
    iconDataUrlCache.set(safePath, null);
    return null;
  }
};

const SHELL_HOST_EXECUTABLES = new Set([
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'wscript.exe',
  'cscript.exe',
  'conhost.exe',
]);

const isInstallerLikeExecutable = (filePath = '') => {
  if (!filePath) return false;
  const baseName = path.basename(String(filePath), path.extname(String(filePath))).toLowerCase();
  if (!baseName) return false;
  return (
    baseName.includes('setup')
    || baseName.includes('install')
    || baseName.includes('uninstall')
    || baseName.includes('repair')
    || baseName.includes('prereq')
    || baseName === 'vc_redist.x64'
    || baseName === 'vc_redist.x86'
    || baseName === 'vcredist_x64'
    || baseName === 'vcredist_x86'
    || baseName === 'launcherprereqsetup_x64'
  );
};

const expandWindowsEnvVars = (raw = '') => (
  String(raw).replace(/%([^%]+)%/g, (_match, varName) => process.env[varName] || '')
);

const parseInternetShortcut = (shortcutPath) => {
  try {
    const rawContent = fs.readFileSync(shortcutPath, 'utf8');
    const values = {};
    for (const line of rawContent.split(/\r?\n/)) {
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!key) continue;
      values[key] = value;
    }
    return {
      url: values.URL || '',
      iconFile: expandWindowsEnvVars(values.IconFile || ''),
    };
  } catch {
    return { url: '', iconFile: '' };
  }
};

const isAppProtocolUrl = (value = '') => {
  const raw = String(value || '').trim();
  const match = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  if (!match) return false;
  const protocol = match[1].toLowerCase();
  return protocol !== 'http' && protocol !== 'https' && protocol !== 'file';
};

const getCanonicalAppKey = (value = '') => (
  String(value || '')
    .toLowerCase()
    // Drop common trailing version tokens: "App 1.2.3", "App v2", "App (64-bit)".
    .replace(/\s+v?\d+([._-]\d+)*(\s*(x64|x86|64-bit|32-bit))?$/i, '')
    .replace(/\s+\(?(x64|x86|64-bit|32-bit)\)?$/i, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim()
);

const SERVICE_LIKE_EXECUTABLE_TOKENS = [
  'service',
  'helper',
  'container',
  'telemetry',
  'runtimebroker',
  'crashpad',
];

const isLikelyBackgroundBinary = (filePath = '') => {
  if (!filePath) return false;
  const baseName = path.basename(String(filePath), path.extname(String(filePath))).toLowerCase();
  return SERVICE_LIKE_EXECUTABLE_TOKENS.some((token) => baseName.includes(token));
};

const parseSteamGameId = (value = '') => {
  const match = String(value).match(/steam:\/\/rungameid\/(\d+)/i);
  return match?.[1] || null;
};

const getSteamInstallCandidates = () => {
  const candidates = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Steam'),
    path.join(process.env.ProgramFiles || '', 'Steam'),
    path.join(process.env.LOCALAPPDATA || '', 'Steam'),
  ].filter(Boolean);
  return [...new Set(candidates)];
};

const resolveSteamGameIconPath = (appId) => {
  if (!appId) return null;
  const roots = getSteamInstallCandidates();
  const relativeCandidates = [
    path.join('steam', 'games', `${appId}.ico`),
    path.join('appcache', 'librarycache', `${appId}_icon.jpg`),
    path.join('appcache', 'librarycache', `${appId}_icon.png`),
  ];

  for (const root of roots) {
    for (const rel of relativeCandidates) {
      const full = path.join(root, rel);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
};

const isLikelyUserApp = (name, sourcePath = '', context = {}) => {
  const safeName = String(name || '').trim();
  if (!safeName) return false;

  const targetExe = normalizePathForWindows(context.targetExe || '').toLowerCase();
  if (targetExe && SHELL_HOST_EXECUTABLES.has(path.basename(targetExe))) {
    return false;
  }
  if (targetExe && isLikelyBackgroundBinary(targetExe)) {
    return false;
  }

  const lowerSourcePath = String(sourcePath || '').toLowerCase();
  if (
    lowerSourcePath.includes('\\windows\\system32\\')
    || lowerSourcePath.includes('\\windows\\syswow64\\')
    || lowerSourcePath.includes('\\programdata\\package cache\\')
  ) {
    return false;
  }

  if (isInstallerLikeExecutable(sourcePath)) {
    return false;
  }

  const registryMeta = context.registryMeta || null;
  if (registryMeta) {
    if (registryMeta.systemComponent) return false;
    if (registryMeta.parentKeyName) return false;
    const releaseType = String(registryMeta.releaseType || '').toLowerCase();
    if (
      releaseType.includes('update')
      || releaseType.includes('hotfix')
      || releaseType.includes('security')
    ) {
      return false;
    }
    if (isInstallerLikeExecutable(registryMeta.uninstallString || '')) {
      return false;
    }
  }

  if (
    context.source === 'start-menu-shortcut'
    && !context.targetExe
    && !context.iconSource
    && !context.hasShortcutIcon
  ) {
    return false;
  }

  if (context.source === 'start-menu-url' && !context.isAppProtocol) {
    return false;
  }

  return true;
};

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

app.whenReady().then(() => {
  createWindow();

  // On macOS, re-create a window when the dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  const existingWindow = BrowserWindow.getAllWindows()[0];
  if (!existingWindow) return;
  if (existingWindow.isMinimized()) existingWindow.restore();
  existingWindow.focus();
});

// Listen for 'launch-profile' IPC events from the renderer process
ipcMain.on('launch-profile', (event) => {
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
    const appMap = new Map();
    const seenStartMenuKeys = new Set();
    const sourcePriority = {
      'start-menu-shortcut': 3,
      'start-menu-url': 3,
      registry: 2,
      'exe-scan': 1,
    };
    const upsertDiscoveredApp = (appName, iconPath, sourcePath = '', context = {}) => {
      if (!isLikelyUserApp(appName, sourcePath, context)) return;
      const normalizedName = String(appName || '').trim();
      const key = getCanonicalAppKey(normalizedName) || normalizedName.toLowerCase();
      if (!key) return;

      const nextPriority = sourcePriority[context.source] || 0;
      const existing = appMap.get(key);

      if (context.source === 'start-menu-shortcut' || context.source === 'start-menu-url') {
        seenStartMenuKeys.add(key);
      }

      if (!existing) {
        appMap.set(key, {
          name: normalizedName,
          iconPath: iconPath || null,
          priority: nextPriority,
        });
        return;
      }

      const currentPriority = existing.priority || 0;
      const preferredName = currentPriority >= nextPriority ? existing.name : normalizedName;
      const preferredPriority = Math.max(currentPriority, nextPriority);
      const preferredIcon = existing.iconPath || iconPath || null;

      appMap.set(key, {
        name: preferredName,
        iconPath: preferredIcon,
        priority: preferredPriority,
      });
    };

    const isRegistryCandidateAllowedWithoutStartMenu = (appMeta, iconSourcePath) => {
      const canonicalKey = getCanonicalAppKey(appMeta.name);
      if (seenStartMenuKeys.has(canonicalKey)) return true;

      // Include registry-only apps only when they look like user-launchable GUI apps.
      const source = String(iconSourcePath || '').toLowerCase();
      if (!source) return false;
      if (isLikelyBackgroundBinary(source)) return false;
      if (
        source.includes('\\nvidia corporation\\')
        || source.includes('\\windows\\')
        || source.includes('\\programdata\\package cache\\')
      ) {
        return false;
      }

      return (
        source.includes('\\program files\\')
        || source.includes('\\program files (x86)\\')
        || source.includes('\\appdata\\local\\programs\\')
      );
    };

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
          } catch {
            // Keep discovery resilient: one failing shortcut/icon extraction
            // should not fail the whole installed-app scan.
          }
        }
      };

      const workers = Array.from({ length: safeLimit }, () => worker());
      await Promise.all(workers);
    };

    const iconFailureSummary = {
      shortcut: 0,
      registry: 0,
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
                  const timeout = setTimeout(() => resolve(), 400);
                  ws.query(fullPath, async (err, info) => {
                    try {
                      clearTimeout(timeout);
                      const normalizedTargetExe = !err && info
                        ? extractExecutablePath(info.target || info.targetPath || info.path)
                        : null;
                      const normalizedIconSource = !err && info && info.icon
                        ? extractIconSourcePath(info.icon)
                        : normalizedTargetExe;

                      // If we already discovered this app with an icon, skip expensive rework.
                      const existing = appMap.get(name);
                      if (existing?.iconPath) return resolve();

                      let iconPath = null;
                      if (normalizedIconSource) {
                        iconPath = await getSafeIconDataUrl(normalizedIconSource);
                        if (!iconPath) {
                          iconFailureSummary.shortcut += 1;
                        }
                      }

                      // Safe fallback: get icon from the shortcut itself (helps game launchers/Steam links).
                      if (!iconPath) {
                        const shortcutIcon = await getSafeIconDataUrl(fullPath);
                        if (shortcutIcon) {
                          iconPath = shortcutIcon;
                        }
                      }

                      upsertDiscoveredApp(
                        name,
                        iconPath,
                        normalizedIconSource || normalizedTargetExe || fullPath,
                        {
                          source: 'start-menu-shortcut',
                          shortcutPath: fullPath,
                          targetExe: normalizedTargetExe,
                          iconSource: normalizedIconSource,
                          hasShortcutIcon: !!iconPath,
                        },
                      );
                    } finally {
                      resolve();
                    }
                  });
                }));
              } catch (e) {
                console.warn(`[StartMenu] Exception handling shortcut '${entry.name}':`, e);
              }
            } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.url')) {
              const name = entry.name.replace(/\.url$/i, '');
              const shortcut = parseInternetShortcut(fullPath);
              const iconSource = extractIconSourcePath(shortcut.iconFile);
              const isProtocolApp = isAppProtocolUrl(shortcut.url);
              const steamAppId = parseSteamGameId(shortcut.url);
              shortcutTasks.push(async () => {
                let iconPath = null;
                if (iconSource) {
                  iconPath = await getSafeIconDataUrl(iconSource);
                }
                if (!iconPath && steamAppId) {
                  const steamIconPath = resolveSteamGameIconPath(steamAppId);
                  if (steamIconPath) {
                    iconPath = await getSafeIconDataUrl(steamIconPath);
                  }
                }
                if (!iconPath) {
                  const shortcutIcon = await getSafeIconDataUrl(fullPath);
                  if (shortcutIcon) iconPath = shortcutIcon;
                }
                upsertDiscoveredApp(
                  name,
                  iconPath,
                  iconSource || fullPath,
                  {
                    source: 'start-menu-url',
                    shortcutPath: fullPath,
                    iconSource,
                    hasShortcutIcon: !!iconPath,
                    isAppProtocol: isProtocolApp,
                    steamAppId,
                  },
                );
              });
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
      const normalizedIconSource = extractIconSourcePath(app.iconSource);
      if (!isLikelyUserApp(app.name, normalizedIconSource || app.iconSource, { source: 'registry', registryMeta: app })) {
        continue;
      }
      if (!isRegistryCandidateAllowedWithoutStartMenu(app, normalizedIconSource || app.iconSource)) {
        continue;
      }
      if (!normalizedIconSource) {
        upsertDiscoveredApp(app.name, null, app.iconSource, { source: 'registry', registryMeta: app });
        continue;
      }
      const iconPath = await getSafeIconDataUrl(normalizedIconSource);
      if (!iconPath) {
        iconFailureSummary.registry += 1;
      }
      upsertDiscoveredApp(app.name, iconPath, normalizedIconSource, { source: 'registry', registryMeta: app });
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
        if (!isLikelyUserApp(name, exePath, { source: 'exe-scan' })) continue;
        if (!appMap.has(name)) {
          let iconPath = null;
          try {
            iconPath = await getSafeIconDataUrl(exePath);
            if (!iconPath) {
              console.warn(`[ExeScan] Safe icon lookup failed for '${name}'.`);
            }
          } catch {
            console.warn(`[ExeScan] Safe icon lookup threw for '${name}'.`);
          }
          upsertDiscoveredApp(name, iconPath, exePath, { source: 'exe-scan' });
        } else if (!appMap.get(name).iconPath) {
          const iconPath = await getSafeIconDataUrl(exePath);
          if (iconPath) {
            upsertDiscoveredApp(name, iconPath, exePath, { source: 'exe-scan' });
          }
        }
      }
    }
    await runWithConcurrencyLimit(shortcutTasks, 6);
    if (iconFailureSummary.shortcut > 0 || iconFailureSummary.registry > 0) {
      console.warn(
        `[InstalledApps] Icon extraction failures (shortcut=${iconFailureSummary.shortcut}, registry=${iconFailureSummary.registry}).`,
      );
    }
    return Array.from(appMap.values())
      .map(({ name, iconPath }) => ({ name, iconPath }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
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
      monitors: orderedMonitors.map((monitor) => {
        const cleanedMonitor = { ...monitor };
        delete cleanedMonitor.bounds;
        delete cleanedMonitor.workArea;
        delete cleanedMonitor.pixelBounds;
        delete cleanedMonitor.pixelWorkArea;
        return cleanedMonitor;
      }),
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
