const { app, BrowserWindow, ipcMain, Menu, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');
const { spawn, execFile } = require('child_process');
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
const { createLaunchStatusStore } = require('./services/launch-status-store');
const {
  hiddenProcessNamePatterns,
  hiddenWindowTitlePatterns,
  getRunningWindowProcesses,
} = require('./services/windows-process-service');
const { waitForMainWindowReadyOrBlocker } = require('./services/window-ready-gate');
const {
  isChromiumFamilyProcessKey,
  isChromiumTopLevelWindowRow,
  isChromiumNonPrimaryWindowRow,
  isLikelyAuxiliaryWindowClass,
  scoreWindowCandidate,
} = require('./services/window-candidate-classifier');
const { getMonitorPlacementRect, isWindowOnTargetMonitor } = require('./services/monitor-map');
const { buildCompanionProcessHints } = require('./services/process-hints');
const { captureAllMonitorsScreenshot } = require('./utils/windows-desktop-screenshot');
const {
  isWithinAcceptableStateTolerance,
  planLaunchSlots,
  scoreReuseCandidate,
  shouldTriggerAmbiguityFallback,
} = require('./utils/launch-target-mode');
const { sanitizeProfileStorePayload } = require('./utils/sanitize-profile-store-payload');
const {
  buildSystemMonitorSnapshot,
  physicalBoundsFromDip,
  sortMonitorsByLayout,
  normalizeLabel,
  createProfileMonitorMap,
  buildMonitorMappingDiagnostics,
} = require('./services/system-monitor-layout');
const { createIconPathAndAppHelpers } = require('./services/icon-path-and-app-helpers');
const { createWindowPlacementRuntime } = require('./services/window-placement-runtime');
const {
  createHandleTrustedIpc,
  registerTrustedRendererIpc,
  scheduleInstalledAppsCatalogWarmup,
} = require('./ipc/trusted-renderer-ipc');

const shouldBootstrapElectronMain = (
  Boolean(app)
  && typeof app.requestSingleInstanceLock === 'function'
);

if (shouldBootstrapElectronMain) {
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
    'UseSkiaRenderer,Vulkan,CanvasOopRasterization,VizDisplayCompositor,Accelerated2dCanvas,FluentScrollbar',
  );
}

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
const launchStatusStore = createLaunchStatusStore();

/** Prefer repo-relative paths; add fallbacks when cwd / packaged resources differ. */
const resolveWindowsShellIconScriptPath = () => {
  if (process.platform !== 'win32') return null;
  const name = 'windows-shell-item-icon.ps1';
  const candidates = [
    path.join(__dirname, '../../scripts', name),
    path.join(__dirname, '../scripts', name),
    path.join(process.cwd(), 'scripts', name),
  ];
  if (typeof process.resourcesPath === 'string') {
    candidates.push(
      path.join(process.resourcesPath, 'scripts', name),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', name),
    );
  }
  try {
    if (app?.getAppPath) {
      candidates.push(path.join(app.getAppPath(), 'scripts', name));
    }
  } catch {
    // ignore
  }
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
};

const {
  safeLimitedString,
  isSafeExternalHttpUrl,
  normalizeSafeUrl,
  unpackProfilesReadResult,
  extractExecutablePath,
  resolveBareSystemExecutableFromShimTarget,
  resolveUpdateStyleProcessStartChildExe,
  isDisallowedLaunchExecutablePath,
  resolveShortcutPathForLaunch,
  getPlacementProcessKey,
  extractIconSourcePath,
  getWindowIconPath,
  getSafeIconDataUrl,
  parseInternetShortcut,
  isAppProtocolUrl,
  getCanonicalAppKey,
  isLikelyBackgroundBinary,
  isLikelyUserApp,
} = createIconPathAndAppHelpers({
  iconDataUrlCache,
  maxUrlLength: MAX_URL_LENGTH,
  maxShortcutPathLength: MAX_SHORTCUT_PATH_LENGTH,
  publicDir: path.join(__dirname, '../../public'),
  windowsShellIconScriptPath: resolveWindowsShellIconScriptPath(),
});

