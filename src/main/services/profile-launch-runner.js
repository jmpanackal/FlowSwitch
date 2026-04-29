'use strict';

/**
 * Profile launch orchestration: post-confirmation resume placement and `launchProfileById`.
 * Dependencies are injected to avoid main.js declaration-order coupling.
 */
const path = require('path');
const { execFile } = require('child_process');
const { hiddenProcessNamePatterns } = require('./windows-process-service');
const { launchIconDataUrlFromProfileApp } = require('../utils/launch-ui-icons');

/** App row outcome: opened via shell only — profile has no saved bounds to place or verify. */
const OUTCOME_EXTERNAL_OPEN_NO_LAYOUT = 'ExternalOpenNoLayout';

const createProfileLaunchRunner = (deps) => {
  const {
    sleep,
    getVisibleWindowInfos,
    scoreWindowCandidate,
    moveSpecificWindowHandleToBounds,
    getWindowPlacementRectsByHandle,
    isWindowOnTargetMonitor,
    waitForMainWindowReadyOrBlocker,
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
  placementBounds,
  monitor,
  aggressiveMaximize = false,
  positionOnlyBeforeMaximize = false,
  skipFrameChanged = false,
  launchDiagnostics,
  diagnosticsContext = {},
}) => {
  const blockedHandleSet = new Set(
    (Array.isArray(blockedHandles) ? blockedHandles : [])
      .map((handle) => String(handle || '').trim())
      .filter(Boolean),
  );
  const blockerPresenceHandleSet = new Set(blockedHandleSet);

  const isMeaningfulRectForBounds = (rect, targetBounds) => {
    if (!rect || !targetBounds) return false;
    const rectWidth = Number(rect.width || 0);
    const rectHeight = Number(rect.height || 0);
    const targetWidth = Math.max(1, Number(targetBounds.width || 0));
    const targetHeight = Math.max(1, Number(targetBounds.height || 0));
    const areaRatio = (rectWidth * rectHeight) / (targetWidth * targetHeight);
    const widthRatio = rectWidth / targetWidth;
    const heightRatio = rectHeight / targetHeight;
    return (
      areaRatio >= 0.38
      && widthRatio >= 0.55
      && heightRatio >= 0.45
      && (widthRatio >= 0.72 || heightRatio >= 0.72)
    );
  };

  const normalizedRootHint = String(processHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  // Many apps host their real main window under a companion process (e.g. Steam's main client
  // runs in `steamwebhelper.exe`, not `steam.exe`). Expanded hints are REQUIRED for enumeration
  // so we can actually see/find the main window. Companion-process auxiliary windows that were
  // visible pre-dismissal are filtered out via the blocked-era quarantine, not via hint scope.
  const normalizedScanHints = Array.from(new Set(
    [processHintLc, ...(Array.isArray(processHints) ? processHints : [])]
      .map((hint) => String(hint || '').trim().toLowerCase().replace(/\.exe$/i, ''))
      .filter(Boolean),
  ));
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

  const placeHandleFirstWithFallback = async (primaryHandle) => {
    const orderedHandles = [];
    const primary = String(primaryHandle || '').trim();
    if (primary && !blockedHandleSet.has(primary)) orderedHandles.push(primary);
    const fallbackRows = await collectResumeCandidates();
    for (const row of fallbackRows) {
      const handle = String(row?.handle || '').trim();
      if (!handle || orderedHandles.includes(handle)) continue;
      orderedHandles.push(handle);
    }
    let lastAttempt = { applied: false, handle: null };
    for (const candidateHandle of orderedHandles) {
      lastAttempt = await moveSpecificWindowHandleToBounds({
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
          handleSource: candidateHandle === primary ? 'ready-gate' : 'fallback-candidate',
        },
      });
      if (lastAttempt.applied) {
        return {
          ...lastAttempt,
          fallbackUsed: candidateHandle !== primary,
        };
      }
    }
    return {
      ...lastAttempt,
      fallbackUsed: orderedHandles.length > 1,
    };
  };

  const settlePostModalMaximizedWinner = async (initialHandle) => {
    const settleDeadline = Date.now() + 2800;
    let stableCount = 0;
    let selectedHandle = String(initialHandle || '').trim() || null;
    while (Date.now() <= settleDeadline) {
      const candidates = await collectResumeCandidates();
      if (candidates.length === 0) {
        stableCount = 0;
        await sleep(220);
        continue;
      }
      const topCandidate = candidates[0];
      const topHandle = String(topCandidate?.handle || '').trim() || null;
      if (!topHandle) {
        stableCount = 0;
        await sleep(220);
        continue;
      }
      if (!selectedHandle || selectedHandle !== topHandle) {
        const reelectAttempt = await moveSpecificWindowHandleToBounds({
          handle: topHandle,
          bounds: placementBounds,
          processHintLc,
          aggressiveMaximize,
          positionOnlyBeforeMaximize,
          skipFrameChanged,
          diagnostics: launchDiagnostics,
          diagnosticsContext: {
            ...diagnosticsContext,
            strategy: 'post-modal-resume-reelect-placement',
            candidateHandle: topHandle,
          },
        });
        if (reelectAttempt.applied) {
          selectedHandle = String(reelectAttempt.handle || topHandle).trim() || topHandle;
          stableCount = 0;
          if (launchDiagnostics) {
            launchDiagnostics.decision({
              ...diagnosticsContext,
              strategy: 'post-modal-resume-reelect',
              reason: 'switched-to-top-candidate',
              handle: selectedHandle,
            });
          }
        }
      }

      const measuredRects = selectedHandle
        ? await getWindowPlacementRectsByHandle(selectedHandle)
        : null;
      const measuredRect = measuredRects?.visibleRect || measuredRects?.outerRect || null;
      const onTarget = isWindowOnTargetMonitor({
        rect: measuredRect,
        monitor,
        bounds: placementBounds,
      });
      const meaningful = isMeaningfulRectForBounds(measuredRect, placementBounds);
      if (selectedHandle && selectedHandle === topHandle && onTarget && meaningful) {
        stableCount += 1;
        if (stableCount >= 2) {
          return {
            verified: true,
            handle: selectedHandle,
          };
        }
      } else {
        stableCount = 0;
      }
      await sleep(220);
    }
    return {
      verified: false,
      handle: selectedHandle,
    };
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
  await sleep(1500);

  // Phase 2: run resume gate with expanded hints for discovery, but still exclude quarantined
  // pre-dismissal handles from eligibility.
  let resumeGate = null;
  while (Date.now() <= resumeDeadline) {
    const remainingMs = Math.max(2200, resumeDeadline - Date.now());
    resumeGate = await waitForMainWindowReadyOrBlocker({
      processHintLc,
      processHints,
      expectedBounds: placementBounds,
      timeoutMs: remainingMs,
      pollMs: 320,
      diagnostics: launchDiagnostics,
      listWindows: getVisibleWindowInfos,
      sleep,
      summarizeWindowRows,
      scoreWindowCandidate: (row, hint) => (
        scoreWindowCandidate(row, { chromiumProcessHint: hint })
      ),
      excludeHandles: blockedHandleSet,
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
    if (resumeGate.ready && resumeGate.handle) break;
    if (resumeGate.blocked && resumeGate.blockerKind === 'confirmation') {
      const blockedEraRows = await collectResumeCandidates([], { includeBlocked: true });
      let quarantinedCount = 0;
      for (const row of blockedEraRows) {
        const handle = String(row?.handle || '').trim();
        if (!handle || blockedHandleSet.has(handle)) continue;
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
  if (!resumeGate.ready || !resumeGate.handle) {
    if (launchDiagnostics) {
      launchDiagnostics.failure({
        ...diagnosticsContext,
        strategy: 'post-modal-resume',
        reason: 'post-modal-main-window-not-ready',
        blocked: Boolean(resumeGate.blocked),
        timedOut: Boolean(resumeGate.timedOut),
      });
    }
    return {
      resolved: false,
      status: (resumeGate.blocked && resumeGate.blockerKind === 'confirmation') ? 'waiting' : 'timeout',
      handle: null,
    };
  }

  const placed = await placeHandleFirstWithFallback(resumeGate.handle);
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
  if (placed.fallbackUsed && launchDiagnostics) {
    launchDiagnostics.decision({
      ...diagnosticsContext,
      strategy: 'post-modal-resume-placement',
      reason: 'handle-first-fallback-applied',
      handle: resolvedHandle,
    });
  }

  if (placementBounds.state === 'normal' && monitor) {
    const verification = await verifyAndCorrectWindowPlacement({
      handle: resolvedHandle,
      monitor,
      bounds: placementBounds,
      aggressiveMaximize,
      positionOnlyBeforeMaximize,
      skipFrameChanged,
      maxCorrections: 2,
      initialCheckDelayMs: 120,
      diagnostics: launchDiagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'post-modal-resume-verification',
      },
    });
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
      return {
        resolved: false,
        status: 'placement-failed',
        handle: resolvedHandle,
      };
    }
  }

  if (placementBounds.state === 'maximized' && monitor) {
    // Surface intermediate statuses for fullscreen/maximized apps too.
    // Stabilize across the same expanded hint set used for enumeration. Companion-process
    // windows that were pre-dismissal (splash/overlay/friends/chooser) are already excluded
    // from candidate pools by the blocked-era quarantine, so the hint scope is safe here.
    let stabilized = { verified: false, handle: resolvedHandle };
    for (const hint of normalizedScanHints) {
      stabilized = await stabilizePlacementForSlowLaunch({
        processHintLc: hint,
        bounds: placementBounds,
        monitor,
        initialHandle: stabilized.handle || resolvedHandle,
        excludedWindowHandles: Array.from(blockedHandleSet),
        aggressiveMaximize,
        positionOnlyBeforeMaximize,
        skipFrameChanged,
        durationMs: 2200,
        diagnostics: launchDiagnostics,
        diagnosticsContext: {
          ...diagnosticsContext,
          processHintLc: hint,
          strategy: 'post-modal-resume-stabilize',
        },
      });
      if (stabilized.verified) break;
    }
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

    const settledWinner = await settlePostModalMaximizedWinner(
      stabilized.handle || resolvedHandle,
    );
    if (launchDiagnostics) {
      launchDiagnostics.result({
        ...diagnosticsContext,
        strategy: 'post-modal-resume',
        reason: settledWinner.verified
          ? 'post-modal-maximized-winner-verified'
          : 'post-modal-maximized-winner-not-verified',
        verified: Boolean(settledWinner.verified),
        handle: settledWinner.handle || stabilized.handle || resolvedHandle,
      });
    }
    if (!settledWinner.verified) {
      return {
        resolved: false,
        status: 'placement-failed',
        handle: settledWinner.handle || stabilized.handle || resolvedHandle,
      };
    }
    finalResolvedHandle = settledWinner.handle || stabilized.handle || resolvedHandle;
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
  const tabUrlDedupeForCount = new Set();
  const countUniqueTabUrl = (rawUrl) => {
    const u = normalizeSafeUrl(rawUrl);
    if (!u || tabUrlDedupeForCount.has(u)) return;
    tabUrlDedupeForCount.add(u);
  };
  for (const tab of (Array.isArray(profile?.browserTabs) ? profile.browserTabs : [])) {
    countUniqueTabUrl(tab?.url);
  }
  for (const raw of legacyLaunchData.browserUrls || []) {
    countUniqueTabUrl(raw);
  }
  const requestedBrowserTabCount = tabUrlDedupeForCount.size;

  /** Ordered browser tabs (profile + legacy), deduped by normalized URL. */
  const tabUrlList = [];
  const tabUrlSeen = new Set();
  const pushTabEntry = (raw) => {
    const u = normalizeSafeUrl(raw);
    if (!u || tabUrlSeen.has(u)) return;
    tabUrlSeen.add(u);
    let label = u;
    try {
      label = new URL(u).hostname || u;
    } catch {
      label = u;
    }
    tabUrlList.push({ url: u, label });
  };
  for (const tab of (Array.isArray(profile?.browserTabs) ? profile.browserTabs : [])) {
    pushTabEntry(tab?.url);
  }
  for (const raw of legacyLaunchData.browserUrls || []) {
    pushTabEntry(raw);
  }

  const tabActionIdForUrl = (url) => {
    let h = 2166136261;
    for (let i = 0; i < url.length; i += 1) {
      h ^= url.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return `tab:${(h >>> 0).toString(36)}`;
  };

  const makeAppSubsteps = () => ([
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
    {
      id: 'sub-confirm',
      label: 'Waiting for confirmation',
      state: 'queued',
      startedAtMs: null,
      endedAtMs: null,
    },
  ]);

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
    executionActions.push({
      id: `app:${row.key}`,
      kind: 'app',
      title: row.name,
      targetLocation: targetLocationRaw || null,
      state: 'queued',
      iconDataUrl: row.iconDataUrl,
      pills: null,
      smartDecisions: null,
      errorMessage: null,
      failureKind: null,
      startedAtMs: null,
      endedAtMs: null,
      substeps: makeAppSubsteps(),
    });
    executionTimelineWrite += 1;
  }

  const tabUrlToTimelineIndex = new Map();
  for (const { url, label } of tabUrlList) {
    tabUrlToTimelineIndex.set(url, executionActions.length);
    executionActions.push({
      id: tabActionIdForUrl(url),
      kind: 'tab',
      title: label,
      targetLocation: 'Browser',
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
    const setSubs = (triples) => {
      for (const [id, st] of triples) {
        const s = sl(id);
        if (s) s.state = st;
      }
    };
    if (step === 'pending') {
      action.state = 'queued';
      setSubs([
        ['sub-launch', 'queued'],
        ['sub-place', 'queued'],
        ['sub-verify', 'queued'],
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'launching') {
      action.state = 'running';
      setSubs([
        ['sub-launch', 'running'],
        ['sub-place', 'queued'],
        ['sub-verify', 'queued'],
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'placing') {
      action.state = 'running';
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'running'],
        ['sub-verify', 'queued'],
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'verifying') {
      action.state = 'running';
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'completed'],
        ['sub-verify', 'running'],
        ['sub-confirm', 'queued'],
      ]);
    } else if (step === 'awaiting-confirmation') {
      action.state = 'running';
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'completed'],
        ['sub-verify', 'completed'],
        ['sub-confirm', 'running'],
      ]);
    } else if (step === 'done') {
      const externalNoLayout = Array.isArray(row.outcomes)
        && row.outcomes.some((o) => String(o || '').trim() === OUTCOME_EXTERNAL_OPEN_NO_LAYOUT);
      if (externalNoLayout) {
        action.state = 'warning';
        appendSmartDecision(
          action,
          'No saved window slot — the OS opened the app or link; FlowSwitch did not place or verify a window. Add this app to a monitor in the profile for full launch control.',
        );
      } else {
        action.state = 'completed';
      }
      setSubs([
        ['sub-launch', 'completed'],
        ['sub-place', 'completed'],
        ['sub-verify', 'completed'],
        ['sub-confirm', 'completed'],
      ]);
      const confirmSub = sl('sub-confirm');
      if (confirmSub) confirmSub.label = externalNoLayout ? 'Not applicable' : 'Confirmed';
    } else if (step === 'failed') {
      action.state = 'failed';
      const fk = action.failureKind || 'launch';
      if (fk === 'placement') {
        setSubs([
          ['sub-launch', 'completed'],
          ['sub-place', 'failed'],
          ['sub-verify', 'queued'],
          ['sub-confirm', 'queued'],
        ]);
      } else if (fk === 'verification') {
        setSubs([
          ['sub-launch', 'completed'],
          ['sub-place', 'completed'],
          ['sub-verify', 'failed'],
          ['sub-confirm', 'queued'],
        ]);
      } else {
        setSubs([
          ['sub-launch', 'failed'],
          ['sub-place', 'queued'],
          ['sub-verify', 'queued'],
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
  profileDiagnostics.start({
    strategy: 'launch-profile',
    reason: 'launch-profile-requested',
    latestRunLogFile,
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
      const launchArgs = (isChromiumFamily && isDuplicateProcessLaunch && launchItem.executablePath)
        ? ['--new-window']
        : [];
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
        const excludedHandles = preLaunchHandles;
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
                // Allow minimized pre-existing handles here: warm-attach placement will restore and
                // re-anchor them. Rejecting minimized rows prevented reuse_existing for already-running
                // apps (OBS/Chrome) and forced unnecessary relaunch/confirmation flows.
                if (row?.cloaked || row?.hung || row?.tool || !row?.enabled) continue;
                if (row?.hasOwner || row?.topMost) continue;
                if (isLikelyAuxiliaryWindowClass(row?.className)) continue;
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
              appendSmartDecision(tact, 'Reusing existing window');
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
                appendSmartDecision(tact, 'Launched new instance after reuse check');
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
            placementBounds,
            monitor: launchItem.monitor,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged: chromiumNormalSoftPos,
            launchDiagnostics,
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
            }
            publishCurrentLaunchStatus('awaiting-confirmations');
          }).catch(() => {
            if (!isCurrentRunActive()) return;
            pendingEntry.status = 'failed';
            publishCurrentLaunchStatus('awaiting-confirmations');
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
          newHandles = postLaunchHandles.filter((h) => !preHandleSet.has(h));
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
        const tact = executionActions[appTimelineIndexByApp[appIndex]];
        if (tact) {
          tact.failureKind = failureKind;
          tact.errorMessage = String(error?.message || error || 'Failed to launch app');
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
  }

  for (const { url, label } of tabUrlList) {
    if (!isCurrentRunActive()) break;
    const tIdx = tabUrlToTimelineIndex.get(url);
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
      await shell.openExternal(url);
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
        .filter((item) => String(item?.status || '').toLowerCase() !== 'resolved').length,
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
        (item) => String(item?.status || '').toLowerCase() !== 'resolved',
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
    .filter((item) => String(item?.status || '').toLowerCase() !== 'resolved');
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
