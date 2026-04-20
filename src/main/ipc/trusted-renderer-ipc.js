'use strict';

const path = require('path');
const fs = require('fs');
const ws = require('windows-shortcuts');
const {
  getAppxUserPackageLookup,
  invalidateAppxUserPackageLookupCache,
} = require('../services/windows-appx-user-package-index');
const { BrowserWindow, dialog, shell } = require('electron');
const { MAX_SHORTCUT_PATH_LENGTH } = require('../utils/limits');

/** Filled when `registerTrustedRendererIpc` runs; kicks off a background catalog scan on Windows. */
let scheduleInstalledAppsCatalogWarmup = () => {};

const createHandleTrustedIpc = (ipcMain, isTrustedIpcSender) => (
  (channel, handler) => {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrustedIpcSender(event)) {
        const senderUrl = String(event?.senderFrame?.url || '');
        console.warn(`[ipc:${channel}] Blocked untrusted sender: ${senderUrl || '<empty>'}`);
        throw new Error('Untrusted renderer origin');
      }
      return handler(event, ...args);
    });
  }
);

const registerTrustedRendererIpc = (handleTrustedIpc, deps) => {
  const {
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
    probeInstallFolderForWindowsExe,
    inferMsixUserWindowsAppsShimFromPackageDir,
    parseInternetShortcut,
    isAppProtocolUrl,
    isSafeAppLaunchUrl,
    MAX_URL_LENGTH,
    getSafeIconDataUrl,
    getRunningWindowProcesses,
    hiddenProcessNamePatterns,
    hiddenWindowTitlePatterns,
  } = deps;

  let installedAppsCatalogCache = null;
  let installedAppsCatalogInflight = null;
  const INSTALLED_APPS_CATALOG_TTL_MS = 10 * 60 * 1000;

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
    const disk = readProfilesFromDisk();
    if (disk.storeError) {
      console.error('[profiles:list] Failed to read profiles from store:', disk.storeError);
    }
    return {
      profiles: disk.profiles,
      contentLibrary: disk.contentLibrary,
      contentLibraryExclusions: disk.contentLibraryExclusions,
      storeError: disk.storeError,
    };
  } catch (error) {
    console.error('[profiles:list] Failed to list profiles:', error);
    return {
      profiles: [],
      contentLibrary: { items: [], folders: [] },
      contentLibraryExclusions: {},
      storeError: null,
    };
  }
});

  handleTrustedIpc('profiles:save-all', async (_event, payload) => {
  try {
    const safe = sanitizeProfileStorePayload(payload);
    const savedProfiles = writeProfilesToDisk(safe);
    return { ok: true, count: savedProfiles.length };
  } catch (error) {
    console.error('[profiles:save-all] Failed to save profiles:', error);
    return { ok: false, error: 'Failed to save profiles' };
  }
});

  handleTrustedIpc('content-library:pick-paths', async (event, opts = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options = opts && typeof opts === 'object' ? opts : {};
    const mode = typeof options.mode === 'string' ? options.mode : 'files';

    const buildEntries = (paths) => {
      if (!paths?.length) return [];
      return paths.map((p) => {
        let kind = 'file';
        try {
          const st = fs.statSync(p);
          if (st.isDirectory()) kind = 'directory';
        } catch {
          kind = 'file';
        }
        return { path: p, kind };
      });
    };

    const pack = (result) => {
      if (result.canceled || !result.filePaths?.length) {
        return { canceled: true, entries: [] };
      }
      return { canceled: false, entries: buildEntries(result.filePaths) };
    };

    if (mode === 'directory') {
      const r = await dialog.showOpenDialog(win || undefined, {
        properties: ['openDirectory'],
      });
      return pack(r);
    }

    // mode === 'files' (default) or unknown → file picker only
    const r = await dialog.showOpenDialog(win || undefined, {
      properties: ['openFile', 'multiSelections'],
    });
    return pack(r);
  });

  const MAX_BROWSE_FOLDER_ENTRIES = 500;

  handleTrustedIpc('open-path-in-explorer', async (_event, rawPath) => {
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
      if (st.isDirectory()) {
        const errMsg = await shell.openPath(resolved);
        if (errMsg) return { ok: false, error: errMsg };
        return { ok: true };
      }
      if (st.isFile()) {
        shell.showItemInFolder(resolved);
        return { ok: true };
      }
      return { ok: false, error: 'Unsupported path type' };
    } catch (err) {
      console.error('[open-path-in-explorer]', err);
      return { ok: false, error: 'Failed to open in File Explorer' };
    }
  });

  handleTrustedIpc('browse-folder-list', async (_event, rawPath) => {
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
      if (!st.isDirectory()) {
        return { ok: false, error: 'Path is not a folder' };
      }

      let dirents;
      try {
        dirents = fs.readdirSync(resolved, { withFileTypes: true });
      } catch (readErr) {
        console.error('[browse-folder-list] readdir', readErr);
        return { ok: false, error: 'Could not read folder contents' };
      }

      const mapped = dirents.map((d) => ({
        name: d.name,
        isDirectory: d.isDirectory(),
      }));
      mapped.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      const truncated = mapped.length > MAX_BROWSE_FOLDER_ENTRIES;
      const entries = truncated ? mapped.slice(0, MAX_BROWSE_FOLDER_ENTRIES) : mapped;
      return { ok: true, entries, truncated };
    } catch (err) {
      console.error('[browse-folder-list]', err);
      return { ok: false, error: 'Failed to list folder' };
    }
  });

  handleTrustedIpc('launch-profile', async (_event, profileId, request = {}) => {
  try {
    const safeProfileId = safeLimitedString(profileId, MAX_PROFILE_ID_LENGTH);
    if (!safeProfileId) return { ok: false, error: 'Invalid profile id' };
    const fireAndForget = Boolean(request?.fireAndForget);
    let startedPayload = null;
    const job = launchProfileById(safeProfileId, {
      onStarted: fireAndForget
        ? (payload) => {
          startedPayload = payload;
        }
        : undefined,
    });
    if (!fireAndForget) {
      return await job;
    }
    void job.catch((err) => {
      console.error('[launch-profile] background launch failed:', err);
      if (!startedPayload?.runId) return;
      try {
        launchStatusStore.publishStatus(startedPayload.profileId, startedPayload.runId, {
          state: 'failed',
          launchedAppCount: 0,
          launchedTabCount: 0,
          failedAppCount: 1,
          skippedAppCount: 0,
          requestedAppCount: 0,
          pendingConfirmations: [],
        });
      } catch {
        // ignore publish failures on inactive or malformed runs
      }
      launchStatusStore.sealRun(startedPayload.profileId, startedPayload.runId, 'failed');
    });
    if (!startedPayload) {
      return await job;
    }
    return {
      ok: true,
      started: true,
      runId: startedPayload.runId,
      replacedRunId: startedPayload.replacedRunId,
      profile: startedPayload.profile,
    };
  } catch (err) {
    console.error('Failed to load or launch profile:', err);
    return { ok: false, error: 'Failed to load profile' };
  }
});

  handleTrustedIpc('cancel-profile-launch', async (_event, payload) => {
  const profileId = safeLimitedString(payload?.profileId, MAX_PROFILE_ID_LENGTH);
  const runId = String(payload?.runId || '').trim();
  if (!profileId || !runId) return { ok: false, error: 'Invalid arguments' };
  const result = launchStatusStore.cancelRun(profileId, runId);
  if (!result.ok) return { ok: false, reason: result.reason || 'cancel-failed' };
  return { ok: true };
});

  handleTrustedIpc('launch-profile-status', async (_event, profileId) => {
  const safeProfileId = String(profileId || '').trim();
  if (!safeProfileId) return { ok: false, error: 'Invalid profile id' };
  const status = launchStatusStore.getStatus(safeProfileId);
  if (!status) return { ok: true, status: null };
  return {
    ok: true,
    status,
  };
});

  const collectInstalledAppsCatalog = async () => {
    let appxUserLookup = null;
    if (process.platform === 'win32') {
      try {
        appxUserLookup = await getAppxUserPackageLookup();
      } catch {
        appxUserLookup = null;
      }
    }

    const appMap = new Map();
    const seenStartMenuKeys = new Set();
    const sourcePriority = {
      'start-menu-shortcut': 3,
      'start-menu-url': 3,
      registry: 2,
      'windows-apps-shim': 1,
      'exe-scan': 1,
    };
    const exePathToCatalogKey = new Map();
    const appxManifestDisplayNameByManifestPath = new Map();

    const parsePlainDisplayNameFromAppxManifestXml = (xml) => {
      const strip = (s) => String(s || '').trim();
      const isResourceRef = (s) => /^ms-resource:/i.test(strip(s));
      const propBlock = /<(?:[\w]+:)?Properties>([\s\S]*?)<\/(?:[\w]+:)?Properties>/i.exec(String(xml || ''));
      if (propBlock) {
        const inner = propBlock[1];
        const dm = /<(?:[\w]+:)?DisplayName>([^<]*)<\/(?:[\w]+:)?DisplayName>/gi;
        let m;
        while ((m = dm.exec(inner)) !== null) {
          const n = strip(m[1]);
          if (n && !isResourceRef(n)) return n;
        }
      }
      const ve = /<(?:[\w]+:)?VisualElements[^>]*\sDisplayName=\s*"([^"]*)"/i.exec(String(xml || ''));
      if (ve) {
        const n = strip(ve[1]);
        if (n && !isResourceRef(n)) return n;
      }
      return null;
    };

    const resolveLocalPackagesRootForStoreTargetExe = (exePath) => {
      const norm = String(exePath || '').replace(/\//g, '\\');
      const local = process.env.LOCALAPPDATA;
      if (!local) return null;
      const pkRoot = path.join(local, 'Packages');
      let waFolder = null;
      const nested = norm.match(/\\WindowsApps\\([^\\]+)\\[^\\/]+\.exe$/i);
      if (nested) {
        [, waFolder] = nested;
      } else {
        const flat = norm.match(/\\Microsoft\\WindowsApps\\([^\\/]+\.exe)$/i);
        if (flat) waFolder = path.basename(flat[1], '.exe');
      }
      if (!waFolder) return null;
      const direct = path.join(pkRoot, waFolder);
      try {
        if (fs.existsSync(path.join(direct, 'AppxManifest.xml'))) return direct;
      } catch {
        /* ignore */
      }
      const fam = waFolder.split('_')[0];
      if (!fam) return null;
      try {
        const hit = fs.readdirSync(pkRoot).find((n) => n.toLowerCase().startsWith(`${fam.toLowerCase()}_`));
        if (!hit) return null;
        const d = path.join(pkRoot, hit);
        return fs.existsSync(path.join(d, 'AppxManifest.xml')) ? d : null;
      } catch {
        return null;
      }
    };

    const readStorePackageDisplayNameFromExePathSync = (exePath) => {
      const raw = String(exePath || '').replace(/\//g, '\\');
      if (!raw || process.platform !== 'win32') return null;

      const walkUpForManifestDisplayName = (startExe) => {
        let dir = path.dirname(startExe);
        for (let depth = 0; depth < 20; depth += 1) {
          const manifestPath = path.join(dir, 'AppxManifest.xml');
          if (fs.existsSync(manifestPath)) {
            const cached = appxManifestDisplayNameByManifestPath.get(manifestPath);
            if (cached !== undefined) return cached;
            let parsed = null;
            try {
              const xml = fs.readFileSync(manifestPath, 'utf8');
              parsed = parsePlainDisplayNameFromAppxManifestXml(xml);
            } catch {
              parsed = null;
            }
            if (parsed != null) {
              appxManifestDisplayNameByManifestPath.set(manifestPath, parsed);
              return parsed;
            }
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }
        return null;
      };

      let resolved = raw;
      try {
        resolved = fs.realpathSync.native
          ? fs.realpathSync.native(raw)
          : fs.realpathSync(raw);
      } catch {
        resolved = raw;
      }
      const fromWinRt = appxUserLookup?.getDisplayNameForExe?.(raw)
        || appxUserLookup?.getDisplayNameForExe?.(resolved);
      if (fromWinRt) return fromWinRt;
      const fromResolved = walkUpForManifestDisplayName(resolved);
      if (fromResolved) return fromResolved;
      if (resolved !== raw) {
        const fromRaw = walkUpForManifestDisplayName(raw);
        if (fromRaw) return fromRaw;
      }
      const pkgRoot = resolveLocalPackagesRootForStoreTargetExe(raw)
        || resolveLocalPackagesRootForStoreTargetExe(resolved);
      if (pkgRoot) {
        const manifestPath = path.join(pkgRoot, 'AppxManifest.xml');
        const cached = appxManifestDisplayNameByManifestPath.get(manifestPath);
        if (cached !== undefined) return cached;
        let parsed = null;
        try {
          const xml = fs.readFileSync(manifestPath, 'utf8');
          parsed = parsePlainDisplayNameFromAppxManifestXml(xml);
        } catch {
          parsed = null;
        }
        if (parsed != null) {
          appxManifestDisplayNameByManifestPath.set(manifestPath, parsed);
          return parsed;
        }
      }
      return null;
    };

    const extractAppsFolderAppUserModelId = (...rawValues) => {
      for (const raw of rawValues) {
        const s = String(raw || '');
        if (!s) continue;
        const m = s.match(/shell:AppsFolder\\([A-Za-z0-9._-]+![A-Za-z0-9._-]+)/i);
        if (!m) continue;
        const aumid = String(m[1] || '').trim();
        if (aumid) return aumid;
      }
      return null;
    };

    const toAppsFolderShellMoniker = (appUserModelId) => {
      const id = String(appUserModelId || '').trim();
      if (!id) return null;
      if (!/^[A-Za-z0-9._-]+![A-Za-z0-9._-]+$/i.test(id)) return null;
      return `shell:AppsFolder\\${id}`;
    };

    const resolveStartMenuShortcutCatalogDisplayName = (fileStem, targetExe) => {
      const fromPkg = readStorePackageDisplayNameFromExePathSync(targetExe);
      if (fromPkg) return fromPkg;
      return String(fileStem || '').trim();
    };

    const displayNameQuality = (s) => {
      const t = String(s || '').trim();
      if (!t) return 0;
      let q = Math.min(t.length, 100);
      if (/[A-Z]/.test(t) && t !== t.toUpperCase()) q += 30;
      else if (/[A-Z]/.test(t)) q += 8;
      if (t === t.toLowerCase()) q -= 18;
      if (/\\|\//.test(t)) q -= 50;
      if (/\.[a-z]{2,}_[0-9]/i.test(t) && t.includes('_')) q -= 25;
      return q;
    };

    const betterCatalogDisplayName = (a, b) => {
      const qa = displayNameQuality(a);
      const qb = displayNameQuality(b);
      if (qa !== qb) return qa > qb ? a : b;
      return String(a).length >= String(b).length ? a : b;
    };

    const normalizeExePathDedupeKey = (rawPath) => {
      if (!rawPath || typeof rawPath !== 'string') return null;
      let t = rawPath.replace(/\//g, '\\').trim();
      if (/^"(.+)"$/.test(t)) t = t.slice(1, -1);
      if (!t.toLowerCase().endsWith('.exe')) return null;
      try {
        return path.normalize(t).toLowerCase();
      } catch {
        return null;
      }
    };

    const upsertDiscoveredApp = (appName, iconPath, sourcePath = '', context = {}) => {
      if (!isLikelyUserApp(appName, sourcePath, context)) return;
      const normalizedName = String(appName || '').trim();
      const targetExeRaw = context.targetExe || extractExecutablePath(sourcePath);
      const exeDedupeKey = normalizeExePathDedupeKey(targetExeRaw);
      let key = getCanonicalAppKey(normalizedName) || normalizedName.toLowerCase();
      if (exeDedupeKey && exePathToCatalogKey.has(exeDedupeKey)) {
        key = exePathToCatalogKey.get(exeDedupeKey);
      }
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
        if (exeDedupeKey) {
          exePathToCatalogKey.set(exeDedupeKey, key);
        }
        return;
      }

      const currentPriority = existing.priority || 0;
      let preferredName = currentPriority >= nextPriority ? existing.name : normalizedName;
      if (getCanonicalAppKey(existing.name) === getCanonicalAppKey(normalizedName)) {
        preferredName = betterCatalogDisplayName(existing.name, normalizedName);
      }
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
      if (exeDedupeKey) {
        exePathToCatalogKey.set(exeDedupeKey, key);
      }
    };

    const isRegistryCandidateAllowedWithoutStartMenu = (appMeta, iconSourcePath) => {
      const canonicalKey = getCanonicalAppKey(appMeta.name);
      if (seenStartMenuKeys.has(canonicalKey)) return true;

      // Include registry-only apps only when they look like user-launchable GUI apps.
      const source = String(iconSourcePath || '').toLowerCase();
      if (!source) return false;
      if (
        isLikelyBackgroundBinary(source)
        && !/\\spotify\\/i.test(source)
        && !/\\discord\\/i.test(source)
        && !/\\slack\\/i.test(source)
        && !/\\teams\\/i.test(source)
      ) {
        return false;
      }
      if (
        source.includes('\\nvidia corporation\\')
        || source.includes('\\windows\\system32\\')
        || source.includes('\\windows\\syswow64\\')
        || source.includes('\\windows\\immersivecontrolpanel\\')
        || source.includes('\\programdata\\package cache\\')
      ) {
        return false;
      }

      // Broad, vendor-neutral prefixes (typical Win32 / Store / per-user installs).
      const registryGlobalInstallPrefixes = [
        '\\program files\\',
        '\\program files (x86)\\',
        '\\appdata\\local\\programs\\',
        '\\windowsapps\\',
        '\\windows\\systemapps\\',
        '\\appdata\\local\\packages\\',
        '\\appdata\\local\\microsoft\\windowsapps\\',
      ];
      if (registryGlobalInstallPrefixes.some((m) => source.includes(m))) {
        return true;
      }

      // Per-user installs under %LocalAppData%\<App>\…\<something>.exe|ico — not a fixed vendor list.
      const localAppDataNoise = [
        '\\appdata\\local\\temp\\',
        '\\appdata\\local\\microsoft\\windows\\',
        '\\appdata\\local\\assembly\\',
        '\\appdata\\local\\d3dshadercache\\',
        '\\appdata\\local\\pip\\',
        '\\appdata\\local\\npm-cache\\',
        '\\appdata\\local\\elevateddiagnostics\\',
        '\\appdata\\local\\package cache\\',
        '\\appdata\\local\\crashdumps\\',
        '\\appdata\\local\\comms\\',
        '\\appdata\\local\\connecteddevicesplatform\\',
        '\\appdata\\local\\placeholdermailbox\\',
        '\\appdata\\local\\mutablecache\\',
      ];
      if (
        source.includes('\\appdata\\local\\')
        && !localAppDataNoise.some((n) => source.includes(n))
        && /\.(exe|ico|dll)([,\s]|$)/i.test(source)
      ) {
        return true;
      }

      // Some installers put the real binary under %AppData%\Roaming\<Vendor>\…\.exe
      if (
        source.includes('\\appdata\\roaming\\')
        && /\.(exe|ico)([,\s]|$)/i.test(source)
        && !/\\appdata\\roaming\\microsoft\\windows\\/i.test(source)
      ) {
        return true;
      }

      return false;
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
    // Full matrix (paths, hives, registry values, scope): see
    // docs/superpowers/specs/windows-installed-app-discovery-matrix.md
    const startMenuDirs = [
      path.join(process.env.ProgramData || 'C:/ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
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
                const fileStem = entry.name.replace(/\.lnk$/i, '');
                shortcutTasks.push(() => new Promise((resolve) => {
                  let settled = false;
                  const safety = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    console.warn(`[StartMenu] Shortcut query timed out: ${fullPath}`);
                    resolve();
                  }, 12000);
                  ws.query(fullPath, async (err, info) => {
                    try {
                      if (settled) return;
                      settled = true;
                      clearTimeout(safety);
                      const rawTarget = !err && info
                        ? (info.expanded?.target || info.target || info.targetPath || info.path)
                        : '';
                      const rawArgs = !err && info
                        ? (info.expanded?.args || info.args || '')
                        : '';
                      let normalizedTargetExe = rawTarget
                        ? extractExecutablePath(rawTarget)
                        : null;
                      if (!normalizedTargetExe && rawTarget) {
                        normalizedTargetExe = resolveBareSystemExecutableFromShimTarget(rawTarget);
                      }
                      const processStartChildExe = resolveUpdateStyleProcessStartChildExe(
                        normalizedTargetExe,
                        rawArgs,
                      );
                      const resolvedExecutableForShortcut = (
                        processStartChildExe || normalizedTargetExe
                      );
                      const rawIcon = !err && info
                        ? (info.expanded?.icon || info.icon || '')
                        : '';
                      const normalizedIconFromShortcut = rawIcon
                        ? extractIconSourcePath(rawIcon)
                        : null;
                      const iconSourceForRecord = (
                        normalizedIconFromShortcut
                        || resolvedExecutableForShortcut
                        || toAppsFolderShellMoniker(
                          extractAppsFolderAppUserModelId(rawTarget, rawArgs),
                        )
                        || fullPath
                      );
                      const appUserModelId = extractAppsFolderAppUserModelId(rawTarget, rawArgs);
                      const appUserModelMoniker = toAppsFolderShellMoniker(appUserModelId);

                      // Prefer icon sources that resolve to the *application* icon. SHGetFileInfo on
                      // a .lnk includes the shell shortcut overlay; target .exe / IconFile do not.
                      let iconPath = null;
                      if (normalizedIconFromShortcut) {
                        iconPath = await getSafeIconDataUrl(normalizedIconFromShortcut);
                        if (!iconPath) {
                          iconFailureSummary.shortcut += 1;
                        }
                      }

                      const exeIconCandidates = [
                        processStartChildExe,
                        normalizedTargetExe,
                      ].filter(Boolean);
                      const uniqueExeIconCandidates = [...new Set(exeIconCandidates)];
                      for (const candidate of uniqueExeIconCandidates) {
                        if (iconPath) break;
                        iconPath = await getSafeIconDataUrl(candidate);
                        if (!iconPath) {
                          iconFailureSummary.shortcut += 1;
                        }
                      }

                      if (!iconPath && appUserModelMoniker) {
                        iconPath = await getSafeIconDataUrl(appUserModelMoniker);
                        if (!iconPath) {
                          iconFailureSummary.shortcut += 1;
                        }
                      }

                      if (!iconPath) {
                        const fromLnk = await getSafeIconDataUrl(fullPath);
                        if (fromLnk) {
                          iconPath = fromLnk;
                        } else {
                          iconFailureSummary.shortcut += 1;
                        }
                      }

                      const displayName = resolveStartMenuShortcutCatalogDisplayName(
                        fileStem,
                        resolvedExecutableForShortcut,
                      );

                      upsertDiscoveredApp(
                        displayName,
                        iconPath,
                        iconSourceForRecord,
                        {
                          source: 'start-menu-shortcut',
                          shortcutPath: fullPath,
                          targetExe: resolvedExecutableForShortcut,
                          rawShortcutArgs: rawArgs,
                          rawShortcutTarget: String(rawTarget || ''),
                          iconSource: (
                            normalizedIconFromShortcut
                            || resolvedExecutableForShortcut
                            || appUserModelMoniker
                            || null
                          ),
                          hasShortcutIcon: !!iconPath,
                          appUserModelId: appUserModelId || null,
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
              shortcutTasks.push(async () => {
                let iconPath = null;
                if (iconSource) {
                  iconPath = await getSafeIconDataUrl(iconSource);
                }
                if (!iconPath) {
                  iconPath = await getSafeIconDataUrl(fullPath);
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
    // 2. Registry metadata first; icon extraction runs after Start Menu so `seenStartMenuKeys`
    // reflects shortcuts already merged (registry gating stays correct).
    const registryApps = await getRegistryInstalledApps();
    const startMenuScanConcurrency = 14;
    await runWithConcurrencyLimit(shortcutTasks, startMenuScanConcurrency);

    const registryIconConcurrency = 14;
    const registryTasks = [];
    const shouldPreferMsixShimOverFolderProbe = (locRaw) => {
      const s = String(locRaw || '').toLowerCase().replace(/\//g, '\\');
      return s.includes('\\program files\\windowsapps\\')
        || s.includes('%programfiles%\\windowsapps\\')
        || s.includes('%programfiles(x86)%\\windowsapps\\')
        || s.includes('\\appdata\\local\\packages\\')
        || s.includes('%localappdata%\\packages\\');
    };
    for (const app of registryApps) {
      if (!app.name) {
        continue;
      }
      const haystackParts = [
        app.iconSource,
        app.installLocation,
        app.uninstallString,
        app.quietUninstallString,
      ].filter(Boolean);
      const msixShimExe = inferMsixUserWindowsAppsShimFromPackageDir(app.installLocation);
      const probedExe = app.installLocation
        ? probeInstallFolderForWindowsExe(app.installLocation)
        : null;
      // `C:\Program Files\WindowsApps\...` is ACL-gated: folder probe fails and UninstallString is
      // often `msiexec.exe /...` (blocked as NON_USER exe). Resolve the user-visible shim instead.
      const installProbeExe = (shouldPreferMsixShimOverFolderProbe(app.installLocation) && msixShimExe)
        ? msixShimExe
        : (probedExe || msixShimExe);
      if (installProbeExe) {
        haystackParts.push(installProbeExe);
      }
      const registryHaystack = haystackParts.join('\n');
      if (!registryHaystack.trim()) {
        continue;
      }

      registryTasks.push(async () => {
        const iconSourceForRegistry = (
          extractIconSourcePath(app.iconSource || '')
          || extractIconSourcePath(app.installLocation || '')
          || String(app.iconSource || app.installLocation || '').trim()
        );
        const registryEarlyTargetExe = (
          installProbeExe
          || extractExecutablePath(app.uninstallString || '')
          || extractExecutablePath(app.quietUninstallString || '')
          || null
        );
        if (!isLikelyUserApp(app.name, iconSourceForRegistry, {
          source: 'registry',
          registryMeta: app,
          targetExe: registryEarlyTargetExe,
        })) {
          return;
        }
        if (!isRegistryCandidateAllowedWithoutStartMenu(app, registryHaystack)) {
          return;
        }
        let normalizedIconSource = (
          extractIconSourcePath(app.iconSource || '')
          || extractIconSourcePath(app.installLocation || '')
          || extractExecutablePath(app.uninstallString || '')
          || extractExecutablePath(app.quietUninstallString || '')
          || installProbeExe
        );
        const registryTargetExe = (
          installProbeExe
          || extractExecutablePath(app.uninstallString || '')
          || extractExecutablePath(app.quietUninstallString || '')
          || extractExecutablePath(normalizedIconSource || '')
          || extractExecutablePath(app.iconSource || '')
          || (normalizedIconSource && normalizedIconSource.toLowerCase().endsWith('.exe')
            ? normalizedIconSource
            : null)
        );
        const upsertSourcePath = normalizedIconSource || iconSourceForRegistry || registryHaystack;
        if (!normalizedIconSource) {
          let iconPath = null;
          const registryAumid = appxUserLookup?.getPreferredAppUserModelIdForExe?.(
            registryTargetExe || installProbeExe || normalizedIconSource || '',
          );
          const registryAumidMoniker = toAppsFolderShellMoniker(registryAumid);
          if (registryAumidMoniker) {
            iconPath = await getSafeIconDataUrl(registryAumidMoniker);
            if (!iconPath) {
              iconFailureSummary.registry += 1;
            }
          }
          upsertDiscoveredApp(app.name, iconPath, upsertSourcePath, {
            source: 'registry',
            registryMeta: app,
            targetExe: registryTargetExe || null,
            appUserModelId: registryAumid || null,
          });
          return;
        }
        let iconPath = await getSafeIconDataUrl(normalizedIconSource);
        if (!iconPath) {
          iconFailureSummary.registry += 1;
          const registryAumid = appxUserLookup?.getPreferredAppUserModelIdForExe?.(
            registryTargetExe || normalizedIconSource,
          );
          const registryAumidMoniker = toAppsFolderShellMoniker(registryAumid);
          if (registryAumidMoniker) {
            iconPath = await getSafeIconDataUrl(registryAumidMoniker);
          }
        }
        upsertDiscoveredApp(app.name, iconPath, upsertSourcePath, {
          source: 'registry',
          registryMeta: app,
          targetExe: registryTargetExe || null,
        });
      });
    }
    await runWithConcurrencyLimit(registryTasks, registryIconConcurrency);

    // 2b. MSIX / Store launcher stubs (per-user). Must scan **all** `*.exe` here: a lexicographic cap
    // silently dropped Spotify (`SpotifyAB…` sorts after hundreds of `Microsoft.*` shims).
    // App Execution Aliases are often **symlinks / reparse points** — `dirent.isFile()` is false; use
    // `isSymbolicLink()` or `lstat` so `SpotifyAB.SpotifyMusic_*.exe` is not skipped.
    const isWindowsAppsShimExeDirent = (dir, dirent) => {
      if (!dirent.name.toLowerCase().endsWith('.exe')) return false;
      if (dirent.isFile() || dirent.isSymbolicLink()) return true;
      try {
        const st = fs.lstatSync(path.join(dir, dirent.name));
        return st.isFile() || st.isSymbolicLink();
      } catch {
        return false;
      }
    };

    const friendlyNameForWindowsAppsShimStem = (stem, exeFullPath) => {
      // Prefer Start Menu / Search display name (same index Windows Shell uses) so
      // App Execution Aliases render as e.g. "Snipping Tool" instead of "SnippingTool".
      const fromLookup = appxUserLookup?.getDisplayNameForExe?.(exeFullPath);
      if (fromLookup) return String(fromLookup).trim();
      const fromManifest = readStorePackageDisplayNameFromExePathSync(exeFullPath);
      if (fromManifest) return fromManifest;
      return String(stem || '').trim();
    };

    const windowsAppsShimTasks = [];
    if (process.platform === 'win32') {
      const windowsAppsDir = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps');
      if (fs.existsSync(windowsAppsDir)) {
        try {
          const shimEntries = fs.readdirSync(windowsAppsDir, { withFileTypes: true })
            .filter((d) => isWindowsAppsShimExeDirent(windowsAppsDir, d));
          for (const entry of shimEntries) {
            const fullPath = path.join(windowsAppsDir, entry.name);
            windowsAppsShimTasks.push(async () => {
              const stem = entry.name.replace(/\.exe$/i, '');
              const displayName = friendlyNameForWindowsAppsShimStem(stem, fullPath);
              const ctx = { source: 'windows-apps-shim', targetExe: fullPath };
              if (!isLikelyUserApp(displayName, fullPath, ctx)) return;
              let iconPath = null;
              try {
                iconPath = await getSafeIconDataUrl(fullPath);
                if (!iconPath) {
                  const shimAumid = appxUserLookup?.getPreferredAppUserModelIdForExe?.(fullPath);
                  const shimAumidMoniker = toAppsFolderShellMoniker(shimAumid);
                  if (shimAumidMoniker) {
                    iconPath = await getSafeIconDataUrl(shimAumidMoniker);
                  }
                }
              } catch {
                iconPath = null;
              }
              upsertDiscoveredApp(displayName, iconPath, fullPath, ctx);
            });
          }
        } catch (e) {
          console.warn('[InstalledApps] WindowsApps shim scan failed:', e);
        }
      }
    }
    await runWithConcurrencyLimit(windowsAppsShimTasks, 14);

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
  };

  const ensureInstalledAppsCatalog = async (force) => {
    if (!force && installedAppsCatalogCache
      && Date.now() - installedAppsCatalogCache.at < INSTALLED_APPS_CATALOG_TTL_MS) {
      return installedAppsCatalogCache.apps;
    }
    if (force) {
      installedAppsCatalogCache = null;
      invalidateAppxUserPackageLookupCache();
    }
    if (installedAppsCatalogInflight && force) {
      try {
        await installedAppsCatalogInflight;
      } catch {
        // ignore stale in-flight errors when forcing refresh
      }
    }
    if (!force && installedAppsCatalogInflight) return installedAppsCatalogInflight;

    installedAppsCatalogInflight = (async () => {
      try {
        const apps = await collectInstalledAppsCatalog();
        installedAppsCatalogCache = { at: Date.now(), apps };
        return apps;
      } finally {
        installedAppsCatalogInflight = null;
      }
    })();
    return installedAppsCatalogInflight;
  };

  handleTrustedIpc('get-installed-apps', async (_event, payload) => {
    try {
      const force = Boolean(payload?.force);
      return await ensureInstalledAppsCatalog(force);
    } catch (err) {
      console.error('Error in get-installed-apps handler:', err);
      return [];
    }
  });

  scheduleInstalledAppsCatalogWarmup = () => {
    setImmediate(() => {
      if (process.platform !== 'win32') return;
      void ensureInstalledAppsCatalog(false).catch(() => {});
    });
  };

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

};

module.exports = {
  createHandleTrustedIpc,
  registerTrustedRendererIpc,
  scheduleInstalledAppsCatalogWarmup: () => scheduleInstalledAppsCatalogWarmup(),
};
