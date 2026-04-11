/**
 * Optional verbose logging for profile launch and Win32 placement.
 * Hot paths call `launchTrace` instead of `console.log` so normal runs stay quiet.
 *
 * Enable: `FLOWSWITCH_LAUNCH_TRACE=1`, or run `npm run dev:launch-trace` (works on Windows PowerShell).
 */

const isLaunchTraceEnabled = () => process.env.FLOWSWITCH_LAUNCH_TRACE === '1';

/** @param {...unknown} args */
const launchTrace = (...args) => {
  if (isLaunchTraceEnabled()) {
    console.log(...args);
  }
};

module.exports = {
  launchTrace,
  isLaunchTraceEnabled,
};
