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
  isSafeAppLaunchUrl,
  sanitizeProfileLaunchFieldsDeep,
} = require('./utils/profile-launch-fields');
const {
  createLaunchDiagnostics,
  describeBoundsDelta,
  describeMonitor,
  summarizeWindowRows,
} = require('./utils/launch-diagnostics');
const {
  hiddenProcessNamePatterns,
  hiddenWindowTitlePatterns,
  getRunningWindowProcesses,
} = require('./services/windows-process-service');
const { captureAllMonitorsScreenshot } = require('./utils/windows-desktop-screenshot');

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
const MAX_SHORTCUT_PATH_LENGTH = 4096;
const DEFAULT_AUTOMATION_SETTLE_MS = 1800;
const DEFAULT_AUTOMATION_START_DELAY_MS = 900;

const parseBooleanEnv = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const getLaunchAutomationConfig = () => {
  const profileId = String(process.env.FLOWSWITCH_AUTOMATION_PROFILE_ID || '').trim();
  const screenshotPath = String(process.env.FLOWSWITCH_AUTOMATION_SCREENSHOT_PATH || '').trim();
  const summaryPath = String(process.env.FLOWSWITCH_AUTOMATION_SUMMARY_PATH || '').trim();
  const settleMs = Math.max(600, Number(process.env.FLOWSWITCH_AUTOMATION_SETTLE_MS || DEFAULT_AUTOMATION_SETTLE_MS));
  const startDelayMs = Math.max(0, Number(process.env.FLOWSWITCH_AUTOMATION_START_DELAY_MS || DEFAULT_AUTOMATION_START_DELAY_MS));
  return {
    enabled: Boolean(profileId),
    profileId,
    captureScreenshot: parseBooleanEnv(process.env.FLOWSWITCH_AUTOMATION_CAPTURE_SCREENSHOT || '1'),
    closeProfileAppsBetweenRuns: parseBooleanEnv(process.env.FLOWSWITCH_AUTOMATION_CLOSE_PROFILE_APPS || '1'),
    screenshotPath: screenshotPath || null,
    summaryPath: summaryPath || null,
    autoQuit: parseBooleanEnv(process.env.FLOWSWITCH_AUTOMATION_AUTO_QUIT || '0'),
    settleMs,
    startDelayMs,
  };
};

const collectProfileExecutableImageNames = (profile) => {
  const imageNames = new Set();
  const pushExecutable = (value) => {
    const executablePath = String(value || '').trim();
    if (!executablePath) return;
    const imageName = path.basename(executablePath).trim();
    if (!imageName || !imageName.toLowerCase().endsWith('.exe')) return;
    imageNames.add(imageName.toLowerCase());
  };

  const monitors = Array.isArray(profile?.monitors) ? profile.monitors : [];
  for (const monitor of monitors) {
    const apps = Array.isArray(monitor?.apps) ? monitor.apps : [];
    for (const appItem of apps) {
      pushExecutable(appItem?.executablePath);
    }
  }

  const minimizedApps = Array.isArray(profile?.minimizedApps) ? profile.minimizedApps : [];
  for (const appItem of minimizedApps) {
    pushExecutable(appItem?.executablePath);
  }

  return Array.from(imageNames);
};

const terminateProcessesByImageName = async (imageName) => (
  new Promise((resolve) => {
    const safeImageName = String(imageName || '').trim();
    if (!safeImageName) {
      resolve({ imageName: safeImageName, ok: false, reason: 'missing-image-name' });
      return;
    }
    execFile(
      'taskkill',
      ['/T', '/F', '/IM', safeImageName],
      { windowsHide: true, timeout: 20000 },
      (error, stdout, stderr) => {
        const output = `${String(stdout || '')}\n${String(stderr || '')}`.toLowerCase();
        const noMatches = output.includes('not found') || output.includes('no running instance');
        if (!error || noMatches) {
          resolve({ imageName: safeImageName, ok: true, noMatches });
          return;
        }
        resolve({
          imageName: safeImageName,
          ok: false,
          error: String(error?.message || error),
          outputSnippet: String(output || '').slice(0, 400),
        });
      },
    );
  })
);

const cleanupProfileProcesses = async (profile, diagnostics, reason) => {
  if (process.platform !== 'win32' || !profile) {
    return { attempted: 0, failures: 0, details: [] };
  }

  const imageNames = collectProfileExecutableImageNames(profile);
  if (imageNames.length === 0) {
    return { attempted: 0, failures: 0, details: [] };
  }

  const details = [];
  for (const imageName of imageNames) {
    const result = await terminateProcessesByImageName(imageName);
    details.push(result);
  }
  const failures = details.filter((item) => !item.ok).length;
  if (diagnostics) {
    diagnostics.result({
      reason,
      strategy: 'launch-automation-cleanup',
      attempted: imageNames.length,
      failures,
      cleanedImageNames: imageNames,
    });
  }
  return {
    attempted: imageNames.length,
    failures,
    details,
  };
};

const runPostSettlePlacementAudit = async (launchResult, diagnostics) => {
  const records = Array.isArray(launchResult?.placementRecords) ? launchResult.placementRecords : [];
  const normalRecords = records.filter((record) => (
    record
    && record.handle
    && record.monitor
    && record.bounds
    && record.bounds.state === 'normal'
  ));
  if (normalRecords.length === 0) {
    return { attempted: 0, verified: 0, corrected: 0, failed: 0 };
  }

  let verified = 0;
  let corrected = 0;
  let failed = 0;
  for (const record of normalRecords) {
    const preCheckRects = await getWindowPlacementRectsByHandle(record.handle);
    const preCheckRect = preCheckRects?.visibleRect || preCheckRects?.outerRect || null;
    let auditHandle = record.handle;
    if (!preCheckRect) {
      const recovered = await stabilizePlacementForSlowLaunch({
        processHintLc: record.processHintLc,
        bounds: record.bounds,
        monitor: record.monitor,
        initialHandle: record.handle,
        excludedWindowHandles: [],
        aggressiveMaximize: false,
        positionOnlyBeforeMaximize: false,
        skipFrameChanged: false,
        durationMs: 3200,
        diagnostics,
        diagnosticsContext: {
          processHintLc: record.processHintLc,
          strategy: 'automation-post-settle-recover-handle',
          appName: record.appName,
          placementState: record.bounds.state,
        },
      });
      if (recovered?.handle) {
        auditHandle = recovered.handle;
      }
    }

    let verification = await verifyAndCorrectWindowPlacement({
      handle: auditHandle,
      monitor: record.monitor,
      bounds: record.bounds,
      aggressiveMaximize: false,
      positionOnlyBeforeMaximize: false,
      skipFrameChanged: false,
      maxCorrections: 2,
      initialCheckDelayMs: 0,
      diagnostics,
      diagnosticsContext: {
        processHintLc: record.processHintLc,
        strategy: 'automation-post-settle-audit',
        appName: record.appName,
      },
    });
    if (!verification.verified) {
      const measured = await getWindowPlacementRectsByHandle(auditHandle);
      const visibleRect = measured?.visibleRect || measured?.outerRect || null;
      if (visibleRect) {
        const onTarget = isWindowOnTargetMonitor({ rect: visibleRect, monitor: record.monitor, bounds: record.bounds });
        const delta = describeBoundsDelta(visibleRect, record.bounds);
        const widthDeficit = Math.max(0, -Number(delta?.width || 0));
        const heightDeficit = Math.max(0, -Number(delta?.height || 0));
        const leftAligned = Math.abs(Number(delta?.left || 0)) <= 4;
        const topAligned = Math.abs(Number(delta?.top || 0)) <= 4;
        if (onTarget && leftAligned && topAligned && (widthDeficit >= 8 || heightDeficit >= 8)) {
          const compensatingBounds = {
            ...record.bounds,
            width: Number(record.bounds.width || 0) + widthDeficit,
            height: Number(record.bounds.height || 0) + heightDeficit,
          };
          await moveSpecificWindowHandleToBounds({
            handle: auditHandle,
            bounds: compensatingBounds,
            aggressiveMaximize: false,
            positionOnlyBeforeMaximize: false,
            skipFrameChanged: false,
            diagnostics,
            diagnosticsContext: {
              processHintLc: record.processHintLc,
              strategy: 'automation-post-settle-compensating-resize',
              appName: record.appName,
            },
          });
          verification = await verifyAndCorrectWindowPlacement({
            handle: auditHandle,
            monitor: record.monitor,
            bounds: record.bounds,
            aggressiveMaximize: false,
            positionOnlyBeforeMaximize: false,
            skipFrameChanged: false,
            maxCorrections: 1,
            initialCheckDelayMs: 80,
            diagnostics,
            diagnosticsContext: {
              processHintLc: record.processHintLc,
              strategy: 'automation-post-settle-compensating-verify',
              appName: record.appName,
            },
          });
        }
      }
    }
    if (verification.verified) verified += 1;
    if (verification.corrected) corrected += 1;
    if (!verification.verified) failed += 1;
  }

  return {
    attempted: normalRecords.length,
    verified,
    corrected,
    failed,
  };
};

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
      return sanitizeProfileLaunchFieldsDeep(sanitizeProfileIconPathsDeep(normalized));
    });
};

const unpackProfilesReadResult = (value) => {
  if (Array.isArray(value)) {
    return { profiles: value, storeError: null };
  }
  if (value && typeof value === 'object') {
    return {
      profiles: Array.isArray(value.profiles) ? value.profiles : [],
      storeError: value.storeError || null,
    };
  }
  return { profiles: [], storeError: null };
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

const resolveShortcutPathForLaunch = (raw) => {
  const s = safeLimitedString(raw, MAX_SHORTCUT_PATH_LENGTH);
  if (!s) return null;
  const normalized = normalizePathForWindows(s);
  if (!normalized.toLowerCase().endsWith('.lnk')) return null;
  if (normalized.includes('..')) return null;
  try {
    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) return null;
  } catch {
    return null;
  }
  return normalized;
};

/**
 * When the profile only has a .lnk (no stored exe), Get-Process must still use the real image name
 * (e.g. brave / chrome / msedge) or Chromium placement never runs and the wrong HWND gets moved (gray window).
 */
const inferBrowserProcessKeyFromHints = (launchItem) => {
  const name = String(launchItem.appName || '').toLowerCase();
  const sc = String(launchItem.shortcutPath || '').toLowerCase();
  const base = path.basename(sc, '.lnk').toLowerCase();
  const hay = `${name}\n${sc}\n${base}`;

  if (/\bbrave\b/.test(hay) || hay.includes('brave-browser')) return 'brave';
  if (hay.includes('msedge') || hay.includes('microsoft edge')) return 'msedge';
  if (hay.includes('microsoft\\edge\\') || hay.includes('/edge/application/')) return 'msedge';
  if (hay.includes('vivaldi')) return 'vivaldi';
  if (hay.includes('chromium')) return 'chrome';
  if (hay.includes('opera') || hay.includes('operagx')) return 'opera';
  if (hay.includes('arc')) return 'arc';
  if (hay.includes('chrome')) return 'chrome';

  return null;
};

/**
 * Basename for window placement / duplicate detection (steam URL groups as "steam").
 * @param {{ executablePath?: string | null; launchUrl?: string | null; shortcutPath?: string | null; appName?: string }} launchItem
 * @returns {string}
 */
