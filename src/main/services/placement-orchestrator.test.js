const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isRectCloseToTargetBounds,
  explorerLoosePlacementAccepts,
  classifyNormalCorrection,
  computeFrameInsets,
  computeZoneAnchoredOuterBounds,
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

test('classifyNormalCorrection returns flush when within tolerance', () => {
  assert.equal(
    classifyNormalCorrection({
      visibleRect: { left: 1, top: 0, width: 1919, height: 1037 },
      targetBounds: { left: 0, top: 0, width: 1920, height: 1038, state: 'normal' },
      flushTolerancePx: 3,
    }),
    'flush',
  );
});

test('classifyNormalCorrection flags size-constrained when window far exceeds zone', () => {
  // Audacity-style min-size window: visible height much larger than the requested zone.
  assert.equal(
    classifyNormalCorrection({
      visibleRect: { left: 8, top: 0, width: 1912, height: 1458 },
      targetBounds: { left: 0, top: 0, width: 1920, height: 1038, state: 'normal' },
      flushTolerancePx: 3,
    }),
    'size-constrained',
  );
});

test('classifyNormalCorrection fine-tunes a small residual', () => {
  assert.equal(
    classifyNormalCorrection({
      visibleRect: { left: 0, top: 0, width: 1908, height: 1030 },
      targetBounds: { left: 0, top: 0, width: 1920, height: 1038, state: 'normal' },
      flushTolerancePx: 3,
    }),
    'fine-tune',
  );
});

test('computeFrameInsets derives per-edge invisible border from outer vs visible rect', () => {
  const insets = computeFrameInsets(
    { left: -4, top: 0, width: 1936, height: 1470 },
    { left: 8, top: 0, width: 1912, height: 1458 },
  );
  assert.deepEqual(insets, { left: 12, top: 0, right: 12, bottom: 12 });
});

test('computeZoneAnchoredOuterBounds anchors visible top-left to the zone, keeps window size', () => {
  const result = computeZoneAnchoredOuterBounds({
    visibleRect: { left: 8, top: 0, width: 1912, height: 1458 },
    outerRect: { left: -4, top: 0, width: 1936, height: 1470 },
    targetBounds: { left: 0, top: 0, width: 1920, height: 1038, state: 'normal' },
    monitorTarget: { x: 0, y: 0, width: 3840, height: 2078 },
  });
  // Outer left offset so the visible frame's left (outer.left + leftInset) lands on the zone left (0).
  assert.equal(result.left, -12);
  assert.equal(result.top, 0);
  assert.equal(result.width, 1936);
  assert.equal(result.height, 1470);
});

test('computeZoneAnchoredOuterBounds clamps so the visible frame stays on the monitor', () => {
  const result = computeZoneAnchoredOuterBounds({
    visibleRect: { left: 900, top: 50, width: 560, height: 400 },
    outerRect: { left: 893, top: 50, width: 574, height: 407 },
    targetBounds: { left: 900, top: 50, width: 200, height: 200, state: 'normal' },
    monitorTarget: { x: 0, y: 0, width: 1000, height: 1000 },
  });
  // Visible width 560 cannot start at x=900 on a 1000px monitor; it pulls back to 1000-560=440.
  const leftInset = 900 - 893; // 7
  assert.equal(result.left, 440 - leftInset);
  assert.equal(result.width, 574);
});
