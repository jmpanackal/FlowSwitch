'use strict';

/**
 * Single source of truth for profile launch "weight" thresholds (main + renderer).
 * See docs/superpowers/specs/large-profile-launch-guardrails.md
 */

/** One unit per deduped app launch row (same notion as launch pipeline). */
const LAUNCH_WEIGHT_PER_APP_LAUNCH = 1;

/** One unit per deduped browser tab URL (profile.browserTabs + legacy action URLs). */
const LAUNCH_WEIGHT_PER_BROWSER_TAB = 1;

/**
 * Soft threshold: renderer may show a confirm dialog before IPC (Phase 2).
 * Main process does not block on this alone.
 */
const LAUNCH_WEIGHT_SOFT_WARN_UNITS = 32;

/**
 * Hard ceiling: main rejects launch before starting a run when totalUnits exceeds this.
 * Tune after dogfood; keep in sync with spec revision history when changed.
 */
const LAUNCH_WEIGHT_HARD_MAX_UNITS = 100;

module.exports = {
  LAUNCH_WEIGHT_PER_APP_LAUNCH,
  LAUNCH_WEIGHT_PER_BROWSER_TAB,
  LAUNCH_WEIGHT_SOFT_WARN_UNITS,
  LAUNCH_WEIGHT_HARD_MAX_UNITS,
};
