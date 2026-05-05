'use strict';

/**
 * Profile launch orchestration: post-confirmation resume placement and `launchProfileById`.
 * Dependencies are injected to avoid main.js declaration-order coupling.
 */
const path = require('path');
const { execFile } = require('child_process');
const { PROCESS_HINTS_VERSION } = require('./process-hints');
const { hiddenProcessNamePatterns } = require('./windows-process-service');
const { launchIconDataUrlFromProfileApp } = require('../utils/launch-ui-icons');

/** App row outcome: opened via shell only — profile has no saved bounds to place or verify. */
const OUTCOME_EXTERNAL_OPEN_NO_LAYOUT = 'ExternalOpenNoLayout';
const OUTCOME_CONSTRAINED_PLACEMENT = 'ConstrainedPlacement';
const CONSTRAINED_PLACEMENT_DECISION_TEXT = (
  'This app has a fixed window size and was positioned as close to the snap zone as possible.'
);
const OBS_ERROR_WINDOW_TITLE_SET = new Set([
  'error',
  'obs error',
  'critical error',
]);

const createProfileLaunchRunner = (deps) => {
  const {
    sleep,
    getVisibleWindowInfos,
    scoreWindowCandidate,
    moveSpecificWindowHandleToBounds,
    getWindowPlacementRectsByHandle,
    isWindowOnTargetMonitor,
    waitForMainWindowReadyOrBlocker,
    isLikelyMainPlacementWindowIgnoringBlocker,
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
    getRunningWindowProcesses,
  } = deps;

  const normalizeLabel = (value) => String(value || '').trim().toLowerCase();
  const shouldCloseBlockedProfileApps = async (profile, diagnostics, diagnosticsContext = {}) => {
    if (process.platform !== 'win32') return { attempted: 0, failures: 0, closed: [] };
    const blocked = Array.isArray(profile?.restrictedApps) ? profile.restrictedApps : [];
    const blockedSet = new Set(blocked.map(normalizeLabel).filter(Boolean));
    if (blockedSet.size === 0) return { attempted: 0, failures: 0, closed: [] };

    let processes = [];
    try {
      processes = await getRunningWindowProcesses();
    } catch {
      processes = [];
    }

    const targets = processes
      .filter((row) => blockedSet.has(normalizeLabel(row?.name)))
      .map((row) => ({
        imageName: `${String(row?.name || '').trim()}.exe`,
        pid: Number(row?.id || 0),
      }))
      .filter((row) => row.imageName && row.pid > 0);

    const closed = [];
    let failures = 0;
    for (const target of targets) {
      const result = await new Promise((resolve) => {
        execFile(
          'taskkill',
          ['/PID', String(target.pid), '/T', '/F'],
          { windowsHide: true, timeout: 20000 },
          (error, stdout, stderr) => {
            const output = `${String(stdout || '')}\n${String(stderr || '')}`.toLowerCase();
            const noMatches = output.includes('not found') || output.includes('no running instance');
            resolve({
              ...target,
              ok: !error || noMatches,
              noMatches,
              error: error ? String(error?.message || error) : null,
            });
          },
        );
      });
      closed.push(result);
      if (!result.ok) failures += 1;
    }

    if (diagnostics) {
      diagnostics.result({
        ...diagnosticsContext,
        strategy: 'profile-blocked-apps-close',
        reason: 'blocked-apps-closed',
        attempted: targets.length,
        failures,
        blockedApps: Array.from(blockedSet),
        closed,
      });
    }
    return { attempted: targets.length, failures, closed };
  };

  /**
   * Maps a running process row to the same placement key family used for profile-slot launches.
   * @param {{ name?: string; executablePath?: string | null }} row
   */
  const rowToPlacementKey = (row) => {
    const exePath = row?.executablePath;
    if (exePath && typeof exePath === 'string' && exePath.trim()) {
      const base = path.basename(String(exePath).trim());
      return path.basename(base, path.extname(base)).toLowerCase();
    }
    return normalizeLabel(row?.name).replace(/\.exe$/i, '');
  };

  const isCriticalOrHiddenProcessRow = (row) => {
    const n = normalizeLabel(row?.name);
    if (!n) return true;
    if (n === 'explorer' || n === 'dwm' || n === 'csrss' || n === 'winlogon' || n === 'fontdrvhost') {
      return true;
    }
    return hiddenProcessNamePatterns.some((re) => re.test(n));
  };

  const taskkillPidTree = (pid) => new Promise((resolve) => {
    const id = Number(pid || 0);
    if (!Number.isFinite(id) || id <= 0) {
      resolve({ ok: true, skipped: true });
      return;
    }
    execFile(
      'taskkill',
      ['/PID', String(id), '/T', '/F'],
      { windowsHide: true, timeout: 20000 },
      (error, stdout, stderr) => {
        const output = `${String(stdout || '')}\n${String(stderr || '')}`.toLowerCase();
        const noMatches = output.includes('not found') || output.includes('no running instance');
        resolve({
          ok: !error || noMatches,
          noMatches,
          error: error ? String(error?.message || error) : null,
        });
      },
    );
  });

  /**
   * Pre-launch: optional close/minimize of profile-slot apps, then minimize/close of non-profile apps.
   * Runs on Windows only, after filter/blocked-app closes.
   */
  const applyPreLaunchWindowPolicies = async ({
    profile,
    appLaunches,
    diagnostics,
    diagnosticsContext = {},
  }) => {
    if (process.platform !== 'win32') {
      return { skipped: true, reason: 'non-win32' };
    }

    const inPolicy = String(profile?.preLaunchInProfileBehavior || 'reuse').trim();
    const outPolicy = String(
      profile?.preLaunchOutsideProfileBehavior || profile?.backgroundBehavior || 'keep',
    ).trim();

    const profileSlotKeys = new Set(
      (Array.isArray(appLaunches) ? appLaunches : [])
        .map((launch) => getPlacementProcessKey(launch))
        .filter(Boolean),
    );

    const inTargetMode = (
      Array.isArray(profile?.preLaunchInProfileTargetKeys)
      && profile.preLaunchInProfileTargetKeys.length > 0
    )
      ? 'selected'
      : 'all';
    const inTargetKeySet = new Set(
      (Array.isArray(profile?.preLaunchInProfileTargetKeys) ? profile.preLaunchInProfileTargetKeys : [])
        .map((k) => String(k || '').trim().toLowerCase())
        .filter(Boolean),
    );

    const outsideTargetMode = (
      outPolicy !== 'keep'
      && Array.isArray(profile?.preLaunchOutsideTargetNames)
      && profile.preLaunchOutsideTargetNames.length > 0
    )
      ? 'selected'
      : 'all';
    const outsideNameSet = new Set(
      (Array.isArray(profile?.preLaunchOutsideTargetNames) ? profile.preLaunchOutsideTargetNames : [])
        .map((n) => normalizeLabel(n))
        .filter(Boolean),
    );

    let processes = [];
    try {
      processes = await getRunningWindowProcesses();
    } catch {
      processes = [];
    }

    const rowInProfileSlots = (row) => profileSlotKeys.has(rowToPlacementKey(row));

    const shouldMutateInProfileRow = (row) => {
      if (!rowInProfileSlots(row)) return false;
      const key = rowToPlacementKey(row);
      if (inPolicy === 'reuse') {
        if (inTargetMode !== 'selected') return false;
        return profileSlotKeys.has(key) && !inTargetKeySet.has(key);
      }
      if (inPolicy === 'close_for_fresh_launch') {
        if (inTargetMode === 'all') return true;
        return inTargetKeySet.has(key);
      }
      if (inPolicy === 'minimize_then_launch') {
        if (inTargetMode === 'all') return true;
        return inTargetKeySet.has(key);
      }
      return false;
    };

    const inResults = [];
    if (inPolicy === 'close_for_fresh_launch' || (inPolicy === 'reuse' && inTargetMode === 'selected')) {
      const targets = processes.filter(
        (row) => shouldMutateInProfileRow(row) && Number(row?.id || 0) > 0,
      );
      for (const row of targets) {
        const res = await taskkillPidTree(row.id);
        inResults.push({ pid: row.id, name: row.name, ...res });
      }
      if (targets.length > 0) {
        await sleep(150);
      }
      try {
        processes = await getRunningWindowProcesses();
      } catch {
        processes = [];
      }
    } else if (inPolicy === 'minimize_then_launch') {
      for (const row of processes.filter(
        (r) => shouldMutateInProfileRow(r) && Number(r?.id || 0) > 0,
      )) {
        const h = row?.mainWindowHandle ? String(row.mainWindowHandle).trim() : '';
        if (!h) continue;
        const ok = await minimizeWindowHandle(h);
        inResults.push({ pid: row.id, name: row.name, minimized: ok });
      }
    }

    const outResults = [];
    if (outPolicy === 'keep') {
      if (diagnostics?.result) {
        diagnostics.result({
          ...diagnosticsContext,
          strategy: 'pre-launch-window-policies',
          reason: 'outside-keep',
          inPolicy,
          outPolicy,
          inTargetMode,
          outsideTargetMode,
          profileSlotKeyCount: profileSlotKeys.size,
        });
      }
      return { inPolicy, outPolicy, inResults, outResults };
    }

    const outsideRowMatchesTargets = (row) => {
      if (outsideTargetMode === 'all') return true;
      const key = rowToPlacementKey(row);
      const nm = normalizeLabel(row?.name);
      return outsideNameSet.has(nm) || outsideNameSet.has(key);
    };

    const outsideRows = processes.filter(
      (row) => !rowInProfileSlots(row)
        && !isCriticalOrHiddenProcessRow(row)
        && Number(row?.id || 0) > 0
        && outsideRowMatchesTargets(row),
    );

    if (outPolicy === 'close') {
      for (const row of outsideRows) {
        const res = await taskkillPidTree(row.id);
        outResults.push({ pid: row.id, name: row.name, ...res });
      }
      if (outsideRows.length > 0) {
        await sleep(150);
      }
    } else if (outPolicy === 'minimize') {
      for (const row of outsideRows) {
        const h = row?.mainWindowHandle ? String(row.mainWindowHandle).trim() : '';
        if (!h) {
          outResults.push({ pid: row.id, name: row.name, minimized: false, reason: 'no-main-window-handle' });
          continue;
        }
        const ok = await minimizeWindowHandle(h);
        outResults.push({ pid: row.id, name: row.name, minimized: ok });
      }
    }

    if (diagnostics?.result) {
      diagnostics.result({
        ...diagnosticsContext,
        strategy: 'pre-launch-window-policies',
        reason: 'applied',
        inPolicy,
        outPolicy,
        inTargetMode,
        outsideTargetMode,
        profileSlotKeyCount: profileSlotKeys.size,
        inResults,
        outResults,
      });
    }

    return { inPolicy, outPolicy, inResults, outResults };
  };

  const resumePlacementAfterConfirmationModal = async ({
  processHintLc,
  processHints = [],
  blockedHandles = [],
  launchedPid = 0,
  placementBounds,
  monitor,
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  skipFrameChanged = false,
  launchDiagnostics,
  diagnosticsContext = {},
  // HWNDs that earlier launches in this run have already placed. Treated like quarantined
  // handles: they must not be reselected as the post-modal main window for this launch.
  runPlacedHandles = null,
}) => {
  const launchedPidNumber = Number(launchedPid || 0);
  const blockedHandleSet = new Set(
    (Array.isArray(blockedHandles) ? blockedHandles : [])
      .map((handle) => String(handle || '').trim())
      .filter(Boolean),
  );
  if (runPlacedHandles && typeof runPlacedHandles[Symbol.iterator] === 'function') {
    for (const handle of runPlacedHandles) {
      const normalized = String(handle || '').trim();
      if (normalized) blockedHandleSet.add(normalized);
    }
  }
  const blockerPresenceHandleSet = new Set(blockedHandleSet);
  const rejectedPostModalHandleSet = new Set();

  const isPlausibleRectForPlacement = (rect, targetBounds) => {
    if (!rect || !targetBounds) return false;
    const rectWidth = Math.max(0, Number(rect.width || 0));
    const rectHeight = Math.max(0, Number(rect.height || 0));
    const targetWidth = Math.max(1, Number(targetBounds.width || 0));
    const targetHeight = Math.max(1, Number(targetBounds.height || 0));
    if (rectWidth < Math.max(360, Math.floor(targetWidth * 0.3))) return false;
    if (rectHeight < Math.max(220, Math.floor(targetHeight * 0.24))) return false;
    const expectedAspect = targetWidth / Math.max(1, targetHeight);
    const aspect = rectWidth / Math.max(1, rectHeight);
    if (aspect < Math.max(0.82, expectedAspect * 0.72) || aspect > Math.min(3.2, expectedAspect * 2.1)) {
      return false;
    }
    const areaRatio = (rectWidth * rectHeight) / (targetWidth * targetHeight);
    if (areaRatio < 0.22) return false;
    return true;
  };
  const isHandlePlausibleAndStable = async (candidateHandle) => {
    const stableSamplesNeeded = 2;
    const samples = 3;
    let stableCount = 0;
    let prevArea = null;
    for (let i = 0; i < samples; i += 1) {
      const rects = await getWindowPlacementRectsByHandle(candidateHandle);
      const rect = rects?.visibleRect || rects?.outerRect || null;
      if (!isPlausibleRectForPlacement(rect, placementBounds)) return false;
      const area = Number(rect?.width || 0) * Number(rect?.height || 0);
      if (prevArea != null) {
        const ratio = area / Math.max(1, prevArea);
        if (ratio < 0.7 || ratio > 1.35) {
          stableCount = 0;
          prevArea = area;
          await sleep(180);
          continue;
        }
      }
      stableCount += 1;
      prevArea = area;
      if (stableCount >= stableSamplesNeeded) return true;
      await sleep(180);
    }
    return false;
  };

  const normalizedRootHint = String(processHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  // Many apps host their real main window under a companion process (e.g. Steam's main client
  // runs in `steamwebhelper.exe`, not `steam.exe`). Expanded hints are REQUIRED for enumeration
  // so we can actually see/find the main window. Companion-process auxiliary windows that were
  // visible pre-dismissal are filtered out via the blocked-era quarantine, not via hint scope.
  let normalizedScanHints = Array.from(new Set(
    [processHintLc, ...(Array.isArray(processHints) ? processHints : [])]
      .map((hint) => String(hint || '').trim().toLowerCase().replace(/\.exe$/i, ''))
      .filter(Boolean),
  ));
  if (typeof buildCompanionProcessHints === 'function') {
    const expanded = await buildCompanionProcessHints({
      baseProcessHintLc: normalizedRootHint || processHintLc,
      appNameHint: diagnosticsContext?.appName,
      diagnostics: launchDiagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'post-modal-resume-hints',
      },
    });
    const merged = Array.from(new Set(
      [...normalizedScanHints, ...(Array.isArray(expanded) ? expanded : [])]
        .map((hint) => String(hint || '').trim().toLowerCase().replace(/\.exe$/i, ''))
        .filter(Boolean),
    ));
    if (merged.length > normalizedScanHints.length && launchDiagnostics) {
      launchDiagnostics.decision({
        ...diagnosticsContext,
        strategy: 'post-modal-resume-hints',
        reason: 'expanded-process-hints-applied',
        initialProcessHints: normalizedScanHints,
        expandedProcessHints: merged,
      });
    }
    normalizedScanHints = merged;
  }
  const collectResumeCandidates = async (_ignoredExpandedHints = [], options = {}) => {
    const includeBlocked = options?.includeBlocked === true;
    const rowsByHint = await Promise.all(
      normalizedScanHints.map((hint) => getVisibleWindowInfos(hint, {
        diagnostics: launchDiagnostics,
        diagnosticsContext: {
          ...diagnosticsContext,
          strategy: 'post-modal-resume-candidate-scan',
          processHintLc: hint,
        },
      })),
    );
    const seenHandles = new Set();
    const allRows = [];
    for (const rows of rowsByHint) {
      for (const row of (Array.isArray(rows) ? rows : [])) {
        const handle = String(row?.handle || '').trim();
        if (!handle || seenHandles.has(handle)) continue;
        if (!includeBlocked && blockedHandleSet.has(handle)) continue;
        seenHandles.add(handle);
        allRows.push(row);
      }
    }
    return allRows
      .filter((row) => (
        !row?.cloaked
        && !row?.hung
        && !row?.tool
        && !row?.isMinimized
        && (placementBounds.state !== 'maximized' || (!row?.hasOwner && !row?.topMost))
        && row?.enabled
        && Number(row?.width || 0) >= 280
        && Number(row?.height || 0) >= 140
      ))
      .sort((a, b) => {
        const scoreA = scoreWindowCandidate(a, { chromiumProcessHint: processHintLc });
        const scoreB = scoreWindowCandidate(b, { chromiumProcessHint: processHintLc });
        if (scoreA !== scoreB) return scoreB - scoreA;
        const areaA = Number(a?.area || (Number(a?.width || 0) * Number(a?.height || 0)));
        const areaB = Number(b?.area || (Number(b?.width || 0) * Number(b?.height || 0)));
        if (areaA !== areaB) return areaB - areaA;
        return String(a?.handle || '').localeCompare(String(b?.handle || ''));
      });
  };

  const placeChosenHandle = async (candidateHandle, handleSource = 'ready-gate') => (
    moveSpecificWindowHandleToBounds({
      handle: candidateHandle,
      bounds: placementBounds,
      processHintLc,
      aggressiveMaximize,
      positionOnlyBeforeMaximize,
      skipFrameChanged,
      diagnostics: launchDiagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'post-modal-resume-placement',
        candidateHandle,
        handleSource,
      },
    })
  );

  const tryPidTreePlacement = async (reason = 'pid-tree-main-window-attempt') => {
    if (!Number.isFinite(launchedPidNumber) || launchedPidNumber <= 0) {
      return { applied: false, handle: null };
    }
    const attempt = await moveWindowToBounds({
      pid: launchedPidNumber,
      bounds: placementBounds,
      processNameHint: '',
      aggressiveMaximize,
      positionOnlyBeforeMaximize,
      preferNameEnumeration: false,
      excludedWindowHandles: Array.from(new Set([
        ...blockedHandleSet,
        ...rejectedPostModalHandleSet,
      ])),
      skipFrameChanged,
      diagnostics: launchDiagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'post-modal-resume-pid-tree',
        reason,
      },
    });
    if (!attempt?.applied || !attempt?.handle) return { applied: false, handle: null };
    const placedHandle = String(attempt.handle || '').trim();
    const stable = await isHandlePlausibleAndStable(placedHandle);
    if (!stable) {
      rejectedPostModalHandleSet.add(placedHandle);
      if (launchDiagnostics) {
        launchDiagnostics.decision({
          ...diagnosticsContext,
          strategy: 'post-modal-resume-pid-tree',
          reason: 'pid-tree-handle-rejected-as-unstable-or-implausible',
          handle: placedHandle,
        });
      }
      return { applied: false, handle: placedHandle };
    }
    if (launchDiagnostics) {
      launchDiagnostics.decision({
        ...diagnosticsContext,
        strategy: 'post-modal-resume-pid-tree',
        reason: 'pid-tree-main-window-placed',
        handle: placedHandle,
      });
    }
    return { applied: true, handle: placedHandle };
  };

  const resumeDeadline = Date.now() + 120000;

  // Phase 1: actively wait for the confirmation blocker to be dismissed. While the blocker is
  // still visible, every observed candidate is added to quarantine so pre-dismissal companion/
  // transient windows cannot later win as the "main" post-confirmation window.
  const awaitBlockerDismissal = async () => {
    let quarantinedDuringWait = 0;
    let lastScanHadBlocker = true;
    while (Date.now() <= resumeDeadline) {
      const rows = await collectResumeCandidates([], { includeBlocked: true });
      const visibleHandles = new Set(
        rows
          .map((row) => String(row?.handle || '').trim())
          .filter(Boolean),
      );
      const blockerStillVisible = Array.from(blockerPresenceHandleSet).some((handle) => (
        visibleHandles.has(handle)
      ));
      if (blockerStillVisible) {
        for (const row of rows) {
          const handle = String(row?.handle || '').trim();
          if (!handle || blockedHandleSet.has(handle)) continue;
          // Do not quarantine handles that already look like the real main window (e.g. Audacity
          // main visible behind a small confirmation dialog). Quarantining them caused
          // post-dismissal resume to loop on `ready-handle-quarantined` forever.
          if (isLikelyMainPlacementWindowIgnoringBlocker(row, placementBounds)) {
            continue;
          }
          blockedHandleSet.add(handle);
          quarantinedDuringWait += 1;
        }
        lastScanHadBlocker = true;
        await sleep(360);
        continue;
      }
      if (launchDiagnostics) {
        launchDiagnostics.decision({
          ...diagnosticsContext,
          strategy: 'post-modal-resume-gate',
          reason: lastScanHadBlocker
            ? 'blocker-dismissed'
            : 'blocker-not-visible-at-resume-start',
          quarantinedDuringWait,
          blockedHandleCount: blockedHandleSet.size,
        });
      }
      return { dismissed: true, quarantinedDuringWait };
    }
    return { dismissed: false, quarantinedDuringWait };
  };

  const dismissalOutcome = await awaitBlockerDismissal();
  if (!dismissalOutcome.dismissed) {
    if (launchDiagnostics) {
      launchDiagnostics.failure({
        ...diagnosticsContext,
        strategy: 'post-modal-resume',
        reason: 'confirmation-dismissal-timeout',
      });
    }
    return {
      resolved: false,
      status: 'waiting',
      handle: null,
    };
  }
  // Mandatory settle delay after blocker dismissal. This gives the host application time to
  // destroy pre-confirmation windows and spawn its real main window before we attempt winner
  // selection, avoiding latching onto transient or companion-process windows (e.g. steamwebhelper
  // overlay / friends list) that were visible pre-dismissal.
  await sleep(800);

  const pidTreePreflight = await tryPidTreePlacement('pid-tree-main-window-preflight');
  if (pidTreePreflight.applied && pidTreePreflight.handle) {
    return {
      resolved: true,
      status: 'resolved',
      handle: String(pidTreePreflight.handle || '').trim() || null,
    };
  }

  // Phase 2: run resume gate with expanded hints for discovery, but still exclude quarantined
  // pre-dismissal handles from eligibility.
  const postDismissDeadline = Date.now() + 12000;
  let resumeGate = null;
  while (Date.now() <= postDismissDeadline) {
    const remainingMs = postDismissDeadline - Date.now();
    const gateTimeoutMs = Math.max(1200, Math.min(2600, remainingMs));
    resumeGate = await waitForMainWindowReadyOrBlocker({
      processHintLc,
      processHints: normalizedScanHints,
      expectedBounds: placementBounds,
      timeoutMs: gateTimeoutMs,
      pollMs: 320,
      diagnostics: launchDiagnostics,
      listWindows: getVisibleWindowInfos,
      sleep,
      summarizeWindowRows,
      scoreWindowCandidate: (row, hint) => (
        scoreWindowCandidate(row, { chromiumProcessHint: hint })
      ),
      excludeHandles: blockedHandleSet,
      onPoll: ({ pollIndex, rows }) => {
        if (!launchDiagnostics) return;
        for (const row of (Array.isArray(rows) ? rows : [])) {
          if (Array.isArray(row?.rejectionReasons) && row.rejectionReasons.length > 0) {
            const rejectedHandle = String(row?.handle || '').trim();
            if (rejectedHandle) rejectedPostModalHandleSet.add(rejectedHandle);
          }
        }
        launchDiagnostics.decision({
          ...diagnosticsContext,
          strategy: 'post-modal-resume-gate-poll',
          reason: 'candidate-scan',
          pollIndex,
          candidateRows: rows,
        });
      },
      postModalResumeSizing: true,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'post-modal-resume-gate',
      },
    });
    for (const blockedHandle of (Array.isArray(resumeGate?.blockerHandles) ? resumeGate.blockerHandles : [])) {
      const safeBlockedHandle = String(blockedHandle || '').trim();
      if (safeBlockedHandle) blockedHandleSet.add(safeBlockedHandle);
    }
    if (resumeGate?.blockerHandle) {
      const safeBlockerHandle = String(resumeGate.blockerHandle || '').trim();
      if (safeBlockerHandle) blockedHandleSet.add(safeBlockerHandle);
    }
    if (resumeGate.ready && resumeGate.handle && blockedHandleSet.has(String(resumeGate.handle || '').trim())) {
      if (launchDiagnostics) {
        launchDiagnostics.decision({
          ...diagnosticsContext,
          strategy: 'post-modal-resume-gate',
          reason: 'ready-handle-quarantined',
          handle: resumeGate.handle,
        });
      }
      await sleep(260);
      continue;
    }
    if (resumeGate.ready && resumeGate.handle) {
      const readyHandle = String(resumeGate.handle || '').trim();
      if (!readyHandle) break;
      const stableReady = await isHandlePlausibleAndStable(readyHandle);
      if (!stableReady) {
        blockedHandleSet.add(readyHandle);
        if (launchDiagnostics) {
          launchDiagnostics.decision({
            ...diagnosticsContext,
            strategy: 'post-modal-resume-gate',
            reason: 'ready-handle-rejected-as-unstable-or-implausible',
            handle: readyHandle,
          });
        }
        await sleep(220);
        continue;
      }
      break;
    }
    if (!resumeGate.ready && !resumeGate.blocked) {
      const pidTreeRetry = await tryPidTreePlacement('pid-tree-main-window-retry');
      if (pidTreeRetry.applied && pidTreeRetry.handle) {
        resumeGate = {
          ready: true,
          blocked: false,
          timedOut: Boolean(resumeGate?.timedOut),
          handle: String(pidTreeRetry.handle || '').trim(),
        };
        break;
      }
    }
    if (resumeGate.blocked && resumeGate.blockerKind === 'confirmation') {
      const blockedEraRows = await collectResumeCandidates([], { includeBlocked: true });
      let quarantinedCount = 0;
      for (const row of blockedEraRows) {
        const handle = String(row?.handle || '').trim();
        if (!handle || blockedHandleSet.has(handle)) continue;
        if (isLikelyMainPlacementWindowIgnoringBlocker(row, placementBounds)) {
          continue;
        }
        blockedHandleSet.add(handle);
        quarantinedCount += 1;
      }
      if (quarantinedCount > 0 && launchDiagnostics) {
        launchDiagnostics.decision({
          ...diagnosticsContext,
          strategy: 'post-modal-resume-gate',
          reason: 'blocked-era-candidates-quarantined',
          quarantinedCount,
        });
      }
      await sleep(420);
      continue;
    }
    break;
  }
  if (!resumeGate?.ready || !resumeGate?.handle) {
    // Fallback for apps that expose a usable post-dismiss window that misses strict winner
    // heuristics (e.g. atypical class/topmost flags). Try one best-effort candidate before fail.
    const fallbackRows = await collectResumeCandidates([], { includeBlocked: false });
    const expectedW = Math.max(1, Number(placementBounds?.width || 0));
    const expectedH = Math.max(1, Number(placementBounds?.height || 0));
    const timeoutFallbackCandidates = fallbackRows.filter((row) => {
      const handle = String(row?.handle || '').trim();
      if (!handle || blockedHandleSet.has(handle)) return false;
      if (String(row?.className || '').trim().toLowerCase() === '#32770') return false;
      const w = Number(row?.width || 0);
      const h = Number(row?.height || 0);
      const area = Number(row?.area || (Number(row?.width || 0) * Number(row?.height || 0)));
      const titleLength = Number(row?.titleLength || 0);
      if (w < Math.max(360, Math.floor(expectedW * 0.3))) return false;
      if (h < Math.max(220, Math.floor(expectedH * 0.24))) return false;
      const expectedAspect = expectedW / Math.max(1, expectedH);
      const aspect = w / Math.max(1, h);
      if (aspect < Math.max(0.82, expectedAspect * 0.72) || aspect > Math.min(3.2, expectedAspect * 2.1)) {
        return false;
      }
      if (area < 240_000) return false;
      if (titleLength < 10 && area < 400_000) return false;
      return true;
    });
    const timeoutFallback = timeoutFallbackCandidates
      .sort((a, b) => {
        const aw = Number(a?.width || 0);
        const ah = Number(a?.height || 0);
        const bw = Number(b?.width || 0);
        const bh = Number(b?.height || 0);
        const aMismatch = Math.abs((aw / expectedW) - 1) + Math.abs((ah / expectedH) - 1);
        const bMismatch = Math.abs((bw / expectedW) - 1) + Math.abs((bh / expectedH) - 1);
        if (aMismatch !== bMismatch) return aMismatch - bMismatch;
        const areaA = Number(a?.area || (aw * ah));
        const areaB = Number(b?.area || (bw * bh));
        return areaB - areaA;
      })[0];
    if (timeoutFallback?.handle) {
      const fallbackHandle = String(timeoutFallback.handle || '').trim();
      if (fallbackHandle) {
        if (launchDiagnostics) {
          launchDiagnostics.decision({
            ...diagnosticsContext,
            strategy: 'post-modal-resume-gate',
            reason: 'timeout-fallback-candidate-selected',
            handle: fallbackHandle,
            candidateSample: summarizeWindowRows([timeoutFallback], 1),
          });
        }
        resumeGate = {
          ready: true,
          blocked: false,
          timedOut: Boolean(resumeGate?.timedOut),
          handle: fallbackHandle,
        };
      }
    }
  }
  if (!resumeGate?.ready || !resumeGate?.handle) {
    if (launchDiagnostics) {
      launchDiagnostics.failure({
        ...diagnosticsContext,
        strategy: 'post-modal-resume',
        reason: 'post-modal-main-window-not-ready',
        blocked: Boolean(resumeGate?.blocked),
        timedOut: Boolean(resumeGate?.timedOut),
      });
    }
    return {
      resolved: false,
      status: (resumeGate?.blocked && resumeGate?.blockerKind === 'confirmation') ? 'waiting' : 'timeout',
      handle: null,
    };
  }

  const lockedHandle = String(resumeGate.handle || '').trim() || null;
  if (launchDiagnostics && lockedHandle) {
    launchDiagnostics.decision({
      ...diagnosticsContext,
      strategy: 'post-modal-resume-handle-lock',
      reason: 'locked-selected-handle-for-placement',
      handle: lockedHandle,
    });
  }
  const placed = lockedHandle
    ? await placeChosenHandle(lockedHandle, resumeGate?.timedOut ? 'timeout-fallback' : 'ready-gate')
    : { applied: false, handle: null };
  const resolvedHandle = String(placed?.handle || resumeGate.handle || '').trim() || null;
  let finalResolvedHandle = resolvedHandle;
  if (!placed.applied) {
    if (launchDiagnostics) {
      launchDiagnostics.failure({
        ...diagnosticsContext,
        strategy: 'post-modal-resume',
        reason: 'post-modal-placement-not-applied',
        handle: resumeGate.handle,
      });
    }
    return {
      resolved: false,
      status: 'placement-failed',
      handle: resolvedHandle,
    };
  }

  if (placementBounds.state === 'normal' && monitor) {
    const verifyHandle = async (candidateHandle) => verifyAndCorrectWindowPlacement({
      handle: candidateHandle,
      monitor,
      bounds: placementBounds,
      aggressiveMaximize,
      positionOnlyBeforeMaximize,
      skipFrameChanged,
      maxCorrections: 0,
      initialCheckDelayMs: 180,
      diagnostics: launchDiagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'post-modal-resume-verification',
        candidateHandle,
      },
    });

    let verification = await verifyHandle(resolvedHandle);
    if (launchDiagnostics) {
      launchDiagnostics.result({
        ...diagnosticsContext,
        strategy: 'post-modal-resume',
        reason: verification.verified ? 'post-modal-placement-verified' : 'post-modal-placement-not-verified',
        verified: Boolean(verification.verified),
        corrected: Boolean(verification.corrected),
        handle: resolvedHandle,
      });
    }
    if (!verification.verified) {
      await sleep(320);
      verification = await verifyHandle(resolvedHandle);
      if (!verification.verified) {
        return {
          resolved: false,
          status: 'placement-failed',
          handle: resolvedHandle,
        };
      }
    }
  }

  if (placementBounds.state === 'maximized' && monitor) {
    const stabilized = await stabilizeKnownHandlePlacement({
      handle: resolvedHandle,
      bounds: placementBounds,
      monitor,
      aggressiveMaximize,
      positionOnlyBeforeMaximize,
      skipFrameChanged,
      durationMs: 2600,
      diagnostics: launchDiagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        processHintLc,
        strategy: 'post-modal-resume-known-handle-stabilize',
      },
    });
    if (launchDiagnostics) {
      launchDiagnostics.result({
        ...diagnosticsContext,
        strategy: 'post-modal-resume',
        reason: stabilized.verified
          ? 'post-modal-maximized-stabilized'
          : 'post-modal-maximized-not-stabilized',
        verified: Boolean(stabilized.verified),
        handle: stabilized.handle || resolvedHandle,
      });
    }
    if (!stabilized.verified) {
      return {
        resolved: false,
        status: 'placement-failed',
        handle: stabilized.handle || resolvedHandle,
      };
    }
    finalResolvedHandle = stabilized.handle || resolvedHandle;
  }
  return {
    resolved: true,
    status: 'resolved',
    handle: finalResolvedHandle,
  };
};

