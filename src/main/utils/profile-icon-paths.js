/** Max decoded size for base64 icon payloads (~2 MiB). */
const MAX_ICON_BYTES = 2 * 1024 * 1024;

/** Preset ids for `FlowProfile.icon` (must stay aligned with renderer `FLOW_PROFILE_VISUAL_ICON_IDS`). */
const FLOW_PROFILE_ROOT_ICON_PRESETS = new Set([
  'work',
  'gaming',
  'personal',
  'study',
  'development',
  'creative',
  'streaming',
  'music',
  'fitness',
  'coffee',
  'rocket',
  'moon',
  'laptop',
]);

/**
 * Allowlist: only raster image data URLs from main/icon pipeline (no SVG — XSS surface).
 * @param {unknown} value
 * @returns {boolean}
 */
const isSafeIconDataUrl = (value) => {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v.startsWith('data:image/')) return false;
  const match = /^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(v);
  if (!match) return false;
  const b64 = match[2].replace(/\s/g, '');
  const approxBytes = Math.floor((b64.length * 3) / 4);
  return approxBytes <= MAX_ICON_BYTES && approxBytes >= 0;
};

/**
 * Recursively clear unsafe `iconPath` strings anywhere in a profile object.
 * @param {unknown} value
 * @returns {unknown}
 */
const sanitizeProfileIconPathsDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProfileIconPathsDeep(item));
  }
  if (value && typeof value === 'object') {
    const out = { ...value };
    for (const key of Object.keys(out)) {
      if (key === 'iconPath') {
        const raw = out[key];
        if (raw == null) {
          out[key] = raw;
        } else {
          const str = String(raw);
          out[key] = isSafeIconDataUrl(str) ? str : null;
        }
      } else {
        out[key] = sanitizeProfileIconPathsDeep(out[key]);
      }
    }
    return out;
  }
  return value;
};

/**
 * Top-level profile visual icon: preset id or validated raster data URL.
 * @param {unknown} raw
 * @returns {string}
 */
const sanitizeProfileRootIcon = (raw) => {
  if (raw == null) return 'work';
  const s = String(raw).trim();
  if (isSafeIconDataUrl(s)) return s;
  const lc = s.toLowerCase().replace(/-/g, '_');
  if (FLOW_PROFILE_ROOT_ICON_PRESETS.has(lc)) return lc;
  return 'work';
};

module.exports = {
  isSafeIconDataUrl,
  sanitizeProfileIconPathsDeep,
  sanitizeProfileRootIcon,
};
