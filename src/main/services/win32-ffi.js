'use strict';

const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');

const HWND = koffi.pointer('HWND', koffi.opaque());
const RECT = koffi.struct('RECT', {
  left: 'int32',
  top: 'int32',
  right: 'int32',
  bottom: 'int32',
});
const POINT = koffi.struct('POINT', {
  x: 'int32',
  y: 'int32',
});
const WINDOWPLACEMENT = koffi.struct('WINDOWPLACEMENT', {
  length: 'uint32',
  flags: 'uint32',
  showCmd: 'uint32',
  ptMinPosition: POINT,
  ptMaxPosition: POINT,
  rcNormalPosition: RECT,
});

const GetWindowRect = user32.func(
  'bool __stdcall GetWindowRect(HWND hwnd, _Out_ RECT *rect)'
);
const DwmGetWindowAttribute = dwmapi.func(
  'long __stdcall DwmGetWindowAttribute(HWND hwnd, uint32 dwAttribute, _Out_ RECT *pvAttribute, uint32 cbAttribute)'
);
const SetWindowPos = user32.func(
  'bool __stdcall SetWindowPos(HWND hWnd, HWND hWndInsertAfter, int X, int Y, int cx, int cy, uint32 uFlags)'
);
const ShowWindowAsync = user32.func(
  'bool __stdcall ShowWindowAsync(HWND hWnd, int nCmdShow)'
);
const GetWindowPlacement = user32.func(
  'bool __stdcall GetWindowPlacement(HWND hWnd, _Inout_ WINDOWPLACEMENT *lpwndpl)'
);
const IsWindow = user32.func('bool __stdcall IsWindow(HWND hWnd)');

const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const SW_SHOWMINIMIZED = 2;
const SW_SHOWMAXIMIZED = 3;

const toHwnd = (value) => {
  try {
    const big = typeof value === 'bigint' ? value : BigInt(String(value || '0'));
    if (big === 0n) return null;
    // Koffi supports opaque pointers from BigInt on supported versions.
    return big;
  } catch {
    return null;
  }
};

module.exports = {
  koffi,
  user32,
  dwmapi,
  HWND,
  RECT,
  WINDOWPLACEMENT,
  GetWindowRect,
  DwmGetWindowAttribute,
  SetWindowPos,
  ShowWindowAsync,
  GetWindowPlacement,
  IsWindow,
  DWMWA_EXTENDED_FRAME_BOUNDS,
  SW_SHOWMINIMIZED,
  SW_SHOWMAXIMIZED,
  toHwnd,
};