const launchProfileById = async (profileId, options = {}) => {
  const { profiles, storeError } = unpackProfilesReadResult(readProfilesFromDisk());
  if (storeError) {
    return {
      ok: false,
      error: String(storeError?.message || 'Could not load saved profiles.'),
      code: String(storeError?.code || 'READ_FAILED'),
      requestedProfileId: String(profileId || '').trim(),
      availableProfileIds: [],
    };
  }
  const normalizedProfileId = String(profileId || '').trim();
  const profile = profiles.find(
    (candidate) => String(candidate?.id || '').trim() === normalizedProfileId,
  );
  if (!profile) {
    return {
      ok: false,
      error: 'Profile not found. Save the profile and try again.',
      requestedProfileId: normalizedProfileId,
      availableProfileIds: profiles
        .map((candidate) => String(candidate?.id || '').trim())
        .filter(Boolean),
    };
  }
  const runSession = launchStatusStore.startRun(normalizedProfileId);
  const activeRunId = String(runSession?.runId || '').trim();
  if (!activeRunId) {
    return {
      ok: false,
      error: 'Could not initialize launch run state.',
      profile,
      requestedProfileId: normalizedProfileId,
    };
  }
  const replacedRunId = runSession?.replacedRunId || null;
  const isCurrentRunActive = () => launchStatusStore.isActiveRun(normalizedProfileId, activeRunId);
  if (typeof options.onStarted === 'function') {
    options.onStarted({
      profileId: normalizedProfileId,
      runId: activeRunId,
      replacedRunId,
      profile,
    });
  }
  const latestRunLogFile = initializeLatestLaunchDiagnosticsLog({
    profileId: normalizedProfileId,
    runId: activeRunId,
  });

  const launchState = profile?.launchMaximized
    ? 'maximized'
    : profile?.launchMinimized
      ? 'minimized'
      : 'normal';

  const systemMonitors = buildSystemMonitorSnapshot();
  const monitorMap = createProfileMonitorMap(profile?.monitors, systemMonitors);
  const modernLaunchData = gatherProfileAppLaunches(profile, monitorMap);
  const legacyLaunchData = gatherLegacyActionLaunches(profile, monitorMap);
  const hasModernLaunches = modernLaunchData.launches.length > 0;
  const launchKey = (launch) => {
    const instanceId = String(launch.app?.instanceId || '').trim();
    if (instanceId) {
      return `${instanceId}::${launch.monitor?.id || 'monitor'}`;
    }
    // Without an explicit instanceId, treat same launch target on same monitor as one logical app launch.
    // This prevents accidental duplicates from mixed/legacy profile data from opening multiple windows.
    return `${launch.monitor?.id || 'monitor'}::${String(launch.executablePath || '').toLowerCase()}::${String(launch.shortcutPath || '').toLowerCase()}::${String(launch.launchUrl || '').toLowerCase()}`;
  };
  const seenLaunchKeys = new Set();
  // Prefer modern monitor-layout launches. Legacy action-app launches are fallback only
  // when a profile has no modern app definitions.
  const preferredLaunches = hasModernLaunches
    ? modernLaunchData.launches
    : [...modernLaunchData.launches, ...legacyLaunchData.launches];
  const appLaunches = preferredLaunches
    .filter((launch) => {
      const key = launchKey(launch);
      if (seenLaunchKeys.has(key)) return false;
      seenLaunchKeys.add(key);
      return true;
    });
  const skippedApps = [...modernLaunchData.skippedApps, ...legacyLaunchData.skippedApps];
  const failedApps = [];
  const pendingConfirmations = [];
  const placementRecords = [];
  let launchedAppCount = 0;
  let launchedTabCount = 0;
  const requestedLaunchOrder = profile?.launchOrder === 'sequential' ? 'sequential' : 'all-at-once';
  const launchOrder = 'sequential';
  const appLaunchDelays = (profile?.appLaunchDelays && typeof profile.appLaunchDelays === 'object')
    ? profile.appLaunchDelays
    : {};
  const processHintCounts = new Map();
  for (const launchItem of appLaunches) {
    const processKey = getPlacementProcessKey(launchItem);
    processHintCounts.set(processKey, (processHintCounts.get(processKey) || 0) + 1);
  }
  const consumedReuseHandlesByProcessHint = new Map();
  const baselineReuseHandlesByProcessHint = new Map();
  // Run-scoped set of HWNDs already claimed by a successful placement earlier in this
  // run. Subsequent launches must exclude these from candidate selection so a later
  // duplicate-process launch (e.g. a second `explorer.exe <path>` invocation) cannot
  // pick up and reposition a window that an earlier launch already placed. The shell
  // sometimes reuses an existing top-level HWND for the second invocation (or the new
  // HWND is slow to appear), so the ready-gate would otherwise latch onto the previous
  // launch's placed window and move it.
  const placedHandlesInRun = new Set();
  const claimRunPlacementHandle = (handle) => {
    const normalized = String(handle || '').trim();
    if (!normalized) return;
    placedHandlesInRun.add(normalized);
  };

  const displayOrdinalLabelForMonitor = (m) => {
    if (!m || typeof m !== 'object') return null;
    const mid = String(m.id || '').trim();
    const list = Array.isArray(systemMonitors) ? [...systemMonitors] : [];
    if (!list.length) return m.primary ? 'Primary display' : null;
    list.sort((a, b) => {
      if (Boolean(a?.primary) !== Boolean(b?.primary)) return a?.primary ? -1 : 1;
      const ad = Number(a?.displayId);
      const bd = Number(b?.displayId);
      if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return ad - bd;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
    const idx = list.findIndex((mon) => String(mon?.id || '') === mid);
    if (idx < 0) return m.primary ? 'Primary display' : null;
    const hit = list[idx];
    if (hit?.primary) return 'Primary display';
    const nonPrimary = list.filter((mon) => !mon?.primary);
    const rank = nonPrimary.findIndex((mon) => String(mon?.id || '') === mid);
    if (rank < 0) return 'Display';
    return `Display ${rank + 2}`;
  };

  const launchLocationLabel = (li) => {
    if (li?.app?._launchFromMinimizedTray) return 'Minimized row';
    const m = li?.monitor;
    if (!m || typeof m !== 'object') return 'Display (unspecified)';
    return displayOrdinalLabelForMonitor(m) || 'Display (unspecified)';
  };

  const appLaunchProgress = appLaunches.map((li, idx) => ({
    key: String(li.app?.instanceId || '').trim() || `seq-${idx}`,
    name: String(li.appName || '').trim() || `App ${idx + 1}`,
    step: 'pending',
    iconDataUrl: launchIconDataUrlFromProfileApp(li.app),
    location: launchLocationLabel(li),
    outcomes: [],
  }));
  let activeUiPhase = null;
  let activeUiName = null;
  const launchExeByInstanceId = new Map();
  const launchExeByAppName = new Map();
  const BROWSER_ALIAS_GROUPS = [
    ['microsoft edge', 'edge'],
    ['google chrome', 'chrome'],
    ['mozilla firefox', 'firefox'],
    ['vivaldi', 'vivaldi browser'],
    ['opera', 'opera browser'],
    ['brave', 'brave browser'],
  ];
  const normalizeBrowserLabel = (raw) => String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const resolveBrowserNameCandidates = (raw) => {
    const base = normalizeBrowserLabel(raw);
    if (!base) return [];
    const out = new Set([base]);
    const group = BROWSER_ALIAS_GROUPS.find((g) => g.includes(base));
    if (group) {
      for (const alias of group) out.add(alias);
    }
    return Array.from(out);
  };
  for (const launch of appLaunches) {
    const ex = typeof launch?.executablePath === 'string' ? launch.executablePath.trim() : '';
    if (!ex) continue;
    const iid = String(launch?.app?.instanceId || '').trim();
    if (iid) launchExeByInstanceId.set(iid, ex);
    const nl = normalizeBrowserLabel(launch?.appName || '');
    if (nl && !launchExeByAppName.has(nl)) launchExeByAppName.set(nl, ex);
  }

  /** Ordered browser tabs (profile + legacy), deduped by URL + preferred host hints. */
  const tabUrlList = [];
  const tabUrlSeen = new Set();
  const pushTabEntry = (raw, meta = {}) => {
    const u = normalizeSafeUrl(raw);
    if (!u) return;
    const browser = String(meta.browser || '').trim();
    const appInstanceId = String(meta.appInstanceId || '').trim();
    const key = `${u}\0${browser.toLowerCase()}\0${appInstanceId}`;
    if (tabUrlSeen.has(key)) return;
    tabUrlSeen.add(key);
    let label = u;
    try {
      label = new URL(u).hostname || u;
    } catch {
      label = u;
    }
    tabUrlList.push({ key, url: u, label, browser, appInstanceId });
  };
  for (const tab of (Array.isArray(profile?.browserTabs) ? profile.browserTabs : [])) {
    pushTabEntry(tab?.url, {
      browser: tab?.browser,
      appInstanceId: tab?.appInstanceId,
    });
  }
  for (const raw of legacyLaunchData.browserUrls || []) {
    pushTabEntry(raw);
  }
  const requestedBrowserTabCount = tabUrlList.length;
  const tabEntriesByAppInstanceId = new Map();
  for (const entry of tabUrlList) {
    const iid = String(entry?.appInstanceId || '').trim();
    if (!iid) continue;
    const existing = tabEntriesByAppInstanceId.get(iid);
    if (existing) existing.push(entry);
    else tabEntriesByAppInstanceId.set(iid, [entry]);
  }
  const openedTabKeySet = new Set();

  const tabActionIdForUrl = (tabKey) => {
    let h = 2166136261;
    for (let i = 0; i < tabKey.length; i += 1) {
      h ^= tabKey.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `tab:${(h >>> 0).toString(36)}`;
  };

  const makeAppSubsteps = (contentSubstepMode) => {
    const steps = [
      {
        id: 'sub-launch',
        label: 'Launching',
        state: 'queued',
        startedAtMs: null,
        endedAtMs: null,
      },
      {
        id: 'sub-place',
        label: 'Positioning window',
        state: 'queued',
        startedAtMs: null,
        endedAtMs: null,
      },
      {
        id: 'sub-verify',
        label: 'Verifying placement',
        state: 'queued',
        startedAtMs: null,
        endedAtMs: null,
      },
    ];
    if (contentSubstepMode) {
      steps.push({
        id: 'sub-content',
        label: 'Opening content',
        state: 'queued',
        startedAtMs: null,
        endedAtMs: null,
      });
    }
    steps.push({
      id: 'sub-confirm',
      label: 'Waiting for confirmation',
      state: 'queued',
      startedAtMs: null,
      endedAtMs: null,
    });
    return steps;
  };

  const buildInitialContentSmartDecisions = (launch) => {
    const decisions = [];
    const associatedFiles = Array.isArray(launch?.app?.associatedFiles)
      ? launch.app.associatedFiles
      : [];
    if (associatedFiles.length > 0) {
      const allFolders = associatedFiles.every((f) => String(f?.type || '').trim().toLowerCase() === 'folder');
      const contentKind = allFolders ? 'folder' : 'file';
      decisions.push(
        associatedFiles.length === 1
          ? `1 ${contentKind} opened with this app`
          : `${associatedFiles.length} ${contentKind}s opened with this app`,
      );
    }
    return decisions.length > 0 ? decisions : null;
  };

  const buildAssociatedFileContentItems = (launch) => {
    const associatedFiles = Array.isArray(launch?.app?.associatedFiles)
      ? launch.app.associatedFiles
      : [];
    return associatedFiles
      .map((f) => {
        const name = String(f?.name || path.basename(String(f?.path || '')) || '').trim();
        const type = String(f?.type || '').trim().toLowerCase() === 'folder' ? 'folder' : 'file';
        const filePath = String(f?.path || '').trim();
        if (!name && !filePath) return null;
        return {
          name: name || filePath,
          type,
          path: filePath || null,
        };
      })
      .filter(Boolean);
  };

  const buildLinkedTabContentItems = (launch) => {
    const instanceId = String(launch?.app?.instanceId || '').trim();
    if (!instanceId) return [];
    return tabUrlList
      .filter((t) => String(t?.appInstanceId || '').trim() === instanceId)
      .map((t) => {
        const url = String(t?.url || '').trim();
        if (!url) return null;
        const label = String(t?.label || '').trim();
        const name = label || url;
        return { name, type: 'link', path: url };
      })
      .filter(Boolean);
  };

  const buildInitialContentItems = (launch) => {
    const fromFiles = buildAssociatedFileContentItems(launch);
    const fromLinks = buildLinkedTabContentItems(launch);
    const merged = [...fromFiles, ...fromLinks];
    return merged.length > 0 ? merged : null;
  };

  const delayTimelineIndexByApp = new Array(appLaunches.length).fill(-1);
  const appTimelineIndexByApp = new Array(appLaunches.length);
  const executionActions = [];
  let executionTimelineWrite = 0;
  for (let i = 0; i < appLaunches.length; i += 1) {
    const row = appLaunchProgress[i];
    const delaySeconds = Number(appLaunchDelays[appLaunches[i].appName] || 0);
    if (delaySeconds > 0) {
      delayTimelineIndexByApp[i] = executionTimelineWrite;
      executionActions.push({
        id: `delay:${row.key}`,
        kind: 'system',
        title: `Wait before ${row.name}`,
        state: 'queued',
        pills: null,
        smartDecisions: [`Waiting ${delaySeconds}s delay`],
        errorMessage: null,
        failureKind: null,
        startedAtMs: null,
        endedAtMs: null,
        substeps: [{
          id: 'sub-wait',
          label: `Waiting ${delaySeconds}s delay`,
          state: 'queued',
          startedAtMs: null,
          endedAtMs: null,
        }],
      });
      executionTimelineWrite += 1;
    }
    appTimelineIndexByApp[i] = executionTimelineWrite;
    const targetLocationRaw = row?.location ? String(row.location).trim() : '';
    const launchRowForContent = appLaunches[i];
    const builtFileContentItemsForMode = buildAssociatedFileContentItems(launchRowForContent);
    const builtContentItemsForAction = buildInitialContentItems(launchRowForContent);
    const phForContentMode = getPlacementProcessKey(launchRowForContent);
    const spaForContentMode = Array.isArray(launchRowForContent.spawnArgsForExecutable)
      ? launchRowForContent.spawnArgsForExecutable.filter((a) => typeof a === 'string' && a.trim())
      : [];
    const explorerMultiTabForMode = (
      process.platform === 'win32'
      && phForContentMode === 'explorer'
      && spaForContentMode.length > 1
      && launchRowForContent.executablePath
    );
    const contentSubstepMode = (
      builtFileContentItemsForMode && builtFileContentItemsForMode.length > 0
        ? (explorerMultiTabForMode ? 'post-verify' : 'parallel-launch')
        : null
    );
    executionActions.push({
      id: `app:${row.key}`,
      kind: 'app',
      title: row.name,
      targetLocation: targetLocationRaw || null,
      state: 'queued',
      iconDataUrl: row.iconDataUrl,
      pills: null,
      smartDecisions: buildInitialContentSmartDecisions(appLaunches[i]),
      contentItems: builtContentItemsForAction,
      contentSubstepMode,
      contentOpenFailed: false,
      errorMessage: null,
      failureKind: null,
      startedAtMs: null,
      endedAtMs: null,
      substeps: makeAppSubsteps(contentSubstepMode),
    });
    executionTimelineWrite += 1;
  }

  const tabUrlToTimelineIndex = new Map();
  for (const { key, label, url } of tabUrlList) {
    tabUrlToTimelineIndex.set(key, executionActions.length);
    executionActions.push({
      id: tabActionIdForUrl(key),
      kind: 'tab',
      title: label,
      targetLocation: 'Browser',
      browserTabUrl: url,
      state: 'queued',
      iconDataUrl: null,
      pills: null,
      smartDecisions: null,
      errorMessage: null,
      failureKind: null,
      startedAtMs: null,
      endedAtMs: null,
      substeps: [{
        id: 'sub-open',
        label: 'Opening in browser',
        state: 'queued',
        startedAtMs: null,
        endedAtMs: null,
      }],
    });
  }

  const syncAppTimelineFromRow = (action, row) => {
    if (!action || !row) return;
    const step = row.step;
    const subs = action.substeps || [];
    const sl = (id) => subs.find((s) => s.id === id);
    const hasContent = Boolean(sl('sub-content'));
    const mode = action.contentSubstepMode || null;
    const isParallel = mode === 'parallel-launch';
    const setSubs = (triples) => {
      for (const [id, st] of triples) {
        const s = sl(id);
        if (s) s.state = st;
      }
    };
    const setSubLabel = (id, label) => {
      const s = sl(id);
      if (s) s.label = label;
    };
    setSubLabel('sub-launch', 'Launching');
    setSubLabel('sub-place', 'Positioning window');
    setSubLabel('sub-verify', 'Verifying placement');
    setSubLabel('sub-confirm', 'Waiting for confirmation');
    if (hasContent) {
      setSubLabel('sub-content', 'Opening content');
    }
    if (step === 'pending') {
      action.state = 'queued';
      setSubs([
        ['sub-launch', 'queued'],
        ['sub-place', 'queued'],
        ['sub-verify', 'queued'],
        ...(hasContent ? [['sub-content', 'queued']] : []),
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'launching') {
      action.state = 'running';
      setSubs([
        ['sub-launch', 'running'],
        ['sub-place', 'queued'],
        ['sub-verify', 'queued'],
        ...(hasContent && isParallel ? [['sub-content', 'running']] : hasContent ? [['sub-content', 'queued']] : []),
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'placing') {
      action.state = 'running';
      setSubLabel('sub-launch', 'Launched');
      if (hasContent && isParallel) {
        setSubLabel('sub-content', 'Opened content');
      }
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'running'],
        ['sub-verify', 'queued'],
        ...(hasContent && isParallel ? [['sub-content', 'completed']] : hasContent ? [['sub-content', 'queued']] : []),
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'verifying') {
      action.state = 'running';
      setSubLabel('sub-launch', 'Launched');
      setSubLabel('sub-place', 'Positioned');
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'completed'],
        ['sub-verify', 'running'],
        ...(hasContent ? [['sub-content', 'queued']] : []),
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'opening-content') {
      action.state = 'running';
      setSubLabel('sub-launch', 'Launched');
      setSubLabel('sub-place', 'Positioned');
      setSubLabel('sub-verify', 'Verified placement');
      setSubLabel('sub-content', 'Opening content');
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'completed'],
        ['sub-verify', 'completed'],
        ['sub-content', 'running'],
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'awaiting-confirmation') {
      action.state = 'running';
      setSubLabel('sub-launch', 'Launched');
      setSubLabel('sub-place', 'Positioned');
      setSubLabel('sub-verify', 'Verified placement');
      if (hasContent && isParallel) {
        setSubLabel('sub-content', 'Opened content');
      }
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'completed'],
        ['sub-verify', 'completed'],
        ...(hasContent ? [['sub-content', isParallel ? 'completed' : 'queued']] : []),
        ['sub-confirm', 'running'],
      ]);
    } else if (step === 'done') {
      const externalNoLayout = Array.isArray(row.outcomes)
        && row.outcomes.some((o) => String(o || '').trim() === OUTCOME_EXTERNAL_OPEN_NO_LAYOUT);
      const constrainedPlacement = Array.isArray(row.outcomes)
        && row.outcomes.some((o) => String(o || '').trim() === OUTCOME_CONSTRAINED_PLACEMENT);
      const hadConfirmation = Array.isArray(row.outcomes)
        && row.outcomes.some((o) => String(o || '').trim() === 'Confirmation');
      if (externalNoLayout) {
        action.state = 'warning';
        appendSmartDecision(
          action,
          'No saved window slot — the OS opened the app or link; FlowSwitch did not place or verify a window. Add this app to a monitor in the profile for full launch control.',
        );
      } else if (constrainedPlacement) {
        action.state = 'warning';
      } else {
        action.state = 'completed';
      }
      setSubLabel('sub-launch', 'Launched');
      setSubLabel('sub-place', 'Positioned');
      setSubLabel('sub-verify', 'Verified placement');
      if (hasContent) {
        setSubLabel('sub-content', 'Opened content');
      }
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'completed'],
        ['sub-verify', 'completed'],
        ...(hasContent ? [['sub-content', 'completed']] : []),
        ['sub-confirm', 'completed'],
      ]);
      const confirmSub = sl('sub-confirm');
      if (confirmSub) {
        if (externalNoLayout) {
          confirmSub.label = 'Not applicable';
        } else if (hadConfirmation) {
          confirmSub.label = 'Confirmed';
        } else {
          confirmSub.label = 'No confirmation needed';
        }
      }
    } else if (step === 'failed') {
      action.state = 'failed';
      const fk = action.failureKind || 'launch';
      const contentFail = Boolean(action.contentOpenFailed);
      if (fk === 'placement') {
        setSubs([
          ['sub-launch', 'completed'],
          ['sub-place', 'failed'],
          ['sub-verify', 'queued'],
          ...(hasContent ? [['sub-content', 'queued']] : []),
          ['sub-confirm', 'queued'],
        ]);
      } else if (fk === 'verification' && contentFail && hasContent) {
        setSubs([
          ['sub-launch', 'completed'],
          ['sub-place', 'completed'],
          ['sub-verify', 'completed'],
          ['sub-content', 'failed'],
          ['sub-confirm', 'queued'],
        ]);
      } else if (fk === 'verification') {
        setSubs([
          ['sub-launch', 'completed'],
          ['sub-place', 'completed'],
          ['sub-verify', 'failed'],
          ...(hasContent ? [['sub-content', 'queued']] : []),
          ['sub-confirm', 'queued'],
        ]);
      } else {
        setSubs([
          ['sub-launch', 'failed'],
          ['sub-place', 'queued'],
          ['sub-verify', 'queued'],
          ...(hasContent ? [['sub-content', 'queued']] : []),
          ['sub-confirm', 'queued'],
        ]);
      }
    } else if (step === 'skipped') {
      action.state = 'skipped';
    }
  };

  const refreshAllAppTimelines = () => {
    for (let i = 0; i < appLaunches.length; i += 1) {
      const ai = appTimelineIndexByApp[i];
      syncAppTimelineFromRow(executionActions[ai], appLaunchProgress[i]);
    }
  };

  const countCompletedTimelineActions = () => executionActions.filter(
    (a) => a.state === 'completed'
      || a.state === 'failed'
      || a.state === 'skipped'
      || a.state === 'warning',
  ).length;

  const resolveActiveActionId = () => {
    const running = executionActions.find((a) => a.state === 'running');
    if (running) return running.id;
    return null;
  };

  const appendUniquePill = (action, pill) => {
    if (!action || !pill) return;
    const prev = Array.isArray(action.pills) ? action.pills : [];
    if (prev.includes(pill)) return;
    action.pills = [...prev, pill];
  };

  const appendSmartDecision = (action, text) => {
    if (!action || !text) return;
    const prev = Array.isArray(action.smartDecisions) ? action.smartDecisions : [];
    if (prev.includes(text)) return;
    action.smartDecisions = [...prev, text];
  };

  const { shell } = require('electron');
  const profileDiagnostics = createLaunchDiagnostics({
    profileId: normalizedProfileId,
    launchState,
    runId: activeRunId,
  });
  const publishCurrentLaunchStatus = (state = 'in-progress') => {
    refreshAllAppTimelines();
    const activeActionId = resolveActiveActionId();
    publishLaunchProfileStatus(normalizedProfileId, activeRunId, {
      state,
      launchedAppCount,
      launchedTabCount,
      failedAppCount: failedApps.length,
      skippedAppCount: skippedApps.length,
      requestedAppCount: appLaunches.length,
      requestedBrowserTabCount,
      activePhase: activeUiPhase,
      activeAppName: activeUiName,
      appLaunchProgress: appLaunchProgress.map((row) => ({ ...row })),
      pendingConfirmations,
      activeActionId,
      actionsTotal: executionActions.length,
      actionsCompleted: countCompletedTimelineActions(),
      actions: executionActions,
    });
  };
  const countUnresolvedPendingConfirmations = () => pendingConfirmations
    .filter((item) => String(item?.status || '').toLowerCase() === 'waiting')
    .length;
  const countFailedPendingConfirmations = () => pendingConfirmations
    .filter((item) => String(item?.status || '').toLowerCase() === 'failed')
    .length;
  const finalizeRunIfPendingConfirmationsSettled = () => {
    if (!isCurrentRunActive()) return;
    const unresolvedCount = countUnresolvedPendingConfirmations();
    if (unresolvedCount > 0) {
      publishCurrentLaunchStatus('awaiting-confirmations');
      return;
    }
    const terminalState = (
      failedApps.length === 0 && countFailedPendingConfirmations() === 0
        ? 'complete'
        : 'failed'
    );
    activeUiPhase = null;
    activeUiName = null;
    publishCurrentLaunchStatus(terminalState);
    launchStatusStore.sealRun(normalizedProfileId, activeRunId, terminalState);
  };

  const isLikelyFatalLaunchDialog = (row, processHintLc) => {
    const hint = String(processHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
    const title = String(row?.title || '').trim().toLowerCase();
    const className = String(row?.className || '').trim().toLowerCase();
    if (!title) return false;
    if (hint === 'obs64' || hint === 'obs') {
      return OBS_ERROR_WINDOW_TITLE_SET.has(title) && /qt\d+qwindowicon/.test(className);
    }
    return false;
  };

  const buildFatalLaunchDialogErrorMessage = (processHintLc, row) => {
    const hint = String(processHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
    if (hint === 'obs64' || hint === 'obs') {
      return (
        'OBS opened an error dialog instead of a usable main window. '
        + 'Close the OBS error dialog, confirm the OBS executable path points to the real install '
        + '(not an updater/helper), then relaunch. If it persists, repair/reinstall OBS.'
      );
    }
    const title = String(row?.title || '').trim();
    if (title) {
      return `App opened an error dialog ("${title}") instead of a usable main window.`;
    }
    return 'App opened an error dialog instead of a usable main window.';
  };

  const parseExplorerTargetPath = (arg) => {
    const raw = String(arg || '').trim();
    if (!raw) return '';
    if (!raw.toLowerCase().startsWith('/select,')) {
      return raw.replace(/\//g, '\\');
    }
    let v = raw.slice('/select,'.length).trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      v = v.slice(1, -1);
    }
    return String(v || '').trim().replace(/\//g, '\\');
  };

  const psSingleQuoted = (value) => `'${String(value || '').replace(/'/g, "''")}'`;

  const openExplorerPathInWindow = ({
    handle,
    arg,
    newTab = true,
    diagnostics,
  }) => new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, reason: 'non-win32' });
      return;
    }
    const safeHandle = String(handle || '').trim();
    const targetPath = parseExplorerTargetPath(arg);
    if (!safeHandle || !targetPath) {
      resolve({ ok: false, reason: 'missing-handle-or-path' });
      return;
    }
    const psTargetPath = psSingleQuoted(targetPath);
    const psScript = `
$targetHwnd = [int64]"${safeHandle.replace(/"/g, '`"')}"
if ($targetHwnd -le 0) { Write-Output "invalid-handle"; exit 0 }
$targetPath = ${psTargetPath}
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class ExplorerTabs {
  public delegate bool EnumChildProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hWndParent, EnumChildProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  public static List<IntPtr> FindChildWindowsByClass(IntPtr parent, string className) {
    var found = new List<IntPtr>();
    EnumChildWindows(parent, (h, l) => {
      var sb = new StringBuilder(256);
      GetClassName(h, sb, sb.Capacity);
      if (String.Equals(sb.ToString(), className, StringComparison.OrdinalIgnoreCase)) {
        found.Add(h);
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
Add-Type -AssemblyName System.Windows.Forms

function Get-LatestShellViewForFrame {
  param($Shell, [int64]$FrameHwnd)
  try {
    $sw = $Shell.Windows()
    $c = [int]$sw.Count
    if ($c -le 0) { return $null }
    for ($i = $c - 1; $i -ge 0; $i--) {
      try {
        $it = $sw.Item($i)
        if ($null -eq $it) { continue }
        if ([int64]$it.HWND -eq $FrameHwnd) { return $it }
      } catch {}
    }
  } catch {}
  return $null
}

function Open-ExplorerTab {
  param([int64]$Handle)
  $h = [IntPtr]::new($Handle)
  [void][ExplorerTabs]::ShowWindowAsync($h, 9)
  Start-Sleep -Milliseconds 80
  [void][ExplorerTabs]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 80

  $sent = $false
  try {
    $tabWindows = [ExplorerTabs]::FindChildWindowsByClass($h, "ShellTabWindowClass")
    if ($tabWindows.Count -gt 0) {
      $tabHwnd = $tabWindows[0]
      [void][ExplorerTabs]::SendMessage($tabHwnd, 0x0111, [IntPtr]::new(0xA21B), [IntPtr]::Zero)
      $sent = $true
    }
  } catch {}
  if (-not $sent) {
    try {
      [System.Windows.Forms.SendKeys]::SendWait("^{t}")
      $sent = $true
    } catch {}
  }
  return $sent
}

try {
  $shell = New-Object -ComObject Shell.Application
  $fileUrl = $null
  try {
    $fileUrl = ([Uri]::new($targetPath)).AbsoluteUri
  } catch {
    $norm = ($targetPath -replace '\\\\','/')
    $fileUrl = 'file:///' + $norm
  }
  if (${!newTab ? '$true' : '$false'}) {
    $targetItem = Get-LatestShellViewForFrame -Shell $shell -FrameHwnd $targetHwnd
    if ($null -eq $targetItem) {
      Write-Output "shell-item-not-found"
      exit 0
    }
    $targetItem.Navigate2($fileUrl, 0)
    Write-Output "ok"
    exit 0
  }

  [void](Open-ExplorerTab -Handle $targetHwnd)
  Start-Sleep -Milliseconds 1000
  $targetItem = Get-LatestShellViewForFrame -Shell $shell -FrameHwnd $targetHwnd
  if ($null -eq $targetItem) {
    Write-Output "shell-item-not-found-after-new-tab"
    exit 0
  }
  $targetItem.Navigate2($fileUrl, 0)
  Write-Output "ok"
  exit 0
} catch {
  Write-Output ("shell-com-failed|" + $_.Exception.Message)
  exit 0
}
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 12000, maxBuffer: 1024 * 128 },
      (error, stdout) => {
        const out = String(stdout || '').trim().toLowerCase();
        const ok = !error && out.includes('ok');
        if (!ok && diagnostics) {
          diagnostics.failure({
            strategy: 'explorer-multi-tab-spawn',
            reason: 'open-path-in-tab-failed',
            handle: safeHandle,
            targetPath,
            outputSnippet: out.slice(0, 160) || null,
            error: error ? String(error?.message || error) : null,
          });
        }
        resolve({ ok, targetPath });
      },
    );
  });

  const isConstrainedPlacementAcceptable = ({
    finalRect,
    targetBounds,
    monitor,
    processHintLc = '',
  }) => {
    if (!finalRect || !targetBounds || !monitor) return false;
    if (String(targetBounds.state || '').trim().toLowerCase() !== 'normal') return false;
    const processKey = String(processHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
    const onTargetMonitor = isWindowOnTargetMonitor({
      rect: finalRect,
      monitor,
      bounds: targetBounds,
    });
    if (!onTargetMonitor) return false;
    if (processKey === 'explorer') {
      const bx = Number(targetBounds.left || 0);
      const by = Number(targetBounds.top || 0);
      const bw = Math.max(0, Number(targetBounds.width || 0));
      const bh = Math.max(0, Number(targetBounds.height || 0));
      const fx = Number(finalRect.left || 0);
      const fy = Number(finalRect.top || 0);
      const fw = Math.max(0, Number(finalRect.width || 0));
      const fh = Math.max(0, Number(finalRect.height || 0));
      const desiredArea = bw * bh;
      if (desiredArea <= 0) return false;
      const ix1 = Math.max(bx, fx);
      const iy1 = Math.max(by, fy);
      const ix2 = Math.min(bx + bw, fx + fw);
      const iy2 = Math.min(by + bh, fy + fh);
      if (ix2 <= ix1 || iy2 <= iy1) return false;
      const overlapRatio = ((ix2 - ix1) * (iy2 - iy1)) / desiredArea;
      return overlapRatio >= 0.24;
    }
    const leftDelta = Math.abs(Number(finalRect.left || 0) - Number(targetBounds.left || 0));
    const topDelta = Math.abs(Number(finalRect.top || 0) - Number(targetBounds.top || 0));
    const widthDelta = Math.abs(Number(finalRect.width || 0) - Number(targetBounds.width || 0));
    const heightDelta = Math.abs(Number(finalRect.height || 0) - Number(targetBounds.height || 0));
    const anchoredNearTargetOrigin = leftDelta <= 24 && topDelta <= 24;
    const largeSizeConstraintDelta = widthDelta >= 80 || heightDelta >= 80;
    return anchoredNearTargetOrigin && largeSizeConstraintDelta;
  };
  profileDiagnostics.start({
    strategy: 'launch-profile',
    reason: 'launch-profile-requested',
    latestRunLogFile,
    processHintsVersion: PROCESS_HINTS_VERSION,
    launchOrder,
    appCount: appLaunches.length,
    modernLaunchCount: modernLaunchData.launches.length,
    legacyLaunchCount: legacyLaunchData.launches.length,
    skippedAppCount: skippedApps.length,
  });
  publishCurrentLaunchStatus('in-progress');
  profileDiagnostics.decision({
    strategy: 'monitor-mapping',
    reason: 'profile-monitor-map-created',
    mappings: buildMonitorMappingDiagnostics(profile?.monitors, systemMonitors, monitorMap),
  });
  profileDiagnostics.decision({
    strategy: 'process-hint-distribution',
    reason: 'process-hint-counts',
    counts: Array.from(processHintCounts.entries()).map(([processHintLc, count]) => ({
      processHintLc,
      count,
    })),
  });

  // Close blocked apps (filters) before launching profile apps.
  await shouldCloseBlockedProfileApps(profile, profileDiagnostics, {
    profileId: normalizedProfileId,
    runId: activeRunId,
  });

  await applyPreLaunchWindowPolicies({
    profile,
    appLaunches,
    diagnostics: profileDiagnostics,
    diagnosticsContext: {
      profileId: normalizedProfileId,
      runId: activeRunId,
    },
  });

  const runLaunch = async (launchItem, appIndex) => {
    if (!isCurrentRunActive()) return;
    let launchStatusMode = 'spawned_new_window';
    let launchStatusReasonCode = 'spawned_new_window';
    const launchDiagnostics = createLaunchDiagnostics({
      profileId: normalizedProfileId,
      launchSequence: Number(launchItem?.launchSequence ?? -1),
      appName: launchItem?.appName || 'unknown',
      runId: activeRunId,
    });
    try {
      if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
        const tactReset = executionActions[appTimelineIndexByApp[appIndex]];
        if (tactReset) tactReset.contentOpenFailed = false;
        activeUiPhase = 'launching';
        activeUiName = launchItem.appName;
        appLaunchProgress[appIndex].step = 'launching';
        publishCurrentLaunchStatus('in-progress');
      }
      const processHintLc = getPlacementProcessKey(launchItem);
      if (!consumedReuseHandlesByProcessHint.has(processHintLc)) {
        consumedReuseHandlesByProcessHint.set(processHintLc, new Set());
      }
      const consumedReuseHandles = consumedReuseHandlesByProcessHint.get(processHintLc);
      const processNameHint = processHintLc;
      const hintCount = processHintCounts.get(processHintLc) || 0;
      const isDuplicateProcessLaunch = hintCount > 1;
      const isChromiumFamily = isChromiumFamilyProcessKey(processHintLc);
      const profileSpawnArgs = Array.isArray(launchItem.spawnArgsForExecutable)
        ? launchItem.spawnArgsForExecutable.filter((a) => typeof a === 'string' && a.trim())
        : [];
      const contentTargetTokens = profileSpawnArgs
        .map((arg) => {
          const raw = String(arg || '').trim();
          if (!raw) return [];
          const parts = [];
          try {
            const maybeUrl = new URL(raw);
            const host = String(maybeUrl.hostname || '').trim().toLowerCase();
            if (host) parts.push(host);
          } catch {
            // not a URL
          }
          const normalizedPath = raw.replace(/\//g, '\\');
          const baseName = String(path.basename(normalizedPath) || '').trim().toLowerCase();
          if (baseName) parts.push(baseName);
          const withoutExt = baseName.replace(/\.[a-z0-9]+$/i, '').trim();
          if (withoutExt && withoutExt !== baseName) parts.push(withoutExt);
          return parts;
        })
        .flat()
        .filter(Boolean);
      let launchArgs = [...profileSpawnArgs];
      const explorerMultiTabSpawn = (
        process.platform === 'win32'
        && processHintLc === 'explorer'
        && profileSpawnArgs.length > 1
        && launchItem.executablePath
      );
      if (explorerMultiTabSpawn) {
        launchArgs = [profileSpawnArgs[0]];
      }
      if (
        isChromiumFamily
        && isDuplicateProcessLaunch
        && launchItem.executablePath
        && profileSpawnArgs.length === 0
      ) {
        launchArgs = ['--new-window', ...launchArgs];
      }
      launchDiagnostics.start({
        processHintLc,
        strategy: 'run-launch',
        reason: 'app-launch-start',
        launchTarget: launchItem.shortcutPath
          ? 'shortcut'
          : launchItem.launchUrl
            ? 'url'
            : 'executable',
        launchOrder,
        requestedLaunchOrder,
        isDuplicateProcessLaunch,
        isChromiumFamily,
        monitor: describeMonitor(launchItem.monitor),
      });
      const preLaunchWindowInfos = await getVisibleWindowInfos(processHintLc, {
        diagnostics: launchDiagnostics,
        diagnosticsContext: {
          processHintLc,
          strategy: isDuplicateProcessLaunch
            ? 'duplicate-prelaunch-window-scan'
            : 'prelaunch-window-scan',
        },
        includeNonVisible: true,
      });
      const preLaunchHandles = preLaunchWindowInfos.map((row) => row.handle);
      if (!baselineReuseHandlesByProcessHint.has(processHintLc)) {
        baselineReuseHandlesByProcessHint.set(
          processHintLc,
          new Set(
            (Array.isArray(preLaunchHandles) ? preLaunchHandles : [])
              .map((handle) => String(handle || '').trim())
              .filter(Boolean),
          ),
        );
      }

      let launchedChild = null;
      const bounds = buildWindowBoundsForApp(launchItem.app, launchItem.monitor, launchState, {
        diagnostics: launchDiagnostics,
        diagnosticsContext: {
          processHintLc,
          strategy: 'build-window-bounds',
        },
        processHintLc,
      });
      launchDiagnostics.decision({
        processHintLc,
        strategy: 'build-window-bounds',
        reason: bounds ? 'bounds-created' : 'bounds-unavailable',
        targetMonitor: launchItem.monitor?.name || launchItem.monitor?.id || 'unknown',
        state: bounds?.state || null,
        bounds,
        sourcePosition: launchItem.app?.position || null,
        sourceSize: launchItem.app?.size || null,
      });
      if (!bounds) {
        if (launchItem.shortcutPath) {
          const openErr = await shell.openPath(launchItem.shortcutPath);
          if (openErr) throw new Error(openErr);
        } else if (launchItem.launchUrl) {
          await shell.openExternal(launchItem.launchUrl);
        } else {
          launchedChild = await launchExecutable(launchItem.executablePath, launchArgs);
        }
        launchDiagnostics.decision({
          processHintLc,
          strategy: 'no-bounds-open',
          reason: 'external-open-without-profile-placement',
          launchTarget: launchItem.launchUrl
            ? 'url'
            : launchItem.shortcutPath
              ? 'shortcut'
              : 'executable',
        });
        launchedAppCount += 1;
        if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
          appLaunchProgress[appIndex].step = 'done';
          const prev = Array.isArray(appLaunchProgress[appIndex].outcomes)
            ? appLaunchProgress[appIndex].outcomes
            : [];
          appLaunchProgress[appIndex].outcomes = Array.from(new Set(
            [...prev, 'Launched', OUTCOME_EXTERNAL_OPEN_NO_LAYOUT],
          ));
        }
        activeUiPhase = null;
        activeUiName = null;
        publishCurrentLaunchStatus('in-progress');
        return;
      }
      if (bounds) {
        let placementPhasePublished = false;
        const signalPlacementPhase = () => {
          if (placementPhasePublished) return;
          placementPhasePublished = true;
          if (!Number.isInteger(appIndex) || !appLaunchProgress[appIndex]) return;
          activeUiPhase = 'placing';
          activeUiName = launchItem.appName;
          appLaunchProgress[appIndex].step = 'placing';
          publishCurrentLaunchStatus('in-progress');
        };
        const aggressiveMaximize = bounds.state === 'maximized' && processHintLc === 'msedge';
        const positionOnlyBeforeMaximize = processHintLc === 'msedge' && bounds.state === 'maximized';
        const shouldDelayChromiumMaximize = (
          isChromiumFamily
          && bounds.state === 'maximized'
        );
        const placementBounds = shouldDelayChromiumMaximize
          ? { ...bounds, state: 'normal' }
          : bounds;
        const readyGateExpectedBounds = shouldDelayChromiumMaximize ? null : placementBounds;
        // Combine this launch's pre-launch HWNDs with all HWNDs already claimed by earlier
        // launches in this run. The latter is what prevents duplicate-process launches
        // (e.g. two File Explorer windows) from inheriting a sibling launch's already-placed
        // window when the shell reuses an existing top-level HWND.
        const excludedHandles = Array.from(new Set([
          ...(Array.isArray(preLaunchHandles) ? preLaunchHandles : []),
          ...placedHandlesInRun,
        ].map((handle) => String(handle || '').trim()).filter(Boolean)));
        const chromiumNormalSoftPos = isChromiumFamily && placementBounds.state === 'normal';
        launchDiagnostics.decision({
          processHintLc,
          strategy: 'placement-strategy',
          reason: 'strategy-selected',
          isDuplicateProcessLaunch,
          isChromiumFamily,
          shouldDelayChromiumMaximize,
          placementState: placementBounds.state,
        });

        const initialProcessHints = await buildCompanionProcessHints({
          baseProcessHintLc: processHintLc,
          appNameHint: launchItem.appName,
          diagnostics: launchDiagnostics,
          diagnosticsContext: {
            processHintLc,
            strategy: 'window-ready-gate',
            appName: launchItem.appName,
          },
        });
        const readyGateTimeoutMs = placementBounds.state === 'maximized'
          ? (launchItem.shortcutPath ? 14000 : 11000)
          : 9000;
        let activeProcessHints = initialProcessHints;
        const currentPreLaunchHandleSet = new Set(
          (Array.isArray(preLaunchHandles) ? preLaunchHandles : [])
            .map((handle) => String(handle || '').trim())
            .filter(Boolean),
        );
        const baselinePreLaunchHandleSet = baselineReuseHandlesByProcessHint.get(processHintLc) || new Set();
        const preLaunchHandleSet = isDuplicateProcessLaunch
          ? baselinePreLaunchHandleSet
          : currentPreLaunchHandleSet;
        launchDiagnostics.decision({
          processHintLc,
          strategy: 'launch-target-mode',
          reason: 'prelaunch-window-snapshot',
          preLaunchHandleCount: currentPreLaunchHandleSet.size,
          reuseEligiblePreLaunchHandleCount: preLaunchHandleSet.size,
          preLaunchWindowSample: summarizeWindowRows(preLaunchWindowInfos, 3),
        });
        const findStableExistingMainWindowHandle = async (processHintsForScan = []) => {
          if (preLaunchHandleSet.size === 0) return null;
          const normalizedHints = Array.from(new Set(
            [processHintLc, ...(Array.isArray(processHintsForScan) ? processHintsForScan : [])]
              .map((hint) => String(hint || '').trim().toLowerCase().replace(/\.exe$/i, ''))
              .filter(Boolean),
          ));
          if (normalizedHints.length === 0) return null;

          const collectCandidates = async () => {
            const rowsByHint = await Promise.all(
              normalizedHints.map((hint) => getVisibleWindowInfos(hint, {
                diagnostics: launchDiagnostics,
                diagnosticsContext: {
                  processHintLc,
                  strategy: 'existing-main-window-scan',
                  scanHint: hint,
                },
                includeNonVisible: true,
              })),
            );
            const candidates = [];
            const seen = new Set();
            for (const rows of rowsByHint) {
              for (const row of (Array.isArray(rows) ? rows : [])) {
                const handle = String(row?.handle || '').trim();
                if (!handle || seen.has(handle)) continue;
                seen.add(handle);
                if (!preLaunchHandleSet.has(handle)) continue;
                if (consumedReuseHandles.has(handle)) continue;
                // Never reuse a handle that an earlier launch in this run already placed,
                // even if it predates this launch's pre-launch baseline.
                if (placedHandlesInRun.has(handle)) continue;
                // Allow minimized pre-existing handles here: warm-attach placement will restore and
                // re-anchor them. Rejecting minimized rows prevented reuse_existing for already-running
                // apps (OBS/Chrome) and forced unnecessary relaunch/confirmation flows.
                if (row?.cloaked || row?.hung || row?.tool || !row?.enabled) continue;
                if (row?.hasOwner || row?.topMost) continue;
                if (isLikelyAuxiliaryWindowClass(row?.className)) continue;
                if (isLikelyFatalLaunchDialog(row, processHintLc)) continue;
                if (isChromiumFamily && isChromiumNonPrimaryWindowRow(row)) continue;
                const isMinimized = Boolean(row?.isMinimized);
                if (!isMinimized && (Number(row?.width || 0) < 280 || Number(row?.height || 0) < 140)) continue;
                // Tray-only / background phases can leave large non-client HWNDs that are not
                // IsWindowVisible; reusing those skips launchExecutable and the user sees no UI.
                // Minimized real windows remain eligible (taskbar) even if visibility is quirky.
                if (!row?.isWindowVisible && !isMinimized) continue;
                // Do not require "meaningful bounds" at detection-time for reuse_existing.
                // Existing windows are often on a previous monitor/size; placement is responsible
                // for resizing/repositioning to target bounds.
                candidates.push(row);
              }
            }
            return candidates.sort((a, b) => (
              scoreWindowCandidate(b, { chromiumProcessHint: processHintLc })
              - scoreWindowCandidate(a, { chromiumProcessHint: processHintLc })
            ));
          };

          const summarizeTopCandidate = (rankedCandidates) => {
            const topRow = rankedCandidates?.[0] || null;
            const topHandle = String(topRow?.handle || '').trim();
            const topScore = Number(
              topRow
                ? (scoreWindowCandidate(topRow, { chromiumProcessHint: processHintLc }) || 0)
                : 0,
            );
            const secondScore = Number(
              scoreWindowCandidate(rankedCandidates?.[1], { chromiumProcessHint: processHintLc }) || 0,
            );
            return {
              topHandle,
              topScore,
              secondScore,
              candidateCount: Array.isArray(rankedCandidates) ? rankedCandidates.length : 0,
            };
          };

          const pollSummaries = [];
          for (let pollIndex = 0; pollIndex < 3; pollIndex += 1) {
            const rankedCandidates = await collectCandidates();
            pollSummaries.push(summarizeTopCandidate(rankedCandidates));
            if (pollIndex < 2) {
              await sleep(120);
            }
          }

          const flipsIn3Polls = pollSummaries.reduce((flipCount, summary, index) => {
            if (index === 0) return 0;
            const previousHandle = String(pollSummaries[index - 1]?.topHandle || '').trim();
            const currentHandle = String(summary?.topHandle || '').trim();
            if (!previousHandle || !currentHandle) return flipCount;
            return currentHandle === previousHandle ? flipCount : flipCount + 1;
          }, 0);

          const finalSummary = pollSummaries[pollSummaries.length - 1] || null;
          const finalTopHandle = String(finalSummary?.topHandle || '').trim();
          if (!finalTopHandle) return null;
          if (shouldTriggerAmbiguityFallback({
            topScore: finalSummary.topScore,
            secondScore: finalSummary.secondScore,
            flipsIn3Polls,
          })) {
            launchDiagnostics.decision({
              processHintLc,
              strategy: 'launch-target-mode',
              reason: 'reuse-ambiguous-fallback-to-spawn',
              topScore: finalSummary.topScore,
              secondScore: finalSummary.secondScore,
              flipsIn3Polls,
              topHandleSequence: pollSummaries.map((summary) => summary.topHandle).filter(Boolean),
              candidateCount: finalSummary.candidateCount,
            });
            return null;
          }
          return finalTopHandle;
        };
        let reusedExistingHandle = null;
        const shouldPreferReuseExisting = !launchItem.launchUrl;
        if (shouldPreferReuseExisting) {
          reusedExistingHandle = await findStableExistingMainWindowHandle(activeProcessHints);
        }
        const slotPlan = planLaunchSlots({
          requestedSlots: 1,
          existingHandles: reusedExistingHandle ? [reusedExistingHandle] : [],
        });

        for (const reuseSlot of slotPlan.reuseSlots) {
          const stableHandle = String(reuseSlot?.handle || '').trim();
          if (!stableHandle) continue;
          reusedExistingHandle = stableHandle;
          consumedReuseHandles.add(stableHandle);
          launchStatusMode = 'reused_existing_window';
          launchStatusReasonCode = 'reused_existing_window';
          launchedAppCount += 1;
          if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
            const prev = Array.isArray(appLaunchProgress[appIndex].outcomes)
              ? appLaunchProgress[appIndex].outcomes
              : [];
            appLaunchProgress[appIndex].outcomes = Array.from(new Set([...prev, 'Reused']));
            const tact = executionActions[appTimelineIndexByApp[appIndex]];
            if (tact) {
              appendUniquePill(tact, 'Reused');
              appendSmartDecision(tact, 'Reused existing window');
            }
          }
          publishCurrentLaunchStatus('in-progress');
          launchDiagnostics.decision({
            processHintLc,
            strategy: 'launch-target-mode',
            reason: 'reuse-existing-window-detected',
            handle: reusedExistingHandle,
            preLaunchHandleCount: preLaunchHandleSet.size,
          });
          break;
        }

        if (!reusedExistingHandle && slotPlan.spawnSlots.length > 0) {
          launchStatusMode = 'spawned_new_window';
          launchStatusReasonCode = shouldPreferReuseExisting
            ? 'fallback_to_spawn'
            : 'spawned_new_window';
          if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
            const prev = Array.isArray(appLaunchProgress[appIndex].outcomes)
              ? appLaunchProgress[appIndex].outcomes
              : [];
            appLaunchProgress[appIndex].outcomes = Array.from(new Set([...prev, 'New']));
          }
          if (launchItem.shortcutPath) {
            const openErr = await shell.openPath(launchItem.shortcutPath);
            if (openErr) throw new Error(openErr);
          } else if (launchItem.launchUrl) {
            await shell.openExternal(launchItem.launchUrl);
          } else {
            launchedChild = await launchExecutable(launchItem.executablePath, launchArgs);
          }
          if (isDuplicateProcessLaunch) {
            await sleep(240);
          } else if (launchItem.shortcutPath || launchItem.launchUrl) {
            await sleep(200);
          }
          launchedAppCount += 1;
          if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
            const tact = executionActions[appTimelineIndexByApp[appIndex]];
            if (tact) {
              appendUniquePill(tact, 'New');
              if (shouldPreferReuseExisting) {
                appendSmartDecision(tact, 'Launched new instance');
              }
            }
          }
          publishCurrentLaunchStatus('in-progress');
        }

        let readyGate = reusedExistingHandle
          ? {
            ready: true,
            blocked: false,
            timedOut: false,
            handle: reusedExistingHandle,
          }
          : await waitForMainWindowReadyOrBlocker({
            processHintLc,
            processHints: activeProcessHints,
            expectedBounds: readyGateExpectedBounds,
            timeoutMs: readyGateTimeoutMs,
            pollMs: 260,
            diagnostics: launchDiagnostics,
            listWindows: getVisibleWindowInfos,
            sleep,
            summarizeWindowRows,
            scoreWindowCandidate: (row, hint) => (
              scoreWindowCandidate(row, { chromiumProcessHint: hint })
            ),
            // Quarantine HWNDs that earlier launches in this run already placed so the gate
            // cannot latch onto a previous launch's window (root cause of duplicate-Explorer
            // ending up in the same slot when the second `explorer.exe <path>` reuses the
            // existing top-level window).
            excludeHandles: placedHandlesInRun,
            diagnosticsContext: {
              processHintLc,
              strategy: 'window-ready-gate',
              placementState: placementBounds.state,
            },
          });
        if (!readyGate.ready && !readyGate.blocked) {
          const expandedHints = await buildCompanionProcessHints({
            baseProcessHintLc: processHintLc,
            appNameHint: launchItem.appName,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'window-ready-gate-retry',
              appName: launchItem.appName,
            },
          });
          if (expandedHints.length > initialProcessHints.length) {
            activeProcessHints = expandedHints;
            launchDiagnostics.decision({
              processHintLc,
              strategy: 'window-ready-gate-retry',
              reason: 'retrying-with-expanded-process-hints',
              initialProcessHints,
              expandedProcessHints: expandedHints,
            });
            readyGate = await waitForMainWindowReadyOrBlocker({
              processHintLc,
              processHints: activeProcessHints,
              expectedBounds: readyGateExpectedBounds,
              timeoutMs: Math.max(5000, Math.floor(readyGateTimeoutMs * 0.7)),
              pollMs: 240,
              diagnostics: launchDiagnostics,
              listWindows: getVisibleWindowInfos,
              sleep,
              summarizeWindowRows,
              scoreWindowCandidate: (row, hint) => (
                scoreWindowCandidate(row, { chromiumProcessHint: hint })
              ),
              excludeHandles: placedHandlesInRun,
              diagnosticsContext: {
                processHintLc,
                strategy: 'window-ready-gate-retry',
                placementState: placementBounds.state,
              },
            });
          }
        }
        if (!readyGate.ready && readyGate.blocked && readyGate.blockerKind === 'confirmation') {
          const existingMainHandle = await findStableExistingMainWindowHandle(activeProcessHints);
          if (existingMainHandle) {
            launchDiagnostics.decision({
              processHintLc,
              strategy: 'window-ready-gate',
              reason: 'confirmation-blocker-bypassed-existing-main-window',
              blockerHandle: readyGate.blockerHandle || null,
              existingMainHandle,
              preLaunchHandleCount: preLaunchHandleSet.size,
            });
            readyGate = {
              ready: true,
              blocked: false,
              timedOut: false,
              handle: existingMainHandle,
            };
          }
        }
        if (!readyGate.ready && readyGate.blocked && readyGate.blockerKind === 'confirmation') {
          if (readyGate.blockerHandle && launchItem.monitor) {
            await centerWindowHandleOnMonitor({
              handle: readyGate.blockerHandle,
              monitor: launchItem.monitor,
              processHintLc,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'window-ready-gate',
                reason: 'confirmation-modal-centered',
                placementState: placementBounds.state,
              },
            });
          }
          launchDiagnostics.result({
            processHintLc,
            strategy: 'window-ready-gate',
            reason: 'confirmation-modal-awaiting-user',
            blockerHandle: readyGate.blockerHandle || null,
            timeoutMs: readyGateTimeoutMs,
          });
          const pendingEntry = {
            name: launchItem.appName,
            path: launchItem.executablePath || launchItem.shortcutPath || launchItem.launchUrl || '',
            reason: 'Awaiting user confirmation modal before main window can be placed.',
            mode: launchStatusMode,
            reasonCode: launchStatusReasonCode,
            processHintLc,
            blockerHandle: readyGate.blockerHandle || null,
            status: 'waiting',
          };
          pendingConfirmations.push(pendingEntry);
          if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
            appLaunchProgress[appIndex].step = 'awaiting-confirmation';
            const prev = Array.isArray(appLaunchProgress[appIndex].outcomes)
              ? appLaunchProgress[appIndex].outcomes
              : [];
            appLaunchProgress[appIndex].outcomes = Array.from(new Set([...prev, 'Confirmation']));
          }
          activeUiPhase = 'launching';
          activeUiName = launchItem.appName;
          publishCurrentLaunchStatus('awaiting-confirmations');
          void resumePlacementAfterConfirmationModal({
            processHintLc,
            processHints: activeProcessHints,
            blockedHandles: Array.from(new Set([
              ...(Array.isArray(readyGate?.blockerHandles) ? readyGate.blockerHandles : []),
              String(readyGate?.blockerHandle || '').trim(),
            ].filter(Boolean))),
            launchedPid: launchedChild?.pid || 0,
            placementBounds,
            monitor: launchItem.monitor,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            launchDiagnostics,
            runPlacedHandles: placedHandlesInRun,
            diagnosticsContext: {
              processHintLc,
              strategy: 'post-modal-resume',
              appName: launchItem.appName,
              placementState: placementBounds.state,
            },
          }).then((resumeResult) => {
            if (!isCurrentRunActive()) return;
            const status = String(resumeResult?.status || '').trim().toLowerCase();
            const mappedStatus = (
              status === 'resolved'
                ? 'resolved'
                : status === 'waiting'
                  ? 'waiting'
                  : 'failed'
            );
            pendingEntry.status = mappedStatus;
            if (resumeResult?.handle) pendingEntry.handle = String(resumeResult.handle);
            if (mappedStatus === 'resolved') {
              pendingEntry.resolvedAt = Date.now();
              claimRunPlacementHandle(resumeResult?.handle);
            }
            if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
              const nowTs = Date.now();
              const row = appLaunchProgress[appIndex];
              const tact = executionActions[appTimelineIndexByApp[appIndex]];
              if (mappedStatus === 'resolved') {
                row.step = 'done';
                const prev = Array.isArray(row.outcomes) ? row.outcomes : [];
                row.outcomes = Array.from(new Set([...prev, 'Confirmed']));
                if (tact) {
                  const confirmSub = Array.isArray(tact.substeps)
                    ? tact.substeps.find((s) => s.id === 'sub-confirm')
                    : null;
                  if (confirmSub) {
                    if (!confirmSub.startedAtMs) confirmSub.startedAtMs = nowTs;
                    confirmSub.state = 'completed';
                    confirmSub.endedAtMs = nowTs;
                    confirmSub.label = 'Confirmed';
                  }
                  if (tact.state === 'running' || tact.state === 'queued') {
                    tact.state = 'completed';
                  }
                  if (!tact.endedAtMs) tact.endedAtMs = nowTs;
                }
              } else if (mappedStatus === 'failed') {
                row.step = 'failed';
                const prev = Array.isArray(row.outcomes) ? row.outcomes : [];
                row.outcomes = Array.from(new Set([...prev, 'Confirmation failed']));
                const failReason = (
                  status === 'placement-failed'
                    ? 'Confirmation dialog closed, but placement verification failed.'
                    : 'Confirmation dialog flow ended without a usable main window.'
                );
                if (!failedApps.some(
                  (item) => String(item?.name || '').trim() === String(launchItem.appName || '').trim()
                    && String(item?.path || '').trim() === String(launchItem.executablePath || '').trim(),
                )) {
                  failedApps.push({
                    name: launchItem.appName,
                    path: launchItem.executablePath || launchItem.shortcutPath || launchItem.launchUrl || '',
                    error: failReason,
                    mode: launchStatusMode,
                    reasonCode: launchStatusReasonCode,
                  });
                }
                if (tact) {
                  const confirmSub = Array.isArray(tact.substeps)
                    ? tact.substeps.find((s) => s.id === 'sub-confirm')
                    : null;
                  if (confirmSub) {
                    if (!confirmSub.startedAtMs) confirmSub.startedAtMs = nowTs;
                    confirmSub.state = 'failed';
                    confirmSub.endedAtMs = nowTs;
                    confirmSub.label = 'Confirmation failed';
                  }
                  tact.state = 'failed';
                  tact.failureKind = 'placement';
                  tact.errorMessage = failReason;
                  tact.endedAtMs = nowTs;
                }
              }
            }
            finalizeRunIfPendingConfirmationsSettled();
          }).catch(() => {
            if (!isCurrentRunActive()) return;
            pendingEntry.status = 'failed';
            if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
              const nowTs = Date.now();
              appLaunchProgress[appIndex].step = 'failed';
              const tact = executionActions[appTimelineIndexByApp[appIndex]];
              if (tact) {
                const confirmSub = Array.isArray(tact.substeps)
                  ? tact.substeps.find((s) => s.id === 'sub-confirm')
                  : null;
                if (confirmSub) {
                  if (!confirmSub.startedAtMs) confirmSub.startedAtMs = nowTs;
                  confirmSub.state = 'failed';
                  confirmSub.endedAtMs = nowTs;
                  confirmSub.label = 'Confirmation failed';
                }
                tact.state = 'failed';
                tact.failureKind = 'placement';
                tact.errorMessage = 'Confirmation dialog flow ended without a usable main window.';
                tact.endedAtMs = nowTs;
              }
            }
            finalizeRunIfPendingConfirmationsSettled();
          });
          return;
        }

        let result = { applied: false, handle: null };
        let newHandles = [];

        if (readyGate.ready && readyGate.handle) {
          const readyHandle = String(readyGate.handle || '').trim();
          if (readyHandle) {
            const placementRects = await getWindowPlacementRectsByHandle(readyHandle);
            const measuredRect = placementRects?.visibleRect || placementRects?.outerRect || null;
            const onTargetMonitor = isWindowOnTargetMonitor({
              rect: measuredRect,
              monitor: launchItem.monitor,
              bounds: placementBounds,
            });
            const withinTolerance = isWithinAcceptableStateTolerance({
              actual: measuredRect,
              target: placementBounds,
              onTargetMonitor,
            });
            if (launchStatusMode === 'reused_existing_window') {
              const foregroundHandle = await getForegroundWindowHandle();
              const alreadyForeground = foregroundHandle === readyHandle;
              if (onTargetMonitor && withinTolerance) {
                result = {
                  applied: true,
                  handle: readyHandle,
                  status: alreadyForeground
                    ? 'foreground-within-tolerance'
                    : 'reused-within-tolerance-background',
                };
                launchDiagnostics.decision({
                  processHintLc,
                  strategy: 'window-ready-gate',
                  reason: alreadyForeground
                    ? 'reuse-existing-window-foreground-within-tolerance-skip-placement'
                    : 'reuse-existing-window-background-within-tolerance-skip-placement',
                  handle: readyHandle,
                  placementState: placementBounds.state,
                });
              }
            } else if (
              shouldDelayChromiumMaximize
              && onTargetMonitor
            ) {
              // Chromium delayed-maximize path: if spawned window is already on the target monitor,
              // skip normal-state corrective move/stabilization to avoid visible "window thrash".
              result = {
                applied: true,
                handle: readyHandle,
                status: 'on-target-skip-normal-correction',
              };
              launchDiagnostics.decision({
                processHintLc,
                strategy: 'window-ready-gate',
                reason: 'skip-normal-correction-delayed-chromium-already-on-target',
                handle: readyHandle,
                placementState: placementBounds.state,
              });
            } else if (onTargetMonitor && withinTolerance) {
              // If a newly detected handle is already on target and within tolerance,
              // skip corrective placement to avoid visible resize/move thrash.
              result = {
                applied: true,
                handle: readyHandle,
                status: 'already-within-tolerance',
              };
              launchDiagnostics.decision({
                processHintLc,
                strategy: 'window-ready-gate',
                reason: 'ready-handle-already-within-tolerance-skip-placement',
                handle: readyHandle,
                placementState: placementBounds.state,
              });
            }
          }

          if (!result.applied) {
            signalPlacementPhase();
            launchDiagnostics.attempt({
              processHintLc,
              strategy: 'window-ready-gate',
              reason: 'placing-stable-main-window-handle',
              handle: readyGate.handle,
            });
            result = await moveSpecificWindowHandleToBounds({
              handle: readyGate.handle,
              bounds: placementBounds,
              processHintLc,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
              skipFrameChanged: chromiumNormalSoftPos,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'window-ready-gate-placement',
                placementState: placementBounds.state,
              },
            });
          }
        }

        if (!result.applied && isDuplicateProcessLaunch) {
          signalPlacementPhase();
          const postLaunchWindowInfos = await getVisibleWindowInfos(processHintLc, {
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'duplicate-postlaunch-window-scan',
            },
            expectNonEmpty: true,
          });
          const postLaunchHandles = postLaunchWindowInfos.map((row) => row.handle);
          const preHandleSet = new Set(preLaunchHandles);
          newHandles = postLaunchHandles.filter((h) => (
            !preHandleSet.has(h) && !placedHandlesInRun.has(String(h || '').trim())
          ));
          const newHandleSet = new Set(newHandles);
          let rankedNewWindows = postLaunchWindowInfos
            .filter((row) => newHandleSet.has(row.handle))
            .sort((a, b) => scoreWindowCandidate(b, { chromiumProcessHint: processHintLc })
              - scoreWindowCandidate(a, { chromiumProcessHint: processHintLc }));
          if (isChromiumFamily && rankedNewWindows.some(isChromiumTopLevelWindowRow)) {
            rankedNewWindows = rankedNewWindows.filter(isChromiumTopLevelWindowRow);
          }

          for (const candidateRow of rankedNewWindows) {
            const newHandle = candidateRow.handle;
            if (isChromiumFamily) {
              await waitForWindowResponsive(processHintLc, newHandle, 2200, {
                diagnostics: launchDiagnostics,
                diagnosticsContext: {
                  processHintLc,
                  strategy: 'duplicate-window-wait-responsive',
                  candidateHandle: newHandle,
                },
              });
            }
            launchDiagnostics.attempt({
              processHintLc,
              strategy: 'duplicate-ranked-new-window',
              reason: 'trying-new-window-handle',
              handle: newHandle,
            });
            result = await moveSpecificWindowHandleToBounds({
              handle: newHandle,
              bounds: placementBounds,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
              skipFrameChanged: chromiumNormalSoftPos,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'duplicate-ranked-new-window',
                candidateHandle: newHandle,
              },
            });
            if (result.applied) break;
          }

          launchDiagnostics.result({
            processHintLc,
            strategy: 'duplicate-window-discovery',
            reason: result.applied ? 'duplicate-window-placement-applied' : 'duplicate-window-placement-not-applied',
            preHandles: preLaunchHandles,
            postHandles: postLaunchHandles,
            newHandles,
            rankedNewWindowCandidates: summarizeWindowRows(rankedNewWindows.map((row) => ({
              ...row,
              score: scoreWindowCandidate(row, { chromiumProcessHint: processHintLc }),
            })), 6),
            placedHandle: result.handle,
            applied: result.applied,
          });
        }

        if (!result.applied && isChromiumFamily) {
          signalPlacementPhase();
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'chromium-ranked-windows',
            reason: 'fallback-after-duplicate-path',
          });
          result = await placeChromiumByRankedWindows({
            processHintLc,
            placementBounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              placementState: placementBounds.state,
            },
          });
        }

        if (!result.applied) {
          signalPlacementPhase();
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'move-window-to-bounds',
            reason: 'general-placement-attempt',
            pid: launchedChild?.pid || 0,
          });
          result = await moveWindowToBounds({
            pid: launchedChild?.pid || 0,
            bounds: placementBounds,
            processNameHint,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            preferNameEnumeration: isDuplicateProcessLaunch,
            excludedWindowHandles: excludedHandles,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'move-window-to-bounds-primary',
              placementState: placementBounds.state,
            },
          });
        }

        if (!result.applied) {
          signalPlacementPhase();
          await sleep(240);
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'move-window-to-bounds',
            reason: 'generic-late-window-retry',
            pid: launchedChild?.pid || 0,
          });
          result = await moveWindowToBounds({
            pid: launchedChild?.pid || 0,
            bounds: placementBounds,
            processNameHint,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            preferNameEnumeration: true,
            excludedWindowHandles: excludedHandles,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'move-window-to-bounds-generic-retry',
              placementState: placementBounds.state,
            },
          });
        }

        if (!result.applied) {
          signalPlacementPhase();
          // Only scan the primary launch hint here. Companion hints can pull in unrelated
          // Chromium-class windows (wrong browser) that then win by area in scoring.
          const postLaunchRowsByHint = await Promise.all(
            [processHintLc].map((hint) => getVisibleWindowInfos(hint, {
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'postlaunch-candidate-scan',
                scanHint: hint,
              },
            })),
          );
          const seenCandidateHandles = new Set();
          let lateCandidates = [];
          for (const rows of postLaunchRowsByHint) {
            for (const row of (Array.isArray(rows) ? rows : [])) {
              const handle = String(row?.handle || '').trim();
              if (!handle || seenCandidateHandles.has(handle)) continue;
              // Never recapture a handle a sibling launch already placed in this run.
              if (placedHandlesInRun.has(handle)) continue;
              seenCandidateHandles.add(handle);
              lateCandidates.push(row);
            }
          }
          lateCandidates = lateCandidates
            .filter((row) => row?.enabled && !row?.hung && !row?.cloaked && !row?.tool)
            .filter((row) => String(row?.handle || '').trim())
            .sort((a, b) => (
              scoreWindowCandidate(b, { chromiumProcessHint: processHintLc })
              - scoreWindowCandidate(a, { chromiumProcessHint: processHintLc })
            ));
          if (isChromiumFamily && lateCandidates.some(isChromiumTopLevelWindowRow)) {
            lateCandidates = lateCandidates.filter(isChromiumTopLevelWindowRow);
          }
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'postlaunch-candidate-scan',
            reason: 'late-handle-placement-fallback',
            candidateCount: lateCandidates.length,
          });
          for (const candidateRow of lateCandidates.slice(0, 10)) {
            const candidateHandle = String(candidateRow?.handle || '').trim();
            if (!candidateHandle) continue;
            result = await moveSpecificWindowHandleToBounds({
              handle: candidateHandle,
              bounds: placementBounds,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
              skipFrameChanged: chromiumNormalSoftPos,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'postlaunch-candidate-scan',
                candidateHandle,
                placementState: placementBounds.state,
              },
            });
            if (result.applied) break;
          }
        }

        if (!result.applied && isDuplicateProcessLaunch) {
          signalPlacementPhase();
          await sleep(260);
          launchDiagnostics.attempt({
            processHintLc,
            strategy: 'move-window-to-bounds',
            reason: 'duplicate-retry-with-name-enumeration',
            pid: launchedChild?.pid || 0,
          });
          result = await moveWindowToBounds({
            pid: launchedChild?.pid || 0,
            bounds: placementBounds,
            processNameHint,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            preferNameEnumeration: true,
            excludedWindowHandles: excludedHandles,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'move-window-to-bounds-duplicate-retry',
              placementState: placementBounds.state,
            },
          });
        }

        if (!result.applied && isDuplicateProcessLaunch && newHandles.length > 0) {
          signalPlacementPhase();
          for (const newHandle of newHandles) {
            launchDiagnostics.attempt({
              processHintLc,
              strategy: 'duplicate-known-new-handles',
              reason: 'retry-new-handle-placement',
              handle: newHandle,
            });
            result = await moveSpecificWindowHandleToBounds({
              handle: newHandle,
              bounds: placementBounds,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
              skipFrameChanged: chromiumNormalSoftPos,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'duplicate-known-new-handles',
                candidateHandle: newHandle,
              },
            });
            if (result.applied) break;
          }
        }

        launchDiagnostics.result({
          processHintLc,
          strategy: 'placement-final',
          reason: result.applied ? 'placement-applied' : 'placement-not-applied',
          applied: result.applied,
          handle: result.handle || null,
        });
        if (!result.applied || !result.handle) {
          throw new Error('Window placement was not applied to a launchable handle.');
        }
        claimRunPlacementHandle(result.handle);
        const postPlacementRows = await getVisibleWindowInfos(processHintLc, {
          diagnostics: launchDiagnostics,
          diagnosticsContext: {
            processHintLc,
            strategy: 'launch-window-health',
            reason: 'post-placement-window-scan',
          },
        });
        const pickContentTargetHandle = (rows, fallbackHandle) => {
          if (!Array.isArray(rows) || rows.length === 0) return null;
          if (contentTargetTokens.length === 0) return null;
          const fallback = String(fallbackHandle || '').trim();
          let best = null;
          let bestScore = Number.NEGATIVE_INFINITY;
          for (const row of rows) {
            const handle = String(row?.handle || '').trim();
            if (!handle) continue;
            if (row?.cloaked || row?.hung || row?.tool || !row?.enabled) continue;
            if (row?.hasOwner || row?.topMost) continue;
            if (isLikelyAuxiliaryWindowClass(row?.className)) continue;
            const isMinimized = Boolean(row?.isMinimized);
            if (!isMinimized && !row?.isWindowVisible) continue;
            const titleLc = String(row?.title || '').trim().toLowerCase();
            let tokenHits = 0;
            for (const token of contentTargetTokens) {
              if (token && titleLc.includes(token)) tokenHits += 1;
            }
            let score = tokenHits * 1000;
            if (handle === fallback) score += 20;
            score += Math.min(500, Number(row?.width || 0) * Number(row?.height || 0) / 10000);
            if (score > bestScore) {
              bestScore = score;
              best = handle;
            }
          }
          if (bestScore <= 0) return null;
          return best;
        };
        const preferredContentHandle = pickContentTargetHandle(postPlacementRows, result.handle);
        if (preferredContentHandle && preferredContentHandle !== String(result.handle || '').trim()) {
          const preferredPlacement = await moveSpecificWindowHandleToBounds({
            handle: preferredContentHandle,
            bounds: placementBounds,
            processHintLc,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'content-target-handle-selection',
              reason: 'promoted-content-matching-window',
              previousHandle: String(result.handle || '').trim() || null,
              preferredHandle: preferredContentHandle,
            },
          });
          if (preferredPlacement?.applied) {
            const previousHandle = String(result.handle || '').trim();
            result.handle = String(preferredPlacement.handle || preferredContentHandle).trim();
            if (previousHandle && previousHandle !== result.handle) {
              await minimizeWindowHandle(previousHandle);
            }
            claimRunPlacementHandle(result.handle);
          }
        }
        const placedRow = (Array.isArray(postPlacementRows) ? postPlacementRows : [])
          .find((row) => String(row?.handle || '').trim() === String(result.handle || '').trim());
        if (isLikelyFatalLaunchDialog(placedRow, processHintLc)) {
          launchDiagnostics.failure({
            processHintLc,
            strategy: 'launch-window-health',
            reason: 'fatal-app-error-dialog-detected',
            handle: result.handle,
            className: String(placedRow?.className || '').trim() || null,
            title: String(placedRow?.title || '').trim() || null,
          });
          throw new Error(buildFatalLaunchDialogErrorMessage(processHintLc, placedRow));
        }
        const reusedAlreadyWithinTolerance = (
          launchStatusMode === 'reused_existing_window'
          && (result.status === 'foreground-within-tolerance'
            || result.status === 'reused-within-tolerance-background')
        );
        if (result.applied && result.handle && launchStatusMode === 'reused_existing_window') {
          await bringWindowHandleToFront(result.handle, {
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'reuse-existing-foreground',
              placementState: placementBounds.state,
            },
            maxAttempts: 3,
          });
        }
        if (
          result.applied
          && result.handle
          && launchItem.monitor
          && placementBounds.state === 'normal'
          && !shouldDelayChromiumMaximize
        ) {
          placementRecords.push({
            appName: launchItem.appName,
            processHintLc,
            handle: result.handle,
            bounds: placementBounds,
            monitor: launchItem.monitor,
          });
        }

        if (
          result.applied
          && result.handle
          && launchItem.monitor
          && placementBounds.state === 'normal'
          && !shouldDelayChromiumMaximize
        ) {
          const knownHandleStabilized = await stabilizeKnownHandlePlacement({
            handle: result.handle,
            bounds: placementBounds,
            monitor: launchItem.monitor,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            durationMs: isChromiumFamily ? 1600 : 2200,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'known-handle-stabilization',
              placementState: placementBounds.state,
            },
          });
          launchDiagnostics.result({
            processHintLc,
            strategy: 'known-handle-stabilization',
            reason: knownHandleStabilized.verified
              ? 'known-handle-stabilization-verified'
              : 'known-handle-stabilization-not-verified',
            verified: knownHandleStabilized.verified,
            corrected: knownHandleStabilized.corrected,
            handle: knownHandleStabilized.handle,
          });
        }

        let placementVerified = false;
        let maximizedPlacementVerified = false;
        if (
          result.applied
          && result.handle
          && launchItem.monitor
          && placementBounds.state === 'normal'
          && !shouldDelayChromiumMaximize
        ) {
          if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
            appLaunchProgress[appIndex].step = 'verifying';
            publishCurrentLaunchStatus('in-progress');
          }
          const verification = await verifyAndCorrectWindowPlacement({
            handle: result.handle,
            monitor: launchItem.monitor,
            bounds: placementBounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            maxCorrections: isDuplicateProcessLaunch ? 2 : 3,
            initialCheckDelayMs: isDuplicateProcessLaunch ? 220 : 140,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'placement-verification',
              placementState: placementBounds.state,
            },
          });
          placementVerified = verification.verified;

          launchDiagnostics.result({
            processHintLc,
            strategy: 'placement-verification',
            reason: verification.verified ? 'placement-verified' : 'placement-not-verified',
            handle: result.handle,
            verified: verification.verified,
            corrected: verification.corrected,
          });
        }

        // Chromium often restores a remembered window size after first SetWindowPos; re-assert bounds once.
        if (
          result.applied
          && result.handle
          && isChromiumFamily
          && placementBounds.state === 'normal'
          && !shouldDelayChromiumMaximize
        ) {
          await sleep(260);
          await moveSpecificWindowHandleToBounds({
            handle: result.handle,
            bounds: placementBounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'chromium-normal-soft-reassert',
              candidateHandle: result.handle,
            },
          });
        }

        if (result.applied && result.handle && bounds.state === 'minimized') {
          // Ensure minimized tray apps remain minimized after any placement/verification retries.
          await sleep(80);
          await minimizeWindowHandle(result.handle);
          void ensureMinimizedAfterLaunch({
            handle: result.handle,
            bounds,
            processNameHint,
            pid: launchedChild?.pid || 0,
          });

          // Slow-launch apps may switch from splash HWND to main HWND after first minimize.
          void stabilizePlacementForSlowLaunch({
            processHintLc,
            bounds,
            monitor: launchItem.monitor || null,
            initialHandle: result.handle,
            excludedWindowHandles: preLaunchHandles,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: true,
            durationMs: 7600,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'minimized-stabilization',
              placementState: bounds.state,
            },
          });
        }

        if (
          result.applied
          && placementBounds.state === 'normal'
          && launchItem.monitor
          && !shouldDelayChromiumMaximize
        ) {
          const stabilizationDurationMs = isChromiumFamily ? 2000 : 5600;
          // Some apps resize/reframe after initial launch; keep correcting for a short window.
          const stabilized = await stabilizePlacementForSlowLaunch({
            processHintLc,
            bounds: placementBounds,
            monitor: launchItem.monitor,
            initialHandle: result.handle,
            excludedWindowHandles: preLaunchHandles,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            durationMs: stabilizationDurationMs,
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'normal-stabilization',
              placementState: placementBounds.state,
            },
          });

          launchDiagnostics.result({
            processHintLc,
            strategy: 'placement-stabilization',
            reason: stabilized.verified ? 'stabilization-verified' : 'stabilization-not-verified',
            verified: stabilized.verified,
            handle: stabilized.handle,
          });
          placementVerified = placementVerified || stabilized.verified;
        }

        let skipDelayedChromiumMaximizeStabilization = false;
        if (result.applied && result.handle && shouldDelayChromiumMaximize) {
          const delayedPlacementRects = await getWindowPlacementRectsByHandle(result.handle);
          const delayedPlacementRect = delayedPlacementRects?.visibleRect || delayedPlacementRects?.outerRect || null;
          const onTargetMonitor = isWindowOnTargetMonitor({
            rect: delayedPlacementRect,
            monitor: launchItem.monitor,
            bounds,
          });
          const targetMonitorBounds = (
            process.platform === 'win32' && launchItem.monitor?.workAreaPhysical
              ? launchItem.monitor.workAreaPhysical
              : (launchItem.monitor?.workArea || launchItem.monitor?.bounds || null)
          );
          const containmentSlackPx = 20;
          const rectLeft = Number(delayedPlacementRect?.left || 0);
          const rectTop = Number(delayedPlacementRect?.top || 0);
          const rectRight = rectLeft + Number(delayedPlacementRect?.width || 0);
          const rectBottom = rectTop + Number(delayedPlacementRect?.height || 0);
          const monitorLeft = Number(targetMonitorBounds?.x || 0);
          const monitorTop = Number(targetMonitorBounds?.y || 0);
          const monitorRight = monitorLeft + Number(targetMonitorBounds?.width || 0);
          const monitorBottom = monitorTop + Number(targetMonitorBounds?.height || 0);
          const containedWithinTargetMonitor = Boolean(targetMonitorBounds) && (
            rectLeft >= (monitorLeft - containmentSlackPx)
            && rectTop >= (monitorTop - containmentSlackPx)
            && rectRight <= (monitorRight + containmentSlackPx)
            && rectBottom <= (monitorBottom + containmentSlackPx)
          );
          const targetWidth = Math.max(1, Number(bounds?.width || 0));
          const targetHeight = Math.max(1, Number(bounds?.height || 0));
          const widthRatio = Number(delayedPlacementRect?.width || 0) / targetWidth;
          const heightRatio = Number(delayedPlacementRect?.height || 0) / targetHeight;
          const areaRatio = (
            Math.max(1, Number(delayedPlacementRect?.width || 0) * Number(delayedPlacementRect?.height || 0))
            / Math.max(1, targetWidth * targetHeight)
          );
          const alreadyMaximizedLike = (
            onTargetMonitor
            && containedWithinTargetMonitor
            && areaRatio >= 0.88
            && widthRatio >= 0.9
            && heightRatio >= 0.82
          );
          if (alreadyMaximizedLike) {
            skipDelayedChromiumMaximizeStabilization = true;
            launchDiagnostics.decision({
              processHintLc,
              strategy: 'chromium-delayed-maximize',
              reason: 'skip-maximize-reapply-already-maximized-like',
              handle: result.handle,
            });
          }
        }

        if (
          result.applied
          && result.handle
          && shouldDelayChromiumMaximize
          && !skipDelayedChromiumMaximizeStabilization
        ) {
          await waitForWindowResponsive(processHintLc, result.handle, 2200, {
            diagnostics: launchDiagnostics,
            diagnosticsContext: {
              processHintLc,
              strategy: 'chromium-delayed-maximize-wait',
              candidateHandle: result.handle,
            },
          });
          await maximizeWindowHandle(result.handle);
          launchDiagnostics.result({
            processHintLc,
            strategy: 'chromium-delayed-maximize',
            reason: 'maximize-reapplied-after-normal-stabilization',
            handle: result.handle,
          });
        }

        if (
          result.applied
          && bounds.state === 'maximized'
          && launchItem.monitor
          && !skipDelayedChromiumMaximizeStabilization
          && !reusedAlreadyWithinTolerance
        ) {
          const maximizedStabilizationDurationMs = isChromiumFamily ? 2600 : 1800;
          const stabilizationHints = Array.from(new Set(
            [processHintLc, ...(Array.isArray(activeProcessHints) ? activeProcessHints : [])]
              .map((hint) => String(hint || '').trim().toLowerCase().replace(/\.exe$/i, ''))
              .filter(Boolean),
          ));
          let maximizedStabilized = { verified: false, handle: result.handle };
          for (const hint of stabilizationHints) {
            maximizedStabilized = await stabilizePlacementForSlowLaunch({
              processHintLc: hint,
              bounds,
              monitor: launchItem.monitor,
              initialHandle: maximizedStabilized.handle || result.handle,
              excludedWindowHandles: preLaunchHandles,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
              skipFrameChanged: chromiumNormalSoftPos,
              durationMs: maximizedStabilizationDurationMs,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc: hint,
                strategy: 'maximized-stabilization',
                placementState: bounds.state,
              },
            });
            if (maximizedStabilized.verified) break;
          }
          launchDiagnostics.result({
            processHintLc,
            strategy: 'placement-stabilization-maximized',
            reason: maximizedStabilized.verified
              ? 'maximized-stabilization-verified'
              : 'maximized-stabilization-not-verified',
            verified: maximizedStabilized.verified,
            handle: maximizedStabilized.handle,
          });
          maximizedPlacementVerified = Boolean(maximizedStabilized.verified);
        } else if (
          result.applied
          && bounds.state === 'maximized'
          && launchItem.monitor
          && reusedAlreadyWithinTolerance
        ) {
          launchDiagnostics.decision({
            processHintLc,
            strategy: 'placement-stabilization-maximized',
            reason: 'skip-maximized-stabilization-reused-within-tolerance',
            handle: result.handle || null,
          });
          maximizedPlacementVerified = true;
        }
        if (bounds.state === 'maximized' && skipDelayedChromiumMaximizeStabilization) {
          maximizedPlacementVerified = true;
        }

        const shouldSuppressExtraContentWindows = (
          processHintLc !== 'explorer'
          && profileSpawnArgs.length > 0
          && !launchItem.shortcutPath
          && !launchItem.launchUrl
          && preLaunchHandleSet.size === 0
          && !reusedExistingHandle
          && result.applied
          && result.handle
        );
        if (shouldSuppressExtraContentWindows) {
          const anchorHandle = String(result.handle || '').trim();
          const scanHints = Array.from(new Set(
            [processHintLc, ...(Array.isArray(activeProcessHints) ? activeProcessHints : [])]
              .map((hint) => String(hint || '').trim().toLowerCase().replace(/\.exe$/i, ''))
              .filter(Boolean),
          ));
          const extraHandles = new Set();
          for (const hint of scanHints) {
            const rows = await getVisibleWindowInfos(hint, {
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc: hint,
                strategy: 'content-launch-extra-window-scan',
              },
              includeNonVisible: true,
            });
            for (const row of (Array.isArray(rows) ? rows : [])) {
              const handle = String(row?.handle || '').trim();
              if (!handle || handle === anchorHandle) continue;
              if (row?.cloaked || row?.hung || row?.tool || !row?.enabled) continue;
              if (row?.hasOwner || row?.topMost) continue;
              if (isLikelyAuxiliaryWindowClass(row?.className)) continue;
              const isMinimized = Boolean(row?.isMinimized);
              if (!isMinimized && (Number(row?.width || 0) < 280 || Number(row?.height || 0) < 140)) {
                continue;
              }
              if (!row?.isWindowVisible && !isMinimized) continue;
              extraHandles.add(handle);
            }
          }
          for (const extraHandle of extraHandles) {
            await minimizeWindowHandle(extraHandle);
          }
          if (extraHandles.size > 0) {
            launchDiagnostics.result({
              processHintLc,
              strategy: 'content-launch-extra-window-suppression',
              reason: 'suppressed-extra-windows',
              anchorHandle: anchorHandle || null,
              suppressedHandles: Array.from(extraHandles),
              suppressedCount: extraHandles.size,
            });
          }
        }

        const placementValidated = (
          bounds.state === 'normal'
            ? placementVerified
            : bounds.state === 'maximized'
              ? maximizedPlacementVerified
              : Boolean(result.applied && result.handle)
        );
        if (!placementValidated) {
          const finalPlacementRects = await getWindowPlacementRectsByHandle(result.handle);
          const finalPlacementRect = (
            finalPlacementRects?.visibleRect
            || finalPlacementRects?.outerRect
            || null
          );
          const constrainedPlacementAccepted = isConstrainedPlacementAcceptable({
            finalRect: finalPlacementRect,
            targetBounds: bounds,
            monitor: launchItem.monitor,
            processHintLc,
          });
          if (constrainedPlacementAccepted) {
            launchDiagnostics.result({
              processHintLc,
              strategy: 'placement-verification',
              reason: 'placement-constrained-accepted',
              handle: result.handle,
              finalRect: finalPlacementRect,
              targetBounds: bounds,
            });
            if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
              const prev = Array.isArray(appLaunchProgress[appIndex].outcomes)
                ? appLaunchProgress[appIndex].outcomes
                : [];
              appLaunchProgress[appIndex].outcomes = Array.from(new Set([
                ...prev,
                OUTCOME_CONSTRAINED_PLACEMENT,
              ]));
              const tact = executionActions[appTimelineIndexByApp[appIndex]];
              if (tact) {
                appendUniquePill(tact, 'Constrained');
                appendSmartDecision(
                  tact,
                  CONSTRAINED_PLACEMENT_DECISION_TEXT,
                );
              }
            }
          } else {
          if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
            appLaunchProgress[appIndex].step = 'verifying';
          }
          throw new Error(
            bounds.state === 'maximized'
              ? 'Placed window did not pass maximized stabilization verification.'
              : bounds.state === 'normal'
                ? 'Placed window did not pass placement verification/stabilization.'
                : 'Placed window could not be validated.',
          );
          }
        }

        if (explorerMultiTabSpawn && result.applied && result.handle && launchItem.executablePath) {
          const tactContent = executionActions[appTimelineIndexByApp[appIndex]];
          if (
            tactContent?.contentSubstepMode === 'post-verify'
            && Number.isInteger(appIndex)
            && appLaunchProgress[appIndex]
          ) {
            appLaunchProgress[appIndex].step = 'opening-content';
            publishCurrentLaunchStatus('in-progress');
          }
          if (launchStatusMode === 'reused_existing_window') {
            const firstOpened = await openExplorerPathInWindow({
              handle: result.handle,
              arg: profileSpawnArgs[0],
              newTab: false,
              diagnostics: launchDiagnostics,
            });
            launchDiagnostics.result({
              processHintLc,
              strategy: 'explorer-multi-tab-spawn',
              reason: firstOpened.ok ? 'reused-window-current-tab-navigated' : 'reused-window-current-tab-not-navigated',
              tabIndex: 0,
              argPreview: String(profileSpawnArgs[0] || '').slice(0, 120),
            });
          }
          for (let tabIdx = 1; tabIdx < profileSpawnArgs.length; tabIdx += 1) {
            const extraArg = profileSpawnArgs[tabIdx];
            await sleep(450);
            try {
              const openedInTab = await openExplorerPathInWindow({
                handle: result.handle,
                arg: extraArg,
                newTab: true,
                diagnostics: launchDiagnostics,
              });
              launchDiagnostics.result({
                processHintLc,
                strategy: 'explorer-multi-tab-spawn',
                reason: openedInTab.ok ? 'opened-in-existing-window-tab' : 'explorer-tab-open-failed-no-spawn-fallback',
                tabIndex: tabIdx,
                argPreview: String(extraArg || '').slice(0, 120),
              });
            } catch (err) {
              launchDiagnostics.failure({
                processHintLc,
                strategy: 'explorer-multi-tab-spawn',
                reason: 'sequential-tab-path-open-failed',
                tabIndex: tabIdx,
                error: String(err?.message || err),
              });
            }
          }
          // Opening additional Explorer tabs can trigger shell-driven size/position adjustments.
          // Re-assert placement after tab injection so final bounds match the profile layout.
          const placedHandle = String(result.handle || '').trim();
          if (placedHandle) {
            await sleep(260);
            const reasserted = await moveSpecificWindowHandleToBounds({
              handle: placedHandle,
              bounds: placementBounds,
              aggressiveMaximize,
              positionOnlyBeforeMaximize,
              skipFrameChanged: false,
              diagnostics: launchDiagnostics,
              diagnosticsContext: {
                processHintLc,
                strategy: 'explorer-content-post-place',
                reason: 'reassert-placement-after-tabs',
                tabCount: profileSpawnArgs.length,
              },
            });
            if (reasserted?.applied && reasserted?.handle) {
              result.handle = String(reasserted.handle).trim();
              claimRunPlacementHandle(result.handle);
            }
            if (
              launchItem.monitor
              && (placementBounds.state === 'normal' || placementBounds.state === 'maximized')
              && result.handle
            ) {
              const postContentStabilized = await stabilizeKnownHandlePlacement({
                handle: result.handle,
                bounds: placementBounds,
                monitor: launchItem.monitor,
                aggressiveMaximize,
                positionOnlyBeforeMaximize,
                skipFrameChanged: false,
                durationMs: placementBounds.state === 'maximized' ? 1800 : 2400,
                diagnostics: launchDiagnostics,
                diagnosticsContext: {
                  processHintLc,
                  strategy: 'explorer-content-post-place',
                  reason: 'stabilize-after-tab-open',
                  tabCount: profileSpawnArgs.length,
                },
              });
              launchDiagnostics.result({
                processHintLc,
                strategy: 'explorer-content-post-place',
                reason: postContentStabilized.verified
                  ? 'post-content-stabilization-verified'
                  : 'post-content-stabilization-not-verified',
                verified: postContentStabilized.verified,
                corrected: postContentStabilized.corrected,
                handle: postContentStabilized.handle,
              });
            }
          }
        }
      }
      if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
        appLaunchProgress[appIndex].step = 'done';
        const prev = Array.isArray(appLaunchProgress[appIndex].outcomes)
          ? appLaunchProgress[appIndex].outcomes
          : [];
        // If this path was reuse, the outcome is already set; otherwise record a generic success.
        appLaunchProgress[appIndex].outcomes = Array.from(
          new Set([...prev, ...(prev.includes('Reused') ? [] : ['Placed'])]),
        );
      }
      activeUiPhase = null;
      activeUiName = null;
      publishCurrentLaunchStatus('in-progress');
    } catch (error) {
      launchDiagnostics.failure({
        strategy: 'run-launch',
        reason: 'launch-item-failed',
        error: String(error?.message || error || 'Failed to launch app'),
      });
      failedApps.push({
        name: launchItem.appName,
        path: launchItem.executablePath || launchItem.shortcutPath || launchItem.launchUrl || '',
        error: String(error?.message || error || 'Failed to launch app'),
        mode: launchStatusMode,
        reasonCode: launchStatusReasonCode,
      });
      if (Number.isInteger(appIndex) && appLaunchProgress[appIndex]) {
        const prevStep = appLaunchProgress[appIndex].step;
        let failureKind = 'launch';
        if (prevStep === 'placing') failureKind = 'placement';
        if (prevStep === 'verifying') failureKind = 'verification';
        if (prevStep === 'opening-content') {
          failureKind = 'verification';
        }
        const tact = executionActions[appTimelineIndexByApp[appIndex]];
        if (tact) {
          tact.failureKind = failureKind;
          tact.errorMessage = String(error?.message || error || 'Failed to launch app');
          if (prevStep === 'opening-content') tact.contentOpenFailed = true;
        }
        appLaunchProgress[appIndex].step = 'failed';
      }
      activeUiPhase = null;
      activeUiName = null;
      publishCurrentLaunchStatus('in-progress');
    }
  };

  const hasDuplicateProcessLaunches = Array.from(processHintCounts.values())
    .some((count) => count > 1);
  profileDiagnostics.decision({
    strategy: 'launch-execution-mode',
    reason: requestedLaunchOrder === 'all-at-once'
      ? 'forced-sequential-stability-mode'
      : (hasDuplicateProcessLaunches ? 'forced-sequential-for-duplicates' : 'sequential-mode-selected'),
    requestedLaunchOrder,
    hasDuplicateProcessLaunches,
    executionMode: launchOrder,
  });

  const launchTabEntry = async ({ key, url, label, browser, appInstanceId }) => {
    if (!isCurrentRunActive()) return;
    if (openedTabKeySet.has(key)) return;
    const tIdx = tabUrlToTimelineIndex.get(key);
    const tAct = tIdx != null ? executionActions[tIdx] : null;
    try {
      activeUiPhase = 'tabs';
      activeUiName = label;
      if (tAct) {
        const t0 = Date.now();
        tAct.state = 'running';
        tAct.startedAtMs = t0;
        tAct.substeps[0].state = 'running';
        tAct.substeps[0].startedAtMs = t0;
      }
      publishCurrentLaunchStatus('in-progress');
      let opened = false;
      const preferredInstanceId = String(appInstanceId || '').trim();
      const preferredBrowserCandidates = resolveBrowserNameCandidates(browser);
      let preferredBrowserExe = null;
      for (const candidate of preferredBrowserCandidates) {
        preferredBrowserExe = launchExeByAppName.get(candidate) || null;
        if (preferredBrowserExe) break;
      }
      const hostExe = (
        (preferredInstanceId && launchExeByInstanceId.get(preferredInstanceId))
        || preferredBrowserExe
        || null
      );
      if (hostExe) {
        try {
          await launchExecutable(hostExe, [url]);
          opened = true;
        } catch {
          // fallback to shell below
        }
      }
      if (!opened) {
        await shell.openExternal(url);
      }
      openedTabKeySet.add(key);
      launchedTabCount += 1;
      if (tAct) {
        const t1 = Date.now();
        tAct.substeps[0].state = 'completed';
        tAct.substeps[0].endedAtMs = t1;
        tAct.state = 'completed';
        tAct.endedAtMs = t1;
      }
      publishCurrentLaunchStatus('in-progress');
    } catch {
      // Keep profile launch resilient if one tab URL fails.
    }
  };

  for (let appIndex = 0; appIndex < appLaunches.length; appIndex += 1) {
    const launchItem = appLaunches[appIndex];
    if (!isCurrentRunActive()) break;
    const delaySeconds = Number(appLaunchDelays[launchItem.appName] || 0);
    const safeDelayMs = Math.max(0, Math.floor(delaySeconds * 1000));
    const delayIdx = delayTimelineIndexByApp[appIndex];
    if (delayIdx >= 0) {
      const dAct = executionActions[delayIdx];
      if (safeDelayMs > 0) {
        const t0 = Date.now();
        dAct.state = 'running';
        dAct.startedAtMs = t0;
        dAct.substeps[0].state = 'running';
        dAct.substeps[0].startedAtMs = t0;
        publishCurrentLaunchStatus('in-progress');
        await sleep(safeDelayMs);
        const t1 = Date.now();
        dAct.substeps[0].state = 'completed';
        dAct.substeps[0].endedAtMs = t1;
        dAct.state = 'completed';
        dAct.endedAtMs = t1;
        publishCurrentLaunchStatus('in-progress');
      } else {
        const t1 = Date.now();
        dAct.substeps[0].state = 'completed';
        dAct.substeps[0].endedAtMs = t1;
        dAct.state = 'completed';
        dAct.endedAtMs = t1;
        publishCurrentLaunchStatus('in-progress');
      }
    }
    await runLaunch(launchItem, appIndex);
    const launchInstanceId = String(launchItem?.app?.instanceId || '').trim();
    if (launchInstanceId && tabEntriesByAppInstanceId.has(launchInstanceId)) {
      const linkedTabs = tabEntriesByAppInstanceId.get(launchInstanceId) || [];
      for (const tabEntry of linkedTabs) {
        if (!isCurrentRunActive()) break;
        await launchTabEntry(tabEntry);
      }
    }
  }

  for (const tabEntry of tabUrlList) {
    if (!isCurrentRunActive()) break;
    await launchTabEntry(tabEntry);
  }

  activeUiPhase = null;
  activeUiName = null;
  publishCurrentLaunchStatus('in-progress');

  const statusSnapshot = launchStatusStore.getStatus(normalizedProfileId);
  const wasLaunchCancelled = (
    statusSnapshot
    && String(statusSnapshot.runId || '') === activeRunId
    && String(statusSnapshot.state || '').toLowerCase() === 'cancelled'
  );
  const wasLaunchSuperseded = (
    statusSnapshot
    && String(statusSnapshot.runId || '') !== activeRunId
    && !wasLaunchCancelled
  );
  if (wasLaunchCancelled || wasLaunchSuperseded) {
    profileDiagnostics.result({
      strategy: 'launch-profile',
      reason: wasLaunchCancelled ? 'launch-profile-cancelled' : 'launch-profile-superseded',
      launchedAppCount,
      launchedTabCount,
      failedAppCount: failedApps.length,
      skippedAppCount: skippedApps.length,
      pendingConfirmationCount: pendingConfirmations.length,
      unresolvedPendingConfirmationCount: pendingConfirmations
        .filter((item) => String(item?.status || '').toLowerCase() === 'waiting').length,
      requestedAppCount: appLaunches.length,
    });
    return {
      ok: false,
      cancelled: wasLaunchCancelled,
      superseded: wasLaunchSuperseded,
      runId: activeRunId,
      replacedRunId,
      profile,
      launchedAppCount,
      launchedTabCount,
      failedApps,
      skippedApps,
      pendingConfirmations,
      pendingConfirmationCount: pendingConfirmations.length,
      unresolvedPendingConfirmationCount: pendingConfirmations.filter(
        (item) => String(item?.status || '').toLowerCase() === 'waiting',
      ).length,
      requestedAppCount: appLaunches.length,
      placementRecords,
    };
  }

  if (launchedAppCount === 0 && launchedTabCount === 0) {
    profileDiagnostics.failure({
      strategy: 'launch-profile',
      reason: 'no-launchable-targets',
      launchedAppCount,
      launchedTabCount,
      requestedAppCount: appLaunches.length,
      skippedAppCount: skippedApps.length,
    });
    publishCurrentLaunchStatus('failed');
    launchStatusStore.sealRun(normalizedProfileId, activeRunId, 'failed');
    return {
      ok: false,
      error: 'No launchable apps or tabs found in this profile. Add an executable path in app details or recreate from installed apps.',
      runId: activeRunId,
      replacedRunId,
      profile,
      launchedAppCount,
      launchedTabCount,
      failedApps,
      skippedApps,
      pendingConfirmations,
      requestedAppCount: appLaunches.length,
      placementRecords,
    };
  }

  const unresolvedPendingConfirmations = pendingConfirmations
    .filter((item) => String(item?.status || '').toLowerCase() === 'waiting');
  profileDiagnostics.result({
    strategy: 'launch-profile',
    reason: unresolvedPendingConfirmations.length > 0
      ? 'launch-profile-awaiting-confirmations'
      : (failedApps.length === 0 ? 'launch-profile-complete' : 'launch-profile-complete-with-failures'),
    launchedAppCount,
    launchedTabCount,
    failedAppCount: failedApps.length,
    skippedAppCount: skippedApps.length,
    pendingConfirmationCount: pendingConfirmations.length,
    unresolvedPendingConfirmationCount: unresolvedPendingConfirmations.length,
    requestedAppCount: appLaunches.length,
  });
  publishCurrentLaunchStatus(
    unresolvedPendingConfirmations.length > 0
      ? 'awaiting-confirmations'
      : (failedApps.length === 0 ? 'complete' : 'failed'),
  );
  if (unresolvedPendingConfirmations.length === 0) {
    launchStatusStore.sealRun(
      normalizedProfileId,
      activeRunId,
      failedApps.length === 0 ? 'complete' : 'failed',
    );
  }
  return {
    ok: failedApps.length === 0,
    runId: activeRunId,
    replacedRunId,
    profile,
    launchedAppCount,
    launchedTabCount,
    failedApps,
    skippedApps,
    pendingConfirmations,
    pendingConfirmationCount: pendingConfirmations.length,
    unresolvedPendingConfirmationCount: unresolvedPendingConfirmations.length,
    requestedAppCount: appLaunches.length,
    placementRecords,
  };
};
  return { launchProfileById };
};

module.exports = { createProfileLaunchRunner };
