/**
 * Builds profile → launch-item lists for the main launch pipeline.
 * Injected dependencies keep this module free of main.js ordering / closure coupling.
 */
const fs = require('fs');
const path = require('path');

const createProfileLaunchGatherers = ({
  buildSystemMonitorSnapshot,
  sortMonitorsByLayout,
  normalizeLabel,
  extractExecutablePath,
  resolveShortcutPathForLaunch,
  isSafeAppLaunchUrl,
  safeLimitedString,
  maxUrlLength,
  isDisallowedLaunchExecutablePath,
}) => {
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
      let executablePath = extractExecutablePath(rawExe) || null;
      const shortcutPath = resolveShortcutPathForLaunch(app?.shortcutPath);
      const launchUrl = (typeof app?.launchUrl === 'string' && isSafeAppLaunchUrl(app.launchUrl))
        ? safeLimitedString(app.launchUrl, maxUrlLength)
        : '';

      const resolveWindowsFolderTargetPath = (folderEntry) => {
        if (!folderEntry || process.platform !== 'win32') return '';
        let fp = String(folderEntry.path || '').trim().replace(/\//g, '\\');
        try {
          fp = path.normalize(fp);
        } catch {
          return '';
        }
        if (!fp || fp.includes('..') || !/^([a-zA-Z]:|\\\\)/.test(fp)) return '';
        try {
          if (!fs.existsSync(fp) || !fs.statSync(fp).isDirectory()) return '';
        } catch {
          return '';
        }
        return fp;
      };

      /**
       * File Explorer: one argv per folder path, or `/select,<path>` for files (see ss64.com/nt/explorer.html).
       * Order matches associatedFiles; de-duplicates by lowercase path.
       */
      const buildWindowsExplorerSpawnArgsFromAssociatedFiles = (associatedFiles) => {
        if (process.platform !== 'win32') return [];
        const rows = Array.isArray(associatedFiles) ? associatedFiles : [];
        const out = [];
        const seen = new Set();
        const pushUnique = (token) => {
          const t = String(token || '').trim();
          if (!t) return;
          const k = t.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k);
          out.push(t);
        };
        for (const row of rows) {
          if (!row) continue;
          const typ = String(row.type || '').trim().toLowerCase();
          let fp = String(row.path || '').trim().replace(/\//g, '\\');
          try {
            fp = path.normalize(fp);
          } catch {
            continue;
          }
          if (!fp || fp.includes('..') || !/^([a-zA-Z]:|\\\\)/.test(fp)) continue;
          try {
            if (!fs.existsSync(fp)) continue;
            const st = fs.statSync(fp);
            if (st.isDirectory()) {
              const folderPath = resolveWindowsFolderTargetPath({ ...row, type: 'folder', path: fp });
              if (folderPath) pushUnique(folderPath);
              continue;
            }
            if (!st.isFile()) continue;
          } catch {
            continue;
          }
          if (typ === 'folder') {
            const folderPath = resolveWindowsFolderTargetPath(row);
            if (folderPath) pushUnique(folderPath);
            continue;
          }
          const norm = fp.replace(/\//g, '\\');
          const selectArg = /\s/.test(norm) ? `/select,"${norm}"` : `/select,${norm}`;
          pushUnique(selectArg);
        }
        return out;
      };

      const isWindowsExplorerExecutablePath = (exePath) => {
        const p = String(exePath || '').trim().replace(/\//g, '\\').toLowerCase();
        return p.endsWith('\\explorer.exe');
      };

      let spawnArgsForExecutable = null;
      const af = Array.isArray(app?.associatedFiles) ? app.associatedFiles : [];
      const folderEntry = af.find((f) => f && String(f.type || '').toLowerCase() === 'folder'
        && String(f.path || '').trim());
      const folderTarget = folderEntry ? resolveWindowsFolderTargetPath(folderEntry) : '';
      const explorerSpawnArgs = buildWindowsExplorerSpawnArgsFromAssociatedFiles(af);

      if (executablePath && isWindowsExplorerExecutablePath(executablePath) && explorerSpawnArgs.length > 0) {
        spawnArgsForExecutable = explorerSpawnArgs;
      } else if (folderTarget && executablePath) {
        // Non-Explorer hosts (VS Code, etc.): first folder path only — same as before.
        spawnArgsForExecutable = [folderTarget];
      }

      if (!executablePath && !shortcutPath && !launchUrl && process.platform === 'win32' && explorerSpawnArgs.length > 0) {
        const windir = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
        const explorerExe = path.join(windir, 'explorer.exe');
        try {
          if (fs.existsSync(explorerExe) && fs.statSync(explorerExe).isFile()) {
            executablePath = explorerExe;
            spawnArgsForExecutable = explorerSpawnArgs;
          }
        } catch {
          // ignore
        }
      }

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
        ...(spawnArgsForExecutable ? { spawnArgsForExecutable } : {}),
      });
    };

    for (const monitor of (Array.isArray(profile?.monitors) ? profile.monitors : [])) {
      for (const app of (Array.isArray(monitor?.apps) ? monitor.apps : [])) {
        pushIfLaunchable(app, monitor?.id);
      }
    }

    for (const app of (Array.isArray(profile?.minimizedApps) ? profile.minimizedApps : [])) {
      pushIfLaunchable(
        {
          ...app,
          launchBehavior: 'minimize',
          _launchFromMinimizedTray: true,
        },
        app?.targetMonitor || primaryProfileMonitorId || null,
      );
    }

    const preferredOrder = Array.isArray(profile?.appLaunchOrder) ? profile.appLaunchOrder : [];
    if (preferredOrder.length > 0) {
      const indexById = new Map(
        preferredOrder
          .map((id) => String(id || '').trim())
          .filter(Boolean)
          .map((id, idx) => [id, idx]),
      );
      launches.sort((a, b) => {
        const aId = String(a?.app?.instanceId || a?.app?.name || '').trim();
        const bId = String(b?.app?.instanceId || b?.app?.name || '').trim();
        const ai = indexById.has(aId) ? indexById.get(aId) : Number.POSITIVE_INFINITY;
        const bi = indexById.has(bId) ? indexById.get(bId) : Number.POSITIVE_INFINITY;
        if (ai !== bi) return ai - bi;
        return Number(a?.launchSequence ?? 0) - Number(b?.launchSequence ?? 0);
      });
      launches.forEach((launch, idx) => {
        launch.launchSequence = idx;
      });
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

  return {
    gatherProfileAppLaunches,
    gatherLegacyActionLaunches,
  };
};

module.exports = {
  createProfileLaunchGatherers,
};
