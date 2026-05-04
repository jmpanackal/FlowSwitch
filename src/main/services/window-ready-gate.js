const MODAL_DIALOG_CLASSES = new Set(['#32770']);
const LOADING_TITLE_PATTERNS = [
  /loading/i,
  /starting/i,
  /launching/i,
  /please wait/i,
  /updating/i,
  /initializing/i,
  /connecting/i,
];
const CONFIRMATION_TITLE_PATTERNS = [
  /confirm/i,
  /are you sure/i,
  /already running/i,
  /open another/i,
  /choose/i,
  /select/i,
  /sign in/i,
  /login/i,
  /account/i,
  /warning/i,
  /crash/i,
  /error/i,
  /exception/i,
  /fatal/i,
  /critical/i,
  /abort/i,
  /terminate/i,
  /exit/i,
  /shutdown/i,
];

const isLikelyInteractiveChooserBlocker = (row, expectedBounds = null) => {
  if (!row || row.cloaked || row.hung || !row.enabled || row.tool || row.isMinimized) return false;
  const titleLength = Number(row.titleLength || 0);
  const className = String(row.className || '').toLowerCase();
  const title = String(row.title || '').trim();
  const expectedWidth = Math.max(1, Number(expectedBounds?.width || 0));
  const expectedHeight = Math.max(1, Number(expectedBounds?.height || 0));
  const expectedArea = expectedWidth * expectedHeight;
  const width = Math.max(1, Number(row.width || 0));
  const height = Math.max(1, Number(row.height || 0));
  const area = width * height;
  const expectsMaximized = String(expectedBounds?.state || '').toLowerCase() === 'maximized';
  if (!expectsMaximized) return false;
  // Generic chooser heuristic: interactive titled window significantly smaller than
  // a known-maximized target, large enough to be a real dialog (not tooltip/splash).
  const significantlySmaller = (
    width <= Math.floor(expectedWidth * 0.82)
    && height <= Math.floor(expectedHeight * 0.82)
    && area <= Math.floor(expectedArea * 0.72)
  );
  const plausibleChooserSize = area >= 55_000 && width >= 280 && height >= 140;
  const loadingByTitle = LOADING_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  const confirmationByTitle = CONFIRMATION_TITLE_PATTERNS.some((pattern) => pattern.test(title));
  const modalClass = MODAL_DIALOG_CLASSES.has(className);
  const genericInteractiveClass = /dialog|bootstrap|chooser|account|login|signin|ui/.test(className);
  const interactiveSignal = (
    (titleLength > 0 && confirmationByTitle)
    || Boolean(row.hasOwner)
    || Boolean(row.topMost)
    || modalClass
    || genericInteractiveClass
  );
  return significantlySmaller && plausibleChooserSize && interactiveSignal && !loadingByTitle;
};

const isLikelyModalBlockerWindow = (row, expectedBounds = null) => {
  if (!row || row.cloaked || row.hung || !row.enabled || row.isMinimized) return false;
  // Tool windows are never interactive modals. They are typically toasts, notifications,
  // tooltips, tray balloons, or small transient overlays that do not block the main window
  // and require no user interaction. Treating them as blockers would indefinitely stall the
  // resume gate (Steam emits small SDL_app tool windows post-confirmation which were
  // previously latched onto as fake "confirmation" blockers).
  if (row.tool) return false;
  const className = String(row.className || '').toLowerCase();
  const titleLength = Number(row.titleLength || 0);
  const hasOwner = Boolean(row.hasOwner);
  const topMost = Boolean(row.topMost);
  const width = Number(row.width || 0);
  const height = Number(row.height || 0);
  const expectedWidth = Math.max(1, Number(expectedBounds?.width || 0));
  const expectedHeight = Math.max(1, Number(expectedBounds?.height || 0));
  const clearlySmallerThanTarget = (
    expectedWidth > 0
    && expectedHeight > 0
    && width <= Math.floor(expectedWidth * 0.78)
    && height <= Math.floor(expectedHeight * 0.78)
  );
  if (MODAL_DIALOG_CLASSES.has(className)) return true;
  if (hasOwner && titleLength > 0 && clearlySmallerThanTarget) return true;
  if (topMost && hasOwner && titleLength > 0) return true;
  if (isLikelyInteractiveChooserBlocker(row, expectedBounds)) return true;
  return false;
};

