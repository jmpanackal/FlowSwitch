const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ZONE_HISTORY_FILENAME = 'zone-history.v1.json';
const MAX_HISTORY_ENTRIES = 200; // Maximum number of app+monitor combinations to store
const MAX_AGE_DAYS = 30; // Remove entries older than 30 days
const FLUSH_DEBOUNCE_MS = 2000;

const getZoneHistoryPath = () => (
  path.join(app.getPath('userData'), ZONE_HISTORY_FILENAME)
);

let memoryMap = null;
let flushTimer = null;

/**
 * Generate a unique key for an app+monitor combination.
 * @param {string} appIdentifier - App name or executable path
 * @param {string} monitorId - Monitor identifier
 * @returns {string} Composite key
 */
const generateZoneKey = (appIdentifier, monitorId) => {
  const safeApp = String(appIdentifier || '').toLowerCase().trim();
  const safeMonitor = String(monitorId || 'default').toLowerCase().trim();
  return `${safeApp}::${safeMonitor}`;
};

/**
 * Parse file contents into a pruned Map (same rules as legacy read).
 * @param {string} historyPath
 * @returns {Map<string, Object>}
 */
const parseAndPruneFile = (historyPath) => {
  if (!fs.existsSync(historyPath)) return new Map();

  try {
    const content = fs.readFileSync(historyPath, 'utf8');
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== 'object' || !parsed.entries) {
      return new Map();
    }

    const now = Date.now();
    const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const entries = Object.entries(parsed.entries).filter(([, record]) => {
      return (now - (record.timestamp || 0)) < maxAgeMs;
    });

    if (entries.length > MAX_HISTORY_ENTRIES) {
      entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
      entries.splice(MAX_HISTORY_ENTRIES);
    }

    return new Map(entries);
  } catch (error) {
    console.error('[zone-history] Failed to read zone history:', error);
    return new Map();
  }
};

/**
 * Read zone history from disk into memory cache (once), then reuse.
 * @returns {Map<string, Object>}
 */
const readZoneHistory = () => {
  if (!memoryMap) {
    memoryMap = parseAndPruneFile(getZoneHistoryPath());
  }
  return memoryMap;
};

/**
 * Write zone history map to disk (atomic temp + rename).
 * @param {Map<string, Object>} historyMap
 */
const writeZoneHistory = (historyMap) => {
  const historyPath = getZoneHistoryPath();
  const dirPath = path.dirname(historyPath);
  const tempPath = `${historyPath}.tmp`;

  try {
    fs.mkdirSync(dirPath, { recursive: true });

    const entries = {};
    for (const [key, record] of historyMap.entries()) {
      entries[key] = record;
    }

    const payload = {
      version: 1,
      updatedAt: Date.now(),
      entries,
    };

    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tempPath, historyPath);
  } catch (error) {
    console.error('[zone-history] Failed to write zone history:', error);
  }
};

const scheduleFlush = () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (memoryMap) {
      writeZoneHistory(memoryMap);
    }
  }, FLUSH_DEBOUNCE_MS);
};

/**
 * Write any in-memory zone history to disk immediately (e.g. before app exit).
 * Clears a pending debounced flush so we do not double-write.
 */
const flushPendingZoneHistory = () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (memoryMap) {
    writeZoneHistory(memoryMap);
  }
};

/**
 * Record a successful window placement for future reference.
 * @param {string} appName - Application name
 * @param {string} monitorId - Monitor identifier
 * @param {Object} bounds - Window bounds {left, top, width, height, state}
 * @param {Object} monitorInfo - Monitor info for context {width, height, scaleFactor}
 */
