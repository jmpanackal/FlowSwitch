const test = require('node:test');
const assert = require('node:assert/strict');
const { createProfileLaunchRunner } = require('./profile-launch-runner');
const { LAUNCH_WEIGHT_HARD_MAX_UNITS } = require('../../shared/launch-weight-limits');

test('createProfileLaunchRunner returns launchProfileById function', () => {
  const noop = () => {};
  const asyncNoop = async () => {};
  const deps = {
    sleep: async () => {},
    getVisibleWindowInfos: async () => [],
    scoreWindowCandidate: () => 0,
    moveSpecificWindowHandleToBounds: async () => ({ applied: false, handle: null }),
    getWindowPlacementRectsByHandle: async () => null,
    isWindowOnTargetMonitor: () => false,
    waitForMainWindowReadyOrBlocker: async () => ({
      ready: false,
      blocked: false,
      timedOut: true,
      handle: null,
    }),
    isLikelyMainPlacementWindowIgnoringBlocker: () => false,
    verifyAndCorrectWindowPlacement: async () => ({ verified: false, corrected: false }),
    stabilizePlacementForSlowLaunch: async () => ({ verified: false, handle: null }),
    readProfilesFromDisk: () => ({}),
    unpackProfilesReadResult: () => ({ profiles: [], storeError: new Error('stub') }),
    launchStatusStore: {
      startRun: () => ({ runId: '', replacedRunId: null }),
      publishStatus: noop,
      getStatus: () => null,
      sealRun: noop,
      isActiveRun: () => false,
    },
    initializeLatestLaunchDiagnosticsLog: () => null,
    buildSystemMonitorSnapshot: () => [],
    createProfileMonitorMap: () => new Map(),
    gatherProfileAppLaunches: () => ({ launches: [], skippedApps: [] }),
    gatherLegacyActionLaunches: () => ({ launches: [], browserUrls: [], skippedApps: [] }),
    createLaunchDiagnostics: () => ({
      start: noop,
      decision: noop,
      result: noop,
      failure: noop,
    }),
    publishLaunchProfileStatus: noop,
    getPlacementProcessKey: () => 'app',
    isChromiumFamilyProcessKey: () => false,
    describeMonitor: () => '',
    buildWindowBoundsForApp: () => null,
    buildCompanionProcessHints: async () => [],
    planLaunchSlots: () => ({ reuseSlots: [], spawnSlots: [{}] }),
    summarizeWindowRows: () => [],
    shouldTriggerAmbiguityFallback: () => false,
    isLikelyAuxiliaryWindowClass: () => false,
    isChromiumNonPrimaryWindowRow: () => false,
    isChromiumTopLevelWindowRow: () => false,
    isWithinAcceptableStateTolerance: () => false,
    isWithinSalvagePlacementTolerance: () => false,
    centerWindowHandleOnMonitor: asyncNoop,
    maximizeWindowHandle: asyncNoop,
    buildMonitorMappingDiagnostics: () => [],
    normalizeSafeUrl: () => '',
    launchExecutable: async () => ({}),
    getForegroundWindowHandle: () => null,
    waitForWindowResponsive: async () => false,
    placeChromiumByRankedWindows: async () => ({ applied: false, handle: null }),
    moveWindowToBounds: async () => ({ applied: false, handle: null }),
    bringWindowHandleToFront: asyncNoop,
    stabilizeKnownHandlePlacement: async () => ({ verified: false, handle: null }),
    minimizeWindowHandle: () => {},
    ensureMinimizedAfterLaunch: async () => {},
  };

  const { launchProfileById } = createProfileLaunchRunner(deps);
  assert.equal(typeof launchProfileById, 'function');
});

