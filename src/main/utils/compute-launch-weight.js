'use strict';

const limits = require('../../shared/launch-weight-limits');
const { buildBrowserTabLaunchList } = require('./browser-tab-launch-list');

/**
 * @param {{ skippedApps?: object[] }} modernLaunchData
 * @param {{ skippedApps?: object[] }} legacyLaunchData
 * @param {number} [sampleMax]
 */
const buildSkippedLaunchTargetsSummary = (modernLaunchData, legacyLaunchData, sampleMax = 12) => {
  const modernSk = modernLaunchData?.skippedApps || [];
  const legacySk = legacyLaunchData?.skippedApps || [];
  const merged = [];
  const seen = new Set();
  for (const row of [...modernSk, ...legacySk]) {
    const name = String(row?.name || '').trim() || 'App';
    const reason = String(row?.reason || '').trim() || 'unknown';
    const key = `${name.toLowerCase()}::${reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ name, reason });
  }
  return {
    count: merged.length,
    sample: merged.slice(0, sampleMax),
  };
};

/**
 * App tiles on layout + minimized row (same scope as gather), after optional monitor slice.
 * @param {object} profile
 * @returns {number}
 */
const countLayoutAppSlots = (profile) => {
  let n = 0;
  for (const mon of Array.isArray(profile?.monitors) ? profile.monitors : []) {
    n += Array.isArray(mon?.apps) ? mon.apps.length : 0;
  }
  n += Array.isArray(profile?.minimizedApps) ? profile.minimizedApps.length : 0;
  return n;
};

/**
 * Skips with reason `missing-launch-target` (no exe, shortcut, or URL on Windows).
 * @param {{ skippedApps?: object[] }} modernLaunchData
 * @param {{ skippedApps?: object[] }} legacyLaunchData
 * @returns {number}
 */
const countMissingLaunchTargetSkips = (modernLaunchData, legacyLaunchData) => {
  let n = 0;
  for (const row of [...(modernLaunchData?.skippedApps || []), ...(legacyLaunchData?.skippedApps || [])]) {
    if (String(row?.reason || '').trim() === 'missing-launch-target') n += 1;
  }
  return n;
};

/**
 * Dedupe key aligned with `profile-launch-runner.js` launch pipeline.
 * @param {object} launch
 * @returns {string}
 */
const launchKey = (launch) => {
  const instanceId = String(launch.app?.instanceId || '').trim();
  if (instanceId) {
    return `${instanceId}::${launch.monitor?.id || 'monitor'}`;
  }
  return `${launch.monitor?.id || 'monitor'}::${String(launch.executablePath || '').toLowerCase()}::${String(launch.shortcutPath || '').toLowerCase()}::${String(launch.launchUrl || '').toLowerCase()}`;
};

/**
 * @param {{ launches: object[] }} modernLaunchData
 * @param {{ launches: object[], browserUrls?: string[] }} legacyLaunchData
 * @returns {object[]}
 */
const dedupeAppLaunchesFromGather = (modernLaunchData, legacyLaunchData) => {
  const modern = modernLaunchData?.launches || [];
  const legacy = legacyLaunchData?.launches || [];
  const hasModernLaunches = modern.length > 0;
  const preferredLaunches = hasModernLaunches ? modern : [...modern, ...legacy];
  const seenLaunchKeys = new Set();
  return preferredLaunches.filter((launch) => {
    const key = launchKey(launch);
    if (seenLaunchKeys.has(key)) return false;
    seenLaunchKeys.add(key);
    return true;
  });
};

/**
 * Drop profile monitors (and minimized rows targeting them) excluded from a best-effort launch.
 * @param {object} profile
 * @param {string[]|undefined} excludedProfileMonitorIds
 * @returns {object}
 */
const sliceProfileForExcludedMonitors = (profile, excludedProfileMonitorIds) => {
  if (!Array.isArray(excludedProfileMonitorIds) || excludedProfileMonitorIds.length === 0) {
    return profile;
  }
  const ex = new Set(
    excludedProfileMonitorIds.map((id) => String(id || '').trim()).filter(Boolean),
  );
  const monitors = (Array.isArray(profile?.monitors) ? profile.monitors : []).filter(
    (m) => m?.id && !ex.has(String(m.id)),
  );
  const minimizedApps = (Array.isArray(profile?.minimizedApps) ? profile.minimizedApps : []).filter(
    (a) => {
      const t = a?.targetMonitor;
      if (t == null || t === '') return true;
      return !ex.has(String(t).trim());
    },
  );
  return { ...profile, monitors, minimizedApps };
};

/**
 * @param {object} deps
 * @param {() => object[]} deps.buildSystemMonitorSnapshot
 * @param {(profileMonitors: unknown, systemMonitors: unknown) => Map<string, object>} deps.createProfileMonitorMap
 * @param {(profile: object, monitorMap: Map<string, object>) => { launches: object[], skippedApps: object[] }} deps.gatherProfileAppLaunches
 * @param {(profile: object, monitorMap: Map<string, object>) => { launches: object[], browserUrls?: string[], skippedApps: object[] }} deps.gatherLegacyActionLaunches
 * @param {(raw: unknown) => string} deps.normalizeSafeUrl
 * @param {object} [options]
 * @param {object[]} [options.systemMonitorsOverride] — use instead of buildSystemMonitorSnapshot()
 * @param {string[]} [options.excludedProfileMonitorIds]
 */
const computeLaunchWeight = (profile, deps, options = {}) => {
  const {
    buildSystemMonitorSnapshot,
    createProfileMonitorMap,
    gatherProfileAppLaunches,
    gatherLegacyActionLaunches,
    normalizeSafeUrl,
  } = deps;

  const effectiveProfile = sliceProfileForExcludedMonitors(
    profile,
    options.excludedProfileMonitorIds,
  );
  const systemMonitors = Array.isArray(options.systemMonitorsOverride) && options.systemMonitorsOverride.length
    ? options.systemMonitorsOverride
    : buildSystemMonitorSnapshot();
  const monitorMap = createProfileMonitorMap(effectiveProfile?.monitors, systemMonitors);
  const modernLaunchData = gatherProfileAppLaunches(effectiveProfile, monitorMap);
  const legacyLaunchData = gatherLegacyActionLaunches(effectiveProfile, monitorMap);
  const appLaunches = dedupeAppLaunchesFromGather(modernLaunchData, legacyLaunchData);
  const tabEntries = buildBrowserTabLaunchList(
    effectiveProfile,
    legacyLaunchData,
    normalizeSafeUrl,
  );

  const perApp = limits.LAUNCH_WEIGHT_PER_APP_LAUNCH;
  const perTab = limits.LAUNCH_WEIGHT_PER_BROWSER_TAB;
  const appUnits = appLaunches.length * perApp;
  const tabUnits = tabEntries.length * perTab;
  const totalUnits = appUnits + tabUnits;

  const skippedLaunchTargets = buildSkippedLaunchTargetsSummary(
    modernLaunchData,
    legacyLaunchData,
    12,
  );

  const layoutAppSlots = countLayoutAppSlots(effectiveProfile);
  const missingLaunchTargetSkips = countMissingLaunchTargetSkips(
    modernLaunchData,
    legacyLaunchData,
  );

  return {
    totalUnits,
    breakdown: {
      dedupedAppLaunches: appLaunches.length,
      dedupedBrowserTabs: tabEntries.length,
    },
    limits: {
      softWarn: limits.LAUNCH_WEIGHT_SOFT_WARN_UNITS,
      hardMax: limits.LAUNCH_WEIGHT_HARD_MAX_UNITS,
    },
    skippedLaunchTargets,
    preflight: {
      layoutAppSlots,
      launchableAppLaunches: appLaunches.length,
      missingLaunchTargetSkips,
      dedupedBrowserTabs: tabEntries.length,
    },
  };
};

module.exports = {
  launchKey,
  dedupeAppLaunchesFromGather,
  sliceProfileForExcludedMonitors,
  buildSkippedLaunchTargetsSummary,
  countLayoutAppSlots,
  countMissingLaunchTargetSkips,
  buildBrowserTabLaunchList,
  computeLaunchWeight,
};
