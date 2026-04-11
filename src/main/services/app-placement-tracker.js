/**
 * In-memory map of the last rectangle placed for each app name during the current
 * `launch-profile` run. Used for same-monitor overlap heuristics (`wouldOverlapExistingApp`).
 * Cleared with `clearGlobalAppPlacements` when a new launch begins.
 */

const globalPlacedAppBounds = new Map();

const recordAppPlacement = (appName, bounds, monitor) => {
  const safeBounds = {
    left: Number(bounds.left || 0),
    top: Number(bounds.top || 0),
    width: Number(bounds.width || 0),
    height: Number(bounds.height || 0),
    monitor: monitor || bounds.monitor || null,
  };
  globalPlacedAppBounds.set(appName, safeBounds);
};

const clearGlobalAppPlacements = () => {
  globalPlacedAppBounds.clear();
};

/**
 * Returns whether `newBounds` would overlap a previously recorded placement on the same monitor
 * by a meaningful area threshold (avoids noise from minor chrome differences).
 */
const wouldOverlapExistingApp = (newBounds, excludeAppName = '', targetMonitorId = '') => {
  const newLeft = Number(newBounds.left || 0);
  const newTop = Number(newBounds.top || 0);
  const newRight = newLeft + Number(newBounds.width || 0);
  const newBottom = newTop + Number(newBounds.height || 0);

  for (const [appName, existingBounds] of globalPlacedAppBounds.entries()) {
    if (appName === excludeAppName) continue;

    const existingMonitorId = existingBounds.monitor?.id || existingBounds.monitor?.name || '';
    const newMonitorId = targetMonitorId || newBounds.monitor?.id || newBounds.monitor?.name || '';

    if (!existingMonitorId || !newMonitorId) continue;
    if (existingMonitorId !== newMonitorId) continue;

    const existLeft = existingBounds.left;
    const existTop = existingBounds.top;
    const existRight = existLeft + existingBounds.width;
    const existBottom = existTop + existingBounds.height;

    const overlapX = newLeft < existRight && newRight > existLeft;
    const overlapY = newTop < existBottom && newBottom > existTop;

    if (overlapX && overlapY) {
      const overlapWidth = Math.max(0, Math.min(newRight, existRight) - Math.max(newLeft, existLeft));
      const overlapHeight = Math.max(0, Math.min(newBottom, existBottom) - Math.max(newTop, existTop));
      const overlapArea = overlapWidth * overlapHeight;

      const newArea = (newRight - newLeft) * (newBottom - newTop);
      const existingArea = (existRight - existLeft) * (existBottom - existTop);
      const isSignificant = overlapArea > 100000;

      if (isSignificant) {
        return {
          wouldOverlap: true,
          existingApp: appName,
          existingBounds,
          overlapArea,
        };
      }
    }
  }

  return { wouldOverlap: false };
};

module.exports = {
  recordAppPlacement,
  clearGlobalAppPlacements,
  wouldOverlapExistingApp,
};
