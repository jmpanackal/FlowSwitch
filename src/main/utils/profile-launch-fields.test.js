const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSafeAppLaunchUrl,
  normalizeShortcutPathForProfile,
  sanitizeProfileLaunchFieldsDeep,
} = require('./profile-launch-fields');

test('isSafeAppLaunchUrl allows listed custom protocols', () => {
  assert.equal(isSafeAppLaunchUrl('steam://run/123'), true);
  assert.equal(isSafeAppLaunchUrl('cursor://file/path'), true);
});

test('isSafeAppLaunchUrl rejects http(s) and file', () => {
  assert.equal(isSafeAppLaunchUrl('https://example.com'), false);
  assert.equal(isSafeAppLaunchUrl('http://example.com'), false);
  assert.equal(isSafeAppLaunchUrl('file:///C:/x'), false);
});

test('normalizeShortcutPathForProfile accepts valid .lnk paths', () => {
  assert.match(
    normalizeShortcutPathForProfile('C:\\Programs\\App.lnk') || '',
    /App\.lnk$/i,
  );
});

test('normalizeShortcutPathForProfile rejects traversal and bad roots', () => {
  assert.equal(normalizeShortcutPathForProfile('C:\\a\\..\\b.lnk'), null);
  assert.equal(normalizeShortcutPathForProfile('relative\\x.lnk'), null);
  assert.equal(normalizeShortcutPathForProfile('C:\\\\x.exe'), null);
});

test('sanitizeProfileLaunchFieldsDeep clears bad launchUrl and keeps good', () => {
  const out = sanitizeProfileLaunchFieldsDeep({
    launchUrl: 'javascript:alert(1)',
    nested: { launchUrl: 'steam://open/main' },
  });
  assert.equal(out.launchUrl, null);
  assert.equal(out.nested.launchUrl, 'steam://open/main');
});

test('sanitizeProfileLaunchFieldsDeep normalizes shortcutPath', () => {
  const out = sanitizeProfileLaunchFieldsDeep({
    shortcutPath: 'C:/Apps/App.lnk',
  });
  assert.ok(
    out.shortcutPath
    && String(out.shortcutPath).replace(/\\/g, '/').toLowerCase().endsWith('apps/app.lnk'),
  );
});
