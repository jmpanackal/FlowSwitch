'use strict';

/** Time the user has to dismiss a confirmation modal before FlowSwitch times out that wait. */
const CONFIRMATION_USER_WAIT_MS = 10_000;

/** Settle delay after blocker dismissal before selecting the post-modal main window. */
const CONFIRMATION_POST_DISMISS_SETTLE_MS = 800;

/** Budget to find and place the main window after the user dismisses the modal. */
const CONFIRMATION_POST_DISMISS_PLACE_MS = 32_000;

const computeConfirmationUserDeadlineMs = (startedAtMs = Date.now()) => (
  Math.floor(Number(startedAtMs)) + CONFIRMATION_USER_WAIT_MS
);

const computeConfirmationSessionEndsAtMs = (startedAtMs = Date.now()) => (
  Math.floor(Number(startedAtMs))
  + CONFIRMATION_USER_WAIT_MS
  + CONFIRMATION_POST_DISMISS_SETTLE_MS
  + CONFIRMATION_POST_DISMISS_PLACE_MS
);

module.exports = {
  CONFIRMATION_USER_WAIT_MS,
  CONFIRMATION_POST_DISMISS_SETTLE_MS,
  CONFIRMATION_POST_DISMISS_PLACE_MS,
  computeConfirmationUserDeadlineMs,
  computeConfirmationSessionEndsAtMs,
};
