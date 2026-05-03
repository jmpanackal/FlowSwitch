const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isRectCloseToTargetBounds,
  explorerLoosePlacementAccepts,
} = require('./placement-orchestrator');

test('isRectCloseToTargetBounds accepts normal within tolerance', () => {
  assert.equal(
    isRectCloseToTargetBounds(
      { left: 10, top: 20, width: 100, height: 200 },
      { left: 11, top: 21, width: 101, height: 199, state: 'normal' },
      6,
    ),
    true,
  );
});

test('isRectCloseToTargetBounds ignores pixel checks when bounds not normal', () => {
  assert.equal(
    isRectCloseToTargetBounds(
      { left: 0, top: 0, width: 1, height: 1 },
      { left: 999, top: 999, width: 9, height: 9, state: 'maximized' },
      6,
    ),
    true,
  );
});

test('explorerLoosePlacementAccepts allows large explorer window overlapping slot', () => {
  const monitor = {
    workAreaPhysical: { x: 0, y: 0, width: 1920, height: 1080 },
  };
  const bounds = { left: 100, top: 100, width: 640, height: 480, state: 'normal' };
  const visibleRect = { left: 80, top: 90, width: 1200, height: 800 };
  assert.equal(
    explorerLoosePlacementAccepts({
      visibleRect,
      bounds,
      monitor,
      processHintLc: 'explorer',
    }),
    true,
  );
});

test('explorerLoosePlacementAccepts rejects non-explorer process key', () => {
  const monitor = { workAreaPhysical: { x: 0, y: 0, width: 1920, height: 1080 } };
  const bounds = { left: 100, top: 100, width: 640, height: 480, state: 'normal' };
  const visibleRect = { left: 80, top: 90, width: 1200, height: 800 };
  assert.equal(
    explorerLoosePlacementAccepts({
      visibleRect,
      bounds,
      monitor,
      processHintLc: 'notepad',
    }),
    false,
  );
});
