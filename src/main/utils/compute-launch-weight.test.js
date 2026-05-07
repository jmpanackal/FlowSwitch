'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dedupeAppLaunchesFromGather,
  computeLaunchWeight,
  sliceProfileForExcludedMonitors,
} = require('./compute-launch-weight');

test('dedupeAppLaunchesFromGather prefers modern only when modern has rows', () => {
  const m = { launches: [{ app: { instanceId: 'a' }, monitor: { id: 'm1' }, executablePath: 'C:\\a.exe' }] };
  const l = {
    launches: [{ app: { name: 'x' }, monitor: { id: 'm1' }, executablePath: 'C:\\b.exe' }],
    browserUrls: [],
  };
  const out = dedupeAppLaunchesFromGather(m, l);
  assert.equal(out.length, 1);
  assert.equal(out[0].app.instanceId, 'a');
});

test('dedupeAppLaunchesFromGather merges legacy when no modern launches', () => {
  const m = { launches: [] };
  const l = {
    launches: [
      { app: { name: 'x' }, monitor: { id: 'm1' }, executablePath: 'C:\\b.exe' },
    ],
    browserUrls: [],
  };
  const out = dedupeAppLaunchesFromGather(m, l);
  assert.equal(out.length, 1);
});

test('sliceProfileForExcludedMonitors removes monitors and targeted minimized apps', () => {
  const profile = {
    monitors: [{ id: 'mon-a', apps: [] }, { id: 'mon-b', apps: [] }],
    minimizedApps: [
      { name: 'App1', targetMonitor: 'mon-a' },
      { name: 'App2', targetMonitor: 'mon-b' },
    ],
  };
  const sliced = sliceProfileForExcludedMonitors(profile, ['mon-a']);
  assert.equal(sliced.monitors.length, 1);
  assert.equal(sliced.monitors[0].id, 'mon-b');
  assert.equal(sliced.minimizedApps.length, 1);
  assert.equal(sliced.minimizedApps[0].name, 'App2');
});

test('computeLaunchWeight merges skippedApps from modern and legacy gathers', () => {
  const profile = {
    monitors: [{ id: 'm1', apps: [{ name: 'Ok', instanceId: 'i1', executablePath: 'C:\\a.exe' }] }],
    minimizedApps: [],
    browserTabs: [],
  };
  const deps = {
    buildSystemMonitorSnapshot: () => [{ id: 'm1', primary: true }],
    createProfileMonitorMap: (pm, sm) => new Map([[String(pm[0].id), sm[0]]]),
    gatherProfileAppLaunches: () => ({
      launches: [],
      skippedApps: [{ name: 'Ghost', reason: 'missing-launch-target' }],
    }),
    gatherLegacyActionLaunches: () => ({
      launches: [],
      browserUrls: [],
      skippedApps: [{ name: 'Legacy skip', reason: 'missing-path' }],
    }),
    normalizeSafeUrl: () => '',
  };
  const w = computeLaunchWeight(profile, deps, {});
  assert.equal(w.skippedLaunchTargets.count, 2);
  assert.equal(w.skippedLaunchTargets.sample.length, 2);
});

test('computeLaunchWeight dedupes skippedApps by name and reason', () => {
  const profile = {
    monitors: [{ id: 'm1', apps: [] }],
    minimizedApps: [],
    browserTabs: [],
  };
  const deps = {
    buildSystemMonitorSnapshot: () => [{ id: 'm1', primary: true }],
    createProfileMonitorMap: (pm, sm) => new Map([[String(pm[0].id), sm[0]]]),
    gatherProfileAppLaunches: () => ({
      launches: [],
      skippedApps: [{ name: 'Dup', reason: 'missing-launch-target' }],
    }),
    gatherLegacyActionLaunches: () => ({
      launches: [],
      browserUrls: [],
      skippedApps: [{ name: 'Dup', reason: 'missing-launch-target' }],
    }),
    normalizeSafeUrl: () => '',
  };
  const w = computeLaunchWeight(profile, deps, {});
  assert.equal(w.skippedLaunchTargets.count, 1);
});

test('computeLaunchWeight sums deduped apps and tabs', () => {
  const profile = {
    monitors: [{ id: 'm1', apps: [{ name: 'A', instanceId: 'i1', executablePath: 'C:\\a.exe' }] }],
    minimizedApps: [],
    browserTabs: [{ url: 'https://example.com/', browser: 'edge' }],
  };
  const deps = {
    buildSystemMonitorSnapshot: () => [{ id: 'm1', primary: true }],
    createProfileMonitorMap: (pm, sm) => new Map([[String(pm[0].id), sm[0]]]),
    gatherProfileAppLaunches: (p, map) => {
      const mon = map.get('m1');
      return {
        launches: p.monitors[0].apps.map((app, idx) => ({
          appName: app.name,
          executablePath: app.executablePath,
          shortcutPath: null,
          launchUrl: null,
          launchSequence: idx,
          monitor: mon,
          app,
        })),
        skippedApps: [],
      };
    },
    gatherLegacyActionLaunches: () => ({ launches: [], browserUrls: [], skippedApps: [] }),
    normalizeSafeUrl: (u) => (typeof u === 'string' && u.startsWith('https://') ? u : ''),
  };
  const w = computeLaunchWeight(profile, deps, {});
  assert.equal(w.breakdown.dedupedAppLaunches, 1);
  assert.equal(w.breakdown.dedupedBrowserTabs, 1);
  assert.equal(w.totalUnits, 2);
  assert.equal(w.skippedLaunchTargets.count, 0);
  assert.ok(w.preflight);
  assert.equal(w.preflight.layoutAppSlots, 1);
  assert.equal(w.preflight.launchableAppLaunches, 1);
  assert.equal(w.preflight.missingLaunchTargetSkips, 0);
  assert.equal(w.preflight.dedupedBrowserTabs, 1);
});

test('computeLaunchWeight preflight counts layout slots and missing-launch-target skips', () => {
  const profile = {
    monitors: [
      { id: 'm1', apps: [{ name: 'A', instanceId: 'i1' }, { name: 'B', instanceId: 'i2' }] },
    ],
    minimizedApps: [{ name: 'Min', instanceId: 'i3' }],
    browserTabs: [],
  };
  const deps = {
    buildSystemMonitorSnapshot: () => [{ id: 'm1', primary: true }],
    createProfileMonitorMap: (pm, sm) => new Map([[String(pm[0].id), sm[0]]]),
    gatherProfileAppLaunches: () => ({
      launches: [],
      skippedApps: [
        { name: 'A', reason: 'missing-launch-target' },
        { name: 'B', reason: 'missing-launch-target' },
      ],
    }),
    gatherLegacyActionLaunches: () => ({
      launches: [],
      browserUrls: [],
      skippedApps: [{ name: 'Min', reason: 'missing-launch-target' }],
    }),
    normalizeSafeUrl: () => '',
  };
  const w = computeLaunchWeight(profile, deps, {});
  assert.equal(w.preflight.layoutAppSlots, 3);
  assert.equal(w.preflight.missingLaunchTargetSkips, 3);
  assert.equal(w.preflight.launchableAppLaunches, 0);
  assert.equal(w.preflight.dedupedBrowserTabs, 0);
});
