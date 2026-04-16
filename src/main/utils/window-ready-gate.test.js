const test = require('node:test');
const assert = require('node:assert/strict');
const { waitForMainWindowReadyOrBlocker } = require('../services/window-ready-gate');

const buildRow = (overrides = {}) => ({
  handle: '100',
  className: 'Chrome_WidgetWin_1',
  title: 'Sample Window',
  titleLength: 12,
  hasOwner: true,
  topMost: false,
  tool: false,
  enabled: true,
  hung: false,
  cloaked: false,
  width: 1300,
  height: 700,
  area: 910000,
  ...overrides,
});

test('waitForMainWindowReadyOrBlocker treats overlapping blocker/main candidate as ready', async () => {
  const rows = [buildRow({ handle: '68810' })];
  const result = await waitForMainWindowReadyOrBlocker({
    processHintLc: 'notion',
    expectedBounds: { width: 1920, height: 1080, state: 'maximized' },
    timeoutMs: 5000,
    pollMs: 10,
    listWindows: async () => rows,
    sleep: async () => {},
    summarizeWindowRows: (items) => items,
    scoreWindowCandidate: () => 100,
  });

  assert.equal(result.ready, true);
  assert.equal(result.blocked, false);
  assert.equal(result.handle, '68810');
});

test('waitForMainWindowReadyOrBlocker still blocks for true non-candidate modal', async () => {
  const rows = [buildRow({
    handle: '327934',
    className: '#32770',
    width: 620,
    height: 420,
    area: 260400,
  })];
  const result = await waitForMainWindowReadyOrBlocker({
    processHintLc: 'obs64',
    expectedBounds: { width: 1920, height: 1080, state: 'maximized' },
    timeoutMs: 5000,
    pollMs: 10,
    listWindows: async () => rows,
    sleep: async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
    summarizeWindowRows: (items) => items,
    scoreWindowCandidate: () => 50,
  });

  assert.equal(result.ready, false);
  assert.equal(result.blocked, true);
  assert.equal(result.blockerKind, 'confirmation');
  assert.equal(result.blockerHandle, '327934');
});