const getPlacementProcessKey = (launchItem) => {
  if (launchItem.executablePath) {
    return path.basename(launchItem.executablePath, path.extname(launchItem.executablePath)).toLowerCase();
  }
  const url = String(launchItem.launchUrl || '').toLowerCase();
  if (url.includes('steam://') || url.includes('rungameid')) return 'steam';

  const inferred = inferBrowserProcessKeyFromHints(launchItem);
  if (inferred) return inferred;

  return 'app';
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
  const publicDir = path.join(__dirname, '../../public');
  // Windows scales the whole bitmap into a fixed taskbar slot; a trimmed asset
  // makes the mark read larger than the full-canvas logo used in the renderer.
  if (process.platform === 'win32') {
    const taskbarPath = path.join(publicDir, 'flowswitch-taskbar.png');
    if (fs.existsSync(taskbarPath)) return taskbarPath;
  }
  const logoPath = path.join(publicDir, 'flowswitch-logo.png');
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
    path.join('steamapps', 'librarycache', `${appId}_icon.jpg`),
    path.join('steamapps', 'librarycache', `${appId}_icon.png`),
    path.join('steamapps', 'librarycache', `${appId}.jpg`),
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
  void runLaunchAutomationIfRequested();

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

  const monitors = displays.map((display, idx) => {
    let workAreaPhysical = null;
    if (process.platform === 'win32') {
      try {
        workAreaPhysical = screen.dipToScreenRect(null, {
          x: display.workArea.x,
          y: display.workArea.y,
          width: display.workArea.width,
          height: display.workArea.height,
        });
      } catch {
        workAreaPhysical = null;
      }
    }
    return {
    id: `monitor-${display.id}`,
    displayId: display.id,
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
    workAreaPhysical,
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
  };
  });

  return monitors.length > 0 ? monitors : [{
    id: 'monitor-1',
    displayId: screen.getPrimaryDisplay().id,
    name: 'Monitor 1',
    systemName: null,
    primary: true,
    scaleFactor: 1,
    resolution: '1920x1080',
    orientation: 'landscape',
    layoutPosition: { x: 0, y: 0 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    workAreaPhysical: null,
    pixelBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    pixelWorkArea: { x: 0, y: 0, width: 1920, height: 1080 },
    apps: [],
  }];
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeWindowClassName = (value) => String(value || '').trim().toLowerCase();

const WINDOW_CLASS_RESIDUAL_POLICIES = {
  // Chromium top-level windows often report a stable visible inset on Windows.
  chrome_widgetwin_1: { left: 8, top: 0, width: -16, height: -8 },
};

const getClassResidualCalibration = (className) => {
  const key = normalizeWindowClassName(className);
  if (!key) return null;
  const policy = WINDOW_CLASS_RESIDUAL_POLICIES[key];
  if (!policy) return null;
  return {
    left: Number(policy.left || 0),
    top: Number(policy.top || 0),
    width: Number(policy.width || 0),
    height: Number(policy.height || 0),
    source: 'class-policy',
  };
};

const getPlacementCommandBounds = (bounds, processHintLc) => {
  if (!bounds) return bounds;
  if (String(bounds.state || '').toLowerCase() !== 'normal') return bounds;
  if (!isChromiumFamilyProcessKey(String(processHintLc || '').trim().toLowerCase())) return bounds;
  return {
    ...bounds,
    left: Number(bounds.left || 0) - 8,
    width: Math.max(120, Number(bounds.width || 0) + 16),
    height: Math.max(120, Number(bounds.height || 0) + 8),
  };
};

/**
 * Electron Display bounds/workArea are DIP; Win32 SetWindowPos in a DPI-aware
 * PowerShell process expects physical screen pixels.
 *
 * `screen.dipToScreenRect(null, rect)` converts using the display nearest to `rect`.
 * Passing a Display object (not BrowserWindow) caused a silent failure in earlier code.
 */
const physicalBoundsFromDip = (dipBounds, diagnostics = null, diagnosticsContext = {}) => {
  if (process.platform !== 'win32' || !dipBounds) return dipBounds;
  try {
    const { screen } = require('electron');
    const rect = {
      x: Math.round(Number(dipBounds.left)),
      y: Math.round(Number(dipBounds.top)),
      width: Math.round(Number(dipBounds.width)),
      height: Math.round(Number(dipBounds.height)),
    };
    const p = screen.dipToScreenRect(null, rect);
    return {
      left: p.x,
      top: p.y,
      width: p.width,
      height: p.height,
      state: dipBounds.state,
    };
  } catch (error) {
    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        event: 'dip-to-physical-conversion-failed',
        reason: 'dip-to-screen-rect-throw',
        dipBounds,
        error: String(error?.message || error || 'unknown-error'),
      });
    }
    return dipBounds;
  }
};

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

const buildMonitorMappingDiagnostics = (profileMonitors, systemMonitors, monitorMap) => {
  const profileList = sortMonitorsByLayout(profileMonitors);
  const systemList = sortMonitorsByLayout(systemMonitors);
  return profileList.map((profileMonitor, index) => {
    const target = profileMonitor?.id ? monitorMap.get(profileMonitor.id) : null;
    const profileOrdinal = parseMonitorOrdinal(profileMonitor?.name) || parseMonitorOrdinal(profileMonitor?.id);
    const targetOrdinal = parseMonitorOrdinal(target?.name) || parseMonitorOrdinal(target?.id);
    const profileSystemName = normalizeLabel(profileMonitor?.systemName);
    const targetSystemName = normalizeLabel(target?.systemName);
    let reason = 'unmapped';
    if (target) {
      if (profileMonitor?.id && target?.id && profileMonitor.id === target.id) {
        reason = 'system-id';
      } else if (profileSystemName && targetSystemName && profileSystemName === targetSystemName) {
        reason = 'system-name';
      } else if (profileOrdinal && targetOrdinal && profileOrdinal === targetOrdinal) {
        reason = 'monitor-ordinal';
      } else if (systemList[index]?.id && systemList[index].id === target.id) {
        reason = 'index-fallback';
      } else if (
        Number.isFinite(Number(profileMonitor?.layoutPosition?.x))
        && Number.isFinite(Number(profileMonitor?.layoutPosition?.y))
      ) {
        reason = 'layout-proximity';
      } else {
        reason = 'first-unused-fallback';
      }
    }

    return {
      reason,
      profileMonitor: describeMonitor(profileMonitor),
      targetMonitor: describeMonitor(target),
    };
  });
};

/**
 * Edge-aligned rectangles for half-screen "snap" layouts (matches side-by-side / top-bottom presets).
 * Avoids center-percent rounding so each pane uses an exact partition of the work area.
 */
const trySnapLayoutPartitionBounds = ({
  workArea,
  widthPct,
  heightPct,
  centerXPct,
  centerYPct,
  shouldMinimize,
}) => {
  if (shouldMinimize) return null;
  const wx = workArea.x;
  const wy = workArea.y;
  const ww = workArea.width;
  const wh = workArea.height;

  const isHalfWidth = widthPct >= 44 && widthPct <= 56;
  const isFullHeight = heightPct >= 95;
  if (isHalfWidth && isFullHeight && centerXPct !== 50) {
    const leftW = Math.floor(ww / 2);
    const rightW = ww - leftW;
    if (centerXPct < 50) {
      return {
        left: wx,
        top: wy,
        width: leftW,
        height: wh,
        state: 'normal',
      };
    }
    if (centerXPct > 50) {
      return {
        left: wx + leftW,
        top: wy,
        width: rightW,
        height: wh,
        state: 'normal',
      };
    }
  }

  // Three side-by-side columns (~33% width each): center-based math leaves gaps; partition exactly.
  const isThirdWidth = widthPct >= 27 && widthPct <= 40;
  if (isThirdWidth && isFullHeight) {
    const w0 = Math.floor(ww / 3);
    const w1 = Math.floor((ww - w0) / 2);
    const w2 = ww - w0 - w1;
    let col = 1;
    if (centerXPct < 37) col = 0;
    else if (centerXPct > 63) col = 2;
    if (col === 0) {
      return { left: wx, top: wy, width: w0, height: wh, state: 'normal' };
    }
    if (col === 1) {
      return { left: wx + w0, top: wy, width: w1, height: wh, state: 'normal' };
    }
    return { left: wx + w0 + w1, top: wy, width: w2, height: wh, state: 'normal' };
  }

  const isHalfHeight = heightPct >= 44 && heightPct <= 56;
  const isFullWidth = widthPct >= 95;
  if (isHalfHeight && isFullWidth && centerYPct !== 50) {
    const topH = Math.floor(wh / 2);
    const bottomH = wh - topH;
    if (centerYPct < 50) {
      return {
        left: wx,
        top: wy,
        width: ww,
        height: topH,
        state: 'normal',
      };
    }
    if (centerYPct > 50) {
      return {
        left: wx,
        top: wy + topH,
        width: ww,
        height: bottomH,
        state: 'normal',
      };
    }
  }

  // Quadrant layouts: half-width + half-height (4-quadrants preset).
  if (isHalfWidth && isHalfHeight) {
    const leftW = Math.floor(ww / 2);
    const rightW = ww - leftW;
    const topH = Math.floor(wh / 2);
    const bottomH = wh - topH;
    const isLeft = centerXPct < 50;
    const isTop = centerYPct < 50;
    return {
      left: isLeft ? wx : wx + leftW,
      top: isTop ? wy : wy + topH,
      width: isLeft ? leftW : rightW,
      height: isTop ? topH : bottomH,
      state: 'normal',
    };
  }

  // Three horizontal rows (~33% height each): partition exactly like 3-columns does for width.
  const isThirdHeight = heightPct >= 27 && heightPct <= 40;
  if (isFullWidth && isThirdHeight) {
    const h0 = Math.floor(wh / 3);
    const h1 = Math.floor((wh - h0) / 2);
    const h2 = wh - h0 - h1;
    let row = 1;
    if (centerYPct < 37) row = 0;
    else if (centerYPct > 63) row = 2;
    if (row === 0) return { left: wx, top: wy, width: ww, height: h0, state: 'normal' };
    if (row === 1) return { left: wx, top: wy + h0, width: ww, height: h1, state: 'normal' };
    return { left: wx, top: wy + h0 + h1, width: ww, height: h2, state: 'normal' };
  }

  // Four vertical panels (25% width each).
  const isQuarterWidth = widthPct >= 20 && widthPct <= 30;
  if (isQuarterWidth && isFullHeight) {
    const w0 = Math.floor(ww / 4);
    const w1 = Math.floor((ww - w0) / 3);
    const w2 = Math.floor((ww - w0 - w1) / 2);
    const w3 = ww - w0 - w1 - w2;
    let col = 0;
    if (centerXPct >= 20 && centerXPct < 45) col = 1;
    else if (centerXPct >= 45 && centerXPct < 70) col = 2;
    else if (centerXPct >= 70) col = 3;
    const widths = [w0, w1, w2, w3];
    let x = wx;
    for (let i = 0; i < col; i++) x += widths[i];
    return { left: x, top: wy, width: widths[col], height: wh, state: 'normal' };
  }

  return null;
};

const applySnapZoneOverlapCompensation = ({
  bounds,
  workArea,
  monitor,
  widthPct = 100,
  heightPct = 100,
  processHintLc = '',
}) => {
  if (!bounds || !workArea) return bounds;
  const dipWidth = Math.max(1, Number(workArea.width || 1));
  const dipHeight = Math.max(1, Number(workArea.height || 1));
  const physicalWidth = Math.max(1, Number(monitor?.workAreaPhysical?.width || dipWidth));
  const physicalHeight = Math.max(1, Number(monitor?.workAreaPhysical?.height || dipHeight));
  const scaleFactorX = physicalWidth / dipWidth;
  const scaleFactorY = physicalHeight / dipHeight;
  // Keep snap partitions geometry-first and avoid pre-inflating tiles.
  // Final correction is handled by placement verification and post-settle audit.
  const targetOverlapPxX = 0;
  const targetOverlapPxY = 0;
  const overlapDipX = clamp(Math.round(targetOverlapPxX / Math.max(0.8, scaleFactorX)), 0, 8);
  const overlapDipY = clamp(Math.round(targetOverlapPxY / Math.max(0.8, scaleFactorY)), 0, 6);

  const workLeft = Number(workArea.x || 0);
  const workTop = Number(workArea.y || 0);
  const workRight = workLeft + Math.max(0, Number(workArea.width || 0));
  const workBottom = workTop + Math.max(0, Number(workArea.height || 0));
  const zoneLeft = Number(bounds.left || 0);
  const zoneTop = Number(bounds.top || 0);
  const zoneRight = zoneLeft + Math.max(0, Number(bounds.width || 0));
  const zoneBottom = zoneTop + Math.max(0, Number(bounds.height || 0));
  const tol = 1;

  // Expand only on internal edges to avoid pushing tiles off monitor outer bounds.
  const leftExpand = Math.abs(zoneLeft - workLeft) <= tol ? 0 : overlapDipX;
  const topExpand = Math.abs(zoneTop - workTop) <= tol ? 0 : overlapDipY;
  const rightExpand = Math.abs(zoneRight - workRight) <= tol ? 0 : overlapDipX;
  const bottomExpand = Math.abs(zoneBottom - workBottom) <= tol ? 0 : overlapDipY;

  const left = zoneLeft - leftExpand;
  const top = zoneTop - topExpand;
  const width = Number(bounds.width || 0) + leftExpand + rightExpand;
  const height = Number(bounds.height || 0) + topExpand + bottomExpand;

  return {
    ...bounds,
    left,
    top,
    width,
    height,
  };
};

