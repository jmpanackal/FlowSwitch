const SOFTWARE_RENDERING_DISABLED_FEATURES = [
  'UseSkiaRenderer',
  'Vulkan',
  'CanvasOopRasterization',
  'VizDisplayCompositor',
  'Accelerated2dCanvas',
  'FluentScrollbar',
].join(',');

const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);

function shouldForceSoftwareRendering(env = process.env) {
  const value = env.FLOWSWITCH_SOFTWARE_RENDERING;
  if (typeof value !== 'string') return false;
  return TRUE_ENV_VALUES.has(value.trim().toLowerCase());
}

function applySoftwareRenderingWorkaround(electronApp) {
  electronApp.disableHardwareAcceleration();
  electronApp.commandLine.appendSwitch('disable-gpu');
  electronApp.commandLine.appendSwitch('disable-gpu-compositing');
  electronApp.commandLine.appendSwitch('in-process-gpu');
  electronApp.commandLine.appendSwitch('use-angle', 'swiftshader');
  electronApp.commandLine.appendSwitch('use-gl', 'swiftshader');
  electronApp.commandLine.appendSwitch('disable-direct-composition');
  electronApp.commandLine.appendSwitch('disable-d3d11');
  electronApp.commandLine.appendSwitch(
    'disable-features',
    SOFTWARE_RENDERING_DISABLED_FEATURES,
  );
}

module.exports = {
  applySoftwareRenderingWorkaround,
  shouldForceSoftwareRendering,
};
