/**
 * Builds profile → launch-item lists for the main launch pipeline.
 * Injected dependencies keep this module free of main.js ordering / closure coupling.
 */
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
      const executablePath = extractExecutablePath(rawExe) || null;
      const shortcutPath = resolveShortcutPathForLaunch(app?.shortcutPath);
      const launchUrl = (typeof app?.launchUrl === 'string' && isSafeAppLaunchUrl(app.launchUrl))
        ? safeLimitedString(app.launchUrl, maxUrlLength)
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

  return {
    gatherProfileAppLaunches,
    gatherLegacyActionLaunches,
  };
};

module.exports = {
  createProfileLaunchGatherers,
};
