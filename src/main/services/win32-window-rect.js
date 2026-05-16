'use strict';

const {
  koffi,
  GetWindowRect,
  DwmGetWindowAttribute,
  DWMWA_EXTENDED_FRAME_BOUNDS,
  RECT,
  toHwnd,
} = require('./win32-ffi');

const toPlacementRect = (rect) => {
  if (!rect || !Number.isFinite(Number(rect.left)) || !Number.isFinite(Number(rect.top))
    || !Number.isFinite(Number(rect.right)) || !Number.isFinite(Number(rect.bottom))) {
    return null;
  }
  return {
    left: Number(rect.left),
    top: Number(rect.top),
    width: Number(rect.right) - Number(rect.left),
    height: Number(rect.bottom) - Number(rect.top),
  };
};

const getWindowPlacementRects = (handleDecimal) => {
  const hwnd = toHwnd(handleDecimal);
  if (!hwnd) return { outerRect: null, visibleRect: null };

  let outerRect = null;
  try {
    const wr = {};
    if (GetWindowRect(hwnd, wr)) {
      outerRect = toPlacementRect(wr);
    }
  } catch {
    outerRect = null;
  }

  let visibleRect = null;
  try {
    const fr = {};
    const hr = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, fr, koffi.sizeof(RECT));
    if (hr === 0) {
      visibleRect = toPlacementRect(fr);
    }
  } catch {
    visibleRect = null;
  }

  if (!visibleRect && outerRect) visibleRect = { ...outerRect };
  if (!outerRect && visibleRect) outerRect = { ...visibleRect };
  return { outerRect, visibleRect };
};

module.exports = { getWindowPlacementRects };
