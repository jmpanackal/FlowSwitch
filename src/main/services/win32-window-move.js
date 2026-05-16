'use strict';

const {
  SetWindowPos,
  ShowWindowAsync,
  GetWindowPlacement,
  WINDOWPLACEMENT,
  SW_SHOWMINIMIZED,
  SW_SHOWMAXIMIZED,
  toHwnd,
  koffi,
} = require('./win32-ffi');

const SW_RESTORE = 9;
const SW_SHOW = 5;
const SW_MAXIMIZE = 3;
const SW_MINIMIZE = 6;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readShowCmd = (hwnd) => {
  const placement = {
    length: Number(koffi.sizeof(WINDOWPLACEMENT)),
    flags: 0,
    showCmd: 0,
    ptMinPosition: { x: 0, y: 0 },
    ptMaxPosition: { x: 0, y: 0 },
    rcNormalPosition: { left: 0, top: 0, right: 0, bottom: 0 },
  };
  const ok = GetWindowPlacement(hwnd, placement);
  if (!ok) return null;
  return Number(placement.showCmd || 0);
};

const waitUntilShowCmd = async (hwnd, predicate, timeoutMs = 500) => {
  const deadline = Date.now() + Math.max(0, Number(timeoutMs || 0));
  while (Date.now() <= deadline) {
    const showCmd = readShowCmd(hwnd);
    if (showCmd !== null && predicate(showCmd)) return true;
    await wait(16);
  }
  return false;
};

const moveWindowHandleToBounds = async (handleDecimal, bounds, options = {}) => {
  const hwnd = toHwnd(handleDecimal);
  if (!hwnd || !bounds) return { applied: false, handle: null };
  const nullHwnd = toHwnd(0n);

  const {
    positionOnlyBeforeMaximize = false,
    skipFrameChanged = false,
  } = options;

  const left = Math.floor(Number(bounds.left || 0));
  const top = Math.floor(Number(bounds.top || 0));
  const width = Math.max(120, Math.floor(Number(bounds.width || 800)));
  const height = Math.max(120, Math.floor(Number(bounds.height || 600)));
  const basePosFlags = 0x0044;
  const setPosFlags = positionOnlyBeforeMaximize
    ? 0x0045
    : (skipFrameChanged ? basePosFlags : (basePosFlags | 0x0020));

  const windowState = bounds.state === 'maximized'
    ? SW_MAXIMIZE
    : bounds.state === 'minimized'
      ? SW_MINIMIZE
      : SW_SHOW;

  try {
    if (windowState === SW_SHOW || windowState === SW_MAXIMIZE) {
      ShowWindowAsync(hwnd, SW_RESTORE);
      await waitUntilShowCmd(
        hwnd,
        (showCmd) => showCmd !== SW_SHOWMINIMIZED && showCmd !== SW_SHOWMAXIMIZED,
        500,
      );
    }

    SetWindowPos(hwnd, nullHwnd, left, top, width, height, setPosFlags);
    ShowWindowAsync(hwnd, windowState);

    if (windowState === SW_MAXIMIZE) {
      await waitUntilShowCmd(hwnd, (showCmd) => showCmd === SW_SHOWMAXIMIZED, 500);
    }

    return { applied: true, handle: String(handleDecimal || '').trim() || null };
  } catch {
    return { applied: false, handle: null };
  }
};

module.exports = {
  moveWindowHandleToBounds,
  SW_RESTORE,
  SW_SHOW,
  SW_MAXIMIZE,
  SW_MINIMIZE,
};
