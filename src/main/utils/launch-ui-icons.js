'use strict';

/** Cap embedded icons in launch status IPC (chars, not bytes). */
const MAX_LAUNCH_ICON_DATA_URL_CHARS = 2_200_000;

/**
 * Returns a safe raster data URL from profile app fields for launch progress UI.
 * Mirrors renderer `safeIconSrc` policy (non-SVG raster only).
 */
const launchIconDataUrlFromProfileApp = (app) => {
  if (!app || typeof app !== 'object') return null;
  const candidates = [
    typeof app.iconPath === 'string' ? app.iconPath.trim() : '',
    typeof app.icon === 'string' ? app.icon.trim() : '',
  ].filter(Boolean);
  for (const raw of candidates) {
    if (!raw.startsWith('data:image/')) continue;
    if (raw.length > MAX_LAUNCH_ICON_DATA_URL_CHARS) continue;
    if (!/^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,/i.test(raw)) continue;
    return raw;
  }
  return null;
};

module.exports = {
  launchIconDataUrlFromProfileApp,
  MAX_LAUNCH_ICON_DATA_URL_CHARS,
};
