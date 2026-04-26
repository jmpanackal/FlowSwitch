const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSafeIconDataUrl,
  sanitizeProfileIconPathsDeep,
  sanitizeProfileRootIcon,
} = require('./profile-icon-paths');

const tinyPngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('isSafeIconDataUrl accepts png data URL', () => {
  assert.equal(isSafeIconDataUrl(`data:image/png;base64,${tinyPngB64}`), true);
});

test('isSafeIconDataUrl rejects svg', () => {
  assert.equal(isSafeIconDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);
});

test('isSafeIconDataUrl rejects non-data URLs', () => {
  assert.equal(isSafeIconDataUrl('https://x.com/i.png'), false);
});

test('sanitizeProfileIconPathsDeep nulls unsafe iconPath', () => {
  const out = sanitizeProfileIconPathsDeep({
    iconPath: 'https://evil.com/x.png',
    child: { iconPath: `data:image/png;base64,${tinyPngB64}` },
  });
  assert.equal(out.iconPath, null);
  assert.equal(out.child.iconPath?.startsWith('data:image/png'), true);
});

test('sanitizeProfileRootIcon keeps presets and safe data URLs', () => {
  assert.equal(sanitizeProfileRootIcon('gaming'), 'gaming');
  assert.equal(sanitizeProfileRootIcon('GAMING'), 'gaming');
  const png = `data:image/png;base64,${tinyPngB64}`;
  assert.equal(sanitizeProfileRootIcon(png), png);
});

test('sanitizeProfileRootIcon rejects unknown strings', () => {
  assert.equal(sanitizeProfileRootIcon('not-a-preset'), 'work');
  assert.equal(sanitizeProfileRootIcon('https://evil.com/x.png'), 'work');
});