test('launchProfileById rejects before startRun when launch weight exceeds hard max', async () => {
  let startRunCalled = false;
  const noop = () => {};
  const asyncNoop = async () => {};
  const stubProfile = { id: 'p1', name: 'Big', monitors: [{ id: 'm1', apps: [] }] };
  const manyLaunches = Array.from({ length: LAUNCH_WEIGHT_HARD_MAX_UNITS + 1 }, (_, i) => ({
    appName: `App${i}`,
    executablePath: `C:\\app${i}.exe`,
    shortcutPath: null,
    launchUrl: null,
    launchSequence: i,
    monitor: { id: 'm1' },
    app: { instanceId: `id-${i}`, name: `App${i}` },
  }));
  const deps = {
    sleep: async () => {},
    getVisibleWindowInfos: async () => [],
    scoreWindowCandidate: () => 0,
    moveSpecificWindowHandleToBounds: async () => ({ applied: false, handle: null }),
    getWindowPlacementRectsByHandle: async () => null,
    isWindowOnTargetMonitor: () => false,
    waitForMainWindowReadyOrBlocker: async () => ({
      ready: false,
      blocked: false,
      timedOut: true,
      handle: null,
    }),
    isLikelyMainPlacementWindowIgnoringBlocker: () => false,
    verifyAndCorrectWindowPlacement: async () => ({ verified: false, corrected: false }),
    stabilizePlacementForSlowLaunch: async () => ({ verified: false, handle: null }),
    readProfilesFromDisk: () => ({}),
    unpackProfilesReadResult: () => ({
      profiles: [stubProfile],
      storeError: null,
    }),
    launchStatusStore: {
      startRun: () => {
        startRunCalled = true;
        return { runId: 'should-not-run', replacedRunId: null };
      },
      publishStatus: noop,
      getStatus: () => null,
      sealRun: noop,
      isActiveRun: () => false,
    },
    initializeLatestLaunchDiagnosticsLog: () => null,
    buildSystemMonitorSnapshot: () => [{ id: 'm1', primary: true }],
    createProfileMonitorMap: () => new Map([['m1', { id: 'm1', primary: true }]]),
    gatherProfileAppLaunches: () => ({ launches: manyLaunches, skippedApps: [] }),
    gatherLegacyActionLaunches: () => ({ launches: [], browserUrls: [], skippedApps: [] }),
    createLaunchDiagnostics: () => ({
      start: noop,
      decision: noop,
      result: noop,
      failure: noop,
    }),
    publishLaunchProfileStatus: noop,
    getPlacementProcessKey: () => 'app',
    isChromiumFamilyProcessKey: () => false,
    describeMonitor: () => '',
    buildWindowBoundsForApp: () => null,
    buildCompanionProcessHints: async () => [],
    planLaunchSlots: () => ({ reuseSlots: [], spawnSlots: [{}] }),
    summarizeWindowRows: () => [],
    shouldTriggerAmbiguityFallback: () => false,
    isLikelyAuxiliaryWindowClass: () => false,
    isChromiumNonPrimaryWindowRow: () => false,
    isChromiumTopLevelWindowRow: () => false,
    isWithinAcceptableStateTolerance: () => false,
    isWithinSalvagePlacementTolerance: () => false,
    centerWindowHandleOnMonitor: asyncNoop,
    maximizeWindowHandle: asyncNoop,
    buildMonitorMappingDiagnostics: () => [],
    normalizeSafeUrl: () => '',
    launchExecutable: async () => ({}),
    getForegroundWindowHandle: () => null,
    waitForWindowResponsive: async () => false,
    placeChromiumByRankedWindows: async () => ({ applied: false, handle: null }),
    moveWindowToBounds: async () => ({ applied: false, handle: null }),
    bringWindowHandleToFront: asyncNoop,
    stabilizeKnownHandlePlacement: async () => ({ verified: false, handle: null }),
    minimizeWindowHandle: () => {},
    ensureMinimizedAfterLaunch: async () => {},
  };

  const { launchProfileById } = createProfileLaunchRunner(deps);
  const result = await launchProfileById('p1', {});
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LAUNCH_TOO_LARGE');
  assert.equal(startRunCalled, false);
  assert.ok(result.details && result.details.totalUnits > LAUNCH_WEIGHT_HARD_MAX_UNITS);
});

