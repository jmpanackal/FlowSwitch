const path = require('path');
const { MAX_URL_LENGTH, MAX_SHORTCUT_PATH_LENGTH } = require('./limits');
const { safeLimitedString } = require('./url-safety');

/**
 * Protocols allowed for shell.openExternal from saved profiles (not http/https/file).
 */
const ALLOWED_APP_LAUNCH_PROTOCOLS = new Set([
  'steam',
  'com.epicgames.launcher',
  'uplay',
  'origin',
  'eadesktop',
  'twitch',
  'battle.net',
  'blizzard',
  'owexternal',
  'ms-windows-store',
  'microsoft-edge',
  'spotify',
  'slack',
  'discord',
  'msteam',
  'zoommtg',
  'zoomus',
  'obsidian',
  'vscode',
  'cursor',
  'figma',
  'notion',
  'mailto',
]);

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isSafeAppLaunchUrl = (value) => {
  const candidate = safeLimitedString(value, MAX_URL_LENGTH);
  if (!candidate) return false;
  try {
    const u = new URL(candidate);
    const p = String(u.protocol || '').replace(/:$/, '').toLowerCase();
    if (!p || p === 'http' || p === 'https' || p === 'file') return false;
    return ALLOWED_APP_LAUNCH_PROTOCOLS.has(p);
  } catch {
    return false;
  }
};

/**
 * Format-only validation for persisted profiles (no disk check — profiles may sync across machines).
 * @param {unknown} raw
 * @returns {string|null}
 */
const normalizeShortcutPathForProfile = (raw) => {
  const s = safeLimitedString(raw, MAX_SHORTCUT_PATH_LENGTH);
  if (!s) return null;
  const normalized = s.replace(/\//g, '\\').trim();
  if (!/^([a-zA-Z]:|\\\\)/.test(normalized)) return null;
  if (!normalized.toLowerCase().endsWith('.lnk')) return null;
  if (normalized.includes('..')) return null;
  try {
    return path.normalize(normalized);
  } catch {
    return null;
  }
};

/**
 * Sanitize launchUrl / shortcutPath on profile objects (recursive).
 * Invalid values become null.
 * @param {unknown} value
 * @returns {unknown}
 */
const sanitizeProfileLaunchFieldsDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProfileLaunchFieldsDeep(item));
  }
  if (value && typeof value === 'object') {
    const out = { ...value };
    for (const key of Object.keys(out)) {
      if (key === 'launchUrl') {
        const raw = out[key];
        out[key] = (typeof raw === 'string' && isSafeAppLaunchUrl(raw))
          ? safeLimitedString(raw, MAX_URL_LENGTH)
          : null;
      } else if (key === 'shortcutPath') {
        const raw = out[key];
        if (raw == null) {
          out[key] = raw;
        } else if (typeof raw === 'string') {
          const n = normalizeShortcutPathForProfile(raw);
          out[key] = n;
        } else {
          out[key] = null;
        }
      } else {
        out[key] = sanitizeProfileLaunchFieldsDeep(out[key]);
      }
    }
    return out;
  }
  return value;
};

module.exports = {
  ALLOWED_APP_LAUNCH_PROTOCOLS,
  isSafeAppLaunchUrl,
  normalizeShortcutPathForProfile,
  sanitizeProfileLaunchFieldsDeep,
  MAX_URL_LENGTH,
};
