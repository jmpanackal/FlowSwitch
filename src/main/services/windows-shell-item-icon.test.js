const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSafeWindowsShellIconProbePath,
  isSafeWindowsAppsFolderMoniker,
} = require('./windows-shell-item-icon');

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

test('isSafeWindowsAppsFolderMoniker accepts shell AppsFolder AUMID', () => {
  assert.equal(
    isSafeWindowsAppsFolderMoniker('shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'),
    true,
  );
});

test('isSafeWindowsAppsFolderMoniker rejects malformed monikers', () => {
  assert.equal(isSafeWindowsAppsFolderMoniker('shell:AppsFolder\\..\\bad!App'), false);
  assert.equal(isSafeWindowsAppsFolderMoniker('shell:AppsFolder\\NoBang'), false);
});
