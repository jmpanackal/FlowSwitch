'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseProfileLaunchIdFromArgv,
  toElectronAccelerator,
  PROFILE_ARG_PREFIX,
} = require('./profile-access-shell');

test('parseProfileLaunchIdFromArgv reads argv array entry', () => {
  const id = 'prof-1';
  const got = parseProfileLaunchIdFromArgv([
    'exe',
    `${PROFILE_ARG_PREFIX}${encodeURIComponent(id)}`,
  ]);
  assert.equal(got, id);
});

test('parseProfileLaunchIdFromArgv reads Windows-style command line string', () => {
  const id = 'my profile';
  const enc = encodeURIComponent(id);
  const line = `"C:\\Apps\\FlowSwitch.exe" --other ${PROFILE_ARG_PREFIX}${enc} --tail`;
  assert.equal(parseProfileLaunchIdFromArgv(line), id);
});

test('toElectronAccelerator maps Ctrl to CommandOrControl', () => {
  assert.equal(toElectronAccelerator('Ctrl+Shift+9'), 'CommandOrControl+Shift+9');
});
