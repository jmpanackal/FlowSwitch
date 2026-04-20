const test = require('node:test');
const assert = require('node:assert/strict');
const { isSafeWindowsShellIconProbePath } = require('./windows-shell-item-icon');

test('isSafeWindowsShellIconProbePath rejects UNC and traversal', () => {
  assert.equal(isSafeWindowsShellIconProbePath('\\\\server\\share\\a.exe'), false);
  assert.equal(isSafeWindowsShellIconProbePath('C:\\good\\..\\bad.exe'), false);
});

test('isSafeWindowsShellIconProbePath accepts absolute drive paths with allowed extensions', () => {
  assert.equal(isSafeWindowsShellIconProbePath('C:\\Apps\\x.exe'), true);
  assert.equal(isSafeWindowsShellIconProbePath('D:\\Start\\Discord.lnk'), true);
  assert.equal(isSafeWindowsShellIconProbePath('C:\\page.url'), true);
});

test('isSafeWindowsShellIconProbePath rejects odd extensions', () => {
  assert.equal(isSafeWindowsShellIconProbePath('C:\\x.bat'), false);
});
