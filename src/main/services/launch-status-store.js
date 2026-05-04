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
    'verifying',
    'opening-content',
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
    location: item?.location ? String(item.location) : undefined,
    outcomes: Array.isArray(item?.outcomes)
      ? item.outcomes.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 6)
      : undefined,
  }))
);

const normalizeLaunchActionState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const allowed = new Set(['queued', 'running', 'completed', 'warning', 'failed', 'skipped']);
  return allowed.has(normalized) ? normalized : 'queued';
};

const normalizeLaunchActionSubstepState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const allowed = new Set(['queued', 'running', 'completed', 'failed']);
  return allowed.has(normalized) ? normalized : 'queued';
};

const normalizeLaunchActionKind = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const allowed = new Set(['app', 'tab', 'system']);
  return allowed.has(normalized) ? normalized : 'app';
};

const normalizeLaunchFailureKind = (value) => {
  if (value == null) return null;
  const normalized = String(value || '').trim().toLowerCase();
  const allowed = new Set(['launch', 'placement', 'verification']);
  return allowed.has(normalized) ? normalized : null;
};

const normalizeContentSubstepMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'post-verify' || normalized === 'parallel-launch') return normalized;
  return null;
};

const clampString = (value, maxLen, { allowNull = false } = {}) => {
  if (value == null) return allowNull ? null : '';
  const s = String(value).trim();
  if (!s) return allowNull ? null : '';
  return s.length <= maxLen ? s : s.slice(0, maxLen);
};

const clampNullableFiniteNumber = (value) => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clampNullableNonNegativeInt = (value) => {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
};

const cloneStringList = (value, { cap = 32, maxItemLen = 256 } = {}) => {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const items = value
    .slice(0, Math.max(0, cap))
    .map((item) => clampString(item, maxItemLen, { allowNull: false }))
    .filter((s) => Boolean(s));
  return items.length ? items : [];
};

const cloneLaunchActionContentItems = (value) => {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const items = value
    .slice(0, 32)
    .map((item) => {
      const name = clampString(item?.name, 256);
      const path = clampString(item?.path, 1000, { allowNull: true });
      const typeRaw = clampString(item?.type, 32, { allowNull: true });
      const type = typeRaw === 'folder' ? 'folder' : typeRaw === 'link' ? 'link' : 'file';
      if (!name && !path) return null;
      return {
        name: name || path || 'Content item',
        type,
        path,
      };
    })
    .filter(Boolean);
  return items.length ? items : [];
};

const cloneLaunchActionSubsteps = (value) => {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const cap = 32;
  return value.slice(0, cap).map((item, index) => {
    const id = clampString(item?.id, 128) || `substep-${index + 1}`;
    const label = clampString(item?.label, 256) || 'Step';
    const startedAtMs = clampNullableFiniteNumber(item?.startedAtMs ?? item?.startedAt);
    const endedAtMs = clampNullableFiniteNumber(item?.endedAtMs ?? item?.endedAt);
    return {
      id,
      label,
      state: normalizeLaunchActionSubstepState(item?.state),
      startedAtMs,
      endedAtMs,
    };
  });
};

const cloneLaunchActions = (value) => {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const cap = 64;
  return value.slice(0, cap).map((item, index) => {
    const id = clampString(item?.id, 128) || `action-${index + 1}`;
    const title = clampString(item?.title, 256) || 'Action';
    const startedAtMs = clampNullableFiniteNumber(item?.startedAtMs ?? item?.startedAt);
    const endedAtMs = clampNullableFiniteNumber(item?.endedAtMs ?? item?.endedAt);
    const pills = cloneStringList(item?.pills, { cap: 16, maxItemLen: 256 });
    const smartDecisions = cloneStringList(item?.smartDecisions, { cap: 16, maxItemLen: 256 });
    const contentItems = cloneLaunchActionContentItems(item?.contentItems);
    const contentSubstepMode = normalizeContentSubstepMode(item?.contentSubstepMode);
    const contentOpenFailed = Boolean(item?.contentOpenFailed);
    const errorMessage = clampString(item?.errorMessage, 4000, { allowNull: true });
    const failureKind = normalizeLaunchFailureKind(item?.failureKind);
    const substeps = cloneLaunchActionSubsteps(item?.substeps);
    const targetLocation = item?.targetLocation != null
      ? (clampString(item.targetLocation, 256, { allowNull: true }) || null)
      : null;
    const browserTabUrl = item?.browserTabUrl != null
      ? (clampString(item.browserTabUrl, 1000, { allowNull: true }) || null)
      : null;

    return {
      id,
      kind: normalizeLaunchActionKind(item?.kind),
      title,
      state: normalizeLaunchActionState(item?.state),
      iconDataUrl: cloneLaunchRowIconDataUrl(item?.iconDataUrl),
      pills,
      smartDecisions,
      contentItems,
      contentSubstepMode,
      contentOpenFailed,
      errorMessage,
      failureKind,
      startedAtMs,
      endedAtMs,
      substeps,
      targetLocation,
      browserTabUrl,
    };
  });
};

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

  const cloneStatusOutput = (status) => ({
    ...status,
    pendingConfirmations: clonePending(status.pendingConfirmations),
    actions: cloneLaunchActions(status.actions),
  });

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
      .filter((item) => String(item?.status || '').toLowerCase() === 'waiting')
      .length;
    const rawPhase = status.activePhase != null ? String(status.activePhase).trim().toLowerCase() : '';
    const activePhase = rawPhase === 'launching' || rawPhase === 'placing' || rawPhase === 'tabs'
      ? rawPhase
      : null;
    const activeAppName = status.activeAppName != null ? String(status.activeAppName).trim() : '';
    const activeActionId = clampString(status.activeActionId, 128, { allowNull: true });
    const actionsTotal = clampNullableNonNegativeInt(status.actionsTotal);
    const actionsCompleted = clampNullableNonNegativeInt(status.actionsCompleted);
    const actions = cloneLaunchActions(status.actions);
    const nextStatus = {
      profileId: safeProfileId,
      runId: safeRunId,
      startedAt: activeRunByProfileId.get(safeProfileId)?.startedAt ?? null,
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
      activeActionId,
      actionsTotal,
      actionsCompleted,
      actions,
      pendingConfirmations,
      updatedAt: now(),
    };
    statusByProfileId.set(safeProfileId, nextStatus);
    return { published: true, status: cloneStatusOutput(nextStatus) };
  };

  const getStatus = (profileId) => {
    const safeProfileId = String(profileId || '').trim();
    if (!safeProfileId) return null;
    const status = statusByProfileId.get(safeProfileId);
    if (!status) return null;
    return cloneStatusOutput(status);
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
        activePhase: null,
        activeAppName: null,
        activeActionId: null,
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