const isLikelyMainPlacementWindow = (row, expectedBounds = null) => {
  if (!row || row.cloaked || row.hung || row.tool || !row.enabled || row.isMinimized) return false;
  if (isLikelyModalBlockerWindow(row, expectedBounds)) return false;
  return isLikelyMainPlacementWindowIgnoringBlocker(row, expectedBounds);
};

/**
 * Modal signals that must disqualify a post-dismissal *main* candidate. Narrower than
 * `isLikelyModalBlockerWindow`: we omit `hasOwner && smallerThanTarget`, which matches many
 * legitimate mains (e.g. wxWidgets) behind a snap rect and caused endless confirmation waits.
 */
const isLikelyPostModalResumeModalBlocker = (row, expectedBounds = null) => {
  if (!row || row.cloaked || row.hung || !row.enabled || row.isMinimized) return false;
  if (row.tool) return false;
  const className = String(row.className || '').toLowerCase();
  if (MODAL_DIALOG_CLASSES.has(className)) return true;
  if (isLikelyInteractiveChooserBlocker(row, expectedBounds)) return true;
  const titleLength = Number(row.titleLength || 0);
  const hasOwner = Boolean(row.hasOwner);
  const topMost = Boolean(row.topMost);
  if (topMost && hasOwner && titleLength > 0) return true;
  return false;
};

const getPostModalResumeCandidateRejectionReasons = (row, expectedBounds = null) => {
  if (!row) return ['missing-row'];
  const reasons = [];
  if (row.cloaked) reasons.push('cloaked');
  if (row.hung) reasons.push('hung');
  if (row.tool) reasons.push('tool-window');
  if (!row.enabled) reasons.push('disabled');
  if (row.isMinimized) reasons.push('minimized');
  if (reasons.length > 0) return reasons;
  if (isLikelyPostModalResumeModalBlocker(row, expectedBounds)) {
    reasons.push('modal-like');
    return reasons;
  }

  if (String(expectedBounds?.state || '').toLowerCase() === 'maximized') {
    if (!isLikelyMainPlacementWindowIgnoringBlocker(row, expectedBounds)) {
      reasons.push('maximized-size-mismatch');
    }
    return reasons;
  }

  const ew = Math.max(1, Number(expectedBounds?.width || 0));
  const eh = Math.max(1, Number(expectedBounds?.height || 0));
  const expectedArea = ew * eh;
  const expectedAspect = ew / Math.max(1, eh);
  const w = Number(row.width || 0);
  const h = Number(row.height || 0);
  const minW = Math.max(360, Math.floor(ew * 0.32));
  const minH = Math.max(220, Math.floor(eh * 0.24));
  if (w < minW) reasons.push('too-narrow');
  if (h < minH) reasons.push('too-short');

  const area = Math.max(0, w * h);
  const minArea = Math.max(220_000, Math.floor(expectedArea * 0.19));
  if (area < minArea) reasons.push('area-too-small');

  const aspect = w / Math.max(1, h);
  const minAspect = Math.max(0.82, expectedAspect * 0.72);
  const maxAspect = Math.min(3.2, expectedAspect * 2.1);
  if (aspect < minAspect) reasons.push('portrait-companion-shape');
  if (aspect > maxAspect) reasons.push('ultrawide-mismatch');
  return reasons;
};

/**
 * After a confirmation dialog closes, the real main window may still be smaller than the
 * profile snap rect (e.g. Audacity default ~800×600 vs a 1441×1250 tile). The strict 52% rule
 * would never mark it "ready" and post-modal resume times out (`main-window-timeout`).
 */
const isLikelyPostModalResumeMainWindowCandidate = (row, expectedBounds = null) => {
  return getPostModalResumeCandidateRejectionReasons(row, expectedBounds).length === 0;
};