const recordZonePlacement = (appName, monitorId, bounds, monitorInfo = {}) => {
  if (!appName || !bounds) return;

  const key = generateZoneKey(appName, monitorId);
  const history = readZoneHistory();

  const record = {
    timestamp: Date.now(),
    bounds: {
      left: Number(bounds.left || 0),
      top: Number(bounds.top || 0),
      width: Number(bounds.width || 0),
      height: Number(bounds.height || 0),
      state: bounds.state || 'normal',
    },
    monitorInfo: {
      width: Number(monitorInfo.width || 0),
      height: Number(monitorInfo.height || 0),
      scaleFactor: Number(monitorInfo.scaleFactor || 1),
    },
    useCount: 1,
  };

  const existing = history.get(key);
  if (existing) {
    record.useCount = (existing.useCount || 0) + 1;
    const monitorChanged = (
      existing.monitorInfo?.width !== record.monitorInfo.width ||
      existing.monitorInfo?.height !== record.monitorInfo.height
    );
    if (!monitorChanged && existing.useCount > 3) {
      record.bounds = existing.bounds;
      record.useCount = existing.useCount + 1;
    }
  }

  history.set(key, record);
  scheduleFlush();

  if (process.env.FLOWSWITCH_ZONE_HISTORY_DEBUG === '1') {
    console.log('[zone-history] Recorded placement:', {
      appName,
      monitorId,
      bounds: record.bounds,
      useCount: record.useCount,
    });
  }
};

/**
 * Retrieve a stored zone placement for an app+monitor combination.
 * @param {string} appName - Application name
 * @param {string} monitorId - Monitor identifier
 * @returns {Object|null} Placement record or null if not found
 */
const getZonePlacement = (appName, monitorId) => {
  if (!appName) return null;

  const key = generateZoneKey(appName, monitorId);
  const history = readZoneHistory();
  const record = history.get(key);

  if (!record) return null;

  const now = Date.now();
  const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  if ((now - (record.timestamp || 0)) > maxAgeMs) {
    return null;
  }

  return record;
};

/**
 * Get fallback bounds for an app based on historical zone data.
 * @param {string} appName - Application name
 * @param {string} monitorId - Monitor identifier
 * @param {Object} workArea - Current work area bounds
 * @returns {Object|null} Suggested bounds or null if no history available
 */
const getFallbackBounds = (appName, monitorId, workArea) => {
  const record = getZonePlacement(appName, monitorId);
  if (!record || !record.bounds) return null;

  const { bounds, monitorInfo } = record;

  if (workArea && monitorInfo && monitorInfo.width > 0 && monitorInfo.height > 0) {
    const scaleX = workArea.width / monitorInfo.width;
    const scaleY = workArea.height / monitorInfo.height;

    if (Math.abs(scaleX - 1) > 0.05 || Math.abs(scaleY - 1) > 0.05) {
      return {
        left: Math.round(bounds.left * scaleX),
        top: Math.round(bounds.top * scaleY),
        width: Math.round(bounds.width * scaleX),
        height: Math.round(bounds.height * scaleY),
        state: bounds.state,
        scaled: true,
        source: 'zone-history-scaled',
      };
    }
  }

  return {
    ...bounds,
    source: 'zone-history',
  };
};

/**
 * Clear all zone history.
 */
const clearZoneHistory = () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  memoryMap = new Map();
  writeZoneHistory(memoryMap);
};

/**
 * Get statistics about zone history usage.
 * @returns {Object} Statistics object
 */
const getZoneHistoryStats = () => {
  const history = readZoneHistory();
  let totalUseCount = 0;
  let mostUsedApp = null;
  let maxUseCount = 0;

  for (const [key, record] of history.entries()) {
    const useCount = record.useCount || 0;
    totalUseCount += useCount;
    if (useCount > maxUseCount) {
      maxUseCount = useCount;
      mostUsedApp = key.split('::')[0];
    }
  }

  return {
    totalEntries: history.size,
    totalUseCount,
    mostUsedApp,
    maxUseCount,
  };
};

module.exports = {
  recordZonePlacement,
  getZonePlacement,
  getFallbackBounds,
  clearZoneHistory,
  getZoneHistoryStats,
  generateZoneKey,
  flushPendingZoneHistory,
};