const buildWindowBoundsForApp = (app, monitor, launchState, options = {}) => {
  const diagnostics = options?.diagnostics || null;
  const diagnosticsContext = options?.diagnosticsContext || {};
  const processHintLc = String(options?.processHintLc || '').trim().toLowerCase();
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
  const shouldMinimize = (
    launchState === 'minimized'
    || app?.launchBehavior === 'minimize'
    || app?._launchFromMinimizedTray === true
  );
  // Minimize intent wins over maximize/profile defaults.
  const shouldForceFullscreen = !shouldMinimize
    && (launchState === 'maximized' || app?.launchBehavior === 'maximize');
  const looksFullscreenByGeometry = widthPct >= 95 && heightPct >= 95;
  const minimizedWithoutSavedGeometry = (
    shouldMinimize
    && !hasSourceGeometry
    && !(hasExplicitSize && hasExplicitPosition)
  );

  const finalizeBounds = (b) => physicalBoundsFromDip(b, diagnostics, diagnosticsContext);

  if (shouldForceFullscreen || looksFullscreenByGeometry || minimizedWithoutSavedGeometry) {
    return finalizeBounds({
      left: workArea.x,
      top: workArea.y,
      width: workArea.width,
      height: workArea.height,
      state: shouldMinimize ? 'minimized' : 'maximized',
    });
  }

  const snapBounds = trySnapLayoutPartitionBounds({
    workArea,
    widthPct,
    heightPct,
    centerXPct,
    centerYPct,
    shouldMinimize,
  });
  if (snapBounds) {
    const compensatedSnapBounds = applySnapZoneOverlapCompensation({
      bounds: snapBounds,
      workArea,
      monitor,
      widthPct,
      heightPct,
      processHintLc,
    });
    return finalizeBounds(compensatedSnapBounds);
  }

  // Convert from center/size percentages into edge percentages first, then round edges to pixels.
  // This keeps shared boundaries (and monitor edges) aligned without 1px gaps between snapped apps.
  const leftPct = clamp(centerXPct - (widthPct / 2), 0, 100);
  const topPct = clamp(centerYPct - (heightPct / 2), 0, 100);
  const rightPct = clamp(centerXPct + (widthPct / 2), 0, 100);
  const bottomPct = clamp(centerYPct + (heightPct / 2), 0, 100);

  const leftEdge = Math.round(workArea.x + ((leftPct / 100) * workArea.width));
  const topEdge = Math.round(workArea.y + ((topPct / 100) * workArea.height));
  const rightEdge = Math.round(workArea.x + ((rightPct / 100) * workArea.width));
  const bottomEdge = Math.round(workArea.y + ((bottomPct / 100) * workArea.height));

  const width = clamp(rightEdge - leftEdge, 120, workArea.width);
  const height = clamp(bottomEdge - topEdge, 120, workArea.height);

  const boundedLeft = clamp(leftEdge, workArea.x, workArea.x + Math.max(0, workArea.width - width));
  const boundedTop = clamp(topEdge, workArea.y, workArea.y + Math.max(0, workArea.height - height));

  return finalizeBounds({
    left: boundedLeft,
    top: boundedTop,
    width,
    height,
    state: shouldMinimize ? 'minimized' : 'normal',
  });
};

