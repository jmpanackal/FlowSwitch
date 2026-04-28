const normalizePendingStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'resolved') return 'resolved';
  if (normalized === 'failed') return 'failed';
  return 'waiting';
};

const normalizeAppLaunchStep = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const allowed = new Set([
    'pending',
    'launching',
    'placing',
    'awaiting-confirmation',
    'done',
    'failed',
    'skipped',
  ]);
  return allowed.has(normalized) ? normalized : 'pending';
};

const cloneLaunchRowIconDataUrl = (value) => {
  const s = String(value || '').trim();
  if (!s.startsWith('data:image/')) return null;
  if (s.length > 2_200_000) return null;
  if (!/^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,/i.test(s)) return null;
  return s;
};

const cloneAppLaunchProgress = (rows) => (
  (Array.isArray(rows) ? rows : []).map((item, index) => ({
    key: String(item?.key || '').trim() || `app-${index}`,
    name: String(item?.name || '').trim() || 'App',
    step: normalizeAppLaunchStep(item?.step),
    iconDataUrl: cloneLaunchRowIconDataUrl(item?.iconDataUrl),
  }))
);

const clonePendingConfirmations = (pendingConfirmations) => (
  (Array.isArray(pendingConfirmations) ? pendingConfirmations : []).map((item) => ({
    name: String(item?.name || ''),
    path: String(item?.path || ''),
    reason: String(item?.reason || ''),
    mode: item?.mode ? String(item.mode) : undefined,
    reasonCode: item?.reasonCode ? String(item.reasonCode) : undefined,
    processHintLc: item?.processHintLc ? String(item.processHintLc) : undefined,
    blockerHandle: item?.blockerHandle ? String(item.blockerHandle) : null,
    status: normalizePendingStatus(item?.status),
    handle: item?.handle ? String(item.handle) : undefined,
    resolvedAt: Number.isFinite(Number(item?.resolvedAt)) ? Number(item.resolvedAt) : undefined,
  }))
);

const createRunIdFactory = ({ now }) => {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `run-${now()}-${sequence}`;
  };
};

const createLaunchStatusStore = (options = {}) => {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const nextRunId = typeof options.createRunId === 'function'
    ? options.createRunId
    : createRunIdFactory({ now });
  const clonePending = typeof options.clonePendingConfirmations === 'function'
    ? options.clonePendingConfirmations
    : clonePendingConfirmations;
  const statusByProfileId = new Map();
  const activeRunByProfileId = new Map();

  const startRun = (profileId) => {
    const safeProfileId = String(profileId || '').trim();
    if (!safeProfileId) return null;
    const previousActiveRunId = activeRunByProfileId.get(safeProfileId)?.runId || null;
    const runId = String(nextRunId(safeProfileId) || '').trim();
    if (!runId) return null;
    activeRunByProfileId.set(safeProfileId, {
      runId,
      startedAt: now(),
    });
    return {
      profileId: safeProfileId,
      runId,
      replacedRunId: previousActiveRunId,
    };
  };

  const isActiveRun = (profileId, runId) => {
    const safeProfileId = String(profileId || '').trim();
    const safeRunId = String(runId || '').trim();
    if (!safeProfileId || !safeRunId) return false;
    return activeRunByProfileId.get(safeProfileId)?.runId === safeRunId;
  };

  const publishStatus = (profileId, runId, status) => {
    const safeProfileId = String(profileId || '').trim();
    const safeRunId = String(runId || '').trim();
    if (!safeProfileId || !safeRunId || !status || typeof status !== 'object') {
      return { published: false, reason: 'invalid-arguments' };
    }
    if (!isActiveRun(safeProfileId, safeRunId)) {
      return { published: false, reason: 'inactive-run' };
    }
    const pendingConfirmations = clonePending(status.pendingConfirmations);
    const unresolvedPendingConfirmationCount = pendingConfirmations
      .filter((item) => item.status !== 'resolved')
      .length;
    const rawPhase = status.activePhase != null ? String(status.activePhase).trim().toLowerCase() : '';
    const activePhase = rawPhase === 'launching' || rawPhase === 'placing' || rawPhase === 'tabs'
      ? rawPhase
      : null;
    const activeAppName = status.activeAppName != null ? String(status.activeAppName).trim() : '';
    const nextStatus = {
      profileId: safeProfileId,
      runId: safeRunId,
      state: String(status.state || 'idle'),
      launchedAppCount: Number(status.launchedAppCount || 0),
      launchedTabCount: Number(status.launchedTabCount || 0),
      failedAppCount: Number(status.failedAppCount || 0),
      skippedAppCount: Number(status.skippedAppCount || 0),
      pendingConfirmationCount: pendingConfirmations.length,
      unresolvedPendingConfirmationCount,
      requestedAppCount: Number(status.requestedAppCount || 0),
      requestedBrowserTabCount: Math.max(0, Number(status.requestedBrowserTabCount || 0)),
      activePhase,
      activeAppName: activeAppName || null,
      appLaunchProgress: cloneAppLaunchProgress(status.appLaunchProgress),
      pendingConfirmations,
      updatedAt: now(),
    };
    statusByProfileId.set(safeProfileId, nextStatus);
    return { published: true, status: { ...nextStatus, pendingConfirmations: clonePending(nextStatus.pendingConfirmations) } };
  };

  const getStatus = (profileId) => {
    const safeProfileId = String(profileId || '').trim();
    if (!safeProfileId) return null;
    const status = statusByProfileId.get(safeProfileId);
    if (!status) return null;
    return {
      ...status,
      pendingConfirmations: clonePending(status.pendingConfirmations),
    };
  };

  const sealRun = (profileId, runId, state = null) => {
    const safeProfileId = String(profileId || '').trim();
    const safeRunId = String(runId || '').trim();
    if (!safeProfileId || !safeRunId) return false;
    if (!isActiveRun(safeProfileId, safeRunId)) return false;
    activeRunByProfileId.delete(safeProfileId);
    if (state) {
      const currentStatus = statusByProfileId.get(safeProfileId);
      if (currentStatus && currentStatus.runId === safeRunId) {
        statusByProfileId.set(safeProfileId, {
          ...currentStatus,
          state: String(state),
          updatedAt: now(),
        });
      }
    }
    return true;
  };

  const cancelRun = (profileId, runId) => {
    const safeProfileId = String(profileId || '').trim();
    const safeRunId = String(runId || '').trim();
    if (!safeProfileId || !safeRunId) return { ok: false, reason: 'invalid-arguments' };
    if (!isActiveRun(safeProfileId, safeRunId)) return { ok: false, reason: 'not-active' };
    activeRunByProfileId.delete(safeProfileId);
    const currentStatus = statusByProfileId.get(safeProfileId);
    if (currentStatus && currentStatus.runId === safeRunId) {
      statusByProfileId.set(safeProfileId, {
        ...currentStatus,
        state: 'cancelled',
        updatedAt: now(),
      });
    }
    return { ok: true };
  };

  return {
    startRun,
    isActiveRun,
    publishStatus,
    getStatus,
    sealRun,
    cancelRun,
  };
};

module.exports = {
  clonePendingConfirmations,
  createLaunchStatusStore,
};
