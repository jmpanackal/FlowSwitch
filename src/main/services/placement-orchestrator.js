const { isChromiumFamilyProcessKey } = require('./window-candidate-classifier');
const { isWindowOnTargetMonitor } = require('./monitor-map');

/**
 * Target alignment for the visible window frame (DWM extended frame bounds) against the snap
 * zone. Windows' own snap aligns the visible edge, not the outer window rect, so we converge the
 * visible rect to within a few pixels to make adjacent windows and screen edges look seamless.
 */
const NORMAL_FLUSH_TOLERANCE_PX = 3;

/**
 * Looser, app-aware tolerance used only as a final fallback after exact-flush corrections are
 * exhausted. This avoids reporting false placement failures for apps that quantize their own
 * size (e.g. Explorer, some Qt apps) while still attempting exact flush first.
 */
const getVerificationFallbackTolerancePx = (processHintLc) => {
  const key = String(processHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  if (key === 'explorer') return 24;
  if (isChromiumFamilyProcessKey(key)) return 14;
  return 20;
};

/**
 * Explorer often ignores exact client size; accept placement when the window substantially
 * covers the requested slot on the target monitor.
 */
const explorerLoosePlacementAccepts = ({ visibleRect, bounds, monitor, processHintLc }) => {
  const key = String(processHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  if (key !== 'explorer') return false;
  if (!visibleRect || !bounds || bounds.state !== 'normal' || !monitor) return false;
  if (!isWindowOnTargetMonitor({ rect: visibleRect, monitor })) return false;
  const bx = Number(bounds.left || 0);
  const by = Number(bounds.top || 0);
  const bw = Math.max(0, Number(bounds.width || 0));
  const bh = Math.max(0, Number(bounds.height || 0));
  const vx = Number(visibleRect.left || 0);
  const vy = Number(visibleRect.top || 0);
  const vw = Math.max(0, Number(visibleRect.width || 0));
  const vh = Math.max(0, Number(visibleRect.height || 0));
  const desiredArea = bw * bh;
  if (desiredArea <= 0) return false;
  const ix1 = Math.max(bx, vx);
  const iy1 = Math.max(by, vy);
  const ix2 = Math.min(bx + bw, vx + vw);
  const iy2 = Math.min(by + bh, vy + vh);
  if (ix2 <= ix1 || iy2 <= iy1) return false;
  const intersectionArea = (ix2 - ix1) * (iy2 - iy1);
  return (intersectionArea / desiredArea) >= 0.28;
};

const isRectCloseToTargetBounds = (rect, bounds, tolerancePx = 6) => {
  if (!rect || !bounds) return false;
  if (bounds.state !== 'normal') return true;
  const tol = Math.max(0, Number(tolerancePx || 0));
  const dl = Math.abs(Number(rect.left || 0) - Number(bounds.left || 0));
  const dt = Math.abs(Number(rect.top || 0) - Number(bounds.top || 0));
  const dw = Math.abs(Number(rect.width || 0) - Number(bounds.width || 0));
  const dh = Math.abs(Number(rect.height || 0) - Number(bounds.height || 0));
  return dl <= tol && dt <= tol && dw <= tol && dh <= tol;
};

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * When a window's visible frame exceeds the requested zone by more than this in either axis,
 * the app is treated as having a minimum size larger than the zone. Like native Windows snap
 * (which honors WM_GETMINMAXINFO), we stop trying to shrink it and anchor it to the zone instead.
 */
const SIZE_CONSTRAINT_THRESHOLD_PX = 24;

/** Per-edge invisible-border insets between the outer window rect and the visible (DWM) frame. */
const computeFrameInsets = (outerRect, visibleRect) => {
  if (!outerRect || !visibleRect) return { left: 0, top: 0, right: 0, bottom: 0 };
  const outerRight = Number(outerRect.left || 0) + Number(outerRect.width || 0);
  const outerBottom = Number(outerRect.top || 0) + Number(outerRect.height || 0);
  const visibleRight = Number(visibleRect.left || 0) + Number(visibleRect.width || 0);
  const visibleBottom = Number(visibleRect.top || 0) + Number(visibleRect.height || 0);
  return {
    left: Math.max(0, Number(visibleRect.left || 0) - Number(outerRect.left || 0)),
    top: Math.max(0, Number(visibleRect.top || 0) - Number(outerRect.top || 0)),
    right: Math.max(0, outerRight - visibleRight),
    bottom: Math.max(0, outerBottom - visibleBottom),
  };
};

/**
 * Decide how to correct a normal-state window toward its zone:
 * - `flush`: already aligned within tolerance.
 * - `size-constrained`: visible frame is materially larger than the zone (min-size app) — anchor,
 *   don't keep resizing (prevents the feedback loop from oscillating against a clamped window).
 * - `fine-tune`: small residual — apply one inset/error correction.
 */
const classifyNormalCorrection = ({
  visibleRect,
  targetBounds,
  flushTolerancePx,
  sizeConstraintThresholdPx = SIZE_CONSTRAINT_THRESHOLD_PX,
}) => {
  if (!visibleRect || !targetBounds) return 'fine-tune';
  if (isRectCloseToTargetBounds(visibleRect, targetBounds, flushTolerancePx)) return 'flush';
  const widthExcess = Number(visibleRect.width || 0) - Number(targetBounds.width || 0);
  const heightExcess = Number(visibleRect.height || 0) - Number(targetBounds.height || 0);
  if (widthExcess > sizeConstraintThresholdPx || heightExcess > sizeConstraintThresholdPx) {
    return 'size-constrained';
  }
  return 'fine-tune';
};

/**
 * Outer bounds that keep the window's current size but anchor its visible top-left to the zone's
 * top-left, clamped so the visible frame stays on the target monitor's work area when possible.
 * Mirrors how Windows snaps a window whose minimum size exceeds the zone.
 */
const computeZoneAnchoredOuterBounds = ({ visibleRect, outerRect, targetBounds, monitorTarget }) => {
  const insets = computeFrameInsets(outerRect, visibleRect);
  const outerWidth = Math.max(1, Number(outerRect?.width || 0));
  const outerHeight = Math.max(1, Number(outerRect?.height || 0));
  let visibleLeft = Number(targetBounds.left || 0);
  let visibleTop = Number(targetBounds.top || 0);
  if (monitorTarget) {
    const workLeft = Number(monitorTarget.x || 0);
    const workTop = Number(monitorTarget.y || 0);
    const workRight = workLeft + Math.max(0, Number(monitorTarget.width || 0));
    const workBottom = workTop + Math.max(0, Number(monitorTarget.height || 0));
    const visibleWidth = Math.max(1, outerWidth - insets.left - insets.right);
    const visibleHeight = Math.max(1, outerHeight - insets.top - insets.bottom);
    visibleLeft = clampValue(visibleLeft, workLeft, Math.max(workLeft, workRight - visibleWidth));
    visibleTop = clampValue(visibleTop, workTop, Math.max(workTop, workBottom - visibleHeight));
  }
  return {
    left: Math.round(visibleLeft - insets.left),
    top: Math.round(visibleTop - insets.top),
    width: Math.round(outerWidth),
    height: Math.round(outerHeight),
    state: 'normal',
  };
};

const createVerifyAndCorrectWindowPlacement = (deps) => {
  const {
    sleep,
    clamp,
    moveSpecificWindowHandleToBounds,
    getWindowPlacementRectsByHandle,
    getWindowClassNameByHandle,
    describeBoundsDelta,
    describeMonitor,
  } = deps;

  return async ({
    handle,
    monitor,
    bounds,
    aggressiveMaximize = false,
    positionOnlyBeforeMaximize = false,
    skipFrameChanged = false,
    maxCorrections = 3,
    initialCheckDelayMs = 0,
    diagnostics = null,
    diagnosticsContext = {},
  }) => {
    const safeHandle = String(handle || '').trim();
    const processHintLc = String(diagnosticsContext?.processHintLc || '').trim().toLowerCase();
    if (!safeHandle || !monitor || !bounds) {
      return { verified: false, corrected: false };
    }

    if (initialCheckDelayMs > 0) {
      await sleep(initialCheckDelayMs);
    }

    const target = (
      process.platform === 'win32' && monitor.workAreaPhysical
        ? monitor.workAreaPhysical
        : (monitor.workArea || monitor.bounds || null)
    );
    const desiredVisibleBounds = { ...bounds };
    const isNormalState = String(desiredVisibleBounds.state || 'normal').toLowerCase() === 'normal';
    let correctedOuterBounds = { ...bounds };
    let lastOuterRect = null;
    let lastVisibleRect = null;
    // Primary goal: drive the visible frame flush to the snap zone. The looser per-app tolerance
    // is only consulted on the final attempt so cooperating apps converge to exact alignment.
    const flushTolerancePx = isNormalState ? NORMAL_FLUSH_TOLERANCE_PX : 0;
    const fallbackTolerancePx = getVerificationFallbackTolerancePx(processHintLc);
    const windowClassName = await getWindowClassNameByHandle(safeHandle);
    // Once an app proves it cannot shrink to the zone (minimum size larger than the zone), we stop
    // commanding new sizes and only anchor its position — exactly what native Windows snap does.
    let sizeConstrained = false;
    for (let attempt = 0; attempt <= maxCorrections; attempt += 1) {
      const placementRects = await getWindowPlacementRectsByHandle(safeHandle);
      const outerRect = placementRects?.outerRect || null;
      const visibleRect = placementRects?.visibleRect || outerRect;
      lastOuterRect = outerRect;
      lastVisibleRect = visibleRect;
      const onTargetMonitor = isWindowOnTargetMonitor({
        rect: visibleRect,
        monitor,
        bounds: desiredVisibleBounds,
      });
      const isFlush = isRectCloseToTargetBounds(
        visibleRect,
        desiredVisibleBounds,
        flushTolerancePx,
      );
      if (onTargetMonitor && isFlush) {
        return { verified: true, corrected: attempt > 0 };
      }
      // A size-constrained window is fully placed once its top-left is anchored to the zone; the
      // remaining (size) delta is unavoidable, so hand off to constrained acceptance rather than
      // burning more correction passes oscillating against the app's minimum size.
      if (sizeConstrained && onTargetMonitor) {
        const anchored = isRectCloseToTargetBounds(
          { ...visibleRect, width: desiredVisibleBounds.width, height: desiredVisibleBounds.height },
          desiredVisibleBounds,
          fallbackTolerancePx,
        );
        if (anchored) break;
      }
      const isFinalAttempt = attempt >= maxCorrections;
      if (isFinalAttempt) {
        // Corrections exhausted: accept windows that are on target and acceptably close (or that
        // legitimately cannot match the requested client size) instead of reporting a false failure.
        const looselyClose = isRectCloseToTargetBounds(
          visibleRect,
          desiredVisibleBounds,
          fallbackTolerancePx,
        );
        if (
          onTargetMonitor
          && (
            looselyClose
            || explorerLoosePlacementAccepts({
              visibleRect,
              bounds: desiredVisibleBounds,
              monitor,
              processHintLc,
            })
          )
        ) {
          return { verified: true, corrected: true };
        }
        break;
      }

      if (outerRect && visibleRect && isNormalState) {
        const classification = sizeConstrained
          ? 'size-constrained'
          : classifyNormalCorrection({
            visibleRect,
            targetBounds: desiredVisibleBounds,
            flushTolerancePx,
          });
        if (classification === 'size-constrained') {
          // Keep the window's own (minimum) size; only anchor its visible top-left to the zone.
          sizeConstrained = true;
          correctedOuterBounds = computeZoneAnchoredOuterBounds({
            visibleRect,
            outerRect,
            targetBounds: desiredVisibleBounds,
            monitorTarget: target,
          });
        } else {
          // Fine-tune: compensate the measured invisible-border insets plus residual visible error
          // so a cooperating window lands flush. Clamped to a small overflow around the target.
          const insets = computeFrameInsets(outerRect, visibleRect);
          const baseOuterLeft = Number(desiredVisibleBounds.left || 0) - insets.left;
          const baseOuterTop = Number(desiredVisibleBounds.top || 0) - insets.top;
          const baseOuterWidth = Number(desiredVisibleBounds.width || 0) + insets.left + insets.right;
          const baseOuterHeight = Number(desiredVisibleBounds.height || 0) + insets.top + insets.bottom;
          const visibleLeftError = Number(desiredVisibleBounds.left || 0) - Number(visibleRect.left || 0);
          const visibleTopError = Number(desiredVisibleBounds.top || 0) - Number(visibleRect.top || 0);
          const visibleWidthError = Number(desiredVisibleBounds.width || 0) - Number(visibleRect.width || 0);
          const visibleHeightError = Number(desiredVisibleBounds.height || 0) - Number(visibleRect.height || 0);
          const correctedLeft = baseOuterLeft + visibleLeftError;
          const correctedTop = baseOuterTop + visibleTopError;
          const correctedWidth = baseOuterWidth + visibleWidthError;
          const correctedHeight = baseOuterHeight + visibleHeightError;

          const minWidth = 120;
          const minHeight = 120;
          const frameOverflowAllowance = 40;
          const maxWidth = target
            ? Number((target.width || correctedWidth) + insets.left + insets.right + (frameOverflowAllowance * 2))
            : Number(correctedWidth);
          const maxHeight = target
            ? Number((target.height || correctedHeight) + insets.top + insets.bottom + (frameOverflowAllowance * 2))
            : Number(correctedHeight);
          const nextWidth = clamp(Math.round(correctedWidth), minWidth, Math.max(minWidth, Math.round(maxWidth)));
          const nextHeight = clamp(Math.round(correctedHeight), minHeight, Math.max(minHeight, Math.round(maxHeight)));
          const minLeft = target
            ? Number((target.x || 0) - insets.left - frameOverflowAllowance)
            : Number(correctedLeft);
          const minTop = target
            ? Number((target.y || 0) - insets.top - frameOverflowAllowance)
            : Number(correctedTop);
          const maxLeft = target
            ? Number(target.x || 0) + Number(target.width || 0) + insets.right + frameOverflowAllowance - nextWidth
            : Number(correctedLeft);
          const maxTop = target
            ? Number(target.y || 0) + Number(target.height || 0) + insets.bottom + frameOverflowAllowance - nextHeight
            : Number(correctedTop);

          correctedOuterBounds = {
            ...correctedOuterBounds,
            left: clamp(Math.round(correctedLeft), Math.round(minLeft), Math.round(Math.max(minLeft, maxLeft))),
            top: clamp(Math.round(correctedTop), Math.round(minTop), Math.round(Math.max(minTop, maxTop))),
            width: nextWidth,
            height: nextHeight,
          };
        }
      }

      await moveSpecificWindowHandleToBounds({
        handle: safeHandle,
        bounds: correctedOuterBounds,
        processHintLc,
        aggressiveMaximize,
        positionOnlyBeforeMaximize,
        skipFrameChanged,
        frameCompensationMode: 'none',
        diagnostics,
        diagnosticsContext: {
          ...diagnosticsContext,
          strategy: 'verify-and-correct-placement',
          attemptIndex: attempt + 1,
          correctionMode: sizeConstrained ? 'anchor-size-constrained' : 'fine-tune',
        },
      });
      await sleep(90);
    }
    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        strategy: 'verify-and-correct-placement',
        reason: sizeConstrained ? 'minimum-size-larger-than-zone' : 'verification-failed',
        handle: safeHandle,
        className: windowClassName || null,
        sizeConstrained,
        actualRect: lastVisibleRect || lastOuterRect || null,
        actualOuterRect: lastOuterRect || null,
        actualVisibleRect: lastVisibleRect || null,
        targetBounds: desiredVisibleBounds || null,
        attemptedOuterBounds: correctedOuterBounds || null,
        delta: describeBoundsDelta(lastVisibleRect || lastOuterRect, desiredVisibleBounds),
        monitor: describeMonitor(monitor),
      });
    }
    return { verified: false, corrected: true, sizeConstrained };
  };
};

module.exports = {
  createVerifyAndCorrectWindowPlacement,
  isRectCloseToTargetBounds,
  classifyNormalCorrection,
  computeFrameInsets,
  computeZoneAnchoredOuterBounds,
  SIZE_CONSTRAINT_THRESHOLD_PX,
  explorerLoosePlacementAccepts,
};
