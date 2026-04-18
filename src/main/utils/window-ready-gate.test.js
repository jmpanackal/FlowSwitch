const test = require('node:test');
const assert = require('node:assert/strict');
const {
  sortCandidateRows,
  waitForMainWindowReadyOrBlocker,
} = require('../services/window-ready-gate');

const buildRow = (overrides = {}) => ({
  handle: '100',
  className: 'Chrome_WidgetWin_1',
  title: 'Sample Window',
  titleLength: 12,
  hasOwner: true,
  topMost: false,
  tool: false,
  isMinimized: false,
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
    expectedBounds: { width: 1600, height: 900, state: 'normal' },
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
  assert.deepEqual(result.blockerHandles, ['327934']);
});

test('waitForMainWindowReadyOrBlocker ignores minimized ghost windows', async () => {
  const rows = [buildRow({
    handle: 'ghost-1',
    title: 'Steam',
    titleLength: 5,
    isMinimized: true,
  })];
  const result = await waitForMainWindowReadyOrBlocker({
    processHintLc: 'steam',
    expectedBounds: { width: 1920, height: 1080, state: 'maximized' },
    timeoutMs: 120,
    pollMs: 10,
    listWindows: async () => rows,
    sleep: async () => {},
    summarizeWindowRows: (items) => items,
    scoreWindowCandidate: () => 100,
  });

  assert.equal(result.ready, false);
  assert.equal(result.blocked, false);
  assert.equal(result.handle, null);
});

test('waitForMainWindowReadyOrBlocker rejects undersized maximized candidates', async () => {
  const rows = [buildRow({
    handle: 'steam-modal-like',
    width: 1234,
    height: 770,
    area: 1234 * 770,
    title: 'Who\'s playing?',
    titleLength: 13,
    hasOwner: false,
  })];
  const result = await waitForMainWindowReadyOrBlocker({
    processHintLc: 'steam',
    expectedBounds: { width: 2560, height: 1381, state: 'maximized' },
    timeoutMs: 120,
    pollMs: 10,
    listWindows: async () => rows,
    sleep: async () => {},
    summarizeWindowRows: (items) => items,
    scoreWindowCandidate: () => 100,
  });

  assert.equal(result.ready, false);
  assert.equal(result.handle, null);
});

test('waitForMainWindowReadyOrBlocker rejects owned top-level candidates for maximized placement', async () => {
  const rows = [buildRow({
    handle: 'owned-maximized-like',
    width: 2200,
    height: 1250,
    area: 2200 * 1250,
    hasOwner: true,
    topMost: true,
  })];
  const result = await waitForMainWindowReadyOrBlocker({
    processHintLc: 'steam',
    expectedBounds: { width: 2560, height: 1381, state: 'maximized' },
    timeoutMs: 120,
    pollMs: 10,
    listWindows: async () => rows,
    sleep: async () => {},
    summarizeWindowRows: (items) => items,
    scoreWindowCandidate: () => 100,
  });

  assert.equal(result.ready, false);
  assert.equal(result.handle, null);
});

test('waitForMainWindowReadyOrBlocker does not treat tool windows as confirmation blockers', async () => {
  // Regression: post-dismissal, Steam emits small `tool: true` SDL_app notification windows.
  // These must never stall the gate as confirmation blockers, even when a larger main window
  // candidate is already present in the same scan.
  const rows = [
    buildRow({
      handle: 'steam-tool-toast',
      className: 'SDL_app',
      title: 'Steam is updating content 1 of 2',
      titleLength: 39,
      hasOwner: true,
      topMost: false,
      tool: true,
      width: 496,
      height: 123,
      area: 496 * 123,
    }),
    buildRow({
      handle: 'steam-main',
      className: 'SDL_app',
      title: 'Steam',
      titleLength: 5,
      hasOwner: false,
      topMost: false,
      tool: false,
      width: 2400,
      height: 1350,
      area: 2400 * 1350,
    }),
  ];
  const result = await waitForMainWindowReadyOrBlocker({
    processHintLc: 'steam',
    processHints: ['steamwebhelper'],
    expectedBounds: { width: 2560, height: 1381, state: 'maximized' },
    timeoutMs: 3000,
    pollMs: 10,
    listWindows: async () => rows,
    sleep: async () => {},
    summarizeWindowRows: (items) => items,
    scoreWindowCandidate: (row) => Number(row?.area || 0),
  });

  assert.equal(result.ready, true);
  assert.equal(result.blocked, false);
  assert.equal(result.handle, 'steam-main');
});

test('waitForMainWindowReadyOrBlocker filters out quarantined handles via excludeHandles', async () => {
  // Simulate Steam's post-confirmation resume: pre-dismissal chooser and overlay windows are
  // quarantined; a new post-dismissal main window is the only eligible candidate.
  const rows = [
    buildRow({
      handle: 'chooser-4917910',
      className: 'SDL_app',
      title: 'Sign in to Steam',
      titleLength: 15,
      hasOwner: false,
      width: 1234,
      height: 770,
      area: 1234 * 770,
    }),
    buildRow({
      handle: 'overlay-ghost-8850622',
      className: 'SDL_app',
      title: 'Steam',
      titleLength: 5,
      hasOwner: false,
      width: 2200,
      height: 1250,
      area: 2200 * 1250,
    }),
    buildRow({
      handle: 'real-steam-main',
      className: 'SDL_app',
      title: 'Steam',
      titleLength: 5,
      hasOwner: false,
      width: 2400,
      height: 1350,
      area: 2400 * 1350,
    }),
  ];
  const result = await waitForMainWindowReadyOrBlocker({
    processHintLc: 'steam',
    processHints: ['steamwebhelper'],
    expectedBounds: { width: 2560, height: 1381, state: 'maximized' },
    timeoutMs: 5000,
    pollMs: 10,
    listWindows: async () => rows,
    sleep: async () => {},
    summarizeWindowRows: (items) => items,
    scoreWindowCandidate: (row) => Number(row?.area || 0),
    excludeHandles: new Set(['chooser-4917910', 'overlay-ghost-8850622']),
  });

  assert.equal(result.ready, true);
  assert.equal(result.blocked, false);
  assert.equal(result.handle, 'real-steam-main');
});

test('sortCandidateRows uses deterministic tie-break when scores are equal', () => {
  const rows = [
    buildRow({ handle: '300', area: 500000, titleLength: 6 }),
    buildRow({ handle: '120', area: 500000, titleLength: 6 }),
    buildRow({ handle: '200', area: 520000, titleLength: 4 }),
  ];
  const sorted = sortCandidateRows(rows, () => 100, 'obs64');
  assert.deepEqual(
    sorted.map((row) => row.handle),
    ['200', '120', '300'],
  );
});
