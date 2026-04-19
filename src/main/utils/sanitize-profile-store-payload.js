/**
 * Validates and lightly normalizes the full profile store document (profiles +
 * global content library) before writing to disk.
 */
const {
  MAX_PROFILE_COUNT,
  MAX_PROFILE_ID_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  MAX_PROFILE_PAYLOAD_SIZE_BYTES,
} = require('./limits');
const { safeLimitedString, normalizeSafeUrl } = require('./url-safety');
const { sanitizeProfileIconPathsDeep } = require('./profile-icon-paths');
const { sanitizeProfileLaunchFieldsDeep } = require('./profile-launch-fields');

const MAX_CONTENT_ITEMS = 8000;
const MAX_CONTENT_FOLDERS = 2000;
const MAX_CONTENT_STRING = 4096;
const MAX_EXCLUSIONS_PER_PROFILE = 4000;

const clampStr = (v, max) => safeLimitedString(String(v ?? ''), max);

const sanitizeProfilesArray = (profiles) => {
  if (!Array.isArray(profiles)) {
    throw new Error('Profiles payload must be an array');
  }
  if (profiles.length > MAX_PROFILE_COUNT) {
    throw new Error('Profiles payload exceeds maximum profile count');
  }

  return profiles
    .filter((profile) => profile && typeof profile === 'object' && !Array.isArray(profile))
    .map((profile) => {
      const normalized = { ...profile };
      normalized.id = safeLimitedString(profile.id, MAX_PROFILE_ID_LENGTH);
      normalized.name = safeLimitedString(profile.name, MAX_PROFILE_NAME_LENGTH);
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

const sanitizeContentItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MAX_CONTENT_ITEMS).map((row) => {
    if (!row || typeof row !== 'object') return null;
    const id = clampStr(row.id, 128);
    if (!id) return null;
    const type = row.type === 'link' ? 'link' : 'file';
    const out = {
      ...row,
      id,
      type,
      name: clampStr(row.name, MAX_CONTENT_STRING),
      defaultApp: clampStr(row.defaultApp, 256),
      parentId: row.parentId ? clampStr(row.parentId, 128) : undefined,
      url: type === 'link' ? normalizeSafeUrl(row.url) || '' : row.url,
      path: row.path ? clampStr(row.path, MAX_CONTENT_STRING) : undefined,
      fileType: row.fileType ? clampStr(row.fileType, 64) : undefined,
      description: row.description ? clampStr(row.description, MAX_CONTENT_STRING) : undefined,
    };
    if (type === 'link' && !out.url) return null;
    return out;
  }).filter(Boolean);
};

const sanitizeContentFolders = (folders) => {
  if (!Array.isArray(folders)) return [];
  return folders.slice(0, MAX_CONTENT_FOLDERS).map((row) => {
    if (!row || typeof row !== 'object') return null;
    const id = clampStr(row.id, 128);
    if (!id) return null;
    const children = Array.isArray(row.children)
      ? row.children.map((c) => clampStr(c, 128)).filter(Boolean)
      : [];
    return {
      ...row,
      id,
      name: clampStr(row.name, MAX_CONTENT_STRING),
      type: 'folder',
      defaultApp: clampStr(row.defaultApp, 256),
      parentId: row.parentId ? clampStr(row.parentId, 128) : undefined,
      diskPath: row.diskPath ? clampStr(row.diskPath, MAX_CONTENT_STRING) : undefined,
      contentType: row.contentType === 'link' || row.contentType === 'file' || row.contentType === 'mixed'
        ? row.contentType
        : 'mixed',
      children: children.slice(0, MAX_CONTENT_ITEMS),
    };
  }).filter(Boolean);
};

const sanitizeExclusions = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [pid, arr] of Object.entries(raw)) {
    const profileId = clampStr(pid, MAX_PROFILE_ID_LENGTH);
    if (!profileId || !Array.isArray(arr)) continue;
    out[profileId] = arr
      .map((x) => clampStr(x, 128))
      .filter(Boolean)
      .slice(0, MAX_EXCLUSIONS_PER_PROFILE);
  }
  return out;
};

/**
 * @param {unknown} payload
 * @returns {{ profiles: unknown[], contentLibrary: { items: unknown[], folders: unknown[] }, contentLibraryExclusions: Record<string, string[]> }}
 */
const sanitizeProfileStorePayload = (payload) => {
  let profilesInput;
  let libraryInput;
  let exclusionsInput;

  if (Array.isArray(payload)) {
    profilesInput = payload;
    libraryInput = { items: [], folders: [] };
    exclusionsInput = {};
  } else if (payload && typeof payload === 'object') {
    profilesInput = payload.profiles;
    libraryInput = payload.contentLibrary;
    exclusionsInput = payload.contentLibraryExclusions;
  } else {
    throw new Error('Invalid profile store payload');
  }

  const profiles = sanitizeProfilesArray(profilesInput);
  const contentLibrary = {
    items: sanitizeContentItems(libraryInput?.items),
    folders: sanitizeContentFolders(libraryInput?.folders),
  };
  const contentLibraryExclusions = sanitizeExclusions(exclusionsInput);

  const blob = JSON.stringify({ profiles, contentLibrary, contentLibraryExclusions });
  if (Buffer.byteLength(blob, 'utf8') > MAX_PROFILE_PAYLOAD_SIZE_BYTES) {
    throw new Error('Profile store payload exceeds size limit');
  }

  return { profiles, contentLibrary, contentLibraryExclusions };
};

module.exports = {
  sanitizeProfileStorePayload,
};
