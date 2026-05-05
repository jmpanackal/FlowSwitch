const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSafeHwndString,
  normalizeHwndForShellScript,
} = require('./explorer-window-tab-paths');

test('isSafeHwndString accepts decimal hwnd strings', () => {
  assert.equal(isSafeHwndString(''), false);
  assert.equal(isSafeHwndString('abc'), false);
  assert.equal(isSafeHwndString('123456'), true);
});

test('normalizeHwndForShellScript maps signed Int32-style HWND to unsigned', () => {
  assert.equal(normalizeHwndForShellScript('-1'), '4294967295');
});
