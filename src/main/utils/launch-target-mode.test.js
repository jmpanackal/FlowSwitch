const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isWithinAcceptableStateTolerance,
  planLaunchSlots,
  scoreReuseCandidate,
  shouldTriggerAmbiguityFallback,
} = require('../utils/launch-target-mode');

test('planLaunchSlots reuses min(existing, requested) and spawns remainder', () => {
  const plan = planLaunchSlots({
    requestedSlots: 5,
    existingHandles: ['h-1', 'h-2', 'h-3'],
  });

  assert.equal(plan.reuseCount, 3);
  assert.equal(plan.spawnCount, 2);
  assert.deepEqual(plan.reuseHandles, ['h-1', 'h-2', 'h-3']);
  assert.equal(plan.reuseSlots.length, 3);
  assert.deepEqual(plan.reuseSlots, [
    { slotIndex: 0, handle: 'h-1' },
    { slotIndex: 1, handle: 'h-2' },
    { slotIndex: 2, handle: 'h-3' },
  ]);
  assert.equal(plan.spawnSlots.length, 2);
  assert.deepEqual(plan.spawnSlots, [
    { slotIndex: 3 },
    { slotIndex: 4 },
  ]);
  assert.equal(plan.slots.length, 5);
  assert.deepEqual(
    plan.slots.map((slot) => slot.mode),
    ['reuse', 'reuse', 'reuse', 'spawn', 'spawn'],
  );
});

test('scoreReuseCandidate uses deterministic weighted scoring', () => {
  const score = scoreReuseCandidate({
    monitorAffinity: 1,
    geometrySimilarity: 0.5,
    recencyStability: 0.25,
    reuseAffinity: 0.75,
    visibilityQuality: 0.5,
  });

  const expected = (1 * 0.32)
    + (0.5 * 0.24)
    + (0.25 * 0.20)
    + (0.75 * 0.14)
    + (0.5 * 0.10);
  assert.equal(score, expected);
});

test('scoreReuseCandidate favors monitor affinity over geometry/recency in comparison case', () => {
  const monitorAffinityCandidate = scoreReuseCandidate({
    monitorAffinity: 1,
    geometrySimilarity: 0,
    recencyStability: 0,
    reuseAffinity: 0.5,
    visibilityQuality: 0.5,
  });

  const geometryRecencyCandidate = scoreReuseCandidate({
    monitorAffinity: 0,
    geometrySimilarity: 1,
    recencyStability: 0.3,
    reuseAffinity: 0.5,
    visibilityQuality: 0.5,
  });

  assert.ok(
    monitorAffinityCandidate > geometryRecencyCandidate,
    'monitor affinity should outrank this geometry/recency combination',
  );
});

test('shouldTriggerAmbiguityFallback when score delta is small', () => {
  assert.equal(
    shouldTriggerAmbiguityFallback({
      topScore: 0.70,
      secondScore: 0.65,
      flipsIn3Polls: 0,
    }),
    true,
  );
});

test('shouldTriggerAmbiguityFallback when ranking flips are unstable', () => {
  assert.equal(
    shouldTriggerAmbiguityFallback({
      topScore: 0.90,
      secondScore: 0.75,
      flipsIn3Polls: 2,
    }),
    true,
  );
});

test('shouldTriggerAmbiguityFallback stays false for stable clear winner', () => {
  assert.equal(
    shouldTriggerAmbiguityFallback({
      topScore: 0.90,
      secondScore: 0.75,
      flipsIn3Polls: 1,
    }),
    false,
  );
});

test('reuse slots execute before spawn slots when applying plan order', () => {
  const events = [];
  const runPlan = ({ requestedSlots, existingHandles }) => {
    const { reuseSlots, spawnSlots } = planLaunchSlots({ requestedSlots, existingHandles });
    for (const slot of reuseSlots) events.push(`reuse:${slot.handle}`);
    for (const slot of spawnSlots) events.push(`spawn:${slot.slotIndex}`);
  };

  runPlan({ requestedSlots: 3, existingHandles: ['w1'] });
  assert.deepEqual(events, ['reuse:w1', 'spawn:1', 'spawn:2']);
});

test('isWithinAcceptableStateTolerance accepts normal state within threshold deltas', () => {
  assert.equal(
    isWithinAcceptableStateTolerance({
      actual: {
        left: 110,
        top: 96,
        width: 1268,
        height: 742,
      },
      target: {
        left: 100,
        top: 100,
        width: 1280,
        height: 720,
        state: 'normal',
      },
      onTargetMonitor: true,
    }),
    true,
  );
});

test('isWithinAcceptableStateTolerance rejects normal state when outside thresholds', () => {
  assert.equal(
    isWithinAcceptableStateTolerance({
      actual: {
        left: 121,
        top: 100,
        width: 1280,
        height: 720,
      },
      target: {
        left: 100,
        top: 100,
        width: 1280,
        height: 720,
        state: 'normal',
      },
      onTargetMonitor: true,
    }),
    false,
  );
});

test('isWithinAcceptableStateTolerance requires target monitor match', () => {
  assert.equal(
    isWithinAcceptableStateTolerance({
      actual: {
        left: 100,
        top: 100,
        width: 1280,
        height: 720,
      },
      target: {
        left: 100,
        top: 100,
        width: 1280,
        height: 720,
        state: 'normal',
      },
      onTargetMonitor: false,
    }),
    false,
  );
});

test('isWithinAcceptableStateTolerance accepts maximized state with meaningful bounds', () => {
  assert.equal(
    isWithinAcceptableStateTolerance({
      actual: {
        left: 0,
        top: 0,
        width: 1700,
        height: 980,
      },
      target: {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        state: 'maximized',
      },
      onTargetMonitor: true,
    }),
    true,
  );
});

test('isWithinAcceptableStateTolerance rejects maximized state with underfilled bounds', () => {
  assert.equal(
    isWithinAcceptableStateTolerance({
      actual: {
        left: 0,
        top: 0,
        width: 900,
        height: 500,
      },
      target: {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        state: 'maximized',
      },
      onTargetMonitor: true,
    }),
    false,
  );
});
