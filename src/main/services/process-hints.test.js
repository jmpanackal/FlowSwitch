const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROCESS_HINTS_VERSION,
  buildCompanionProcessHints,
  computeCompanionHintsFromProcessRows,
} = require('./process-hints');

test('PROCESS_HINTS_VERSION is a non-empty semver-style token', () => {
  assert.match(PROCESS_HINTS_VERSION, /^\d+\.\d+\.\d+$/);
});

test('buildCompanionProcessHints returns empty list for blank base', async () => {
  const hints = await buildCompanionProcessHints({ baseProcessHintLc: '' });
  assert.deepEqual(hints, []);
});

test('buildCompanionProcessHints always includes normalized base hint', async () => {
  const hints = await buildCompanionProcessHints({
    baseProcessHintLc: 'SomeApp.EXE',
  });
  assert.ok(hints.includes('someapp'));
});

test('computeCompanionHintsFromProcessRows does not substring-match unrelated Chromium browsers', () => {
  const hints = computeCompanionHintsFromProcessRows('vival', [
    { name: 'Vivaldi.exe' },
    { name: 'notepad.exe' },
  ]);
  assert.deepEqual(hints, ['vival']);
});

test('computeCompanionHintsFromProcessRows still links googlechrome to chrome via substring', () => {
  const hints = computeCompanionHintsFromProcessRows('chrome', [
    { name: 'googlechrome.exe' },
  ]);
  assert.ok(hints.includes('chrome'));
  assert.ok(hints.includes('googlechrome'));
});
