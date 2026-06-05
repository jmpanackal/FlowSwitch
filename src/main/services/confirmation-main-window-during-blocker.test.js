'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findMainWindowDuringBlocker,
  attemptMainWindowPlacementDuringBlocker,
} = require('./confirmation-main-window-during-blocker');

test('findMainWindowDuringBlocker prefers main window over #32770 confirmation dialog', async () => {
  const rows = [
    {
      handle: '100',
      className: '#32770',
      width: 621,
      height: 424,
      enabled: true,
      tool: false,
      cloaked: false,
      hung: false,
      isMinimized: false,
      titleLength: 24,
    },
    {
      handle: '200',
      className: 'wxWindowNR',
      width: 900,
      height: 640,
      enabled: true,
      tool: false,
      cloaked: false,
      hung: false,
      isMinimized: false,
      titleLength: 18,
    },
  ];

  const placementBounds = { width: 1280, height: 691, state: 'normal' };
  const result = await findMainWindowDuringBlocker({
    processHintLc: 'audacity',
    processHints: ['audacity'],
    placementBounds,
    excludeHandles: ['100'],
    getVisibleWindowInfos: async () => rows,
    scoreWindowCandidate: (row) => Number(row.width || 0) * Number(row.height || 0),
    isLikelyMainPlacementWindowIgnoringBlocker: (row) => (
      String(row?.className || '').toLowerCase() === 'wxwindownr'
    ),
  });

  assert.equal(result.handle, '200');
});

test('attemptMainWindowPlacementDuringBlocker moves the discovered main handle', async () => {
  let movedHandle = null;
  const placementBounds = { left: 0, top: 0, width: 1280, height: 691, state: 'normal' };
  const result = await attemptMainWindowPlacementDuringBlocker({
    processHintLc: 'audacity',
    processHints: ['audacity'],
    placementBounds,
    excludeHandles: ['100'],
    getVisibleWindowInfos: async () => ([{
      handle: '200',
      className: 'wxWindowNR',
      width: 900,
      height: 640,
      enabled: true,
      tool: false,
      cloaked: false,
      hung: false,
      isMinimized: false,
      titleLength: 18,
    }]),
    scoreWindowCandidate: (row) => Number(row.width || 0) * Number(row.height || 0),
    isLikelyMainPlacementWindowIgnoringBlocker: (row) => (
      String(row?.className || '').toLowerCase() === 'wxwindownr'
    ),
    moveSpecificWindowHandleToBounds: async ({ handle }) => {
      movedHandle = handle;
      return { applied: true, handle };
    },
  });

  assert.equal(result.applied, true);
  assert.equal(result.handle, '200');
  assert.equal(movedHandle, '200');
});

test('findMainWindowDuringBlocker falls back to relaxed candidate when strict heuristic misses', async () => {
  const rows = [
    {
      handle: '300',
      className: 'wxWindowNR',
      width: 920,
      height: 630,
      enabled: true,
      tool: false,
      cloaked: false,
      hung: false,
      isMinimized: false,
      titleLength: 8,
    },
  ];
  const placementBounds = { width: 1280, height: 691, state: 'normal' };
  const result = await findMainWindowDuringBlocker({
    processHintLc: 'audacity',
    processHints: ['audacity'],
    placementBounds,
    excludeHandles: [],
    getVisibleWindowInfos: async () => rows,
    scoreWindowCandidate: (row) => Number(row.width || 0) * Number(row.height || 0),
    isLikelyMainPlacementWindowIgnoringBlocker: () => false,
  });
  assert.equal(result.handle, '300');
});