const scorePostModalResumeCandidate = (
  row,
  expectedBounds,
  scoreWindowCandidate,
  processHint = '',
) => {
  const baseScore = Number(scoreWindowCandidate(row, processHint) || 0);
  const ew = Math.max(1, Number(expectedBounds?.width || 0));
  const eh = Math.max(1, Number(expectedBounds?.height || 0));
  const expectedAspect = ew / Math.max(1, eh);
  const w = Math.max(1, Number(row?.width || 0));
  const h = Math.max(1, Number(row?.height || 0));
  const widthRatio = w / ew;
  const heightRatio = h / eh;
  const aspect = w / h;
  const aspectDelta = Math.abs(aspect - expectedAspect);
  const sizeBalanceDelta = Math.abs(widthRatio - heightRatio);
  let score = baseScore;

  score += Math.max(0, 1 - Math.min(1.5, aspectDelta)) * 1_600_000;
  score += Math.max(0, 1 - Math.min(1, sizeBalanceDelta)) * 900_000;
  score += Math.min(1.1, widthRatio) * 450_000;
  score += Math.min(1.1, heightRatio) * 450_000;
  score += Math.min(30, Number(row?.titleLength || 0)) * 18_000;

  if (aspect < Math.max(0.82, expectedAspect * 0.72)) score -= 2_200_000;
  if (aspect > Math.min(3.2, expectedAspect * 2.1)) score -= 1_200_000;
  return score;
};

const isLikelyMainPlacementWindowIgnoringBlocker = (row, expectedBounds = null) => {
  if (!row || row.cloaked || row.hung || row.tool || !row.enabled || row.isMinimized) return false;
  const width = Number(row.width || 0);
  const height = Number(row.height || 0);
  const expectsMaximized = String(expectedBounds?.state || '').toLowerCase() === 'maximized';
  if (expectsMaximized) {
    const hasOwner = Boolean(row?.hasOwner);
    const topMost = Boolean(row?.topMost);
    if (hasOwner || topMost) return false;
    const expectedWidth = Math.max(1, Number(expectedBounds?.width || 0));
    const expectedHeight = Math.max(1, Number(expectedBounds?.height || 0));
    const expectedArea = expectedWidth * expectedHeight;
    const area = Math.max(1, width * height);
    const widthRatio = width / expectedWidth;
    const heightRatio = height / expectedHeight;
    const areaRatio = area / expectedArea;
    return (
      widthRatio >= 0.55
      && heightRatio >= 0.45
      && areaRatio >= 0.38
      && (widthRatio >= 0.72 || heightRatio >= 0.72)
    );
  }
  const sizeRatio = 0.52;
  const minExpectedWidth = Math.max(320, Math.floor(Number(expectedBounds?.width || 0) * sizeRatio));
  const minExpectedHeight = Math.max(220, Math.floor(Number(expectedBounds?.height || 0) * sizeRatio));
  return width >= minExpectedWidth && height >= minExpectedHeight;
};

const compareCandidateRows = (a, b, scoreWindowCandidate, processHint = '') => {
  const scoreA = Number(scoreWindowCandidate(a, processHint) || 0);
  const scoreB = Number(scoreWindowCandidate(b, processHint) || 0);
  if (scoreA !== scoreB) return scoreB - scoreA;
  const areaA = Number(a?.area || (Number(a?.width || 0) * Number(a?.height || 0)));
  const areaB = Number(b?.area || (Number(b?.width || 0) * Number(b?.height || 0)));
  if (areaA !== areaB) return areaB - areaA;
  const titleA = Number(a?.titleLength || 0);
  const titleB = Number(b?.titleLength || 0);
  if (titleA !== titleB) return titleB - titleA;
  return String(a?.handle || '').localeCompare(String(b?.handle || ''));
};

const sortCandidateRows = (rows, scoreWindowCandidate, processHint = '') => (
  [...rows].sort((a, b) => compareCandidateRows(a, b, scoreWindowCandidate, processHint))
);

const AMBIGUITY_SCORE_DELTA = 0.06;
const MAX_AMBIGUITY_HOLDS = 3;

const getTopCandidateAmbiguity = (candidates, scoreWindowCandidate, processHint = '') => {
  if (!Array.isArray(candidates) || candidates.length < 2) {
    return { ambiguous: false, delta: Number.POSITIVE_INFINITY, topScore: null, secondScore: null };
  }
  const topScore = Number(scoreWindowCandidate(candidates[0], processHint) || 0);
  const secondScore = Number(scoreWindowCandidate(candidates[1], processHint) || 0);
  if (!Number.isFinite(topScore) || !Number.isFinite(secondScore)) {
    return { ambiguous: false, delta: Number.POSITIVE_INFINITY, topScore, secondScore };
  }
  const delta = Math.abs(topScore - secondScore);
  return {
    ambiguous: delta <= AMBIGUITY_SCORE_DELTA,
    delta,
    topScore,
    secondScore,
  };
};

