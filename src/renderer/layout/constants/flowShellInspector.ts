/**
 * Width reserved for the fixed right inspector drawer.
 * Keep drawer `w-*` and main column `mr-*` in sync so content is not covered.
 * ~2/3 of the prior clamp(18–24rem / 24vw) so the canvas keeps more room when the inspector is open.
 */
export const FLOW_SHELL_INSPECTOR_WIDTH_CLASS = "w-[clamp(14.25rem,19.5vw,18.25rem)]";

export const FLOW_SHELL_INSPECTOR_MARGIN_CLASS = "mr-[clamp(14.25rem,19.5vw,18.25rem)]";
