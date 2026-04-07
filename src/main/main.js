const { app, BrowserWindow, ipcMain, nativeImage, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');
const { spawn, execFile } = require('child_process');
const ws = require('windows-shortcuts');
const { scanForExeFiles } = require('./scanExeFiles');
const { getRegistryInstalledApps } = require('./registryApps');
const {
  readProfilesFromDisk,
  writeProfilesToDisk,
} = require('./services/profile-store');
const { sanitizeProfileIconPathsDeep } = require('./utils/profile-icon-paths');
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

// GPU process can crash on some Windows driver stacks (seen as 0xC0000409),
// which leads to renderer blackscreens. Force software rendering path.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('use-gl', 'swiftshader');
app.commandLine.appendSwitch('disable-direct-composition');
app.commandLine.appendSwitch('disable-d3d11');
app.commandLine.appendSwitch(
  'disable-features',
  'UseSkiaRenderer,Vulkan,CanvasOopRasterization,VizDisplayCompositor,Accelerated2dCanvas',
);

const iconDataUrlCache = new Map();
const DEV_SERVER_URL = 'http://localhost:5173';
const MAX_PROFILE_COUNT = 200;
const MAX_PROFILE_ID_LENGTH = 128;
const MAX_PROFILE_NAME_LENGTH = 256;
const MAX_PROFILE_PAYLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_URL_LENGTH = 2048;

const getDistIndexPath = () => path.join(__dirname, '../../dist/index.html');

const getAppEntryUrl = () => (
  app.isPackaged
    ? pathToFileURL(getDistIndexPath()).href
    : DEV_SERVER_URL
);

/** CSP for the app shell: dev allows Vite HMR; prod is stricter (no eval). */
const getContentSecurityPolicy = () => {
  if (!app.isPackaged) {
    return [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' http://localhost:5173 http://127.0.0.1:5173 ws://localhost:5173 ws://127.0.0.1:5173",
      "media-src 'self' data: blob:",
      "worker-src 'self' blob:",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
  ].join('; ');
};

const shouldInjectAppCsp = (requestUrl) => {
  if (!requestUrl) return false;
  try {
    if (!app.isPackaged) {
      const u = new URL(requestUrl);
      return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.port === '5173';
    }
    const distHref = pathToFileURL(getDistIndexPath()).href;
    const base = distHref.split('#')[0].split('?')[0];
    const reqBase = String(requestUrl).split('#')[0].split('?')[0];
    return reqBase === base || reqBase.startsWith(`${base}/`);
  } catch {
    return false;
  }
};

const setupSessionSecurity = () => {
  const defaultSession = session.defaultSession;

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    console.warn('[session] blocked permission request:', permission);
    callback(false);
  });

  defaultSession.setPermissionCheckHandler(() => false);

  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame' || !shouldInjectAppCsp(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const responseHeaders = { ...details.responseHeaders };
    const csp = getContentSecurityPolicy();
    responseHeaders['Content-Security-Policy'] = [csp];
    callback({ responseHeaders });
  });
};

const getDistDirPath = () => path.join(__dirname, '../../dist');

const isTrustedPackagedFileUrl = (raw = '') => {
  if (!raw.startsWith('file://')) return false;
  try {
    const normalized = String(raw).split('#')[0].split('?')[0];
    const filePath = path.normalize(fileURLToPath(normalized));
    const distDir = path.normalize(getDistDirPath());
    const indexPath = path.normalize(getDistIndexPath());
    return filePath === indexPath || filePath.startsWith(`${distDir}${path.sep}`);
  } catch {
    return false;
  }
};

const isTrustedRendererUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (app.isPackaged) return isTrustedPackagedFileUrl(raw);
  return raw.startsWith(`${DEV_SERVER_URL}/`) || raw === DEV_SERVER_URL;
};

const isTrustedIpcSender = (event) => (
  isTrustedRendererUrl(event?.senderFrame?.url || '')
);

const handleTrustedIpc = (channel, handler) => {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedIpcSender(event)) {
      const senderUrl = String(event?.senderFrame?.url || '');
      console.warn(`[ipc:${channel}] Blocked untrusted sender: ${senderUrl || '<empty>'}`);
      throw new Error('Untrusted renderer origin');
    }
    return handler(event, ...args);
  });
};

const safeLimitedString = (value, maxLength) => {
  const str = String(value || '').trim();
  if (!str) return '';
  return str.slice(0, Math.max(1, Number(maxLength || 1)));
};

const isSafeExternalHttpUrl = (value) => {
  const candidate = safeLimitedString(value, MAX_URL_LENGTH);
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

const normalizeSafeUrl = (value) => (
  isSafeExternalHttpUrl(value) ? safeLimitedString(value, MAX_URL_LENGTH) : ''
);

const sanitizeProfilesPayload = (profiles) => {
  if (!Array.isArray(profiles)) {
    throw new Error('Profiles payload must be an array');
  }
  if (profiles.length > MAX_PROFILE_COUNT) {
    throw new Error('Profiles payload exceeds maximum profile count');
  }

  const serialized = JSON.stringify(profiles);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROFILE_PAYLOAD_SIZE_BYTES) {
    throw new Error('Profiles payload exceeds size limit');
  }

  return profiles
    .filter((profile) => profile && typeof profile === 'object' && !Array.isArray(profile))
    .map((profile) => {
      const normalized = { ...profile };
      normalized.id = safeLimitedString(profile.id, MAX_PROFILE_ID_LENGTH);
      normalized.name = safeLimitedString(profile.name, MAX_PROFILE_NAME_LENGTH);
      if (Array.isArray(profile.browserTabs)) {
        normalized.browserTabs = profile.browserTabs
          .map((tab) => {
            const url = normalizeSafeUrl(tab?.url);
            if (!url) return null;
            return { ...tab, url };
          })
          .filter(Boolean);
      }
      if (Array.isArray(profile.actions)) {
        normalized.actions = profile.actions
          .map((action) => {
            if (action?.type !== 'browserTab') return action;
            const url = normalizeSafeUrl(action?.url);
            if (!url) return null;
            return { ...action, url };
          })
          .filter(Boolean);
      }
      return sanitizeProfileIconPathsDeep(normalized);
    });
};

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

const isDisallowedLaunchExecutablePath = (value = '') => {
  const normalized = normalizePathForWindows(value).toLowerCase();
  if (!normalized) return true;
  const base = path.basename(normalized);
  return SHELL_HOST_EXECUTABLES.has(base);
};

