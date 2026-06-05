'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONFIRMATION_USER_WAIT_MS,
  computeConfirmationUserDeadlineMs,
  computeConfirmationSessionEndsAtMs,
} = require('./launch-confirmation-limits');

test('confirmation user deadline matches configured wait from start', () => {
  const start = 1_000_000;
  assert.equal(
    computeConfirmationUserDeadlineMs(start),
    start + CONFIRMATION_USER_WAIT_MS,
  );
  assert.equal(CONFIRMATION_USER_WAIT_MS, 10_000);
});

test('confirmation session deadline includes post-dismiss budgets', () => {
  const start = 1_000_000;
  assert.equal(
    computeConfirmationSessionEndsAtMs(start),
    start + 10_000 + 800 + 32_000,
  );
});
