const { isChromiumFamilyProcessKey } = require('./window-candidate-classifier');
const { isWindowOnTargetMonitor } = require('./monitor-map');

const WINDOW_CLASS_RESIDUAL_POLICIES = {
  chrome_widgetwin_1: { left: 8, top: 0, width: -16, height: -8 },
  /** Win11 File Explorer: DWM visible client vs outer frame differs from requested DIP bounds. */
  cabinetwclass: { left: 8, top: 0, width: -16, height: -8 },
};

const normalizePlacementClassKey = (value) => String(value || '').trim().toLowerCase();

const getClassResidualCalibration = (className) => {
  const key = normalizePlacementClassKey(className);
  if (!key) return null;
  const policy = WINDOW_CLASS_RESIDUAL_POLICIES[key];
  if (!policy) return null;
  return {
    left: Number(policy.left || 0),
    top: Number(policy.top || 0),
    width: Number(policy.width || 0),
    height: Number(policy.height || 0),
    source: 'class-policy',
  };
};

const getVerificationTolerancePx = (processHintLc) => {
  const key = String(processHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  if (isChromiumFamilyProcessKey(key)) return 6;
  if (key === 'explorer') return 18;
  return 5;
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
    maxCorrections = 2,
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
    let correctedOuterBounds = { ...bounds };
    let lastOuterRect = null;
    let lastVisibleRect = null;
    const verificationTolerancePx = getVerificationTolerancePx(processHintLc);
    const windowClassName = await getWindowClassNameByHandle(safeHandle);
    for (let attempt = 0; attempt <= maxCorrections; attempt += 1) {
      const placementRects = await getWindowPlacementRectsByHandle(safeHandle);
      const outerRect = placementRects?.outerRect || null;
      const visibleRect = placementRects?.visibleRect || outerRect;
      lastOuterRect = outerRect;
      lastVisibleRect = visibleRect;
      const calibration = (
        desiredVisibleBounds.state === 'normal'
          ? getClassResidualCalibration(windowClassName)
          : null
      );
      const correctionTargetBounds = calibration
        ? {
          ...desiredVisibleBounds,
          left: Number(desiredVisibleBounds.left || 0) - Number(calibration.left || 0),
          top: Number(desiredVisibleBounds.top || 0) - Number(calibration.top || 0),
          width: Math.max(120, Number(desiredVisibleBounds.width || 0) - Number(calibration.width || 0)),
          height: Math.max(120, Number(desiredVisibleBounds.height || 0) - Number(calibration.height || 0)),
        }
        : desiredVisibleBounds;
      const onTargetMonitor = isWindowOnTargetMonitor({
        rect: visibleRect,
        monitor,
        bounds: desiredVisibleBounds,
      });
      const closeToTargetBounds = isRectCloseToTargetBounds(
        visibleRect,
        desiredVisibleBounds,
        verificationTolerancePx,
      );
      if (onTargetMonitor && closeToTargetBounds) {
        return { verified: true, corrected: attempt > 0 };
      }
      if (
        onTargetMonitor
        && explorerLoosePlacementAccepts({
          visibleRect,
          bounds: desiredVisibleBounds,
          monitor,
          processHintLc,
        })
      ) {
        return { verified: true, corrected: attempt > 0 };
      }
      if (attempt >= maxCorrections) break;

      if (outerRect && visibleRect && desiredVisibleBounds.state === 'normal') {
        const leftInset = Math.max(0, Number(visibleRect.left || 0) - Number(outerRect.left || 0));
        const topInset = Math.max(0, Number(visibleRect.top || 0) - Number(outerRect.top || 0));
        const rightInset = Math.max(
          0,
          (Number(outerRect.left || 0) + Number(outerRect.width || 0))
          - (Number(visibleRect.left || 0) + Number(visibleRect.width || 0)),
        );
        const bottomInset = Math.max(
          0,
          (Number(outerRect.top || 0) + Number(outerRect.height || 0))
          - (Number(visibleRect.top || 0) + Number(visibleRect.height || 0)),
        );

        const baseOuterLeft = Number(correctionTargetBounds.left || 0) - leftInset;
        const baseOuterTop = Number(correctionTargetBounds.top || 0) - topInset;
        const baseOuterWidth = Number(correctionTargetBounds.width || 0) + leftInset + rightInset;
        const baseOuterHeight = Number(correctionTargetBounds.height || 0) + topInset + bottomInset;
        const visibleLeftError = Number(correctionTargetBounds.left || 0) - Number(visibleRect.left || 0);
        const visibleTopError = Number(correctionTargetBounds.top || 0) - Number(visibleRect.top || 0);
        const visibleWidthError = Number(correctionTargetBounds.width || 0) - Number(visibleRect.width || 0);
        const visibleHeightError = Number(correctionTargetBounds.height || 0) - Number(visibleRect.height || 0);
        const correctedLeft = baseOuterLeft + visibleLeftError;
        const correctedTop = baseOuterTop + visibleTopError;
        const correctedWidth = baseOuterWidth + visibleWidthError;
        const correctedHeight = baseOuterHeight + visibleHeightError;

        const minWidth = 120;
        const minHeight = 120;
        const frameOverflowAllowance = 40;
        const maxWidth = target
          ? Number((target.width || correctedWidth) + leftInset + rightInset + (frameOverflowAllowance * 2))
          : Number(correctedWidth);
        const maxHeight = target
          ? Number((target.height || correctedHeight) + topInset + bottomInset + (frameOverflowAllowance * 2))
          : Number(correctedHeight);
        const nextWidth = clamp(Math.round(correctedWidth), minWidth, Math.max(minWidth, Math.round(maxWidth)));
        const nextHeight = clamp(Math.round(correctedHeight), minHeight, Math.max(minHeight, Math.round(maxHeight)));
        const minLeft = target
          ? Number((target.x || 0) - leftInset - frameOverflowAllowance)
          : Number(correctedLeft);
        const minTop = target
          ? Number((target.y || 0) - topInset - frameOverflowAllowance)
          : Number(correctedTop);
        const maxLeft = target
          ? Number(target.x || 0) + Number(target.width || 0) + rightInset + frameOverflowAllowance - nextWidth
          : Number(correctedLeft);
        const maxTop = target
          ? Number(target.y || 0) + Number(target.height || 0) + bottomInset + frameOverflowAllowance - nextHeight
          : Number(correctedTop);

        correctedOuterBounds = {
          ...correctedOuterBounds,
          left: clamp(Math.round(correctedLeft), Math.round(minLeft), Math.round(Math.max(minLeft, maxLeft))),
          top: clamp(Math.round(correctedTop), Math.round(minTop), Math.round(Math.max(minTop, maxTop))),
          width: nextWidth,
          height: nextHeight,
        };
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
        },
      });
      await sleep(90);
    }
    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        strategy: 'verify-and-correct-placement',
        reason: 'verification-failed',
        handle: safeHandle,
        className: windowClassName || null,
        actualRect: lastVisibleRect || lastOuterRect || null,
        actualOuterRect: lastOuterRect || null,
        actualVisibleRect: lastVisibleRect || null,
        targetBounds: desiredVisibleBounds || null,
        attemptedOuterBounds: correctedOuterBounds || null,
        delta: describeBoundsDelta(lastVisibleRect || lastOuterRect, desiredVisibleBounds),
        monitor: describeMonitor(monitor),
      });
    }
    return { verified: false, corrected: true };
  };
};

module.exports = {
  createVerifyAndCorrectWindowPlacement,
  isRectCloseToTargetBounds,
  explorerLoosePlacementAccepts,
};