const moveWindowToBounds = ({
  pid,
  bounds,
  processNameHint,
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  preferNameEnumeration = false,
  excludedWindowHandles = [],
  skipFrameChanged = false,
  allowForegroundFallback = false,
  frameCompensationMode = 'auto',
  diagnostics = null,
  diagnosticsContext = {},
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

    const commandBounds = frameCompensationMode === 'none'
      ? bounds
      : getPlacementCommandBounds(bounds, safeProcessNameHint);
    const left = Number(commandBounds.left || 0);
    const top = Number(commandBounds.top || 0);
    const width = Math.max(120, Number(commandBounds.width || 800));
    const height = Math.max(120, Number(commandBounds.height || 600));
    const isMaximizedPlacement = String(commandBounds.state || '').toLowerCase() === 'maximized';
    const minCandidateWidth = isMaximizedPlacement
      ? 320
      : Math.max(240, Math.floor(width * 0.55));
    const minCandidateHeight = isMaximizedPlacement
      ? 220
      : Math.max(180, Math.floor(height * 0.55));
    const forceMaximize = commandBounds.state === 'maximized';
    // SWP_FRAMECHANGED (0x0020) can confuse Chromium's compositor during early resize; optional skip.
    const basePosFlags = 0x0044;
    const setPosFlags = positionOnlyBeforeMaximize
      ? 0x0045
      : (skipFrameChanged ? basePosFlags : (basePosFlags | 0x0020));
    const windowState = commandBounds.state === 'maximized'
      ? 3 // SW_MAXIMIZE
      : commandBounds.state === 'minimized'
        ? 6 // SW_MINIMIZE
        : 5; // SW_SHOW

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
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll", EntryPoint="GetWindowLong")] public static extern int GetWindowLong32(IntPtr hWnd, int nIndex);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtr")] public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);
  public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
    return IntPtr.Size == 8
      ? GetWindowLongPtr64(hWnd, nIndex)
      : new IntPtr(GetWindowLong32(hWnd, nIndex));
  }

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  public static bool IsPlacementCandidate(IntPtr hWnd, int minWidth, int minHeight, HashSet<string> excluded) {
    if (hWnd == IntPtr.Zero) return false;
    if (!IsWindowVisible(hWnd)) return false;
    RECT rect;
    if (!GetWindowRect(hWnd, out rect)) return false;
    int width = rect.Right - rect.Left;
    int height = rect.Bottom - rect.Top;
    if (width < minWidth || height < minHeight) return false;
    long exStyle = GetWindowLongPtr(hWnd, -20).ToInt64();
    bool isToolWindow = (exStyle & 0x00000080L) != 0; // WS_EX_TOOLWINDOW
    if (isToolWindow) return false;
    string hs = ((long)hWnd).ToString();
    if (excluded != null && excluded.Contains(hs)) return false;
    return true;
  }

  public static List<IntPtr> FindVisibleWindowsForPids(HashSet<uint> pids, HashSet<string> excluded) {
    var found = new List<IntPtr>();
    EnumWindows((hWnd, lp) => {
      uint wPid;
      GetWindowThreadProcessId(hWnd, out wPid);
      if (!pids.Contains(wPid)) return true;
      if (!IsPlacementCandidate(hWnd, ${minCandidateWidth}, ${minCandidateHeight}, excluded)) return true;
      found.Add(hWnd);
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
try { [void][Win32]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
try { [void][Win32]::SetProcessDPIAware() } catch {}
$excludedSet = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($tok in ("${excludedCsv.replace(/"/g, '`"')}" -split ',')) {
  $t = $tok.Trim()
  if ($t.Length -gt 0) { [void]$excludedSet.Add($t) }
}

function Apply-Placement {
  param([IntPtr]$Handle)
  if ($Handle -eq [IntPtr]::Zero) { return $false }
  if (${windowState} -eq 5) {
    # If the app restores as maximized from previous session, drop to normal first.
    [void][Win32]::ShowWindowAsync($Handle, 9) # SW_RESTORE
    Start-Sleep -Milliseconds 45
  }
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
          $hPtr = [IntPtr]::new([int64]$p.MainWindowHandle)
          if ([Win32]::IsPlacementCandidate($hPtr, ${minCandidateWidth}, ${minCandidateHeight}, $excludedSet)) {
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

  # Strategy 3: foreground window fallback (disabled by default for deterministic placement)
  if (${allowForegroundFallback ? '$true' : '$false'} -and $candidates.Count -eq 0) {
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
      { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 256 },
      (execError, stdout) => {
        const output = String(stdout || '').trim();
        const [status, handle] = output.split('|');
        const applied = (status || '').toLowerCase() === 'ok';
        if (!applied && diagnostics) {
          diagnostics.failure({
            ...diagnosticsContext,
            strategy: 'move-window-to-bounds',
            reason: 'powershell-placement-not-applied',
            processNameHint: safeProcessNameHint || null,
            pid: Number.isFinite(safePid) ? safePid : null,
            status: status || null,
            handle: handle || null,
            outputSnippet: output ? output.slice(0, 200) : null,
            error: execError ? String(execError.message || execError) : null,
          });
        }
        resolve({
          applied,
          handle: handle || null,
          status: status || null,
          outputSnippet: output ? output.slice(0, 200) : null,
          error: execError ? String(execError.message || execError) : null,
        });
      },
    );
  })
);

const moveSpecificWindowHandleToBounds = ({
  handle,
  bounds,
  processHintLc = '',
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  skipFrameChanged = false,
  frameCompensationMode = 'auto',
  diagnostics = null,
  diagnosticsContext = {},
}) => (
  new Promise((resolve) => {
    const safeHandle = String(handle || '').trim();
    if (!safeHandle || !bounds) {
      resolve({ applied: false, handle: null });
      return;
    }

    const processKey = String(processHintLc || diagnosticsContext?.processHintLc || '').trim().toLowerCase();
    const commandBounds = frameCompensationMode === 'none'
      ? bounds
      : getPlacementCommandBounds(bounds, processKey);
    const left = Number(commandBounds.left || 0);
    const top = Number(commandBounds.top || 0);
    const width = Math.max(120, Number(commandBounds.width || 800));
    const height = Math.max(120, Number(commandBounds.height || 600));
    const basePosFlags = 0x0044;
    const setPosFlags = positionOnlyBeforeMaximize
      ? 0x0045
      : (skipFrameChanged ? basePosFlags : (basePosFlags | 0x0020));
    const windowState = commandBounds.state === 'maximized'
      ? 3 // SW_MAXIMIZE
      : commandBounds.state === 'minimized'
        ? 6 // SW_MINIMIZE
        : 5; // SW_SHOW

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
}
"@
try { [void][Win32]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
try { [void][Win32]::SetProcessDPIAware() } catch {}
$h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
if ($h -eq [IntPtr]::Zero) { Write-Output "no-window|"; exit 0 }
if (${windowState} -eq 5) {
  # Prevent persisted maximized state from overriding explicit normal bounds.
  [void][Win32]::ShowWindowAsync($h, 9) # SW_RESTORE
  Start-Sleep -Milliseconds 45
}
[void][Win32]::SetWindowPos($h, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, ${setPosFlags})
[void][Win32]::ShowWindowAsync($h, ${windowState})
if (${(commandBounds.state === 'maximized' && aggressiveMaximize) ? '$true' : '$false'}) {
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
      (execError, stdout) => {
        const output = String(stdout || '').trim();
        const [status, outHandle] = output.split('|');
        const applied = (status || '').toLowerCase() === 'ok';
        if (!applied && diagnostics) {
          diagnostics.failure({
            ...diagnosticsContext,
            strategy: 'move-specific-window-handle',
            reason: 'powershell-placement-not-applied',
            handle: safeHandle,
            status: status || null,
            outputSnippet: output ? output.slice(0, 200) : null,
            error: execError ? String(execError.message || execError) : null,
          });
        }
        resolve({
          applied,
          handle: outHandle || null,
          status: status || null,
          outputSnippet: output ? output.slice(0, 200) : null,
          error: execError ? String(execError.message || execError) : null,
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

const minimizeWindowHandle = (handle) => (
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
[void][Win32]::ShowWindowAsync($h, 6) # SW_MINIMIZE
Start-Sleep -Milliseconds 70
[void][Win32]::ShowWindowAsync($h, 6) # Re-assert for apps that restore immediately
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

const ensureMinimizedAfterLaunch = async ({
  handle,
  bounds,
  processNameHint,
  pid = 0,
}) => {
  if (!bounds || bounds.state !== 'minimized') return false;

  let minimized = false;
  const retryScheduleMs = [120, 260, 480, 760, 1100, 1500, 2100];
  for (const delayMs of retryScheduleMs) {
    await sleep(delayMs);
    if (handle) {
      const byHandle = await minimizeWindowHandle(handle);
      minimized = minimized || byHandle;
    }

    // Slow launchers may create the real top-level HWND after splash windows.
    const byName = await moveWindowToBounds({
      pid,
      bounds,
      processNameHint,
      aggressiveMaximize: false,
      positionOnlyBeforeMaximize: false,
      preferNameEnumeration: true,
      excludedWindowHandles: [],
      skipFrameChanged: true,
    });
    minimized = minimized || Boolean(byName?.applied);
    if (minimized) break;
  }

  return minimized;
};

const stabilizePlacementForSlowLaunch = async ({
  processHintLc,
  bounds,
  monitor,
  initialHandle = null,
  excludedWindowHandles = [],
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  skipFrameChanged = false,
  durationMs = 3200,
  diagnostics = null,
  diagnosticsContext = {},
}) => {
  const safeProcess = String(processHintLc || '').trim().toLowerCase();
  if (!safeProcess || !bounds) {
    return { verified: false, handle: initialHandle ? String(initialHandle) : null };
  }

  const excluded = new Set(
    (Array.isArray(excludedWindowHandles) ? excludedWindowHandles : [])
      .map((h) => String(h || '').trim())
      .filter(Boolean),
  );
  const forcedHandle = initialHandle ? String(initialHandle) : null;
  const deadline = Date.now() + Math.max(1200, Number(durationMs || 0));
  let lastHandle = forcedHandle;
  let lastCandidates = [];

  while (Date.now() <= deadline) {
    const rows = await getVisibleWindowInfos(safeProcess, {
      diagnostics,
      diagnosticsContext,
    });
    const candidates = rows
      .filter((row) => row?.handle)
      .filter((row) => row.handle === forcedHandle || !excluded.has(row.handle))
      .sort((a, b) => (
        scoreWindowCandidate(b, { chromiumProcessHint: safeProcess })
        - scoreWindowCandidate(a, { chromiumProcessHint: safeProcess })
      ));
    lastCandidates = candidates;

    if (bounds.state === 'minimized') {
      // Re-apply minimize against all likely top-level windows in case splash->main handle changes.
      for (const row of candidates.slice(0, 8)) {
        lastHandle = row.handle || lastHandle;
        await moveSpecificWindowHandleToBounds({
          handle: row.handle,
          bounds,
          aggressiveMaximize: false,
          positionOnlyBeforeMaximize: false,
          skipFrameChanged: true,
          diagnostics,
          diagnosticsContext: {
            ...diagnosticsContext,
            strategy: 'stabilize-minimized',
            candidateHandle: row.handle,
          },
        });
      }
      if (lastHandle) {
        await minimizeWindowHandle(lastHandle);
      }
      if (candidates.length > 0) {
        return { verified: true, handle: lastHandle };
      }
      await sleep(220);
      continue;
    }

    if (bounds.state === 'normal' && monitor) {
      for (const row of candidates.slice(0, 6)) {
        lastHandle = row.handle || lastHandle;
        const placementRects = await getWindowPlacementRectsByHandle(row.handle);
        const measuredRect = placementRects?.visibleRect || placementRects?.outerRect || null;
        const onTarget = isWindowOnTargetMonitor({ rect: measuredRect, monitor, bounds });
        const close = isRectCloseToTargetBounds(measuredRect, bounds, 8);
        if (onTarget && close) {
          return { verified: true, handle: row.handle };
        }

        await moveSpecificWindowHandleToBounds({
          handle: row.handle,
          bounds,
          aggressiveMaximize,
          positionOnlyBeforeMaximize,
          skipFrameChanged,
          diagnostics,
          diagnosticsContext: {
            ...diagnosticsContext,
            strategy: 'stabilize-normal',
            candidateHandle: row.handle,
          },
        });
      }
    }

    if (bounds.state === 'maximized' && monitor) {
      for (const row of candidates.slice(0, 6)) {
        lastHandle = row.handle || lastHandle;
        const rect = await getWindowRectByHandle(row.handle);
        const onTarget = isWindowOnTargetMonitor({ rect, monitor, bounds });
        if (onTarget) {
          return { verified: true, handle: row.handle };
        }

        await moveSpecificWindowHandleToBounds({
          handle: row.handle,
          bounds,
          aggressiveMaximize,
          positionOnlyBeforeMaximize,
          skipFrameChanged,
          diagnostics,
          diagnosticsContext: {
            ...diagnosticsContext,
            strategy: 'stabilize-maximized',
            candidateHandle: row.handle,
          },
        });
      }
    }

    await sleep(220);
  }
  if (diagnostics) {
    diagnostics.failure({
      ...diagnosticsContext,
      strategy: 'stabilize-placement',
      reason: 'stabilization-timeout',
      lastHandle,
      candidateCount: lastCandidates.length,
      candidateSample: summarizeWindowRows(lastCandidates, 3),
    });
  }
  return { verified: false, handle: lastHandle };
};

const stabilizeKnownHandlePlacement = async ({
  handle,
  bounds,
  monitor,
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  skipFrameChanged = false,
  durationMs = 1800,
  diagnostics = null,
  diagnosticsContext = {},
}) => {
  const safeHandle = String(handle || '').trim();
  const processHintLc = String(diagnosticsContext?.processHintLc || '').trim().toLowerCase();
  if (!safeHandle || !bounds || !monitor) {
    return { verified: false, corrected: false, handle: safeHandle || null };
  }

  const deadline = Date.now() + Math.max(800, Number(durationMs || 0));
  let corrected = false;
  let lastRect = null;
  let previousMeasuredRect = null;
  let stagnantMeasurementCount = 0;
  let stoppedForStagnation = false;

  while (Date.now() <= deadline) {
    const placementRects = await getWindowPlacementRectsByHandle(safeHandle);
    const measuredRect = placementRects?.visibleRect || placementRects?.outerRect || null;
    if (measuredRect) {
      lastRect = measuredRect;
      const onTarget = isWindowOnTargetMonitor({ rect: measuredRect, monitor, bounds });
      const closeEnough = bounds.state === 'normal'
        ? isRectCloseToTargetBounds(measuredRect, bounds, 8)
        : true;
      if (onTarget && closeEnough) {
        return { verified: true, corrected, handle: safeHandle };
      }

      if (previousMeasuredRect) {
        const stagnant = (
          Math.abs(Number(previousMeasuredRect.left || 0) - Number(measuredRect.left || 0)) <= 2
          && Math.abs(Number(previousMeasuredRect.top || 0) - Number(measuredRect.top || 0)) <= 2
          && Math.abs(Number(previousMeasuredRect.width || 0) - Number(measuredRect.width || 0)) <= 2
          && Math.abs(Number(previousMeasuredRect.height || 0) - Number(measuredRect.height || 0)) <= 2
        );
        stagnantMeasurementCount = stagnant ? (stagnantMeasurementCount + 1) : 0;
        if (stagnantMeasurementCount >= 1) {
          stoppedForStagnation = true;
          break;
        }
      }
      previousMeasuredRect = { ...measuredRect };
    }

    await moveSpecificWindowHandleToBounds({
      handle: safeHandle,
      bounds,
      aggressiveMaximize,
      positionOnlyBeforeMaximize,
      skipFrameChanged,
      diagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'known-handle-stabilization',
        candidateHandle: safeHandle,
      },
    });
    corrected = true;
    await sleep(180);
  }

  if (diagnostics) {
    diagnostics.failure({
      ...diagnosticsContext,
      strategy: 'known-handle-stabilization',
      reason: stoppedForStagnation
        ? 'known-handle-stabilization-stagnant'
        : 'known-handle-stabilization-timeout',
      handle: safeHandle,
      corrected,
      lastRect,
    });
  }

  return { verified: false, corrected, handle: safeHandle };
};

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
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
"@
try { [void][Win32Rect]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
try { [void][Win32Rect]::SetProcessDPIAware() } catch {}
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

const getWindowPlacementRectsByHandle = (handle) => (
  new Promise((resolve) => {
    const safeHandle = String(handle || '').trim();
    if (!safeHandle) {
      resolve({ outerRect: null, visibleRect: null });
      return;
    }

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Win32PlacementRect {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
}
"@
try { [void][Win32PlacementRect]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
try { [void][Win32PlacementRect]::SetProcessDPIAware() } catch {}
$h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
if ($h -eq [IntPtr]::Zero) { Write-Output "{}"; exit 0 }
$outer = New-Object Win32PlacementRect+RECT
$hasOuter = [Win32PlacementRect]::GetWindowRect($h, [ref]$outer)
$visible = New-Object Win32PlacementRect+RECT
$hasVisible = $false
try {
  # DWMWA_EXTENDED_FRAME_BOUNDS = 9 (visible window frame, excludes resize border padding)
  $hr = [Win32PlacementRect]::DwmGetWindowAttribute($h, 9, [ref]$visible, [System.Runtime.InteropServices.Marshal]::SizeOf([type]([Win32PlacementRect+RECT])))
  $hasVisible = ($hr -eq 0)
} catch {
  $hasVisible = $false
}
if (-not $hasOuter -and -not $hasVisible) { Write-Output "{}"; exit 0 }
$out = @{}
if ($hasOuter) {
  $out.outerRect = @{
    left = [int]$outer.Left
    top = [int]$outer.Top
    width = [int]($outer.Right - $outer.Left)
    height = [int]($outer.Bottom - $outer.Top)
  }
}
if ($hasVisible) {
  $out.visibleRect = @{
    left = [int]$visible.Left
    top = [int]$visible.Top
    width = [int]($visible.Right - $visible.Left)
    height = [int]($visible.Bottom - $visible.Top)
  }
}
$out | ConvertTo-Json -Depth 4`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 4500, maxBuffer: 1024 * 128 },
      (_error, stdout) => {
        try {
          const parsed = JSON.parse(String(stdout || '').trim() || '{}');
          const normalizeRect = (rect) => {
            if (!rect || typeof rect !== 'object') return null;
            if (
              !Number.isFinite(Number(rect.left))
              || !Number.isFinite(Number(rect.top))
              || !Number.isFinite(Number(rect.width))
              || !Number.isFinite(Number(rect.height))
            ) {
              return null;
            }
            return {
              left: Number(rect.left),
              top: Number(rect.top),
              width: Number(rect.width),
              height: Number(rect.height),
            };
          };
          resolve({
            outerRect: normalizeRect(parsed.outerRect),
            visibleRect: normalizeRect(parsed.visibleRect),
          });
        } catch {
          resolve({ outerRect: null, visibleRect: null });
        }
      },
    );
  })
);

const getWindowClassNameByHandle = (handle) => (
  new Promise((resolve) => {
    const safeHandle = String(handle || '').trim();
    if (!safeHandle || process.platform !== 'win32') {
      resolve('');
      return;
    }

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Win32ClassName {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
}
"@
$h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
if ($h -eq [IntPtr]::Zero) { Write-Output ""; exit 0 }
$sb = New-Object System.Text.StringBuilder 256
[void][Win32ClassName]::GetClassName($h, $sb, $sb.Capacity)
Write-Output $sb.ToString()`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 3000, maxBuffer: 1024 * 64 },
      (_error, stdout) => {
        resolve(normalizeWindowClassName(String(stdout || '').trim()));
      },
    );
  })
);

const isWindowOnTargetMonitor = ({ rect, monitor }) => {
  if (!rect || !monitor) return false;
  // GetWindowRect is physical px; compare to workAreaPhysical on Windows (DIP workArea would mismatch).
  const target = (
    process.platform === 'win32' && monitor.workAreaPhysical
      ? monitor.workAreaPhysical
      : (monitor.workArea || monitor.bounds || null)
  );
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

const isRectCloseToTargetBounds = (rect, bounds, tolerancePx = 6) => {
  if (!rect || !bounds) return false;
  if (bounds.state !== 'normal') return true;
  const tol = Math.max(0, Number(tolerancePx || 0));
  const dl = Math.abs(Number(rect.left || 0) - Number(bounds.left || 0));
  const dt = Math.abs(Number(rect.top || 0) - Number(bounds.top || 0));
  const dw = Math.abs(Number(rect.width || 0) - Number(bounds.width || 0));
  const dh = Math.abs(Number(rect.height || 0) - Number(bounds.height || 0));
  return dl <= tol && dt <= tol && dw <= tol && dh <= tol;
};

const getVerificationTolerancePx = (processHintLc) => (
  isChromiumFamilyProcessKey(String(processHintLc || '').trim().toLowerCase())
    ? 6
    : 8
);

const verifyAndCorrectWindowPlacement = async ({
  handle,
  monitor,
  bounds,
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  skipFrameChanged = false,
  maxCorrections = 2,
  initialCheckDelayMs = 0,
  diagnostics = null,
  diagnosticsContext = {},
}) => {
  const safeHandle = String(handle || '').trim();
  const processHintLc = String(diagnosticsContext?.processHintLc || '').trim().toLowerCase();
  if (!safeHandle || !monitor || !bounds) {
    return { verified: false, corrected: false };
  }

  if (initialCheckDelayMs > 0) {
    await sleep(initialCheckDelayMs);
  }

  const target = (
    process.platform === 'win32' && monitor.workAreaPhysical
      ? monitor.workAreaPhysical
      : (monitor.workArea || monitor.bounds || null)
  );
  const desiredVisibleBounds = { ...bounds };
  let correctedOuterBounds = { ...bounds };
  let lastOuterRect = null;
  let lastVisibleRect = null;
  const verificationTolerancePx = getVerificationTolerancePx(processHintLc);
  const windowClassName = await getWindowClassNameByHandle(safeHandle);
  for (let attempt = 0; attempt <= maxCorrections; attempt += 1) {
    const placementRects = await getWindowPlacementRectsByHandle(safeHandle);
    const outerRect = placementRects?.outerRect || null;
    const visibleRect = placementRects?.visibleRect || outerRect;
    lastOuterRect = outerRect;
    lastVisibleRect = visibleRect;
    const calibration = (
      desiredVisibleBounds.state === 'normal'
        ? getClassResidualCalibration(windowClassName)
        : null
    );
    const correctionTargetBounds = calibration
      ? {
        ...desiredVisibleBounds,
        left: Number(desiredVisibleBounds.left || 0) - Number(calibration.left || 0),
        top: Number(desiredVisibleBounds.top || 0) - Number(calibration.top || 0),
        width: Math.max(120, Number(desiredVisibleBounds.width || 0) - Number(calibration.width || 0)),
        height: Math.max(120, Number(desiredVisibleBounds.height || 0) - Number(calibration.height || 0)),
      }
      : desiredVisibleBounds;
    const onTargetMonitor = isWindowOnTargetMonitor({
      rect: visibleRect,
      monitor,
      bounds: desiredVisibleBounds,
    });
    const closeToTargetBounds = isRectCloseToTargetBounds(
      visibleRect,
      desiredVisibleBounds,
      verificationTolerancePx,
    );
    if (onTargetMonitor && closeToTargetBounds) {
      return { verified: true, corrected: attempt > 0 };
    }
    if (attempt >= maxCorrections) break;

    if (outerRect && visibleRect && desiredVisibleBounds.state === 'normal') {
      const leftInset = Math.max(0, Number(visibleRect.left || 0) - Number(outerRect.left || 0));
      const topInset = Math.max(0, Number(visibleRect.top || 0) - Number(outerRect.top || 0));
      const rightInset = Math.max(
        0,
        (Number(outerRect.left || 0) + Number(outerRect.width || 0))
        - (Number(visibleRect.left || 0) + Number(visibleRect.width || 0)),
      );
      const bottomInset = Math.max(
        0,
        (Number(outerRect.top || 0) + Number(outerRect.height || 0))
        - (Number(visibleRect.top || 0) + Number(visibleRect.height || 0)),
      );

      // Compensate for app-specific non-client frame differences (caption/shadow) that
      // can cause visible gaps after a nominal SetWindowPos when comparing outer vs visible frame.
      const baseOuterLeft = Number(correctionTargetBounds.left || 0) - leftInset;
      const baseOuterTop = Number(correctionTargetBounds.top || 0) - topInset;
      const baseOuterWidth = Number(correctionTargetBounds.width || 0) + leftInset + rightInset;
      const baseOuterHeight = Number(correctionTargetBounds.height || 0) + topInset + bottomInset;
      const visibleLeftError = Number(correctionTargetBounds.left || 0) - Number(visibleRect.left || 0);
      const visibleTopError = Number(correctionTargetBounds.top || 0) - Number(visibleRect.top || 0);
      const visibleWidthError = Number(correctionTargetBounds.width || 0) - Number(visibleRect.width || 0);
      const visibleHeightError = Number(correctionTargetBounds.height || 0) - Number(visibleRect.height || 0);
      const correctedLeft = baseOuterLeft + visibleLeftError;
      const correctedTop = baseOuterTop + visibleTopError;
      const correctedWidth = baseOuterWidth + visibleWidthError;
      const correctedHeight = baseOuterHeight + visibleHeightError;

      const minWidth = 120;
      const minHeight = 120;
      const frameOverflowAllowance = 40;
      const maxWidth = target
        ? Number((target.width || correctedWidth) + leftInset + rightInset + (frameOverflowAllowance * 2))
        : Number(correctedWidth);
      const maxHeight = target
        ? Number((target.height || correctedHeight) + topInset + bottomInset + (frameOverflowAllowance * 2))
        : Number(correctedHeight);
      const nextWidth = clamp(Math.round(correctedWidth), minWidth, Math.max(minWidth, Math.round(maxWidth)));
      const nextHeight = clamp(Math.round(correctedHeight), minHeight, Math.max(minHeight, Math.round(maxHeight)));
      const minLeft = target
        ? Number((target.x || 0) - leftInset - frameOverflowAllowance)
        : Number(correctedLeft);
      const minTop = target
        ? Number((target.y || 0) - topInset - frameOverflowAllowance)
        : Number(correctedTop);
      const maxLeft = target
        ? Number(target.x || 0) + Number(target.width || 0) + rightInset + frameOverflowAllowance - nextWidth
        : Number(correctedLeft);
      const maxTop = target
        ? Number(target.y || 0) + Number(target.height || 0) + bottomInset + frameOverflowAllowance - nextHeight
        : Number(correctedTop);

      correctedOuterBounds = {
        ...correctedOuterBounds,
        left: clamp(Math.round(correctedLeft), Math.round(minLeft), Math.round(Math.max(minLeft, maxLeft))),
        top: clamp(Math.round(correctedTop), Math.round(minTop), Math.round(Math.max(minTop, maxTop))),
        width: nextWidth,
        height: nextHeight,
      };
    }

    await moveSpecificWindowHandleToBounds({
      handle: safeHandle,
      bounds: correctedOuterBounds,
      processHintLc,
      aggressiveMaximize,
      positionOnlyBeforeMaximize,
      skipFrameChanged,
      frameCompensationMode: 'none',
      diagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'verify-and-correct-placement',
        attemptIndex: attempt + 1,
      },
    });
    await sleep(90);
  }
  if (diagnostics) {
    diagnostics.failure({
      ...diagnosticsContext,
      strategy: 'verify-and-correct-placement',
      reason: 'verification-failed',
      handle: safeHandle,
      className: windowClassName || null,
      actualRect: lastVisibleRect || lastOuterRect || null,
      actualOuterRect: lastOuterRect || null,
      actualVisibleRect: lastVisibleRect || null,
      targetBounds: desiredVisibleBounds || null,
      attemptedOuterBounds: correctedOuterBounds || null,
      delta: describeBoundsDelta(lastVisibleRect || lastOuterRect, desiredVisibleBounds),
      monitor: describeMonitor(monitor),
    });
  }
  return { verified: false, corrected: true };
};

const getVisibleWindowInfos = (processName, options = {}) => (
  new Promise((resolve) => {
    const diagnostics = options?.diagnostics || null;
    const diagnosticsContext = options?.diagnosticsContext || {};
    const expectNonEmpty = options?.expectNonEmpty === true;
    const safeName = String(processName || '').trim().toLowerCase().replace(/\.exe$/i, '');
    if (!safeName) { resolve([]); return; }

    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class WinEnum {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
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
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
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
      var title = new StringBuilder(256);
      GetWindowText(h, title, title.Capacity);
      int titleLen = GetWindowTextLength(h);
      IntPtr owner = GetWindow(h, 4); // GW_OWNER
      bool hasOwner = owner != IntPtr.Zero;
      bool topMost = (exStyle & 0x00000008L) != 0; // WS_EX_TOPMOST
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
      row["title"] = title.ToString();
      row["titleLength"] = titleLen;
      row["hasOwner"] = hasOwner;
      row["topMost"] = topMost;
      r.Add(row);
      return true;
    }, IntPtr.Zero);
    return r;
  }
}
"@
try { [void][WinEnum]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
try { [void][WinEnum]::SetProcessDPIAware() } catch {}
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
      (execError, stdout) => {
        const output = String(stdout || '').trim();
        try {
          const parsed = JSON.parse(output || '[]');
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          const normalizedRows = rows.filter(Boolean).map((row) => ({
            handle: String(row.handle || ''),
            width: Number(row.width || 0),
            height: Number(row.height || 0),
            area: Number(row.area || 0),
            enabled: Boolean(row.enabled),
            hung: Boolean(row.hung),
            tool: Boolean(row.tool),
            cloaked: Boolean(row.cloaked),
            className: String(row.className || ''),
            title: String(row.title || ''),
            titleLength: Number(row.titleLength || 0),
            hasOwner: Boolean(row.hasOwner),
            topMost: Boolean(row.topMost),
          })).filter((row) => row.handle);
          if (expectNonEmpty && normalizedRows.length === 0 && diagnostics) {
            diagnostics.failure({
              ...diagnosticsContext,
              strategy: 'get-visible-window-infos',
              reason: 'no-visible-windows',
              processName: safeName,
              outputSnippet: output.slice(0, 200) || null,
              error: execError ? String(execError?.message || execError) : null,
            });
          }
          resolve(normalizedRows);
        } catch (parseError) {
          if (diagnostics) {
            diagnostics.failure({
              ...diagnosticsContext,
              strategy: 'get-visible-window-infos',
              reason: 'windows-info-parse-failed',
              processName: safeName,
              outputSnippet: output.slice(0, 200) || null,
              error: String(parseError?.message || parseError || 'parse-error'),
              commandError: execError ? String(execError?.message || execError) : null,
            });
          }
          resolve([]);
        }
      },
    );
  })
);

const CHROMIUM_TOPLEVEL_CLASSES = ['chrome_widgetwin_1'];

const isChromiumTopLevelWindowRow = (row) => {
  const cn = String(row?.className || '').toLowerCase();
  return CHROMIUM_TOPLEVEL_CLASSES.some((c) => cn.includes(c));
};

const CHROMIUM_FAMILY_PLACEMENT_KEYS = new Set(['chrome', 'msedge', 'brave', 'vivaldi', 'opera', 'arc']);

const isChromiumFamilyProcessKey = (key) => (
  CHROMIUM_FAMILY_PLACEMENT_KEYS.has(String(key || '').trim().toLowerCase().replace(/\.exe$/i, ''))
);

const scoreWindowCandidate = (row, options = {}) => {
  const chromiumHint = String(options.chromiumProcessHint || '').toLowerCase();
  const isChromiumFamily = isChromiumFamilyProcessKey(chromiumHint);
  const className = String(row?.className || '').toLowerCase();
  const titleLength = Number(row?.titleLength || 0);
  const area = Number(row?.area || 0);
  const w = Number(row?.width || 0);
  const h = Number(row?.height || 0);
  let score = 0;

  if (row?.enabled) score += 1_000_000_000;
  if (!row?.hung) score += 250_000_000;
  if (!row?.tool) score += 100_000_000;
  if (!row?.cloaked) score += 50_000_000;
  if (titleLength > 0) score += 5_000_000;

  // Penalize known non-primary Chromium surfaces that can appear blank/uninteractive.
  if (className.includes('renderwidgethosthwnd')) score -= 150_000_000;
  if (className.includes('intermediate d3d window')) score -= 120_000_000;

  if (isChromiumFamily) {
    if (CHROMIUM_TOPLEVEL_CLASSES.some((c) => className.includes(c))) {
      score += 220_000_000;
    }
    // Brave/Chrome may expose a narrow vertical strip or helper; prefer the wide main frame.
    if (w > 0 && h > 0 && w < 420 && h > 360) {
      score -= 450_000_000;
    }
  }

  return score + area;
};

const MODAL_DIALOG_CLASSES = new Set(['#32770']);

const isLikelyModalBlockerWindow = (row, expectedBounds = null) => {
  if (!row || row.cloaked || row.hung || !row.enabled) return false;
  const className = String(row.className || '').toLowerCase();
  const titleLength = Number(row.titleLength || 0);
  const hasOwner = Boolean(row.hasOwner);
  const topMost = Boolean(row.topMost);
  const width = Number(row.width || 0);
  const height = Number(row.height || 0);
  const expectedWidth = Math.max(1, Number(expectedBounds?.width || 0));
  const expectedHeight = Math.max(1, Number(expectedBounds?.height || 0));
  const clearlySmallerThanTarget = (
    expectedWidth > 0
    && expectedHeight > 0
    && width <= Math.floor(expectedWidth * 0.9)
    && height <= Math.floor(expectedHeight * 0.9)
  );
  if (MODAL_DIALOG_CLASSES.has(className)) return true;
  if (hasOwner && titleLength > 0 && clearlySmallerThanTarget) return true;
  if (topMost && hasOwner && titleLength > 0) return true;
  return false;
};

const isLikelyMainPlacementWindow = (row, expectedBounds = null) => {
  if (!row || row.cloaked || row.hung || row.tool || !row.enabled) return false;
  if (isLikelyModalBlockerWindow(row, expectedBounds)) return false;
  const width = Number(row.width || 0);
  const height = Number(row.height || 0);
  const minExpectedWidth = Math.max(320, Math.floor(Number(expectedBounds?.width || 0) * 0.52));
  const minExpectedHeight = Math.max(220, Math.floor(Number(expectedBounds?.height || 0) * 0.52));
  return width >= minExpectedWidth && height >= minExpectedHeight;
};

const waitForMainWindowReadyOrBlocker = async ({
  processHintLc,
  expectedBounds = null,
  timeoutMs = 30000,
  pollMs = 260,
  diagnostics = null,
  diagnosticsContext = {},
}) => {
  const safeProcess = String(processHintLc || '').trim().toLowerCase();
  if (!safeProcess) return { ready: false, timedOut: false, blocked: false, handle: null };
  const deadline = Date.now() + Math.max(2000, Number(timeoutMs || 0));
  let blockerReported = false;
  let stableHandle = null;
  let stableCount = 0;

  while (Date.now() <= deadline) {
    const rows = await getVisibleWindowInfos(safeProcess, {
      diagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'window-ready-gate-scan',
      },
    });

    const blockers = rows.filter((row) => isLikelyModalBlockerWindow(row, expectedBounds));
    if (blockers.length > 0) {
      if (!blockerReported && diagnostics) {
        diagnostics.decision({
          ...diagnosticsContext,
          strategy: 'launch-blocker-detected',
          reason: 'modal-window-blocking-placement',
          processHintLc: safeProcess,
          blockerCount: blockers.length,
          blockerSample: summarizeWindowRows(blockers, 3),
        });
        blockerReported = true;
      }
      stableHandle = null;
      stableCount = 0;
      await sleep(pollMs);
      continue;
    }

    const candidates = rows
      .filter((row) => isLikelyMainPlacementWindow(row, expectedBounds))
      .sort((a, b) => scoreWindowCandidate(b, { chromiumProcessHint: safeProcess })
        - scoreWindowCandidate(a, { chromiumProcessHint: safeProcess }));
    if (candidates.length === 0) {
      stableHandle = null;
      stableCount = 0;
      await sleep(pollMs);
      continue;
    }

    const topCandidate = candidates[0];
    if (stableHandle && stableHandle === topCandidate.handle) {
      stableCount += 1;
    } else {
      stableHandle = topCandidate.handle;
      stableCount = 1;
    }

    if (stableCount >= 2) {
      return {
        ready: true,
        timedOut: false,
        blocked: false,
        handle: stableHandle,
        candidateSample: summarizeWindowRows(candidates, 3),
      };
    }
    await sleep(pollMs);
  }

  if (diagnostics) {
    diagnostics.failure({
      ...diagnosticsContext,
      strategy: 'window-ready-gate',
      reason: blockerReported ? 'modal-blocker-timeout' : 'main-window-timeout',
      processHintLc: safeProcess,
      timeoutMs: Math.max(2000, Number(timeoutMs || 0)),
    });
  }
  return {
    ready: false,
    timedOut: true,
    blocked: blockerReported,
    handle: null,
  };
};

/**
 * Prefer Chromium top-level HWNDs (Chrome_WidgetWin_1) with largest area; avoids narrow strips / blank surfaces.
 */
const placeChromiumByRankedWindows = async ({
  processHintLc,
  placementBounds,
  aggressiveMaximize,
  positionOnlyBeforeMaximize,
  skipFrameChanged = false,
  diagnostics = null,
  diagnosticsContext = {},
}) => {
  const maxRounds = 26;
  let lastRankedSample = [];
  for (let round = 0; round < maxRounds; round += 1) {
    const rows = await getVisibleWindowInfos(processHintLc, {
      diagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        attemptIndex: round + 1,
      },
    });
    if (rows.length === 0) {
      await sleep(120);
      continue;
    }
    const pool = rows.some(isChromiumTopLevelWindowRow)
      ? rows.filter(isChromiumTopLevelWindowRow)
      : rows;
    const ranked = [...pool].sort(
      (a, b) => scoreWindowCandidate(b, { chromiumProcessHint: processHintLc })
        - scoreWindowCandidate(a, { chromiumProcessHint: processHintLc }),
    );
    lastRankedSample = ranked
      .slice(0, 3)
      .map((row) => ({
        ...row,
        score: scoreWindowCandidate(row, { chromiumProcessHint: processHintLc }),
      }));
    for (const row of ranked.slice(0, 12)) {
      const r = await moveSpecificWindowHandleToBounds({
        handle: row.handle,
        bounds: placementBounds,
        aggressiveMaximize,
        positionOnlyBeforeMaximize,
        skipFrameChanged,
        diagnostics,
        diagnosticsContext: {
          ...diagnosticsContext,
          strategy: 'chromium-ranked-windows',
          attemptIndex: round + 1,
          candidateHandle: row.handle,
        },
      });
      if (r.applied) return r;
    }
    await sleep(120);
  }
  if (diagnostics) {
    diagnostics.failure({
      ...diagnosticsContext,
      strategy: 'chromium-ranked-windows',
      reason: 'ranked-window-placement-exhausted',
      roundsAttempted: maxRounds,
      rankedCandidates: summarizeWindowRows(lastRankedSample, 3),
    });
  }
  return { applied: false, handle: null };
};

const waitForWindowResponsive = async (processName, handle, maxWaitMs = 1800, options = {}) => {
  const diagnostics = options?.diagnostics || null;
  const diagnosticsContext = options?.diagnosticsContext || {};
  const safeHandle = String(handle || '').trim();
  if (!safeHandle) return false;

  const deadline = Date.now() + Math.max(0, Number(maxWaitMs || 0));
  let lastRow = null;
  while (Date.now() <= deadline) {
    const rows = await getVisibleWindowInfos(processName, {
      diagnostics,
      diagnosticsContext,
    });
    const row = rows.find((candidate) => String(candidate.handle) === safeHandle);
    if (row) lastRow = row;
    if (row && row.enabled && !row.hung && !row.cloaked && row.area > 80_000) {
      return true;
    }
    await sleep(120);
  }

  if (diagnostics) {
    diagnostics.failure({
      ...diagnosticsContext,
      strategy: 'wait-for-window-responsive',
      reason: 'responsive-timeout',
      handle: safeHandle,
      maxWaitMs,
      lastWindowState: summarizeWindowRows(lastRow ? [lastRow] : [], 1)[0] || null,
    });
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
  let launchSequence = 0;
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

    const rawExe = app?.executablePath || app?.path || '';
    const executablePath = extractExecutablePath(rawExe) || null;
    const shortcutPath = resolveShortcutPathForLaunch(app?.shortcutPath);
    const launchUrl = (typeof app?.launchUrl === 'string' && isSafeAppLaunchUrl(app.launchUrl))
      ? safeLimitedString(app.launchUrl, MAX_URL_LENGTH)
      : '';

    if (!executablePath && !shortcutPath && !launchUrl) {
      skippedApps.push({
        name: appName,
        reason: 'missing-launch-target',
      });
      return;
    }
    if (executablePath && isDisallowedLaunchExecutablePath(executablePath)) {
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
    const seq = launchSequence;
    launchSequence += 1;
    launches.push({
      appName,
      executablePath,
      shortcutPath: shortcutPath || null,
      launchUrl: launchUrl || null,
      launchSequence: seq,
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
    // Minimized tray entries should always relaunch minimized.
    pushIfLaunchable(
      {
        ...app,
        launchBehavior: 'minimize',
        _launchFromMinimizedTray: true,
      },
      app?.targetMonitor || primaryProfileMonitorId || null,
    );
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
  let legacyLaunchSequence = 0;
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
    const seq = legacyLaunchSequence;
    legacyLaunchSequence += 1;
    launches.push({
      appName,
      executablePath,
      shortcutPath: null,
      launchUrl: null,
      launchSequence: seq,
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
  const { profiles, storeError } = unpackProfilesReadResult(readProfilesFromDisk());
  if (storeError) {
    return {
      ok: false,
      error: String(storeError?.message || 'Could not load saved profiles.'),
      code: String(storeError?.code || 'READ_FAILED'),
      requestedProfileId: String(profileId || '').trim(),
      availableProfileIds: [],
    };
  }
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
  const hasModernLaunches = modernLaunchData.launches.length > 0;
  const launchKey = (launch) => {
    const instanceId = String(launch.app?.instanceId || '').trim();
    if (instanceId) {
      return `${instanceId}::${launch.monitor?.id || 'monitor'}`;
    }
    // Without an explicit instanceId, treat same launch target on same monitor as one logical app launch.
    // This prevents accidental duplicates from mixed/legacy profile data from opening multiple windows.
    return `${launch.monitor?.id || 'monitor'}::${String(launch.executablePath || '').toLowerCase()}::${String(launch.shortcutPath || '').toLowerCase()}::${String(launch.launchUrl || '').toLowerCase()}`;
  };
  const seenLaunchKeys = new Set();
  // Prefer modern monitor-layout launches. Legacy action-app launches are fallback only
  // when a profile has no modern app definitions.
  const preferredLaunches = hasModernLaunches
    ? modernLaunchData.launches
    : [...modernLaunchData.launches, ...legacyLaunchData.launches];
  const appLaunches = preferredLaunches
    .filter((launch) => {
      const key = launchKey(launch);
      if (seenLaunchKeys.has(key)) return false;
      seenLaunchKeys.add(key);
      return true;
    });
  const skippedApps = [...modernLaunchData.skippedApps, ...legacyLaunchData.skippedApps];
  const failedApps = [];
  const placementRecords = [];
  let launchedAppCount = 0;
  const requestedLaunchOrder = profile?.launchOrder === 'sequential' ? 'sequential' : 'all-at-once';
  const launchOrder = 'sequential';
  const appLaunchDelays = (profile?.appLaunchDelays && typeof profile.appLaunchDelays === 'object')
    ? profile.appLaunchDelays
    : {};
  const processHintCounts = new Map();
  for (const launchItem of appLaunches) {
    const processKey = getPlacementProcessKey(launchItem);
    processHintCounts.set(processKey, (processHintCounts.get(processKey) || 0) + 1);
  }

  const { shell } = require('electron');
  const profileDiagnostics = createLaunchDiagnostics({
    profileId: normalizedProfileId,
    launchState,
  });
  profileDiagnostics.start({
    strategy: 'launch-profile',
    reason: 'launch-profile-requested',
    launchOrder,
    appCount: appLaunches.length,
    modernLaunchCount: modernLaunchData.launches.length,
    legacyLaunchCount: legacyLaunchData.launches.length,
    skippedAppCount: skippedApps.length,
  });
  profileDiagnostics.decision({
    strategy: 'monitor-mapping',
    reason: 'profile-monitor-map-created',
    mappings: buildMonitorMappingDiagnostics(profile?.monitors, systemMonitors, monitorMap),
  });
  profileDiagnostics.decision({
    strategy: 'process-hint-distribution',
    reason: 'process-hint-counts',
    counts: Array.from(processHintCounts.entries()).map(([processHintLc, count]) => ({
      processHintLc,
      count,
    })),
  });

  const runLaunch = async (launchItem) => {
    const launchDiagnostics = createLaunchDiagnostics({
      profileId: normalizedProfileId,
      launchSequence: Number(launchItem?.launchSequence ?? -1),
      appName: launchItem?.appName || 'unknown',
    });
    try {
      const processHintLc = getPlacementProcessKey(launchItem);
      const processNameHint = processHintLc;
      const hintCount = processHintCounts.get(processHintLc) || 0;
      const isDuplicateProcessLaunch = hintCount > 1;
      const isChromiumFamily = isChromiumFamilyProcessKey(processHintLc);
      const launchArgs = (isChromiumFamily && isDuplicateProcessLaunch && launchItem.executablePath)
        ? ['--new-window']
        : [];
      launchDiagnostics.start({
        processHintLc,
        strategy: 'run-launch',
        reason: 'app-launch-start',
        launchTarget: launchItem.shortcutPath
          ? 'shortcut'
          : launchItem.launchUrl
            ? 'url'
            : 'executable',
        launchOrder,
        requestedLaunchOrder,
        isDuplicateProcessLaunch,
        isChromiumFamily,
        monitor: describeMonitor(launchItem.monitor),
      });
      const preLaunchWindowInfos = isDuplicateProcessLaunch
        ? await getVisibleWindowInfos(processHintLc, {
          diagnostics: launchDiagnostics,
          diagnosticsContext: {
            processHintLc,
            strategy: 'duplicate-prelaunch-window-scan',
          },
        })
        : [];
      const preLaunchHandles = preLaunchWindowInfos.map((row) => row.handle);

      let launchedChild = null;
      if (launchItem.shortcutPath) {
        const openErr = await shell.openPath(launchItem.shortcutPath);
        if (openErr) throw new Error(openErr);
      } else if (launchItem.launchUrl) {
        await shell.openExternal(launchItem.launchUrl);
      } else {
        launchedChild = await launchExecutable(launchItem.executablePath, launchArgs);
      }
      launchedAppCount += 1;
      const bounds = buildWindowBoundsForApp(launchItem.app, launchItem.monitor, launchState, {
        diagnostics: launchDiagnostics,
        diagnosticsContext: {
          processHintLc,
          strategy: 'build-window-bounds',
        },
        processHintLc,
      });
      launchDiagnostics.decision({
        processHintLc,
        strategy: 'build-window-bounds',
        reason: bounds ? 'bounds-created' : 'bounds-unavailable',
        targetMonitor: launchItem.monitor?.name || launchItem.monitor?.id || 'unknown',
        state: bounds?.state || null,
        bounds,
        sourcePosition: launchItem.app?.position || null,
        sourceSize: launchItem.app?.size || null,
      });
      if (bounds) {
        const aggressiveMaximize = bounds.state === 'maximized' && processHintLc === 'msedge';
        const positionOnlyBeforeMaximize = processHintLc === 'msedge' && bounds.state === 'maximized';
        const shouldDelayChromiumMaximize = (
          isChromiumFamily
          && bounds.state === 'maximized'
        );
        const placementBounds = shouldDelayChromiumMaximize
          ? { ...bounds, state: 'normal' }
          : bounds;
        const excludedHandles = preLaunchHandles;
        const chromiumNormalSoftPos = isChromiumFamily && placementBounds.state === 'normal';
        launchDiagnostics.decision({
          processHintLc,
          strategy: 'placement-strategy',
          reason: 'strategy-selected',
          isDuplicateProcessLaunch,
          isChromiumFamily,
          shouldDelayChromiumMaximize,
          placementState: placementBounds.state,
        });

        if (isDuplicateProcessLaunch) {
          await sleep(240);
        } else if (launchItem.shortcutPath || launchItem.launchUrl) {
          await sleep(200);
        }

        const readyGateTimeoutMs = placementBounds.state === 'maximized' ? 65000 : 45000;
        const readyGate = await waitForMainWindowReadyOrBlocker({
          processHintLc,
          expectedBounds: placementBounds,
          timeoutMs: readyGateTimeoutMs,
          pollMs: 260,
          diagnostics: launchDiagnostics,
          diagnosticsContext: {
            processHintLc,
            strategy: 'window-ready-gate',
            placementState: placementBounds.state,
          },
        });
        if (!readyGate.ready && readyGate.blocked) {
          const blockerMessage = 'App is waiting on a modal prompt; complete it and relaunch profile.';
          launchDiagnostics.failure({
            processHintLc,
            strategy: 'window-ready-gate',
            reason: 'modal-blocker-timeout',
            message: blockerMessage,
            timeoutMs: readyGateTimeoutMs,
          });
          failedApps.push({
            name: launchItem.appName,
            path: launchItem.executablePath || launchItem.shortcutPath || launchItem.launchUrl || '',
            error: blockerMessage,
          });
          return;
        }

        let result = { applied: false, handle: null };
        let newHandles = [];

        if (readyGate.ready && readyGate.handle) {
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'window-ready-gate',
            reason: 'placing-stable-main-window-handle',
            handle: readyGate.handle,
          });
          result = await moveSpecificWindowHandleToBounds({
            handle: readyGate.handle,
            bounds: placementBounds,
            processHintLc,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'window-ready-gate-placement',
              placementState: placementBounds.state,
            },
          });
        }

        if (!result.applied && isDuplicateProcessLaunch) {
          const postLaunchWindowInfos = await getVisibleWindowInfos(processHintLc, {
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'duplicate-postlaunch-window-scan',
            },
            expectNonEmpty: true,
          });
          const postLaunchHandles = postLaunchWindowInfos.map((row) => row.handle);
          const preHandleSet = new Set(preLaunchHandles);
          newHandles = postLaunchHandles.filter((h) => !preHandleSet.has(h));
          const newHandleSet = new Set(newHandles);
          let rankedNewWindows = postLaunchWindowInfos
            .filter((row) => newHandleSet.has(row.handle))
            .sort((a, b) => scoreWindowCandidate(b, { chromiumProcessHint: processHintLc })
              - scoreWindowCandidate(a, { chromiumProcessHint: processHintLc }));
          if (isChromiumFamily && rankedNewWindows.some(isChromiumTopLevelWindowRow)) {
            rankedNewWindows = rankedNewWindows.filter(isChromiumTopLevelWindowRow);
          }

          for (const candidateRow of rankedNewWindows) {
            const newHandle = candidateRow.handle;
            if (isChromiumFamily) {
              await waitForWindowResponsive(processHintLc, newHandle, 2200, {
                diagnostics: launchDiagnostics,
                diagnosticsContext: {
                  processHintLc,
                  strategy: 'duplicate-window-wait-responsive',
                  candidateHandle: newHandle,
                },
              });
            }
            launchDiagnostics.attempt({
              processHintLc,
              strategy: 'duplicate-ranked-new-window',
              reason: 'trying-new-window-handle',
              handle: newHandle,
            });
            result = await moveSpecificWindowHandleToBounds({
              handle: newHandle,
              bounds: placementBounds,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
              skipFrameChanged: chromiumNormalSoftPos,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'duplicate-ranked-new-window',
                candidateHandle: newHandle,
              },
            });
            if (result.applied) break;
          }

          launchDiagnostics.result({
            processHintLc,
            strategy: 'duplicate-window-discovery',
            reason: result.applied ? 'duplicate-window-placement-applied' : 'duplicate-window-placement-not-applied',
            preHandles: preLaunchHandles,
            postHandles: postLaunchHandles,
            newHandles,
            rankedNewWindowCandidates: summarizeWindowRows(rankedNewWindows.map((row) => ({
              ...row,
              score: scoreWindowCandidate(row, { chromiumProcessHint: processHintLc }),
            })), 6),
            placedHandle: result.handle,
            applied: result.applied,
          });
        }

        if (!result.applied && isChromiumFamily) {
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'chromium-ranked-windows',
            reason: 'fallback-after-duplicate-path',
          });
          result = await placeChromiumByRankedWindows({
            processHintLc,
            placementBounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              placementState: placementBounds.state,
            },
          });
        }

        if (!result.applied) {
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'move-window-to-bounds',
            reason: 'general-placement-attempt',
            pid: launchedChild?.pid || 0,
          });
          result = await moveWindowToBounds({
            pid: launchedChild?.pid || 0,
            bounds: placementBounds,
            processNameHint,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            preferNameEnumeration: isDuplicateProcessLaunch,
            excludedWindowHandles: excludedHandles,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'move-window-to-bounds-primary',
              placementState: placementBounds.state,
            },
          });
        }

        if (!result.applied && isDuplicateProcessLaunch) {
          await sleep(260);
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'move-window-to-bounds',
            reason: 'duplicate-retry-with-name-enumeration',
            pid: launchedChild?.pid || 0,
          });
          result = await moveWindowToBounds({
            pid: launchedChild?.pid || 0,
            bounds: placementBounds,
            processNameHint,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            preferNameEnumeration: true,
            excludedWindowHandles: excludedHandles,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'move-window-to-bounds-duplicate-retry',
              placementState: placementBounds.state,
            },
          });
        }

        if (!result.applied && isDuplicateProcessLaunch && newHandles.length > 0) {
          for (const newHandle of newHandles) {
            launchDiagnostics.attempt({
              processHintLc,
              strategy: 'duplicate-known-new-handles',
              reason: 'retry-new-handle-placement',
              handle: newHandle,
            });
            result = await moveSpecificWindowHandleToBounds({
              handle: newHandle,
              bounds: placementBounds,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
              skipFrameChanged: chromiumNormalSoftPos,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'duplicate-known-new-handles',
                candidateHandle: newHandle,
              },
            });
            if (result.applied) break;
          }
        }

        launchDiagnostics.result({
          processHintLc,
          strategy: 'placement-final',
          reason: result.applied ? 'placement-applied' : 'placement-not-applied',
          applied: result.applied,
          handle: result.handle || null,
        });
        if (result.applied && result.handle && launchItem.monitor && placementBounds.state === 'normal') {
          placementRecords.push({
            appName: launchItem.appName,
            processHintLc,
            handle: result.handle,
            bounds: placementBounds,
            monitor: launchItem.monitor,
          });
        }

        if (result.applied && result.handle && launchItem.monitor && placementBounds.state === 'normal') {
          const knownHandleStabilized = await stabilizeKnownHandlePlacement({
            handle: result.handle,
            bounds: placementBounds,
            monitor: launchItem.monitor,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            durationMs: isChromiumFamily ? 1600 : 2200,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'known-handle-stabilization',
              placementState: placementBounds.state,
            },
          });
          launchDiagnostics.result({
            processHintLc,
            strategy: 'known-handle-stabilization',
            reason: knownHandleStabilized.verified
              ? 'known-handle-stabilization-verified'
              : 'known-handle-stabilization-not-verified',
            verified: knownHandleStabilized.verified,
            corrected: knownHandleStabilized.corrected,
            handle: knownHandleStabilized.handle,
          });
        }

        let placementVerified = false;
        if (result.applied && result.handle && launchItem.monitor && placementBounds.state === 'normal') {
          const verification = await verifyAndCorrectWindowPlacement({
            handle: result.handle,
            monitor: launchItem.monitor,
            bounds: placementBounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            maxCorrections: isDuplicateProcessLaunch ? 2 : 3,
            initialCheckDelayMs: isDuplicateProcessLaunch ? 220 : 140,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'placement-verification',
              placementState: placementBounds.state,
            },
          });
          placementVerified = verification.verified;

          launchDiagnostics.result({
            processHintLc,
            strategy: 'placement-verification',
            reason: verification.verified ? 'placement-verified' : 'placement-not-verified',
            handle: result.handle,
            verified: verification.verified,
            corrected: verification.corrected,
          });
        }

        // Chromium often restores a remembered window size after first SetWindowPos; re-assert bounds once.
        if (result.applied && result.handle && isChromiumFamily && placementBounds.state === 'normal') {
          await sleep(260);
          await moveSpecificWindowHandleToBounds({
            handle: result.handle,
            bounds: placementBounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'chromium-normal-soft-reassert',
              candidateHandle: result.handle,
            },
          });
        }

        if (result.applied && result.handle && bounds.state === 'minimized') {
          // Ensure minimized tray apps remain minimized after any placement/verification retries.
          await sleep(80);
          await minimizeWindowHandle(result.handle);
          void ensureMinimizedAfterLaunch({
            handle: result.handle,
            bounds,
            processNameHint,
            pid: launchedChild?.pid || 0,
          });

          // Slow-launch apps may switch from splash HWND to main HWND after first minimize.
          void stabilizePlacementForSlowLaunch({
            processHintLc,
            bounds,
            monitor: launchItem.monitor || null,
            initialHandle: result.handle,
            excludedWindowHandles: preLaunchHandles,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: true,
            durationMs: 7600,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'minimized-stabilization',
              placementState: bounds.state,
            },
          });
        }

        if (result.applied && placementBounds.state === 'normal' && launchItem.monitor) {
          const stabilizationDurationMs = isChromiumFamily ? 2000 : 5600;
          // Some apps resize/reframe after initial launch; keep correcting for a short window.
          const stabilized = await stabilizePlacementForSlowLaunch({
            processHintLc,
            bounds: placementBounds,
            monitor: launchItem.monitor,
            initialHandle: result.handle,
            excludedWindowHandles: preLaunchHandles,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            durationMs: stabilizationDurationMs,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'normal-stabilization',
              placementState: placementBounds.state,
            },
          });

          launchDiagnostics.result({
            processHintLc,
            strategy: 'placement-stabilization',
            reason: stabilized.verified ? 'stabilization-verified' : 'stabilization-not-verified',
            verified: stabilized.verified,
            handle: stabilized.handle,
          });
          placementVerified = placementVerified || stabilized.verified;
        }

        if (result.applied && result.handle && shouldDelayChromiumMaximize) {
          await waitForWindowResponsive(processHintLc, result.handle, 2200, {
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'chromium-delayed-maximize-wait',
              candidateHandle: result.handle,
            },
          });
          await maximizeWindowHandle(result.handle);
          launchDiagnostics.result({
            processHintLc,
            strategy: 'chromium-delayed-maximize',
            reason: 'maximize-reapplied-after-normal-stabilization',
            handle: result.handle,
          });
        }

        if (result.applied && bounds.state === 'maximized' && launchItem.monitor) {
          const maximizedStabilizationDurationMs = isChromiumFamily ? 2600 : 1800;
          const maximizedStabilized = await stabilizePlacementForSlowLaunch({
            processHintLc,
            bounds,
            monitor: launchItem.monitor,
            initialHandle: result.handle,
            excludedWindowHandles: preLaunchHandles,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            durationMs: maximizedStabilizationDurationMs,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'maximized-stabilization',
              placementState: bounds.state,
            },
          });
          launchDiagnostics.result({
            processHintLc,
            strategy: 'placement-stabilization-maximized',
            reason: maximizedStabilized.verified
              ? 'maximized-stabilization-verified'
              : 'maximized-stabilization-not-verified',
            verified: maximizedStabilized.verified,
            handle: maximizedStabilized.handle,
          });
        }
      }
    } catch (error) {
      launchDiagnostics.failure({
        strategy: 'run-launch',
        reason: 'launch-item-failed',
        error: String(error?.message || error || 'Failed to launch app'),
      });
      failedApps.push({
        name: launchItem.appName,
        path: launchItem.executablePath || launchItem.shortcutPath || launchItem.launchUrl || '',
        error: String(error?.message || error || 'Failed to launch app'),
      });
    }
  };

  const hasDuplicateProcessLaunches = Array.from(processHintCounts.values())
    .some((count) => count > 1);
  profileDiagnostics.decision({
    strategy: 'launch-execution-mode',
    reason: requestedLaunchOrder === 'all-at-once'
      ? 'forced-sequential-stability-mode'
      : (hasDuplicateProcessLaunches ? 'forced-sequential-for-duplicates' : 'sequential-mode-selected'),
    requestedLaunchOrder,
    hasDuplicateProcessLaunches,
    executionMode: launchOrder,
  });

  for (const launchItem of appLaunches) {
    const delaySeconds = Number(appLaunchDelays[launchItem.appName] || 0);
    const safeDelayMs = Math.max(0, Math.floor(delaySeconds * 1000));
    if (safeDelayMs > 0) {
      await sleep(safeDelayMs);
    }
    await runLaunch(launchItem);
  }

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
    profileDiagnostics.failure({
      strategy: 'launch-profile',
      reason: 'no-launchable-targets',
      launchedAppCount,
      launchedTabCount,
      requestedAppCount: appLaunches.length,
      skippedAppCount: skippedApps.length,
    });
    return {
      ok: false,
      error: 'No launchable apps or tabs found in this profile. Add an executable path in app details or recreate from installed apps.',
      profile,
      launchedAppCount,
      launchedTabCount,
      failedApps,
      skippedApps,
      requestedAppCount: appLaunches.length,
      placementRecords,
    };
  }

  profileDiagnostics.result({
    strategy: 'launch-profile',
    reason: failedApps.length === 0 ? 'launch-profile-complete' : 'launch-profile-complete-with-failures',
    launchedAppCount,
    launchedTabCount,
    failedAppCount: failedApps.length,
    skippedAppCount: skippedApps.length,
    requestedAppCount: appLaunches.length,
  });
  return {
    ok: failedApps.length === 0,
    profile,
    launchedAppCount,
    launchedTabCount,
    failedApps,
    skippedApps,
    requestedAppCount: appLaunches.length,
    placementRecords,
  };
};

