const test = require('node:test');
const assert = require('node:assert/strict');
const { isRectCloseToTargetBounds } = require('./placement-orchestrator');

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