const waitForMainWindowReadyOrBlocker = async ({
  processHintLc,
  processHints = [],
  expectedBounds = null,
  timeoutMs = 30000,
  pollMs = 260,
  diagnostics = null,
  diagnosticsContext = {},
  listWindows,
  sleep,
  summarizeWindowRows,
  scoreWindowCandidate,
  excludeHandles = null,
  onAmbiguousCandidates = null,
  onPoll = null,
  /** When true (post-confirmation resume), allow smaller top-level windows vs `expectedBounds`. */
  postModalResumeSizing = false,
}) => {
  const safeProcess = String(processHintLc || '').trim().toLowerCase();
  const normalizedHints = Array.from(
    new Set(
      [safeProcess, ...(Array.isArray(processHints) ? processHints : [])]
        .map((hint) => String(hint || '').trim().toLowerCase().replace(/\.exe$/i, ''))
        .filter(Boolean),
    ),
  );
  if (normalizedHints.length === 0) return { ready: false, timedOut: false, blocked: false, handle: null };
  // Normalize the quarantine/exclude set once. Any handle in this set is filtered out of both
  // candidate-for-ready and modal-blocker detection on every poll - used by the post-modal
  // resume flow to prevent pre-dismissal (blocked-era) windows from being selected.
  const excludedSet = (() => {
    if (!excludeHandles) return null;
    const iterable = excludeHandles instanceof Set
      ? Array.from(excludeHandles)
      : (Array.isArray(excludeHandles) ? excludeHandles : []);
    const set = new Set(iterable.map((h) => String(h || '').trim()).filter(Boolean));
    return set.size > 0 ? set : null;
  })();
  const deadline = Date.now() + Math.max(2000, Number(timeoutMs || 0));
  let blockerReported = false;
  let lastBlockerKind = null;
  let blockerFirstSeenAt = 0;
  let lastBlockerHandle = null;
  let blockerStableCount = 0;
  let stableHandle = null;
  let stableCount = 0;
  let lastRows = [];
  let ambiguityHoldCount = 0;
  let pollCount = 0;
  const candidateProcessHint = safeProcess || normalizedHints[0];

  while (Date.now() <= deadline) {
    pollCount += 1;
    const windowsByHint = await Promise.all(
      normalizedHints.map((hint) => (
        listWindows(hint, {
          diagnostics,
          diagnosticsContext: {
            ...diagnosticsContext,
            strategy: 'window-ready-gate-scan',
            processHintLc: hint,
          },
        })
      )),
    );
    const rows = [];
    const seenHandles = new Set();
    for (const hintRows of windowsByHint) {
      for (const row of (Array.isArray(hintRows) ? hintRows : [])) {
        const handle = String(row?.handle || '').trim();
        if (!handle || seenHandles.has(handle)) continue;
        if (excludedSet && excludedSet.has(handle)) continue;
        seenHandles.add(handle);
        rows.push(row);
      }
    }

    const strictCandidates = sortCandidateRows(
      rows.filter((row) => isLikelyMainPlacementWindow(row, expectedBounds)),
      scoreWindowCandidate,
      candidateProcessHint,
    );
    const relaxedCandidates = sortCandidateRows(
      rows.filter((row) => isLikelyMainPlacementWindowIgnoringBlocker(row, expectedBounds)),
      scoreWindowCandidate,
      candidateProcessHint,
    );
    const postModalLooseCandidates = postModalResumeSizing
      ? [...rows.filter((row) => isLikelyPostModalResumeMainWindowCandidate(row, expectedBounds))]
        .sort((a, b) => (
          scorePostModalResumeCandidate(b, expectedBounds, scoreWindowCandidate, candidateProcessHint)
          - scorePostModalResumeCandidate(a, expectedBounds, scoreWindowCandidate, candidateProcessHint)
        ))
      : [];
    const candidateHandleSet = new Set(
      [...relaxedCandidates, ...postModalLooseCandidates]
        .map((row) => String(row?.handle || '').trim())
        .filter(Boolean),
    );
    lastRows = rows;
    const blockers = rows.filter((row) => isLikelyModalBlockerWindow(row, expectedBounds));
    const blockingOnlyRows = blockers.filter((row) => (
      !candidateHandleSet.has(String(row?.handle || '').trim())
    ));
    if (typeof onPoll === 'function') {
      onPoll({
        pollIndex: pollCount,
        rows: rows.slice(0, 8).map((row) => {
          const handle = String(row?.handle || '').trim();
          return {
            handle,
            className: String(row?.className || ''),
            rect: {
              width: Number(row?.width || 0),
              height: Number(row?.height || 0),
            },
            hasOwner: Boolean(row?.hasOwner),
            topMost: Boolean(row?.topMost),
            score: postModalResumeSizing
              ? scorePostModalResumeCandidate(row, expectedBounds, scoreWindowCandidate, candidateProcessHint)
              : Number(scoreWindowCandidate(row, candidateProcessHint) || 0),
            acceptedAs: [
              strictCandidates.some((candidate) => String(candidate?.handle || '').trim() === handle) ? 'strict' : null,
              relaxedCandidates.some((candidate) => String(candidate?.handle || '').trim() === handle) ? 'relaxed' : null,
              postModalLooseCandidates.some((candidate) => String(candidate?.handle || '').trim() === handle) ? 'post-modal' : null,
              blockers.some((candidate) => String(candidate?.handle || '').trim() === handle) ? 'blocker' : null,
            ].filter(Boolean),
            rejectionReasons: postModalResumeSizing
              ? getPostModalResumeCandidateRejectionReasons(row, expectedBounds)
              : [],
          };
        }),
      });
    }
    if (blockingOnlyRows.length > 0) {
      const rankedBlockers = [...blockingOnlyRows].sort((a, b) => Number(b.area || 0) - Number(a.area || 0));
      const blocker = rankedBlockers[0];
      const blockerHandle = String(blocker?.handle || '').trim() || null;
      const blockerTitle = String(blocker?.title || '').trim();
      const loadingByTitle = LOADING_TITLE_PATTERNS.some((pattern) => pattern.test(blockerTitle));
      const loadingByGenericShape = (
        Number(blocker?.titleLength || 0) === 0
        && Boolean(blocker?.hasOwner)
        && Number(blocker?.width || 0) < Math.floor(Number(expectedBounds?.width || 0) * 0.9)
      );
      const isLikelyLoadingModal = loadingByTitle || loadingByGenericShape;
      lastBlockerKind = isLikelyLoadingModal ? 'loading' : 'confirmation';
      if (!blockerFirstSeenAt) blockerFirstSeenAt = Date.now();
      if (blockerHandle && blockerHandle === lastBlockerHandle) {
        blockerStableCount += 1;
      } else {
        blockerStableCount = 1;
        lastBlockerHandle = blockerHandle;
      }

      if (!blockerReported && diagnostics) {
        diagnostics.decision({
          ...diagnosticsContext,
          strategy: 'launch-blocker-detected',
          reason: 'modal-window-blocking-placement',
          processHintLc: safeProcess || normalizedHints[0],
          processHints: normalizedHints,
          blockerCount: blockingOnlyRows.length,
          blockerSample: summarizeWindowRows(blockingOnlyRows, 3),
          blockerKind: isLikelyLoadingModal ? 'loading' : 'confirmation',
        });
        blockerReported = true;
      }
      const blockerVisibleMs = Date.now() - blockerFirstSeenAt;
      if (!isLikelyLoadingModal && blockerStableCount >= 2 && blockerVisibleMs >= 900) {
        const blockerHandles = blockingOnlyRows
          .map((row) => String(row?.handle || '').trim())
          .filter(Boolean);
        return {
          ready: false,
          timedOut: false,
          blocked: true,
          blockerKind: 'confirmation',
          blockerHandle,
          blockerHandles,
          blockerSample: summarizeWindowRows(blockingOnlyRows, 3),
          handle: null,
        };
      }
      stableHandle = null;
      stableCount = 0;
      await sleep(pollMs);
      continue;
    }

    blockerFirstSeenAt = 0;
    lastBlockerHandle = null;
    blockerStableCount = 0;
    let candidates = (blockers.length > 0 && blockingOnlyRows.length === 0)
      ? relaxedCandidates
      : strictCandidates;
    if (
      candidates.length === 0
      && postModalResumeSizing
      && postModalLooseCandidates.length > 0
    ) {
      candidates = postModalLooseCandidates;
    }
    if (candidates.length === 0) {
      stableHandle = null;
      stableCount = 0;
      await sleep(pollMs);
      continue;
    }

    const topCandidate = candidates[0];
    const ambiguityScore = postModalResumeSizing && candidates === postModalLooseCandidates
      ? ((row, hint) => scorePostModalResumeCandidate(row, expectedBounds, scoreWindowCandidate, hint))
      : scoreWindowCandidate;
    const ambiguity = getTopCandidateAmbiguity(candidates, ambiguityScore, candidateProcessHint);
    if (ambiguity.ambiguous && ambiguityHoldCount < MAX_AMBIGUITY_HOLDS) {
      ambiguityHoldCount += 1;
      stableHandle = null;
      stableCount = 0;
      if (typeof onAmbiguousCandidates === 'function') {
        onAmbiguousCandidates({
          ...ambiguity,
          holdCount: ambiguityHoldCount,
          holdLimit: MAX_AMBIGUITY_HOLDS,
          candidateSample: summarizeWindowRows(candidates, 2),
        });
      }
      await sleep(pollMs);
      continue;
    }
    if (!ambiguity.ambiguous) ambiguityHoldCount = 0;

    if (stableHandle && stableHandle === topCandidate.handle) {
      stableCount += 1;
    } else {
      stableHandle = topCandidate.handle;
      stableCount = 1;
    }

    if (stableCount >= 2) {
      return {
        ready: true,
        timedOut: false,
        blocked: false,
        handle: stableHandle,
        candidateSample: summarizeWindowRows(candidates, 3),
      };
    }
    await sleep(pollMs);
  }

  const timeoutPlausibleMainRows = sortCandidateRows(
    lastRows.filter((row) => (
      isLikelyMainPlacementWindowIgnoringBlocker(row, expectedBounds)
      || (postModalResumeSizing && isLikelyPostModalResumeMainWindowCandidate(row, expectedBounds))
    )),
    scoreWindowCandidate,
    candidateProcessHint,
  );
  const timeoutInteractiveRows = lastRows.filter((row) => isLikelyModalBlockerWindow(row, expectedBounds));
  const blockedByTimeoutInteractive = (
    timeoutInteractiveRows.length > 0
    && timeoutPlausibleMainRows.length === 0
  );
  if (diagnostics) {
    if (!blockerReported && blockedByTimeoutInteractive) {
      diagnostics.decision({
        ...diagnosticsContext,
        strategy: 'launch-blocker-detected',
        reason: 'timeout-interactive-window-blocking-placement',
        processHintLc: safeProcess || normalizedHints[0],
        processHints: normalizedHints,
        blockerCount: timeoutInteractiveRows.length,
        blockerSample: summarizeWindowRows(timeoutInteractiveRows, 3),
        blockerKind: 'confirmation',
      });
      blockerReported = true;
      lastBlockerKind = 'confirmation';
    }
    diagnostics.failure({
      ...diagnosticsContext,
      strategy: 'window-ready-gate',
      reason: blockerReported ? 'modal-blocker-timeout' : 'main-window-timeout',
      processHintLc: safeProcess || normalizedHints[0],
      processHints: normalizedHints,
      timeoutMs: Math.max(2000, Number(timeoutMs || 0)),
    });
  }
  return {
    ready: false,
    timedOut: true,
    blocked: blockerReported || blockedByTimeoutInteractive,
    blockerKind: (blockerReported || blockedByTimeoutInteractive) ? (lastBlockerKind || 'confirmation') : null,
    blockerHandles: blockedByTimeoutInteractive
      ? timeoutInteractiveRows.map((row) => String(row?.handle || '').trim()).filter(Boolean)
      : [],
    handle: null,
  };
};

module.exports = {
  compareCandidateRows,
  isLikelyModalBlockerWindow,
  isLikelyMainPlacementWindow,
  isLikelyMainPlacementWindowIgnoringBlocker,
  isLikelyPostModalResumeMainWindowCandidate,
  sortCandidateRows,
  waitForMainWindowReadyOrBlocker,
};
