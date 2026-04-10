const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeProfilesPayload } = require('./sanitize-profiles-payload');

test('sanitizeProfilesPayload throws on non-array', () => {
  assert.throws(() => sanitizeProfilesPayload(null), /must be an array/);
});

test('sanitizeProfilesPayload trims id and name', () => {
  const [one] = sanitizeProfilesPayload([
    { id: '  abc  ', name: '  N  ', monitors: [] },
  ]);
  assert.equal(one.id, 'abc');
  assert.equal(one.name, 'N');
});

test('sanitizeProfilesPayload drops non-http browser tab urls', () => {
  const [one] = sanitizeProfilesPayload([
    {
      id: '1',
      name: 'p',
      browserTabs: [
        { url: 'https://ok.example/' },
        { url: 'javascript:alert(1)' },
      ],
    },
  ]);
  assert.equal(one.browserTabs.length, 1);
  assert.equal(one.browserTabs[0].url, 'https://ok.example/');
});

test('sanitizeProfilesPayload filters browserTab actions with bad urls', () => {
  const [one] = sanitizeProfilesPayload([
    {
      id: '1',
      name: 'p',
      actions: [
        { type: 'browserTab', url: 'https://a/' },
        { type: 'browserTab', url: 'file:///C:/x' },
        { type: 'other', x: 1 },
      ],
    },
  ]);
  assert.equal(one.actions.length, 2);
  assert.equal(one.actions[0].url, 'https://a/');
  assert.equal(one.actions[1].type, 'other');
});
