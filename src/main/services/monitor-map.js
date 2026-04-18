const getMonitorPlacementRect = (monitor) => (
  (process.platform === 'win32' && monitor?.workAreaPhysical)
    ? monitor.workAreaPhysical
    : (monitor?.workArea || monitor?.bounds || null)
);

const isWindowOnTargetMonitor = ({ rect, monitor }) => {
  if (!rect || !monitor) return false;
  const target = (
    process.platform === 'win32' && monitor.workAreaPhysical
      ? monitor.workAreaPhysical
      : (monitor.workArea || monitor.bounds || null)
  );
  if (!target) return false;

  const rx = Number(rect.left || 0);
  const ry = Number(rect.top || 0);
  const rw = Math.max(0, Number(rect.width || 0));
  const rh = Math.max(0, Number(rect.height || 0));
  const rectArea = rw * rh;
  if (rectArea <= 0) return false;

  const tx = Number(target.x ?? target.left ?? 0);
  const ty = Number(target.y ?? target.top ?? 0);
  const tw = Math.max(0, Number(target.width || 0));
  const th = Math.max(0, Number(target.height || 0));
  if (tw <= 0 || th <= 0) return false;

  const ix1 = Math.max(rx, tx);
  const iy1 = Math.max(ry, ty);
  const ix2 = Math.min(rx + rw, tx + tw);
  const iy2 = Math.min(ry + rh, ty + th);
  if (ix2 <= ix1 || iy2 <= iy1) return false;
  const intersectionArea = (ix2 - ix1) * (iy2 - iy1);
  const overlapFraction = intersectionArea / rectArea;
  return overlapFraction >= 0.45;
};

module.exports = {
  getMonitorPlacementRect,
  isWindowOnTargetMonitor,
};
