'use strict';

const path = require('path');
const fs = require('fs');
const ws = require('windows-shortcuts');

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
    sanitizeProfilesPayload,
    writeProfilesToDisk,
    safeLimitedString,
    MAX_PROFILE_ID_LENGTH,
    launchProfileById,
    launchStatusStore,
    isLikelyUserApp,
    getCanonicalAppKey,
    extractExecutablePath,
    isLikelyBackgroundBinary,
    getRegistryInstalledApps,
    scanForExeFiles,
    extractIconSourcePath,
    parseInternetShortcut,
    isAppProtocolUrl,
    parseSteamGameId,
    resolveSteamGameIconPath,
    isSafeAppLaunchUrl,
    MAX_URL_LENGTH,
    getSafeIconDataUrl,
    getRunningWindowProcesses,
    hiddenProcessNamePatterns,
    hiddenWindowTitlePatterns,
  } = deps;

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

};

module.exports = {
  createHandleTrustedIpc,
  registerTrustedRendererIpc,
};
