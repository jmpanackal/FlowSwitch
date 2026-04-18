const REUSE_SCORE_WEIGHTS = Object.freeze({
  monitorAffinity: 0.32,
  geometrySimilarity: 0.24,
  recencyStability: 0.20,
  reuseAffinity: 0.14,
  visibilityQuality: 0.10,
});

const normalizeUnitScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
};

const normalizeCount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
};

const isMeaningfulBoundsForTarget = (actual, target) => {
  if (!actual || !target) return false;
  const actualWidth = Number(actual.width || 0);
  const actualHeight = Number(actual.height || 0);
  const targetWidth = Math.max(1, Number(target.width || 0));
  const targetHeight = Math.max(1, Number(target.height || 0));
  const areaRatio = (actualWidth * actualHeight) / (targetWidth * targetHeight);
  const widthRatio = actualWidth / targetWidth;
  const heightRatio = actualHeight / targetHeight;
  return (
    areaRatio >= 0.38
    && widthRatio >= 0.55
    && heightRatio >= 0.45
    && (widthRatio >= 0.72 || heightRatio >= 0.72)
  );
};

const isWithinAcceptableStateTolerance = ({
  actual,
  target,
  onTargetMonitor,
} = {}) => {
  if (!actual || !target || onTargetMonitor !== true) return false;
  const state = String(target.state || 'normal').trim().toLowerCase();

  if (state === 'normal') {
    const dx = Math.abs(Number(actual.left || 0) - Number(target.left || 0));
    const dy = Math.abs(Number(actual.top || 0) - Number(target.top || 0));
    const dw = Math.abs(Number(actual.width || 0) - Number(target.width || 0));
    const dh = Math.abs(Number(actual.height || 0) - Number(target.height || 0));
    return dx <= 16 && dy <= 16 && dw <= 24 && dh <= 24;
  }

  if (state === 'maximized') {
    return isMeaningfulBoundsForTarget(actual, target);
  }

  return false;
};

const planLaunchSlots = ({ requestedSlots, existingHandles } = {}) => {
  const safeRequestedSlots = normalizeCount(requestedSlots);
  const safeExistingHandles = Array.isArray(existingHandles)
    ? existingHandles.filter((handle) => handle !== null && handle !== undefined && handle !== '')
    : [];

  const reuseCount = Math.min(safeExistingHandles.length, safeRequestedSlots);
  const spawnCount = Math.max(0, safeRequestedSlots - reuseCount);
  const reuseHandles = safeExistingHandles.slice(0, reuseCount);
  const reuseSlots = reuseHandles.map((handle, slotIndex) => ({
    slotIndex,
    handle,
  }));
  const spawnSlots = Array.from({ length: spawnCount }, (_value, offset) => ({
    slotIndex: reuseCount + offset,
  }));
  const slots = Array.from({ length: safeRequestedSlots }, (_value, index) => {
    if (index < reuseCount) {
      return {
        slotIndex: index,
        mode: 'reuse',
        handle: reuseHandles[index],
      };
    }
    return {
      slotIndex: index,
      mode: 'spawn',
      handle: null,
    };
  });

  return {
    requestedSlots: safeRequestedSlots,
    existingHandleCount: safeExistingHandles.length,
    reuseCount,
    spawnCount,
    reuseHandles,
    reuseSlots,
    spawnSlots,
    slots,
  };
};

const scoreReuseCandidate = ({
  monitorAffinity,
  geometrySimilarity,
  recencyStability,
  reuseAffinity,
  visibilityQuality,
} = {}) => (
  (normalizeUnitScore(monitorAffinity) * REUSE_SCORE_WEIGHTS.monitorAffinity)
  + (normalizeUnitScore(geometrySimilarity) * REUSE_SCORE_WEIGHTS.geometrySimilarity)
  + (normalizeUnitScore(recencyStability) * REUSE_SCORE_WEIGHTS.recencyStability)
  + (normalizeUnitScore(reuseAffinity) * REUSE_SCORE_WEIGHTS.reuseAffinity)
  + (normalizeUnitScore(visibilityQuality) * REUSE_SCORE_WEIGHTS.visibilityQuality)
);

const shouldTriggerAmbiguityFallback = ({
  topScore,
  secondScore,
  flipsIn3Polls,
} = {}) => {
  const safeTopScore = Number.isFinite(Number(topScore)) ? Number(topScore) : 0;
  const safeSecondScore = Number.isFinite(Number(secondScore)) ? Number(secondScore) : 0;
  const safeFlipsIn3Polls = normalizeCount(flipsIn3Polls);
  const scoreDelta = safeTopScore - safeSecondScore;
  return scoreDelta <= 0.06 || safeFlipsIn3Polls >= 2;
};

module.exports = {
  REUSE_SCORE_WEIGHTS,
  normalizeUnitScore,
  isWithinAcceptableStateTolerance,
  planLaunchSlots,
  scoreReuseCandidate,
  shouldTriggerAmbiguityFallback,
};
