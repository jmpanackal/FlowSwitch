const test = require('node:test');
const assert = require('node:assert/strict');

test('launchTrace is disabled when FLOWSWITCH_LAUNCH_TRACE is unset', () => {
  delete process.env.FLOWSWITCH_LAUNCH_TRACE;
  delete require.cache[require.resolve('./launch-trace')];
  const { launchTrace, isLaunchTraceEnabled } = require('./launch-trace');
  assert.equal(isLaunchTraceEnabled(), false);
  launchTrace('should-not-throw');
});

test('isLaunchTraceEnabled is true when FLOWSWITCH_LAUNCH_TRACE=1', () => {
  process.env.FLOWSWITCH_LAUNCH_TRACE = '1';
  delete require.cache[require.resolve('./launch-trace')];
  const { isLaunchTraceEnabled } = require('./launch-trace');
  assert.equal(isLaunchTraceEnabled(), true);
  delete process.env.FLOWSWITCH_LAUNCH_TRACE;
  delete require.cache[require.resolve('./launch-trace')];
});
