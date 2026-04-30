const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applySoftwareRenderingWorkaround,
  shouldForceSoftwareRendering,
} = require('./software-rendering-flags');

test('software rendering is disabled by default', () => {
  assert.equal(shouldForceSoftwareRendering({}), false);
});

test('software rendering can be enabled with an environment flag', () => {
  assert.equal(
    shouldForceSoftwareRendering({ FLOWSWITCH_SOFTWARE_RENDERING: '1' }),
    true,
  );
  assert.equal(
    shouldForceSoftwareRendering({ FLOWSWITCH_SOFTWARE_RENDERING: 'true' }),
    true,
  );
  assert.equal(
    shouldForceSoftwareRendering({ FLOWSWITCH_SOFTWARE_RENDERING: 'yes' }),
    true,
  );
});

test('software rendering remains disabled for explicit false-like values', () => {
  assert.equal(
    shouldForceSoftwareRendering({ FLOWSWITCH_SOFTWARE_RENDERING: '0' }),
    false,
  );
  assert.equal(
    shouldForceSoftwareRendering({ FLOWSWITCH_SOFTWARE_RENDERING: 'false' }),
    false,
  );
});

test('software rendering workaround preserves Chromium fallback switches', () => {
  const switches = [];
  let hardwareAccelerationDisabled = false;
  const fakeApp = {
    disableHardwareAcceleration() {
      hardwareAccelerationDisabled = true;
    },
    commandLine: {
      appendSwitch(name, value) {
        switches.push([name, value]);
      },
    },
  };

  applySoftwareRenderingWorkaround(fakeApp);

  assert.equal(hardwareAccelerationDisabled, true);
  assert.deepEqual(switches, [
    ['disable-gpu', undefined],
    ['disable-gpu-compositing', undefined],
    ['in-process-gpu', undefined],
    ['use-angle', 'swiftshader'],
    ['use-gl', 'swiftshader'],
    ['disable-direct-composition', undefined],
    ['disable-d3d11', undefined],
    [
      'disable-features',
      'UseSkiaRenderer,Vulkan,CanvasOopRasterization,VizDisplayCompositor,Accelerated2dCanvas,FluentScrollbar',
    ],
  ]);
});
