/**
 * Per-launch registry of Win32 window handles already assigned to an app tile.
 * Prevents two profile apps from manipulating the same HWND during one `launch-profile` run.
 * Cleared at the start of each profile launch (`clearGlobalWindowHandles`).
 */

const globalUsedWindowHandles = new Set();

const reserveWindowHandle = (handle) => {
  const safeHandle = String(handle || '').trim();
  if (safeHandle) {
    globalUsedWindowHandles.add(safeHandle);
    return true;
  }
  return false;
};

const releaseWindowHandle = (handle) => {
  const safeHandle = String(handle || '').trim();
  globalUsedWindowHandles.delete(safeHandle);
};

const isWindowHandleAvailable = (handle) => {
  const safeHandle = String(handle || '').trim();
  return Boolean(safeHandle && !globalUsedWindowHandles.has(safeHandle));
};

const clearGlobalWindowHandles = () => {
  globalUsedWindowHandles.clear();
};

module.exports = {
  reserveWindowHandle,
  releaseWindowHandle,
  isWindowHandleAvailable,
  clearGlobalWindowHandles,
};