const extractIconSourcePath = (raw) => (
  extractPathFromRawValue(raw, ['.exe', '.ico', '.dll', '.png', '.jpg', '.jpeg', '.webp', '.bmp'])
);

const imageMimeTypeByExt = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

const toImageDataUrlFromFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  // Let Electron/nativeImage handle .ico so we don't accidentally use a tiny embedded frame.
  if (ext === '.ico') return null;
  const mime = imageMimeTypeByExt[ext];
  if (!mime) return null;
  try {
    const binary = fs.readFileSync(filePath);
    return `data:${mime};base64,${binary.toString('base64')}`;
  } catch {
    return null;
  }
};

const getWindowIconPath = () => {
  const logoPath = path.join(__dirname, '../../public/flowswitch-logo.png');
  if (fs.existsSync(logoPath)) return logoPath;
  return undefined;
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

    // Prefer large icons for sharper rendering in monitor layout previews.
    let nativeIcon = await app.getFileIcon(safePath, { size: 'large' });
    if (!nativeIcon || nativeIcon.isEmpty()) {
      nativeIcon = await app.getFileIcon(safePath, { size: 'normal' });
    }
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
  const isWindows = process.platform === 'win32';
  const icon = getWindowIconPath();
  const appEntryUrl = getAppEntryUrl();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1080,
    minHeight: 700,
    icon,
    autoHideMenuBar: true,
    titleBarStyle: isWindows ? 'hidden' : 'default',
    titleBarOverlay: isWindows
      ? {
          color: '#0f172a',
          symbolColor: '#e2e8f0',
          height: 36,
        }
      : false,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'), // Preload script for secure IPC
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] renderer process gone:', details);
  });
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error('[electron] main frame failed to load:', {
      code,
      description,
      validatedURL,
    });
  });
  win.webContents.on('unresponsive', () => {
    console.error('[electron] window became unresponsive');
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url)) return;
    event.preventDefault();
    console.warn('[electron] blocked renderer navigation to untrusted URL:', url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalHttpUrl(url)) {
      return { action: 'allow' };
    }
    console.warn('[electron] blocked window.open for untrusted URL:', url);
    return { action: 'deny' };
  });
  win.removeMenu();
  win.loadURL(appEntryUrl);
};


