const test = require('node:test');
const assert = require('node:assert/strict');
const { launchIconDataUrlFromProfileApp } = require('./launch-ui-icons');

test('launchIconDataUrlFromProfileApp accepts iconPath data URL', () => {
  const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal(
    launchIconDataUrlFromProfileApp({ iconPath: url }),
    url,
  );
});

test('launchIconDataUrlFromProfileApp accepts string icon field', () => {
  const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal(
    launchIconDataUrlFromProfileApp({ icon: url }),
    url,
  );
});

test('launchIconDataUrlFromProfileApp rejects https', () => {
  assert.equal(
    launchIconDataUrlFromProfileApp({ iconPath: 'https://x.test/a.png' }),
    null,
  );
});