const runLaunchAutomationIfRequested = async () => {
  const automation = getLaunchAutomationConfig();
  if (!automation.enabled) return;

  const automationDiagnostics = createLaunchDiagnostics({
    strategy: 'launch-automation',
    profileId: automation.profileId,
  });
  const summary = {
    startedAt: Date.now(),
    profileId: automation.profileId,
    settleMs: automation.settleMs,
    startDelayMs: automation.startDelayMs,
    launchResult: null,
    screenshot: null,
    postSettleAudit: null,
    cleanup: {
      beforeLaunch: null,
      afterLaunch: null,
    },
    ok: false,
  };

  automationDiagnostics.start({
    reason: 'automation-started',
    settleMs: automation.settleMs,
    startDelayMs: automation.startDelayMs,
    captureScreenshot: automation.captureScreenshot,
  });

  try {
    if (automation.startDelayMs > 0) {
      await sleep(automation.startDelayMs);
    }
    if (automation.closeProfileAppsBetweenRuns) {
      const { profiles: automationProfiles } = unpackProfilesReadResult(readProfilesFromDisk());
      const automationProfile = automationProfiles.find(
        (candidate) => String(candidate?.id || '').trim() === automation.profileId,
      ) || null;
      summary.cleanup.beforeLaunch = await cleanupProfileProcesses(
        automationProfile,
        automationDiagnostics,
        'automation-prelaunch-cleanup',
      );
    }

    const launchResult = await launchProfileById(automation.profileId);
    summary.launchResult = launchResult;
    summary.ok = Boolean(launchResult?.ok);
    automationDiagnostics.result({
      reason: 'automation-launch-finished',
      launchOk: Boolean(launchResult?.ok),
      failedAppCount: Array.isArray(launchResult?.failedApps) ? launchResult.failedApps.length : 0,
      launchedAppCount: Number(launchResult?.launchedAppCount || 0),
      launchedTabCount: Number(launchResult?.launchedTabCount || 0),
    });

    await sleep(automation.settleMs);
    summary.postSettleAudit = await runPostSettlePlacementAudit(launchResult, automationDiagnostics);
    automationDiagnostics.result({
      reason: 'automation-post-settle-audit',
      ...summary.postSettleAudit,
    });

    if (automation.captureScreenshot && automation.screenshotPath) {
      const screenshotResult = await captureAllMonitorsScreenshot(automation.screenshotPath);
      summary.screenshot = screenshotResult;
      if (screenshotResult?.ok) {
        automationDiagnostics.result({
          reason: 'automation-screenshot-captured',
          screenshotPath: automation.screenshotPath,
          monitorCount: Number(screenshotResult?.monitorCount || 0),
          virtualBounds: screenshotResult?.virtualBounds || null,
        });
      } else {
        automationDiagnostics.failure({
          reason: 'automation-screenshot-failed',
          screenshotPath: automation.screenshotPath,
          error: screenshotResult?.error || 'Screenshot capture failed.',
        });
      }
    }

    if (automation.closeProfileAppsBetweenRuns && launchResult?.profile) {
      summary.cleanup.afterLaunch = await cleanupProfileProcesses(
        launchResult.profile,
        automationDiagnostics,
        'automation-postrun-cleanup',
      );
    }
  } catch (error) {
    summary.ok = false;
    summary.error = String(error?.message || error);
    automationDiagnostics.failure({
      reason: 'automation-run-failed',
      error: summary.error,
    });
  } finally {
    summary.finishedAt = Date.now();
    summary.durationMs = summary.finishedAt - summary.startedAt;
    if (automation.summaryPath) {
      try {
        fs.mkdirSync(path.dirname(automation.summaryPath), { recursive: true });
        fs.writeFileSync(automation.summaryPath, JSON.stringify(summary, null, 2), 'utf8');
      } catch (error) {
        automationDiagnostics.failure({
          reason: 'automation-summary-write-failed',
          error: String(error?.message || error),
          summaryPath: automation.summaryPath,
        });
      }
    }
    if (automation.autoQuit) {
      setTimeout(() => app.quit(), 350);
    }
  }
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
    const { profiles, storeError } = unpackProfilesReadResult(readProfilesFromDisk());
    if (storeError) {
      console.error('[profiles:list] Failed to read profiles from store:', storeError);
    }
    return profiles;
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
          shortcutPath: context.shortcutPath || null,
          launchUrl: context.launchUrl || null,
          priority: nextPriority,
        });
        return;
      }

      const currentPriority = existing.priority || 0;
      const preferredName = currentPriority >= nextPriority ? existing.name : normalizedName;
      const preferredPriority = Math.max(currentPriority, nextPriority);
      const preferredIcon = (iconPath && (!existing.iconPath || nextPriority >= currentPriority))
        ? iconPath
        : (existing.iconPath || iconPath || null);
      const preferredExecutablePath = existing.executablePath || context.targetExe || extractExecutablePath(sourcePath) || null;
      const preferredShortcutPath = existing.shortcutPath || context.shortcutPath || null;
      const preferredLaunchUrl = existing.launchUrl || context.launchUrl || null;

      appMap.set(key, {
        name: preferredName,
        iconPath: preferredIcon,
        executablePath: preferredExecutablePath,
        shortcutPath: preferredShortcutPath,
        launchUrl: preferredLaunchUrl,
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

    // 1. Start Menu + Taskbar pinned shortcuts (.lnk / .url)
    const startMenuDirs = [
      path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'ImplicitAppShortcuts'),
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

                      const mapKey = getCanonicalAppKey(name) || name.toLowerCase();
                      // If we already discovered this app with an icon, skip expensive rework.
                      const existing = appMap.get(mapKey);
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
                          launchUrl: null,
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
                const rawUrl = String(shortcut.url || '').trim();
                const safeLaunchUrl = isSafeAppLaunchUrl(rawUrl)
                  ? safeLimitedString(rawUrl, MAX_URL_LENGTH)
                  : '';
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
                    launchUrl: safeLaunchUrl || null,
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
      .map((entry) => ({
        name: entry.name,
        iconPath: entry.iconPath,
        executablePath: entry.executablePath || null,
        shortcutPath: entry.shortcutPath || null,
        launchUrl: entry.launchUrl || null,
      }))
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