app.whenReady().then(() => {
  setupSessionSecurity();
  Menu.setApplicationMenu(null);
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

const buildSystemMonitorSnapshot = () => {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const primaryDisplayId = screen.getPrimaryDisplay().id;

  const monitors = displays.map((display, idx) => ({
    id: `monitor-${display.id}`,
    name: `Monitor ${idx + 1}`,
    systemName: (display.label && String(display.label).trim()) ? String(display.label).trim() : null,
    primary: display.id === primaryDisplayId,
    scaleFactor: display.scaleFactor,
    resolution: `${Math.round(display.bounds.width * display.scaleFactor)}x${Math.round(display.bounds.height * display.scaleFactor)}`,
    orientation: (
      display.rotation === 90
      || display.rotation === 270
      || display.bounds.height > display.bounds.width
    ) ? 'portrait' : 'landscape',
    layoutPosition: { x: display.bounds.x, y: display.bounds.y },
    bounds: display.bounds,
    workArea: display.workArea,
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

  return monitors.length > 0 ? monitors : [{
    id: 'monitor-1',
    name: 'Monitor 1',
    systemName: null,
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
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const sortMonitorsByLayout = (monitors) => (
  [...(Array.isArray(monitors) ? monitors : [])].sort((a, b) => (
    (a?.layoutPosition?.y ?? a?.bounds?.y ?? 0) - (b?.layoutPosition?.y ?? b?.bounds?.y ?? 0)
    || (a?.layoutPosition?.x ?? a?.bounds?.x ?? 0) - (b?.layoutPosition?.x ?? b?.bounds?.x ?? 0)
    || Number(Boolean(b?.primary)) - Number(Boolean(a?.primary))
  ))
);

const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

const parseMonitorOrdinal = (value) => {
  const input = String(value || '').trim();
  if (!input) return null;

  const match = input.match(/(?:^|\s|-)monitor\s*([0-9]+)$/i) || input.match(/^monitor-([0-9]+)$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const createProfileMonitorMap = (profileMonitors, systemMonitors) => {
  const profileList = sortMonitorsByLayout(profileMonitors);
  const systemList = sortMonitorsByLayout(systemMonitors);
  const usedSystemIds = new Set();
  const bySystemId = new Map(systemList.map((monitor) => [monitor.id, monitor]));
  const bySystemName = new Map();
  for (const monitor of systemList) {
    const key = normalizeLabel(monitor?.systemName);
    if (key && !bySystemName.has(key)) bySystemName.set(key, monitor);
  }
  const byMonitorOrdinal = new Map();
  for (const monitor of systemList) {
    const ordinal = parseMonitorOrdinal(monitor?.name);
    if (ordinal && !byMonitorOrdinal.has(ordinal)) {
      byMonitorOrdinal.set(ordinal, monitor);
    }
  }

  const closestByLayout = (profileMonitor) => {
    const px = Number(profileMonitor?.layoutPosition?.x ?? NaN);
    const py = Number(profileMonitor?.layoutPosition?.y ?? NaN);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const monitor of systemList) {
      if (usedSystemIds.has(monitor.id)) continue;
      const mx = Number(monitor?.layoutPosition?.x ?? monitor?.bounds?.x ?? NaN);
      const my = Number(monitor?.layoutPosition?.y ?? monitor?.bounds?.y ?? NaN);
      if (!Number.isFinite(mx) || !Number.isFinite(my)) continue;
      const dx = px - mx;
      const dy = py - my;
      const distance = (dx * dx) + (dy * dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = monitor;
      }
    }
    return best;
  };

  const pickFirstUnused = () => systemList.find((monitor) => !usedSystemIds.has(monitor.id)) || systemList[0] || null;

  const mapping = new Map();
  profileList.forEach((profileMonitor, index) => {
    let target = null;
    if (profileMonitor?.id && bySystemId.has(profileMonitor.id) && !usedSystemIds.has(profileMonitor.id)) {
      target = bySystemId.get(profileMonitor.id);
    }
    if (!target) {
      const nameMatch = bySystemName.get(normalizeLabel(profileMonitor?.systemName));
      if (nameMatch && !usedSystemIds.has(nameMatch.id)) {
        target = nameMatch;
      }
    }
    if (!target) {
      const ordinal = (
        parseMonitorOrdinal(profileMonitor?.name)
        || parseMonitorOrdinal(profileMonitor?.id)
      );
      const ordinalMatch = ordinal ? byMonitorOrdinal.get(ordinal) : null;
      if (ordinalMatch && !usedSystemIds.has(ordinalMatch.id)) {
        target = ordinalMatch;
      }
    }
    if (!target) {
      target = closestByLayout(profileMonitor);
    }
    if (!target) {
      const indexCandidate = systemList[index];
      if (indexCandidate && !usedSystemIds.has(indexCandidate.id)) {
        target = indexCandidate;
      }
    }
    if (!target) {
      target = pickFirstUnused();
    }

    if (profileMonitor?.id && target) {
      mapping.set(profileMonitor.id, target);
      usedSystemIds.add(target.id);
    }
  });

  return mapping;
};

const buildWindowBoundsForApp = (app, monitor, launchState) => {
  const workArea = monitor?.workArea || monitor?.bounds;
  if (!workArea) return null;

  const hasExplicitSize = (
    Number.isFinite(Number(app?.size?.width))
    && Number.isFinite(Number(app?.size?.height))
  );
  const hasExplicitPosition = (
    Number.isFinite(Number(app?.position?.x))
    && Number.isFinite(Number(app?.position?.y))
  );
  const hasSourceGeometry = (
    Number.isFinite(Number(app?.sourceSize?.width))
    && Number.isFinite(Number(app?.sourceSize?.height))
    && Number.isFinite(Number(app?.sourcePosition?.x))
    && Number.isFinite(Number(app?.sourcePosition?.y))
  );

  const appSize = app?.size || {};
  const appPosition = app?.position || app?.sourcePosition || {};
  const widthPct = clamp(Number(appSize.width || 70), 5, 100);
  const heightPct = clamp(Number(appSize.height || 70), 5, 100);
  const centerXPct = clamp(Number(appPosition.x || 50), 0, 100);
  const centerYPct = clamp(Number(appPosition.y || 50), 0, 100);
  const width = Math.round(clamp((workArea.width * widthPct) / 100, 280, workArea.width));
  const height = Math.round(clamp((workArea.height * heightPct) / 100, 220, workArea.height));
  const left = Math.round(workArea.x + ((centerXPct / 100) * workArea.width) - (width / 2));
  const top = Math.round(workArea.y + ((centerYPct / 100) * workArea.height) - (height / 2));

  const boundedLeft = clamp(left, workArea.x, workArea.x + Math.max(0, workArea.width - width));
  const boundedTop = clamp(top, workArea.y, workArea.y + Math.max(0, workArea.height - height));
  const shouldForceFullscreen = launchState === 'maximized' || app?.launchBehavior === 'maximize';
  const shouldMinimize = launchState === 'minimized' || app?.launchBehavior === 'minimize';
  const looksFullscreenByGeometry = widthPct >= 95 && heightPct >= 95;
  const minimizedWithoutSavedGeometry = (
    shouldMinimize
    && !hasSourceGeometry
    && !(hasExplicitSize && hasExplicitPosition)
  );

  if (shouldForceFullscreen || looksFullscreenByGeometry || minimizedWithoutSavedGeometry) {
    return {
      left: workArea.x,
      top: workArea.y,
      width: workArea.width,
      height: workArea.height,
      state: shouldMinimize ? 'minimized' : 'maximized',
    };
  }

  return {
    left: boundedLeft,
    top: boundedTop,
    width,
    height,
    state: shouldMinimize ? 'minimized' : 'normal',
  };
};

const moveWindowToBounds = ({
  pid,
  bounds,
  processNameHint,
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  preferNameEnumeration = false,
  excludedWindowHandles = [],
}) => (
  new Promise((resolve) => {
    const safePid = Number(pid || 0);
    const safeProcessNameHint = String(processNameHint || '')
      .trim()
      .toLowerCase()
      .replace(/\.exe$/i, '');
    if (!bounds || (!Number.isFinite(safePid) && !safeProcessNameHint)) {
      resolve({ applied: false, handle: null });
      return;
    }

    const left = Number(bounds.left || 0);
    const top = Number(bounds.top || 0);
    const width = Math.max(120, Number(bounds.width || 800));
    const height = Math.max(120, Number(bounds.height || 600));
    const forceMaximize = bounds.state === 'maximized';
    const setPosFlags = positionOnlyBeforeMaximize ? 0x0045 : 0x0044;
    const windowState = bounds.state === 'maximized'
      ? 3 // SW_MAXIMIZE
      : bounds.state === 'minimized'
        ? 2 // SW_MINIMIZE
        : 9; // SW_RESTORE

    const excludedCsv = (Array.isArray(excludedWindowHandles) ? excludedWindowHandles : [])
      .map((h) => String(h || '').trim())
      .filter(Boolean)
      .join(',');

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);

  public static List<IntPtr> FindVisibleWindowsForPids(HashSet<uint> pids, HashSet<string> excluded) {
    var found = new List<IntPtr>();
    EnumWindows((hWnd, lp) => {
      if (!IsWindowVisible(hWnd)) return true;
      uint wPid;
      GetWindowThreadProcessId(hWnd, out wPid);
      if (!pids.Contains(wPid)) return true;
      string hs = ((long)hWnd).ToString();
      if (excluded != null && excluded.Contains(hs)) return true;
      found.Add(hWnd);
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
$excludedSet = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($tok in ("${excludedCsv.replace(/"/g, '`"')}" -split ',')) {
  $t = $tok.Trim()
  if ($t.Length -gt 0) { [void]$excludedSet.Add($t) }
}

function Apply-Placement {
  param([IntPtr]$Handle)
  if ($Handle -eq [IntPtr]::Zero) { return $false }
  [void][Win32]::SetWindowPos($Handle, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, ${setPosFlags})
  [void][Win32]::ShowWindowAsync($Handle, ${windowState})
  if (${(forceMaximize && aggressiveMaximize) ? '$true' : '$false'}) {
    # Re-assert maximize a few times because Chromium can recreate/restore windows right after launch.
    [void][Win32]::SetWindowPos($Handle, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, 0x0044)
    for ($mx = 0; $mx -lt 3; $mx++) {
      Start-Sleep -Milliseconds 80
      [void][Win32]::ShowWindowAsync($Handle, 9)
      Start-Sleep -Milliseconds 80
      [void][Win32]::ShowWindowAsync($Handle, 3)
    }
  }
  return $true
}

$applied = $false
$appliedHandle = ""
$maxAttempts = ${preferNameEnumeration ? 28 : 16}
$sleepMs = ${preferNameEnumeration ? 100 : 90}
for ($attempt = 0; $attempt -lt $maxAttempts; $attempt++) {
  $candidates = New-Object 'System.Collections.Generic.List[IntPtr]'

  # Strategy 1: PID tree (MainWindowHandle only — fast path for non-Chromium)
  if (${preferNameEnumeration ? '$false' : '$true'} -and ${safePid} -gt 0) {
    $treePids = New-Object 'System.Collections.Generic.HashSet[int]'
    [void]$treePids.Add(${Math.floor(safePid)})
    for ($d = 0; $d -lt 3; $d++) {
      $snap = @($treePids)
      foreach ($pp in $snap) {
        try {
          $children = Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $pp) -ErrorAction SilentlyContinue
          foreach ($c in $children) { try { [void]$treePids.Add([int]$c.ProcessId) } catch {} }
        } catch {}
      }
    }
    foreach ($tp in $treePids) {
      try {
        $p = Get-Process -Id $tp -ErrorAction SilentlyContinue
        if ($p -and $p.MainWindowHandle -ne 0) {
          $hs = [string]([int64]$p.MainWindowHandle)
          if (-not $excludedSet.Contains($hs)) {
            [void]$candidates.Add([IntPtr]::new([int64]$p.MainWindowHandle))
          }
        }
      } catch {}
    }
  }

  # Strategy 2: EnumWindows — compiled C# callback finds ALL visible windows, not just MainWindowHandle
  if ($candidates.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace("${safeProcessNameHint.replace(/"/g, '`"')}")) {
    $pids = New-Object 'System.Collections.Generic.HashSet[uint32]'
    try {
      $procs = Get-Process -Name "${safeProcessNameHint.replace(/"/g, '`"')}" -ErrorAction SilentlyContinue
      foreach ($p in $procs) { [void]$pids.Add([uint32]$p.Id) }
    } catch {}
    if ($pids.Count -gt 0) {
      $enumResults = [Win32]::FindVisibleWindowsForPids($pids, $excludedSet)
      foreach ($eh in $enumResults) { [void]$candidates.Add($eh) }
    }
  }

  # Strategy 3: foreground window fallback
  if ($candidates.Count -eq 0) {
    try {
      $fg = [Win32]::GetForegroundWindow()
      if ($fg -ne [IntPtr]::Zero) {
        $fgStr = [string]([int64]$fg)
        if (-not $excludedSet.Contains($fgStr)) {
          [void]$candidates.Add($fg)
        }
      }
    } catch {}
  }

  foreach ($candidate in $candidates) {
    if ($candidate -eq [IntPtr]::Zero) { continue }
    if (Apply-Placement -Handle $candidate) {
      $applied = $true
      $appliedHandle = [string]([int64]$candidate)
      break
    }
  }

  if ($applied) { break }
  Start-Sleep -Milliseconds $sleepMs
}
if (-not $applied) {
  Write-Output "no-window|"
  exit 0
}
Write-Output "ok|$appliedHandle"`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 12000, maxBuffer: 1024 * 256 },
      (_error, stdout) => {
        const output = String(stdout || '').trim();
        const [status, handle] = output.split('|');
        resolve({
          applied: (status || '').toLowerCase() === 'ok',
          handle: handle || null,
        });
      },
    );
  })
);

const moveSpecificWindowHandleToBounds = ({
  handle,
  bounds,
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
}) => (
  new Promise((resolve) => {
    const safeHandle = String(handle || '').trim();
    if (!safeHandle || !bounds) {
      resolve({ applied: false, handle: null });
      return;
    }

    const left = Number(bounds.left || 0);
    const top = Number(bounds.top || 0);
    const width = Math.max(120, Number(bounds.width || 800));
    const height = Math.max(120, Number(bounds.height || 600));
    const setPosFlags = positionOnlyBeforeMaximize ? 0x0045 : 0x0044;
    const windowState = bounds.state === 'maximized'
      ? 3 // SW_MAXIMIZE
      : bounds.state === 'minimized'
        ? 2 // SW_MINIMIZE
        : 9; // SW_RESTORE

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
}
"@
$h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
if ($h -eq [IntPtr]::Zero) { Write-Output "no-window|"; exit 0 }
[void][Win32]::SetWindowPos($h, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, ${setPosFlags})
[void][Win32]::ShowWindowAsync($h, ${windowState})
if (${(bounds.state === 'maximized' && aggressiveMaximize) ? '$true' : '$false'}) {
  [void][Win32]::SetWindowPos($h, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, 0x0044)
  for ($mx = 0; $mx -lt 3; $mx++) {
    Start-Sleep -Milliseconds 80
    [void][Win32]::ShowWindowAsync($h, 9)
    Start-Sleep -Milliseconds 80
    [void][Win32]::ShowWindowAsync($h, 3)
  }
}
Write-Output "ok|${safeHandle.replace(/"/g, '`"')}"`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 6000, maxBuffer: 1024 * 128 },
      (_error, stdout) => {
        const output = String(stdout || '').trim();
        const [status, outHandle] = output.split('|');
        resolve({
          applied: (status || '').toLowerCase() === 'ok',
          handle: outHandle || null,
        });
      },
    );
  })
);

const maximizeWindowHandle = (handle) => (
  new Promise((resolve) => {
    const safeHandle = String(handle || '').trim();
    if (!safeHandle) {
      resolve(false);
      return;
    }

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
}
"@
$h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
if ($h -eq [IntPtr]::Zero) { Write-Output "no"; exit 0 }
[void][Win32]::ShowWindowAsync($h, 9) # SW_RESTORE
Start-Sleep -Milliseconds 90
[void][Win32]::ShowWindowAsync($h, 3) # SW_MAXIMIZE
Write-Output "ok"`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 3000, maxBuffer: 1024 * 64 },
      (_error, stdout) => {
        resolve(String(stdout || '').toLowerCase().includes('ok'));
      },
    );
  })
);

const getWindowRectByHandle = (handle) => (
  new Promise((resolve) => {
    const safeHandle = String(handle || '').trim();
    if (!safeHandle) {
      resolve(null);
      return;
    }

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win32Rect {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
"@
$h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
if ($h -eq [IntPtr]::Zero) { Write-Output "{}"; exit 0 }
$r = New-Object Win32Rect+RECT
$ok = [Win32Rect]::GetWindowRect($h, [ref]$r)
if (-not $ok) { Write-Output "{}"; exit 0 }
@{
  left = [int]$r.Left
  top = [int]$r.Top
  width = [int]($r.Right - $r.Left)
  height = [int]($r.Bottom - $r.Top)
} | ConvertTo-Json -Depth 2`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 4000, maxBuffer: 1024 * 128 },
      (_error, stdout) => {
        try {
          const parsed = JSON.parse(String(stdout || '').trim() || '{}');
          if (
            Number.isFinite(Number(parsed?.left))
            && Number.isFinite(Number(parsed?.top))
            && Number.isFinite(Number(parsed?.width))
            && Number.isFinite(Number(parsed?.height))
          ) {
            resolve({
              left: Number(parsed.left),
              top: Number(parsed.top),
              width: Number(parsed.width),
              height: Number(parsed.height),
            });
            return;
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      },
    );
  })
);

const isWindowOnTargetMonitor = ({ rect, monitor }) => {
  if (!rect || !monitor) return false;
  const target = monitor.workArea || monitor.bounds || null;
  if (!target) return false;

  const centerX = rect.left + (rect.width / 2);
  const centerY = rect.top + (rect.height / 2);
  const centerOnTarget = (
    centerX >= target.x
    && centerX <= (target.x + target.width)
    && centerY >= target.y
    && centerY <= (target.y + target.height)
  );
  if (!centerOnTarget) return false;
  return true;
};

const verifyAndCorrectWindowPlacement = async ({
  handle,
  monitor,
  bounds,
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  maxCorrections = 2,
  initialCheckDelayMs = 0,
}) => {
  const safeHandle = String(handle || '').trim();
  if (!safeHandle || !monitor || !bounds) {
    return { verified: false, corrected: false };
  }

  if (initialCheckDelayMs > 0) {
    await sleep(initialCheckDelayMs);
  }

  for (let attempt = 0; attempt <= maxCorrections; attempt += 1) {
    const rect = await getWindowRectByHandle(safeHandle);
    if (isWindowOnTargetMonitor({ rect, monitor, bounds })) {
      return { verified: true, corrected: attempt > 0 };
    }
    if (attempt >= maxCorrections) break;

    await moveSpecificWindowHandleToBounds({
      handle: safeHandle,
      bounds,
      aggressiveMaximize,
      positionOnlyBeforeMaximize,
    });
    await sleep(90);
  }

  return { verified: false, corrected: true };
};

const getVisibleWindowInfos = (processName) => (
  new Promise((resolve) => {
    const safeName = String(processName || '').trim().toLowerCase().replace(/\.exe$/i, '');
    if (!safeName) { resolve([]); return; }

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class WinEnum {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public delegate bool EnumWinProc(IntPtr hWnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWinProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);
  public static List<Dictionary<string, object>> FindVisibleWindows(HashSet<uint> pids) {
    var r = new List<Dictionary<string, object>>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint p; GetWindowThreadProcessId(h, out p);
      if (!pids.Contains(p)) return true;
      RECT rect;
      if (!GetWindowRect(h, out rect)) return true;
      int width = rect.Right - rect.Left;
      int height = rect.Bottom - rect.Top;
      if (width <= 80 || height <= 80) return true;
      long exStyle = GetWindowLongPtr(h, -20).ToInt64();
      bool isToolWindow = (exStyle & 0x00000080L) != 0; // WS_EX_TOOLWINDOW
      int cloaked = 0;
      try { DwmGetWindowAttribute(h, 14, out cloaked, 4); } catch { cloaked = 0; } // DWMWA_CLOAKED
      var cls = new StringBuilder(256);
      GetClassName(h, cls, cls.Capacity);
      int titleLen = GetWindowTextLength(h);
      var row = new Dictionary<string, object>();
      row["handle"] = ((long)h).ToString();
      row["width"] = width;
      row["height"] = height;
      row["area"] = width * height;
      row["enabled"] = IsWindowEnabled(h);
      row["hung"] = IsHungAppWindow(h);
      row["tool"] = isToolWindow;
      row["cloaked"] = cloaked != 0;
      row["className"] = cls.ToString();
      row["titleLength"] = titleLen;
      r.Add(row);
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@
$pids = New-Object 'System.Collections.Generic.HashSet[uint32]'
try {
  $procs = Get-Process -Name "${safeName.replace(/"/g, '`"')}" -ErrorAction SilentlyContinue
  foreach ($p in $procs) { [void]$pids.Add([uint32]$p.Id) }
} catch {}
if ($pids.Count -eq 0) { Write-Output "[]"; exit 0 }
$rows = [WinEnum]::FindVisibleWindows($pids)
$rows | ConvertTo-Json -Depth 5`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 256 },
      (_error, stdout) => {
        try {
          const parsed = JSON.parse(String(stdout || '').trim() || '[]');
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          resolve(rows.filter(Boolean).map((row) => ({
            handle: String(row.handle || ''),
            width: Number(row.width || 0),
            height: Number(row.height || 0),
            area: Number(row.area || 0),
            enabled: Boolean(row.enabled),
            hung: Boolean(row.hung),
            tool: Boolean(row.tool),
            cloaked: Boolean(row.cloaked),
            className: String(row.className || ''),
            titleLength: Number(row.titleLength || 0),
          })).filter((row) => row.handle));
        } catch {
          resolve([]);
        }
      },
    );
  })
);

const scoreWindowCandidate = (row) => {
  const className = String(row?.className || '').toLowerCase();
  const titleLength = Number(row?.titleLength || 0);
  const area = Number(row?.area || 0);
  let score = 0;

  if (row?.enabled) score += 1_000_000_000;
  if (!row?.hung) score += 250_000_000;
  if (!row?.tool) score += 100_000_000;
  if (!row?.cloaked) score += 50_000_000;
  if (titleLength > 0) score += 5_000_000;

  // Penalize known non-primary Chromium surfaces that can appear blank/uninteractive.
  if (className.includes('renderwidgethosthwnd')) score -= 150_000_000;
  if (className.includes('intermediate d3d window')) score -= 120_000_000;

  return score + area;
};

const waitForWindowResponsive = async (processName, handle, maxWaitMs = 1800) => {
  const safeHandle = String(handle || '').trim();
  if (!safeHandle) return false;

  const deadline = Date.now() + Math.max(0, Number(maxWaitMs || 0));
  while (Date.now() <= deadline) {
    const rows = await getVisibleWindowInfos(processName);
    const row = rows.find((candidate) => String(candidate.handle) === safeHandle);
    if (row && row.enabled && !row.hung && !row.cloaked && row.area > 80_000) {
      return true;
    }
    await sleep(120);
  }

  return false;
};

const launchExecutable = (executablePath, args = []) => (
  new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(executablePath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
    } catch (error) {
      reject(error);
      return;
    }

    let completed = false;
    const cleanup = () => {
      child.removeListener('error', onError);
      child.removeListener('spawn', onSpawn);
    };
    const onError = (error) => {
      if (completed) return;
      completed = true;
      cleanup();
      reject(error);
    };
    const onSpawn = () => {
      if (completed) return;
      completed = true;
      cleanup();
      child.unref();
      resolve(child);
    };

    child.once('error', onError);
    child.once('spawn', onSpawn);

    setTimeout(() => {
      if (completed) return;
      completed = true;
      cleanup();
      child.unref();
      resolve(child);
    }, 200);
  })
);

const gatherProfileAppLaunches = (profile, monitorMap) => {
  const launches = [];
  const skippedApps = [];
  const primaryProfileMonitorId = (Array.isArray(profile?.monitors) ? profile.monitors : []).find((monitor) => monitor?.primary)?.id;
  const defaultMonitor = sortMonitorsByLayout(buildSystemMonitorSnapshot())[0] || null;
  const restrictedNames = new Set(
    (Array.isArray(profile?.restrictedApps) ? profile.restrictedApps : [])
      .map((name) => normalizeLabel(name))
      .filter(Boolean),
  );

  const pushIfLaunchable = (app, profileMonitorId) => {
    const appName = String(app?.name || '').trim();
    if (!appName) {
      skippedApps.push({
        name: 'Unnamed App',
        reason: 'missing-name',
      });
      return;
    }
    if (restrictedNames.has(normalizeLabel(appName))) {
      skippedApps.push({
        name: appName,
        reason: 'restricted',
      });
      return;
    }

    const executablePath = extractExecutablePath(app?.executablePath || app?.path || '');
    if (!executablePath) {
      skippedApps.push({
        name: appName,
        reason: 'missing-executable-path',
      });
      return;
    }
    if (isDisallowedLaunchExecutablePath(executablePath)) {
      skippedApps.push({
        name: appName,
        reason: 'disallowed-executable-path',
      });
      return;
    }

    const monitor = (
      (profileMonitorId && monitorMap.get(profileMonitorId))
      || monitorMap.get(primaryProfileMonitorId)
      || defaultMonitor
    );
    launches.push({
      appName,
      executablePath,
      monitor,
      app,
    });
  };

  for (const monitor of (Array.isArray(profile?.monitors) ? profile.monitors : [])) {
    for (const app of (Array.isArray(monitor?.apps) ? monitor.apps : [])) {
      pushIfLaunchable(app, monitor?.id);
    }
  }

  for (const app of (Array.isArray(profile?.minimizedApps) ? profile.minimizedApps : [])) {
    pushIfLaunchable(app, app?.targetMonitor || primaryProfileMonitorId || null);
  }

  return { launches, skippedApps };
};

const gatherLegacyActionLaunches = (profile, monitorMap) => {
  const actions = Array.isArray(profile?.actions) ? profile.actions : [];
  const profileMonitors = sortMonitorsByLayout(profile?.monitors);
  const defaultMonitor = sortMonitorsByLayout(buildSystemMonitorSnapshot())[0] || null;
  const launches = [];
  const browserUrls = [];
  const skippedApps = [];
  const restrictedNames = new Set(
    (Array.isArray(profile?.restrictedApps) ? profile.restrictedApps : [])
      .map((name) => normalizeLabel(name))
      .filter(Boolean),
  );

  for (const action of actions) {
    if (action?.type === 'browserTab') {
      const url = String(action?.url || '').trim();
      if (url) browserUrls.push(url);
      continue;
    }

    if (action?.type !== 'app') continue;
    const appName = String(action?.name || 'App').trim();
    if (restrictedNames.has(normalizeLabel(appName))) {
      skippedApps.push({
        name: appName,
        reason: 'restricted',
      });
      continue;
    }

    const executablePath = extractExecutablePath(action?.path || '');
    if (!executablePath) {
      skippedApps.push({
        name: appName,
        reason: 'invalid-legacy-action-path',
      });
      continue;
    }
    if (isDisallowedLaunchExecutablePath(executablePath)) {
      skippedApps.push({
        name: appName,
        reason: 'disallowed-executable-path',
      });
      continue;
    }

    const monitorIndex = Math.max(0, Number(action?.monitor || 1) - 1);
    const profileMonitorId = profileMonitors[monitorIndex]?.id;
    const monitor = (profileMonitorId ? monitorMap.get(profileMonitorId) : null) || defaultMonitor;
    launches.push({
      appName,
      executablePath,
      monitor,
      app: {
        name: appName,
        launchBehavior: 'new',
      },
    });
  }

  return {
    launches,
    browserUrls,
    skippedApps,
  };
};

const launchProfileById = async (profileId) => {
  const profiles = readProfilesFromDisk();
  const normalizedProfileId = String(profileId || '').trim();
  const profile = profiles.find(
    (candidate) => String(candidate?.id || '').trim() === normalizedProfileId,
  );
  if (!profile) {
    return {
      ok: false,
      error: 'Profile not found. Save the profile and try again.',
      requestedProfileId: normalizedProfileId,
      availableProfileIds: profiles
        .map((candidate) => String(candidate?.id || '').trim())
        .filter(Boolean),
    };
  }

  const launchState = profile?.launchMaximized
    ? 'maximized'
    : profile?.launchMinimized
      ? 'minimized'
      : 'normal';

  const systemMonitors = buildSystemMonitorSnapshot();
  const monitorMap = createProfileMonitorMap(profile?.monitors, systemMonitors);
  const modernLaunchData = gatherProfileAppLaunches(profile, monitorMap);
  const legacyLaunchData = gatherLegacyActionLaunches(profile, monitorMap);
  const launchKey = (launch) => `${String(launch.executablePath || '').toLowerCase()}::${launch.monitor?.id || 'monitor'}`;
  const seenLaunchKeys = new Set();
  const appLaunches = [...modernLaunchData.launches, ...legacyLaunchData.launches]
    .filter((launch) => {
      const key = launchKey(launch);
      if (seenLaunchKeys.has(key)) return false;
      seenLaunchKeys.add(key);
      return true;
    });
  const skippedApps = [...modernLaunchData.skippedApps, ...legacyLaunchData.skippedApps];
  const failedApps = [];
  let launchedAppCount = 0;
  const launchOrder = profile?.launchOrder === 'sequential' ? 'sequential' : 'all-at-once';
  const appLaunchDelays = (profile?.appLaunchDelays && typeof profile.appLaunchDelays === 'object')
    ? profile.appLaunchDelays
    : {};
  const processHintCounts = new Map();
  for (const launchItem of appLaunches) {
    const processNameHint = path.basename(launchItem.executablePath, path.extname(launchItem.executablePath)).toLowerCase();
    processHintCounts.set(processNameHint, (processHintCounts.get(processNameHint) || 0) + 1);
  }

  const runLaunch = async (launchItem) => {
    try {
      const processNameHint = path.basename(launchItem.executablePath, path.extname(launchItem.executablePath));
      const processHintLc = processNameHint.toLowerCase();
      const hintCount = processHintCounts.get(processHintLc) || 0;
      const isDuplicateProcessLaunch = hintCount > 1;
      const isChromiumFamily = processHintLc === 'msedge' || processHintLc === 'brave' || processHintLc === 'chrome';
      const launchArgs = (isChromiumFamily && isDuplicateProcessLaunch) ? ['--new-window'] : [];
      const preLaunchWindowInfos = isDuplicateProcessLaunch
        ? await getVisibleWindowInfos(processHintLc)
        : [];
      const preLaunchHandles = preLaunchWindowInfos.map((row) => row.handle);

      const launchedChild = await launchExecutable(launchItem.executablePath, launchArgs);
      launchedAppCount += 1;
      const bounds = buildWindowBoundsForApp(launchItem.app, launchItem.monitor, launchState);
      if (bounds) {
        const aggressiveMaximize = bounds.state === 'maximized' && processHintLc === 'msedge';
        const positionOnlyBeforeMaximize = processHintLc === 'msedge' && bounds.state === 'maximized';
        const shouldDelayChromiumMaximize = (
          isChromiumFamily
          && isDuplicateProcessLaunch
          && bounds.state === 'maximized'
        );
        const placementBounds = shouldDelayChromiumMaximize
          ? { ...bounds, state: 'normal' }
          : bounds;
        const excludedHandles = preLaunchHandles;

        if (isDuplicateProcessLaunch) {
          await sleep(240);
        }

        let result = { applied: false, handle: null };
        let newHandles = [];

        if (isDuplicateProcessLaunch) {
          const postLaunchWindowInfos = await getVisibleWindowInfos(processHintLc);
          const postLaunchHandles = postLaunchWindowInfos.map((row) => row.handle);
          const preHandleSet = new Set(preLaunchHandles);
          newHandles = postLaunchHandles.filter((h) => !preHandleSet.has(h));
          const newHandleSet = new Set(newHandles);
          const rankedNewWindows = postLaunchWindowInfos
            .filter((row) => newHandleSet.has(row.handle))
            .sort((a, b) => scoreWindowCandidate(b) - scoreWindowCandidate(a));

          for (const candidateRow of rankedNewWindows) {
            const newHandle = candidateRow.handle;
            if (isChromiumFamily) {
              await waitForWindowResponsive(processHintLc, newHandle, 2200);
            }
            result = await moveSpecificWindowHandleToBounds({
              handle: newHandle,
              bounds: placementBounds,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
            });
            if (result.applied) break;
          }

          // Trace duplicate-window routing for any multi-window app.
          console.log('[launch-profile] duplicate-window-placement', {
            appName: launchItem.appName,
            process: processHintLc,
            targetMonitor: launchItem.monitor?.name || launchItem.monitor?.id || 'unknown',
            targetState: bounds.state,
            preHandles: preLaunchHandles,
            postHandles: postLaunchHandles,
            newHandles,
            rankedNewWindowCandidates: rankedNewWindows.map((row) => ({
              handle: row.handle,
              enabled: row.enabled,
              hung: row.hung,
              tool: row.tool,
              cloaked: row.cloaked,
              className: row.className,
              titleLength: row.titleLength,
              area: row.area,
              score: scoreWindowCandidate(row),
            })),
            placedHandle: result.handle,
            applied: result.applied,
          });
        }

        if (!result.applied) {
          result = await moveWindowToBounds({
            pid: launchedChild?.pid || 0,
            bounds: placementBounds,
            processNameHint,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            preferNameEnumeration: isDuplicateProcessLaunch,
            excludedWindowHandles: excludedHandles,
          });
        }

        if (!result.applied && isDuplicateProcessLaunch) {
          await sleep(260);
          result = await moveWindowToBounds({
            pid: launchedChild?.pid || 0,
            bounds: placementBounds,
            processNameHint,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            preferNameEnumeration: true,
            excludedWindowHandles: excludedHandles,
          });
        }

        if (!result.applied && isDuplicateProcessLaunch && newHandles.length > 0) {
          for (const newHandle of newHandles) {
            result = await moveSpecificWindowHandleToBounds({
              handle: newHandle,
              bounds: placementBounds,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
            });
            if (result.applied) break;
          }
        }

        if (result.applied && result.handle && isDuplicateProcessLaunch && launchItem.monitor) {
          const verification = await verifyAndCorrectWindowPlacement({
            handle: result.handle,
            monitor: launchItem.monitor,
            bounds: placementBounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            maxCorrections: isDuplicateProcessLaunch ? 1 : 0,
            initialCheckDelayMs: isDuplicateProcessLaunch ? 220 : 0,
          });

          console.log('[launch-profile] placement-verification', {
            appName: launchItem.appName,
            process: processHintLc,
            targetMonitor: launchItem.monitor?.name || launchItem.monitor?.id || 'unknown',
            targetState: bounds.state,
            handle: result.handle,
            verified: verification.verified,
            corrected: verification.corrected,
          });
        }

        if (result.applied && result.handle && shouldDelayChromiumMaximize) {
          await waitForWindowResponsive(processHintLc, result.handle, 2200);
          await maximizeWindowHandle(result.handle);
        }
      }
    } catch (error) {
      failedApps.push({
        name: launchItem.appName,
        path: launchItem.executablePath,
        error: String(error?.message || error || 'Failed to launch app'),
      });
    }
  };

  const hasDuplicateProcessLaunches = Array.from(processHintCounts.values())
    .some((count) => count > 1);

  if (launchOrder === 'sequential' || hasDuplicateProcessLaunches) {
    for (const launchItem of appLaunches) {
      const delaySeconds = Number(appLaunchDelays[launchItem.appName] || 0);
      const safeDelayMs = Math.max(0, Math.floor(delaySeconds * 1000));
      if (safeDelayMs > 0) {
        await sleep(safeDelayMs);
      }
      await runLaunch(launchItem);
    }
  } else {
    await Promise.all(appLaunches.map((launchItem) => runLaunch(launchItem)));
  }

  const { shell } = require('electron');
  const browserTabs = Array.isArray(profile?.browserTabs) ? profile.browserTabs : [];
  const launchedUrls = new Set();
  let launchedTabCount = 0;
  for (const tab of browserTabs) {
    const url = normalizeSafeUrl(tab?.url);
    if (!url || launchedUrls.has(url)) continue;
    launchedUrls.add(url);
    try {
      await shell.openExternal(url);
      launchedTabCount += 1;
    } catch {
      // Keep profile launch resilient if one tab URL fails.
    }
  }

  for (const url of legacyLaunchData.browserUrls) {
    const safeUrl = normalizeSafeUrl(url);
    if (!safeUrl || launchedUrls.has(safeUrl)) continue;
    launchedUrls.add(safeUrl);
    try {
      await shell.openExternal(safeUrl);
      launchedTabCount += 1;
    } catch {
      // Keep profile launch resilient if one tab URL fails.
    }
  }

  if (launchedAppCount === 0 && launchedTabCount === 0) {
    return {
      ok: false,
      error: 'No launchable apps or tabs found in this profile. Add an executable path in app details or recreate from installed apps.',
      profile,
      launchedAppCount,
      launchedTabCount,
      failedApps,
      skippedApps,
      requestedAppCount: appLaunches.length,
    };
  }

  return {
    ok: failedApps.length === 0,
    profile,
    launchedAppCount,
    launchedTabCount,
    failedApps,
    skippedApps,
    requestedAppCount: appLaunches.length,
  };
};

handleTrustedIpc('get-system-monitors', async () => {
  try {
    const monitors = buildSystemMonitorSnapshot();
    return monitors.map((monitor) => {
      const cleanedMonitor = { ...monitor };
      delete cleanedMonitor.bounds;
      delete cleanedMonitor.workArea;
      delete cleanedMonitor.pixelBounds;
      delete cleanedMonitor.pixelWorkArea;
      return cleanedMonitor;
    });
  } catch (error) {
    console.error('Error in get-system-monitors handler:', error);
    return [{
      id: 'monitor-1',
      name: 'Monitor 1',
      systemName: null,
      primary: true,
      scaleFactor: 1,
      resolution: '1920x1080',
      orientation: 'landscape',
      layoutPosition: { x: 0, y: 0 },
      apps: [],
    }];
  }
});

handleTrustedIpc('profiles:list', async () => {
  try {
    return readProfilesFromDisk();
  } catch (error) {
    console.error('[profiles:list] Failed to list profiles:', error);
    return [];
  }
});

handleTrustedIpc('profiles:save-all', async (_event, profiles) => {
  try {
    const sanitizedProfiles = sanitizeProfilesPayload(profiles);
    const savedProfiles = writeProfilesToDisk(sanitizedProfiles);
    return { ok: true, count: savedProfiles.length };
  } catch (error) {
    console.error('[profiles:save-all] Failed to save profiles:', error);
    return { ok: false, error: 'Failed to save profiles' };
  }
});

handleTrustedIpc('launch-profile', async (_event, profileId) => {
  try {
    const safeProfileId = safeLimitedString(profileId, MAX_PROFILE_ID_LENGTH);
    if (!safeProfileId) return { ok: false, error: 'Invalid profile id' };
    return await launchProfileById(safeProfileId);
  } catch (err) {
    console.error('Failed to load or launch profile:', err);
    return { ok: false, error: 'Failed to load profile' };
  }
});

handleTrustedIpc('get-installed-apps', async () => {
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
        const executablePath = context.targetExe || extractExecutablePath(sourcePath) || null;
        appMap.set(key, {
          name: normalizedName,
          iconPath: iconPath || null,
          executablePath,
          priority: nextPriority,
        });
        return;
      }

      const currentPriority = existing.priority || 0;
      const preferredName = currentPriority >= nextPriority ? existing.name : normalizedName;
      const preferredPriority = Math.max(currentPriority, nextPriority);
      const preferredIcon = existing.iconPath || iconPath || null;
      const preferredExecutablePath = existing.executablePath || context.targetExe || extractExecutablePath(sourcePath) || null;

      appMap.set(key, {
        name: preferredName,
        iconPath: preferredIcon,
        executablePath: preferredExecutablePath,
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
      .map(({ name, iconPath, executablePath }) => ({ name, iconPath, executablePath: executablePath || null }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } catch (err) {
    console.error('Error in get-installed-apps handler:', err);
    return [];
  }
});

handleTrustedIpc('capture-running-app-layout', async () => {
  try {
    const processes = await getRunningWindowProcesses();
    const targetMonitors = buildSystemMonitorSnapshot();
    const minimizedApps = [];
    const captureAllowList = new Set(['steamwebhelper', 'explorer']);

    const uniqueWindows = [];
    const seen = new Set();
    for (const p of processes) {
      if (!p?.name || !p?.bounds) continue;
      const processNameLc = String(p.name).toLowerCase();
      if (
        hiddenProcessNamePatterns.some((pattern) => pattern.test(p.name))
        && !captureAllowList.has(processNameLc)
      ) continue;
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

      // Preserve app icon metadata for layout-memory-created profiles and previews.
      let iconPath = null;
      if (windowInfo.executablePath) {
        iconPath = await getSafeIconDataUrl(windowInfo.executablePath);
      }

      const round1 = (n) => Math.round(n * 10) / 10;
      const processName = String(windowInfo.name || '');
      const normalizedAppName = (
        processName.toLowerCase() === 'steamwebhelper'
        || processName.toLowerCase() === 'steam'
      ) ? 'Steam' : processName;
      const mappedWindow = {
        name: normalizedAppName,
        iconPath,
        executablePath: windowInfo.executablePath || null,
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
