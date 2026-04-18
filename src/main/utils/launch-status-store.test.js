const test = require('node:test');
const assert = require('node:assert/strict');
const { createLaunchStatusStore } = require('./launch-status-store');

test('startRun sets active run and supersedes previous run for same profile', () => {
  const store = createLaunchStatusStore({ now: () => 1700000000000 });
  const firstRun = store.startRun('profile-1');
  const secondRun = store.startRun('profile-1');

  assert.ok(firstRun?.runId);
  assert.ok(secondRun?.runId);
  assert.notEqual(secondRun.runId, firstRun.runId);
  assert.equal(secondRun.replacedRunId, firstRun.runId);
  assert.equal(store.isActiveRun('profile-1', firstRun.runId), false);
  assert.equal(store.isActiveRun('profile-1', secondRun.runId), true);
});

test('publishStatus rejects inactive run and accepts active run', () => {
  let tick = 0;
  const store = createLaunchStatusStore({ now: () => 1700000000000 + (tick += 1) });
  const firstRun = store.startRun('profile-1');
  const secondRun = store.startRun('profile-1');

  const staleWrite = store.publishStatus('profile-1', firstRun.runId, {
    state: 'in-progress',
    launchedAppCount: 1,
  });
  assert.equal(staleWrite.published, false);
  assert.equal(staleWrite.reason, 'inactive-run');

  const activeWrite = store.publishStatus('profile-1', secondRun.runId, {
    state: 'awaiting-confirmations',
    launchedAppCount: 2,
    launchedTabCount: 1,
    failedAppCount: 0,
    skippedAppCount: 0,
    requestedAppCount: 3,
    pendingConfirmations: [
      {
        name: 'Steam',
        path: 'C:\\Steam\\steam.exe',
        reason: 'Confirm',
        mode: 'reused_existing_window',
        reasonCode: 'reused_existing_window',
        status: 'waiting',
      },
    ],
  });

  assert.equal(activeWrite.published, true);
  assert.equal(activeWrite.status.runId, secondRun.runId);
  assert.equal(activeWrite.status.pendingConfirmationCount, 1);
  assert.equal(activeWrite.status.unresolvedPendingConfirmationCount, 1);
  assert.equal(activeWrite.status.pendingConfirmations[0]?.mode, 'reused_existing_window');
  assert.equal(activeWrite.status.pendingConfirmations[0]?.reasonCode, 'reused_existing_window');
});

test('sealRun prevents late async status writes from same run', () => {
  const store = createLaunchStatusStore({ now: () => 1700000000000 });
  const run = store.startRun('profile-1');

  const initial = store.publishStatus('profile-1', run.runId, {
    state: 'in-progress',
    launchedAppCount: 1,
    pendingConfirmations: [],
  });
  assert.equal(initial.published, true);

  store.sealRun('profile-1', run.runId, 'complete');
  assert.equal(store.isActiveRun('profile-1', run.runId), false);

  const lateWrite = store.publishStatus('profile-1', run.runId, {
    state: 'awaiting-confirmations',
    pendingConfirmations: [{ name: 'Late', path: '', reason: 'Late', status: 'waiting' }],
  });
  assert.equal(lateWrite.published, false);
  assert.equal(lateWrite.reason, 'inactive-run');

  const status = store.getStatus('profile-1');
  assert.equal(status?.state, 'complete');
  assert.equal(status?.runId, run.runId);
});
