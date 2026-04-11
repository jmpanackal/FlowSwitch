const LAUNCH_PROFILE_TAG = '[launch-profile]';

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toStringOrNull = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const sanitizePayload = (payload) => (
  payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {}
);

const describeMonitor = (monitor) => {
  if (!monitor || typeof monitor !== 'object') return null;
  return {
    id: toStringOrNull(monitor.id),
    name: toStringOrNull(monitor.name),
    systemName: toStringOrNull(monitor.systemName),
    primary: Boolean(monitor.primary),
    layoutPosition: monitor.layoutPosition && typeof monitor.layoutPosition === 'object'
      ? {
        x: toNumberOrNull(monitor.layoutPosition.x),
        y: toNumberOrNull(monitor.layoutPosition.y),
      }
      : null,
    bounds: monitor.bounds && typeof monitor.bounds === 'object'
      ? {
        x: toNumberOrNull(monitor.bounds.x),
        y: toNumberOrNull(monitor.bounds.y),
        width: toNumberOrNull(monitor.bounds.width),
        height: toNumberOrNull(monitor.bounds.height),
      }
      : null,
    workArea: monitor.workArea && typeof monitor.workArea === 'object'
      ? {
        x: toNumberOrNull(monitor.workArea.x),
        y: toNumberOrNull(monitor.workArea.y),
        width: toNumberOrNull(monitor.workArea.width),
        height: toNumberOrNull(monitor.workArea.height),
      }
      : null,
    workAreaPhysical: monitor.workAreaPhysical && typeof monitor.workAreaPhysical === 'object'
      ? {
        x: toNumberOrNull(monitor.workAreaPhysical.x),
        y: toNumberOrNull(monitor.workAreaPhysical.y),
        width: toNumberOrNull(monitor.workAreaPhysical.width),
        height: toNumberOrNull(monitor.workAreaPhysical.height),
      }
      : null,
  };
};

const summarizeWindowRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  return {
    handle: toStringOrNull(row.handle),
    className: toStringOrNull(row.className),
    enabled: Boolean(row.enabled),
    hung: Boolean(row.hung),
    cloaked: Boolean(row.cloaked),
    tool: Boolean(row.tool),
    titleLength: toNumberOrNull(row.titleLength),
    width: toNumberOrNull(row.width),
    height: toNumberOrNull(row.height),
    area: toNumberOrNull(row.area),
    score: toNumberOrNull(row.score),
  };
};

const summarizeWindowRows = (rows, limit = 5) => (
  (Array.isArray(rows) ? rows : [])
    .slice(0, Math.max(1, Number(limit) || 1))
    .map((row) => summarizeWindowRow(row))
    .filter(Boolean)
);

const describeBoundsDelta = (actualRect, targetBounds) => {
  if (!actualRect || !targetBounds) return null;
  const deltaValue = (left, right) => {
    const a = toNumberOrNull(left);
    const b = toNumberOrNull(right);
    if (a === null || b === null) return null;
    return a - b;
  };
  return {
    left: deltaValue(actualRect.left, targetBounds.left),
    top: deltaValue(actualRect.top, targetBounds.top),
    width: deltaValue(actualRect.width, targetBounds.width),
    height: deltaValue(actualRect.height, targetBounds.height),
  };
};

const createLaunchDiagnostics = (context = {}) => {
  const baseContext = sanitizePayload(context);

  const emit = (event, payload = {}) => {
    const safeEvent = String(event || '').trim() || 'event';
    console.log(`${LAUNCH_PROFILE_TAG} ${safeEvent}`, {
      event: safeEvent,
      timestamp: Date.now(),
      ...baseContext,
      ...sanitizePayload(payload),
    });
  };

  return {
    emit,
    start: (payload = {}) => emit('start', payload),
    decision: (payload = {}) => emit('decision', payload),
    attempt: (payload = {}) => emit('attempt', payload),
    result: (payload = {}) => emit('result', payload),
    failure: (payload = {}) => emit('failure', payload),
  };
};

module.exports = {
  createLaunchDiagnostics,
  describeBoundsDelta,
  describeMonitor,
  summarizeWindowRow,
  summarizeWindowRows,
};
