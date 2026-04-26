/**
 * IPC-side guard before writing profiles: count/size limits, then per-field sanitizers (icons, URLs, launch fields).
 */
const {
  MAX_PROFILE_COUNT,
  MAX_PROFILE_ID_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILE_PAYLOAD_SIZE_BYTES,
} = require('./limits');
const { safeLimitedString, normalizeSafeUrl } = require('./url-safety');
const { sanitizeProfileIconPathsDeep, sanitizeProfileRootIcon } = require('./profile-icon-paths');
const { sanitizeProfileLaunchFieldsDeep } = require('./profile-launch-fields');

const sanitizeProfilesPayload = (profiles) => {
  if (!Array.isArray(profiles)) {
    throw new Error('Profiles payload must be an array');
  }
  if (profiles.length > MAX_PROFILE_COUNT) {
    throw new Error('Profiles payload exceeds maximum profile count');
  }

  const serialized = JSON.stringify(profiles);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROFILE_PAYLOAD_SIZE_BYTES) {
    throw new Error('Profiles payload exceeds size limit');
  }

  return profiles
    .filter((profile) => profile && typeof profile === 'object' && !Array.isArray(profile))
    .map((profile) => {
      const normalized = { ...profile };
      normalized.id = safeLimitedString(profile.id, MAX_PROFILE_ID_LENGTH);
      normalized.name = safeLimitedString(profile.name, MAX_PROFILE_NAME_LENGTH);
      normalized.icon = sanitizeProfileRootIcon(profile.icon);
      if (Array.isArray(profile.browserTabs)) {
        normalized.browserTabs = profile.browserTabs
          .map((tab) => {
            const url = normalizeSafeUrl(tab?.url);
            if (!url) return null;
            return { ...tab, url };
          })
          .filter(Boolean);
      }
      if (Array.isArray(profile.actions)) {
        normalized.actions = profile.actions
          .map((action) => {
            if (action?.type !== 'browserTab') return action;
            const url = normalizeSafeUrl(action?.url);
            if (!url) return null;
            return { ...action, url };
          })
          .filter(Boolean);
      }
      return sanitizeProfileLaunchFieldsDeep(sanitizeProfileIconPathsDeep(normalized));
    });
};

module.exports = {
  sanitizeProfilesPayload,
};
