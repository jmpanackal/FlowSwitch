'use strict';

const _cache = new Map();
const DEFAULT_TTL_MS = 150;

const makeKey = (hint, runId) => `${String(hint || '').trim().toLowerCase()}::${String(runId || '').trim()}`;

const getCachedEnum = (hint, runId) => {
  const key = makeKey(hint, runId);
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > DEFAULT_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return Array.isArray(entry.rows) ? entry.rows : null;
};

const setCachedEnum = (hint, runId, rows) => {
  const key = makeKey(hint, runId);
  _cache.set(key, { ts: Date.now(), rows: Array.isArray(rows) ? rows : [] });
};

const invalidateEnumHint = (hint, runId) => {
  _cache.delete(makeKey(hint, runId));
};

const clearRunCache = (runId) => {
  const run = String(runId || '').trim();
  if (!run) return;
  for (const key of _cache.keys()) {
    if (key.endsWith(`::${run}`)) _cache.delete(key);
  }
};

module.exports = {
  getCachedEnum,
  setCachedEnum,
  invalidateEnumHint,
  clearRunCache,
};
