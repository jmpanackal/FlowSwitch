const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCompanionProcessHints } = require('./process-hints');

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
