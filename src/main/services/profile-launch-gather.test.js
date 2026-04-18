const test = require('node:test');
const assert = require('node:assert/strict');
const { createProfileLaunchGatherers } = require('./profile-launch-gather');

const stubDeps = () => {
  const defaultMon = { id: 'm0', label: 'Primary' };
  return {
    buildSystemMonitorSnapshot: () => [defaultMon],
    sortMonitorsByLayout: (mons) => (Array.isArray(mons) ? mons : []),
    normalizeLabel: (v) => String(v || '').trim().toLowerCase(),
    extractExecutablePath: (raw) => String(raw || '').trim() || null,
    resolveShortcutPathForLaunch: () => null,
    isSafeAppLaunchUrl: () => false,
    safeLimitedString: (s) => String(s),
    maxUrlLength: 2048,
    isDisallowedLaunchExecutablePath: () => false,
  };
};

test('gatherProfileAppLaunches collects per-monitor apps with monitor mapping', () => {
  const { gatherProfileAppLaunches } = createProfileLaunchGatherers(stubDeps());
  const monitorMap = new Map([['m1', { id: 'm1' }]]);
  const profile = {
    monitors: [
      { id: 'm1', primary: true, apps: [{ name: 'Calc', executablePath: 'C:\\calc.exe' }] },
    ],
    minimizedApps: [],
    restrictedApps: [],
  };
  const { launches, skippedApps } = gatherProfileAppLaunches(profile, monitorMap);
  assert.equal(skippedApps.length, 0);
  assert.equal(launches.length, 1);
  assert.equal(launches[0].appName, 'Calc');
  assert.equal(launches[0].monitor?.id, 'm1');
});

test('gatherLegacyActionLaunches skips restricted legacy app actions', () => {
  const { gatherLegacyActionLaunches } = createProfileLaunchGatherers(stubDeps());
  const monitorMap = new Map();
  const profile = {
    monitors: [],
    actions: [{ type: 'app', name: 'Notepad', path: 'C:\\notepad.exe', monitor: 1 }],
    restrictedApps: ['Notepad'],
  };
  const { launches, skippedApps } = gatherLegacyActionLaunches(profile, monitorMap);
  assert.equal(launches.length, 0);
  assert.equal(skippedApps.length, 1);
  assert.equal(skippedApps[0].reason, 'restricted');
});