const { createProfileLaunchGatherers } = require('./services/profile-launch-gather');
const { gatherProfileAppLaunches, gatherLegacyActionLaunches } = createProfileLaunchGatherers({
  buildSystemMonitorSnapshot,
  sortMonitorsByLayout,
  normalizeLabel,
  extractExecutablePath,
  resolveShortcutPathForLaunch,
  isSafeAppLaunchUrl,
  safeLimitedString,
  maxUrlLength: MAX_URL_LENGTH,
  isDisallowedLaunchExecutablePath,
});

const {
  sleep,
  buildWindowBoundsForApp,
  moveWindowToBounds,
  moveSpecificWindowHandleToBounds,
  maximizeWindowHandle,
  bringWindowHandleToFront,
  minimizeWindowHandle,
  ensureMinimizedAfterLaunch,
  stabilizePlacementForSlowLaunch,
  stabilizeKnownHandlePlacement,
  getWindowPlacementRectsByHandle,
  centerWindowHandleOnMonitor,
  getForegroundWindowHandle,
  verifyAndCorrectWindowPlacement,
  getVisibleWindowInfos,
  placeChromiumByRankedWindows,
  waitForWindowResponsive,
} = createWindowPlacementRuntime({
  isChromiumFamilyProcessKey,
  isChromiumTopLevelWindowRow,
  physicalBoundsFromDip,
  getMonitorPlacementRect,
  isWindowOnTargetMonitor,
  scoreWindowCandidate,
  summarizeWindowRows,
  describeBoundsDelta,
  describeMonitor,
});

const getLatestLaunchDiagnosticsLogPath = () => (
  path.join(app.getPath('userData'), 'logs', 'launch-latest.jsonl')
);

