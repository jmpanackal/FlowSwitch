const test = require('node:test');
const assert = require('node:assert/strict');
const { createProfileLaunchRunner } = require('./profile-launch-runner');

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
