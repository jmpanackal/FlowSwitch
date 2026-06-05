'use strict';

const { isLikelyModalBlockerWindow } = require('./window-ready-gate');

const normalizeProcessHint = (hint) => (
  String(hint || '').trim().toLowerCase().replace(/\.exe$/i, '')
);

/**
 * Find the best main-window candidate while a confirmation modal is open.
 * @param {object} deps
 * @param {{
 *   processHintLc: string,
 *   processHints?: string[],
 *   placementBounds: object,
 *   excludeHandles?: string[],
 *   getVisibleWindowInfos: Function,
 *   scoreWindowCandidate: Function,
 *   isLikelyMainPlacementWindowIgnoringBlocker: Function,
 * }} params
 * @returns {Promise<{ handle: string | null, row: object | null }>}
 */
const findMainWindowDuringBlocker = async (params) => {
  const {
    processHintLc,
    processHints = [],
    placementBounds,
    excludeHandles = [],
    getVisibleWindowInfos,
    scoreWindowCandidate,
    isLikelyMainPlacementWindowIgnoringBlocker,
    launchDiagnostics = null,
    diagnosticsContext = {},
  } = params;

  const exclude = new Set(
    (Array.isArray(excludeHandles) ? excludeHandles : [])
      .map((handle) => String(handle || '').trim())
      .filter(Boolean),
  );
  const hints = Array.from(new Set(
    [processHintLc, ...(Array.isArray(processHints) ? processHints : [])]
      .map(normalizeProcessHint)
      .filter(Boolean),
  ));
  if (hints.length === 0) return { handle: null, row: null };

  let bestStrictRow = null;
  let bestStrictScore = Number.NEGATIVE_INFINITY;
  let bestRelaxedRow = null;
  let bestRelaxedScore = Number.NEGATIVE_INFINITY;
  const seen = new Set();
  let scannedCount = 0;

  for (const hint of hints) {
    const rows = await getVisibleWindowInfos(hint, {
      expectNonEmpty: false,
    });
    for (const row of (Array.isArray(rows) ? rows : [])) {
      scannedCount += 1;
      const handle = String(row?.handle || '').trim();
      if (!handle || seen.has(handle) || exclude.has(handle)) continue;
      seen.add(handle);
      if (row?.tool || row?.cloaked || row?.hung || !row?.enabled || row?.isMinimized) continue;
      if (String(row?.className || '').trim().toLowerCase() === '#32770') continue;
      if (isLikelyModalBlockerWindow(row, placementBounds)) continue;
      const score = Number(scoreWindowCandidate(row, { chromiumProcessHint: processHintLc }) || 0);
      const area = Number(row?.width || 0) * Number(row?.height || 0);
      const strictMatch = isLikelyMainPlacementWindowIgnoringBlocker(row, placementBounds);
      if (strictMatch && score > bestStrictScore) {
        bestStrictScore = score;
        bestStrictRow = row;
      }
      // Fallback path for apps like Audacity where the main window is present but fails strict
      // readiness heuristics while a modal is still attached.
      const relaxedEligible = (
        Number(row?.width || 0) >= 360
        && Number(row?.height || 0) >= 220
      );
      const relaxedScore = score + (area * 0.01);
      if (relaxedEligible && relaxedScore > bestRelaxedScore) {
        bestRelaxedScore = relaxedScore;
        bestRelaxedRow = row;
      }
    }
  }

  const selectedRow = bestStrictRow || bestRelaxedRow || null;
  const handle = String(selectedRow?.handle || '').trim() || null;
  if (launchDiagnostics) {
    launchDiagnostics.decision({
      ...diagnosticsContext,
      strategy: 'confirmation-main-preplace',
      reason: handle
        ? (bestStrictRow ? 'selected-strict-main-window-candidate' : 'selected-relaxed-main-window-candidate')
        : 'no-main-window-candidate-during-confirmation',
      selectedHandle: handle,
      scannedCount,
      strictCandidateHandle: String(bestStrictRow?.handle || '').trim() || null,
      relaxedCandidateHandle: String(bestRelaxedRow?.handle || '').trim() || null,
    });
  }
  return { handle, row: selectedRow };
};

/**
 * Place the real main window to profile bounds while a confirmation modal is still open.
 * @param {object} params
 * @returns {Promise<{ applied: boolean, handle: string | null }>}
 */
const attemptMainWindowPlacementDuringBlocker = async (params) => {
  const {
    processHintLc,
    processHints = [],
    placementBounds,
    excludeHandles = [],
    getVisibleWindowInfos,
    scoreWindowCandidate,
    isLikelyMainPlacementWindowIgnoringBlocker,
    moveSpecificWindowHandleToBounds,
    aggressiveMaximize = false,
    positionOnlyBeforeMaximize = false,
    skipFrameChanged = false,
    launchDiagnostics = null,
    diagnosticsContext = {},
  } = params;

  const { handle } = await findMainWindowDuringBlocker({
    processHintLc,
    processHints,
    placementBounds,
    excludeHandles,
    getVisibleWindowInfos,
    scoreWindowCandidate,
    isLikelyMainPlacementWindowIgnoringBlocker,
    launchDiagnostics,
    diagnosticsContext,
  });
  if (!handle) return { applied: false, handle: null };

  const placed = await moveSpecificWindowHandleToBounds({
    handle,
    bounds: placementBounds,
    processHintLc,
    aggressiveMaximize,
    positionOnlyBeforeMaximize,
    skipFrameChanged,
    diagnostics: launchDiagnostics,
    diagnosticsContext: {
      ...diagnosticsContext,
      strategy: 'confirmation-main-preplace',
      candidateHandle: handle,
    },
  });
  if (launchDiagnostics && placed?.applied) {
    launchDiagnostics.decision({
      ...diagnosticsContext,
      strategy: 'confirmation-main-preplace',
      reason: 'main-window-placed-behind-confirmation-modal',
      handle,
    });
  }
  return {
    applied: Boolean(placed?.applied),
    handle: String(placed?.handle || handle || '').trim() || null,
  };
};

module.exports = {
  findMainWindowDuringBlocker,
  attemptMainWindowPlacementDuringBlocker,
};