const initializeLatestLaunchDiagnosticsLog = ({ profileId, runId }) => {
  const outputPath = getLatestLaunchDiagnosticsLogPath();
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const header = {
      event: 'run-log-reset',
      timestamp: Date.now(),
      profileId: String(profileId || '').trim() || null,
      runId: String(runId || '').trim() || null,
      note: 'This file is overwritten at the start of every profile launch run.',
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(header)}\n`, 'utf8');
    process.env.FLOWSWITCH_LAUNCH_LOG_FILE = outputPath;
    return outputPath;
  } catch (error) {
    console.error('[launch-profile] failed to initialize latest diagnostics log file:', {
      message: String(error?.message || error),
      outputPath,
    });
    return null;
  }
};

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

  const isClipboardPermission = (permission) => {
    const p = String(permission || '');
    return (
      p === 'clipboard-read'
      || p === 'clipboard-write'
      || p === 'clipboard-sanitized-read'
      || p === 'clipboard-sanitized-write'
    );
  };

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (isClipboardPermission(permission)) {
      callback(true);
      return;
    }
    console.warn('[session] blocked permission request:', permission);
    callback(false);
  });

  defaultSession.setPermissionCheckHandler((_webContents, permission) => (
    isClipboardPermission(permission)
  ));

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


if (shouldBootstrapElectronMain) {
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
}

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

const publishLaunchProfileStatus = (profileId, runId, status) => (
  launchStatusStore.publishStatus(profileId, runId, status)
);

const { createProfileLaunchRunner } = require('./services/profile-launch-runner');
const { launchProfileById } = createProfileLaunchRunner({
  sleep,
  getVisibleWindowInfos,
  scoreWindowCandidate,
  moveSpecificWindowHandleToBounds,
  getWindowPlacementRectsByHandle,
  isWindowOnTargetMonitor,
  waitForMainWindowReadyOrBlocker,
  verifyAndCorrectWindowPlacement,
  stabilizePlacementForSlowLaunch,
  readProfilesFromDisk,
  unpackProfilesReadResult,
  launchStatusStore,
  initializeLatestLaunchDiagnosticsLog,
  buildSystemMonitorSnapshot,
  createProfileMonitorMap,
  gatherProfileAppLaunches,
  gatherLegacyActionLaunches,
  createLaunchDiagnostics,
  publishLaunchProfileStatus,
  getPlacementProcessKey,
  isChromiumFamilyProcessKey,
  describeMonitor,
  buildWindowBoundsForApp,
  buildCompanionProcessHints,
  planLaunchSlots,
  summarizeWindowRows,
  shouldTriggerAmbiguityFallback,
  isLikelyAuxiliaryWindowClass,
  isChromiumNonPrimaryWindowRow,
  isChromiumTopLevelWindowRow,
  isWithinAcceptableStateTolerance,
  centerWindowHandleOnMonitor,
  maximizeWindowHandle,
  buildMonitorMappingDiagnostics,
  normalizeSafeUrl,
  launchExecutable,
  getForegroundWindowHandle,
  waitForWindowResponsive,
  placeChromiumByRankedWindows,
  moveWindowToBounds,
  bringWindowHandleToFront,
  stabilizeKnownHandlePlacement,
  minimizeWindowHandle,
  ensureMinimizedAfterLaunch,
});


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

if (shouldBootstrapElectronMain) {
  registerTrustedRendererIpc(createHandleTrustedIpc(ipcMain, isTrustedIpcSender), {
    buildSystemMonitorSnapshot,
    unpackProfilesReadResult,
    readProfilesFromDisk,
    sanitizeProfileStorePayload,
    writeProfilesToDisk,
    safeLimitedString,
    MAX_PROFILE_ID_LENGTH,
    launchProfileById,
    launchStatusStore,
    isLikelyUserApp,
    getCanonicalAppKey,
    extractExecutablePath,
    resolveBareSystemExecutableFromShimTarget,
    resolveUpdateStyleProcessStartChildExe,
    isLikelyBackgroundBinary,
    getRegistryInstalledApps,
    scanForExeFiles,
    extractIconSourcePath,
    parseInternetShortcut,
    isAppProtocolUrl,
    isSafeAppLaunchUrl,
    MAX_URL_LENGTH,
    getSafeIconDataUrl,
    getRunningWindowProcesses,
    hiddenProcessNamePatterns,
    hiddenWindowTitlePatterns,
  });

  if (process.platform === 'win32') {
    scheduleInstalledAppsCatalogWarmup();
  }

  // Dedicated handler so reveal-in-folder always registers with main ipcMain (avoids ordering issues).
  ipcMain.handle('show-item-in-folder', async (event, rawPath) => {
    if (!isTrustedIpcSender(event)) {
      const senderUrl = String(event?.senderFrame?.url || '');
      console.warn(`[ipc:show-item-in-folder] Blocked untrusted sender: ${senderUrl || '<empty>'}`);
      throw new Error('Untrusted renderer origin');
    }
    try {
      const trimmed = typeof rawPath === 'string' ? rawPath.trim() : '';
      const safePath = safeLimitedString(trimmed, MAX_SHORTCUT_PATH_LENGTH);
      if (!safePath) return { ok: false, error: 'Invalid path' };

      const resolved = path.resolve(safePath);
      if (!fs.existsSync(resolved)) {
        return { ok: false, error: 'Path does not exist' };
      }
      let st;
      try {
        st = fs.statSync(resolved);
      } catch {
        return { ok: false, error: 'Path is not accessible' };
      }
      if (!st.isFile()) {
        return { ok: false, error: 'Path is not a file' };
      }

      shell.showItemInFolder(resolved);
      return { ok: true };
    } catch (err) {
      console.error('[show-item-in-folder]', err);
      return { ok: false, error: 'Failed to reveal in Explorer' };
    }
  });

  // Quit the app when all windows are closed (except on macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = {
  planLaunchSlots,
  scoreReuseCandidate,
  shouldTriggerAmbiguityFallback,
};