test('launchProfileById rejects before startRun when no app launches and no browser tabs', async () => {
  let startRunCalled = false;
  const noop = () => {};
  const asyncNoop = async () => {};
  const stubProfile = {
    id: 'p1',
    name: 'Empty targets',
    monitors: [{ id: 'm1', apps: [{ name: 'Ghost', instanceId: 'g1' }] }],
    browserTabs: [],
  };
  const deps = {
    sleep: async () => {},
    getVisibleWindowInfos: async () => [],
    scoreWindowCandidate: () => 0,
    moveSpecificWindowHandleToBounds: async () => ({ applied: false, handle: null }),
    getWindowPlacementRectsByHandle: async () => null,
    isWindowOnTargetMonitor: () => false,
    waitForMainWindowReadyOrBlocker: async () => ({
      ready: false,
      blocked: false,
      timedOut: true,
      handle: null,
    }),
    isLikelyMainPlacementWindowIgnoringBlocker: () => false,
    verifyAndCorrectWindowPlacement: async () => ({ verified: false, corrected: false }),
    stabilizePlacementForSlowLaunch: async () => ({ verified: false, handle: null }),
    readProfilesFromDisk: () => ({}),
    unpackProfilesReadResult: () => ({
      profiles: [stubProfile],
      storeError: null,
    }),
    launchStatusStore: {
      startRun: () => {
        startRunCalled = true;
        return { runId: 'should-not-run', replacedRunId: null };
      },
      publishStatus: noop,
      getStatus: () => null,
      sealRun: noop,
      isActiveRun: () => false,
    },
    initializeLatestLaunchDiagnosticsLog: () => null,
    buildSystemMonitorSnapshot: () => [{ id: 'm1', primary: true }],
    createProfileMonitorMap: () => new Map([['m1', { id: 'm1', primary: true }]]),
    gatherProfileAppLaunches: () => ({
      launches: [],
      skippedApps: [{ name: 'Ghost', reason: 'missing-launch-target' }],
    }),
    gatherLegacyActionLaunches: () => ({ launches: [], browserUrls: [], skippedApps: [] }),
    createLaunchDiagnostics: () => ({
      start: noop,
      decision: noop,
      result: noop,
      failure: noop,
    }),
    publishLaunchProfileStatus: noop,
    getPlacementProcessKey: () => 'app',
    isChromiumFamilyProcessKey: () => false,
    describeMonitor: () => '',
    buildWindowBoundsForApp: () => null,
    buildCompanionProcessHints: async () => [],
    planLaunchSlots: () => ({ reuseSlots: [], spawnSlots: [{}] }),
    summarizeWindowRows: () => [],
    shouldTriggerAmbiguityFallback: () => false,
    isLikelyAuxiliaryWindowClass: () => false,
    isChromiumNonPrimaryWindowRow: () => false,
    isChromiumTopLevelWindowRow: () => false,
    isWithinAcceptableStateTolerance: () => false,
    isWithinSalvagePlacementTolerance: () => false,
    centerWindowHandleOnMonitor: asyncNoop,
    maximizeWindowHandle: asyncNoop,
    buildMonitorMappingDiagnostics: () => [],
    normalizeSafeUrl: () => '',
    launchExecutable: async () => ({}),
    getForegroundWindowHandle: () => null,
    waitForWindowResponsive: async () => false,
    placeChromiumByRankedWindows: async () => ({ applied: false, handle: null }),
    moveWindowToBounds: async () => ({ applied: false, handle: null }),
    bringWindowHandleToFront: asyncNoop,
    stabilizeKnownHandlePlacement: async () => ({ verified: false, handle: null }),
    minimizeWindowHandle: () => {},
    ensureMinimizedAfterLaunch: async () => {},
  };

  const { launchProfileById } = createProfileLaunchRunner(deps);
  const result = await launchProfileById('p1', {});
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LAUNCH_NOTHING_TO_RUN');
  assert.equal(startRunCalled, false);
  assert.ok(String(result.error || '').includes('Nothing to launch'));
});
