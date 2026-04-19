const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { sanitizeProfileIconPathsDeep } = require('../utils/profile-icon-paths');
const { sanitizeProfileLaunchFieldsDeep } = require('../utils/profile-launch-fields');

const PROFILE_STORE_FILENAME = 'profiles.v1.json';

const MAGIC = Buffer.from([0x46, 0x4c, 0x53, 0x32]); // "FLS2"
const FORMAT_VERSION = 1;

/** @typedef {{ code: string, message: string }} ProfileStoreReadError */

const normalizeProfiles = (raw) => (Array.isArray(raw) ? raw : []);

const getProfileStorePath = () => (
  path.join(app.getPath('userData'), PROFILE_STORE_FILENAME)
);

const parseProfilesPayload = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.profiles)) return parsed.profiles;
  return [];
};

const mapSanitizedProfiles = (profiles) => (
  profiles.map((p) => sanitizeProfileLaunchFieldsDeep(sanitizeProfileIconPathsDeep(p)))
);

const emptyLibrary = () => ({ items: [], folders: [] });

/**
 * One-time migration: library lived on each profile. Merge by id into a global
 * library and clear embedded arrays so future saves stay normalized.
 * @param {unknown[]} profiles
 * @returns {{ items: unknown[], folders: unknown[] }}
 */
const migrateEmbeddedContentToLibrary = (profiles) => {
  const seenItem = new Map();
  const seenFolder = new Map();
  let found = false;
  for (const p of profiles) {
    if (!p || typeof p !== 'object') continue;
    for (const it of p.contentItems || []) {
      if (it && typeof it === 'object' && it.id && !seenItem.has(String(it.id))) {
        seenItem.set(String(it.id), it);
        found = true;
      }
    }
    for (const f of p.contentFolders || []) {
      if (f && typeof f === 'object' && f.id && !seenFolder.has(String(f.id))) {
        seenFolder.set(String(f.id), f);
        found = true;
      }
    }
  }
  if (!found) return emptyLibrary();
  for (const p of profiles) {
    if (!p || typeof p !== 'object') continue;
    p.contentItems = [];
    p.contentFolders = [];
  }
  return { items: [...seenItem.values()], folders: [...seenFolder.values()] };
};

const parseRootContentLibrary = (parsed, profiles, hadRootLibraryKey) => {
  if (
    hadRootLibraryKey
    && parsed.contentLibrary
    && typeof parsed.contentLibrary === 'object'
  ) {
    const items = Array.isArray(parsed.contentLibrary.items) ? parsed.contentLibrary.items : [];
    const folders = Array.isArray(parsed.contentLibrary.folders) ? parsed.contentLibrary.folders : [];
    return { items, folders };
  }
  return migrateEmbeddedContentToLibrary(profiles);
};

const parseExclusions = (parsed) => {
  const ex = parsed?.contentLibraryExclusions;
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return {};
  const out = {};
  for (const [pid, arr] of Object.entries(ex)) {
    if (typeof pid !== 'string' || !Array.isArray(arr)) continue;
    out[pid] = arr.filter((x) => typeof x === 'string');
  }
  return out;
};

const buildReadSuccess = (parsed) => {
  const rawProfiles = parseProfilesPayload(parsed);
  const profiles = mapSanitizedProfiles(rawProfiles);
  const hadRootLibraryKey = Boolean(
    parsed && Object.prototype.hasOwnProperty.call(parsed, 'contentLibrary'),
  );
  const contentLibrary = parseRootContentLibrary(parsed, profiles, hadRootLibraryKey);
  const contentLibraryExclusions = parseExclusions(parsed);
  if (hadRootLibraryKey) {
    for (const p of profiles) {
      if (p && typeof p === 'object') {
        p.contentItems = [];
        p.contentFolders = [];
      }
    }
  }
  return {
    profiles,
    contentLibrary,
    contentLibraryExclusions,
    storeError: null,
  };
};

/**
 * Read profiles + global content library from disk.
 * @returns {{
 *   profiles: unknown[],
 *   contentLibrary: { items: unknown[], folders: unknown[] },
 *   contentLibraryExclusions: Record<string, string[]>,
 *   storeError: ProfileStoreReadError | null
 * }}
 */
const readProfilesFromDisk = () => {
  const storePath = getProfileStorePath();
  if (!fs.existsSync(storePath)) {
    return {
      profiles: [],
      contentLibrary: emptyLibrary(),
      contentLibraryExclusions: {},
      storeError: null,
    };
  }

  try {
    const buf = fs.readFileSync(storePath);
    if (buf.length >= 5 && buf.subarray(0, 4).equals(MAGIC) && buf[4] === FORMAT_VERSION) {
      if (!safeStorage.isEncryptionAvailable()) {
        const message = (
          'Your profile data is encrypted, but this PC cannot use OS secure storage to unlock it '
          + '(encryption unavailable). Your profiles were not loaded. '
          + 'Try signing into Windows with your usual account or move userData to a machine '
          + 'where Electron safeStorage works.'
        );
        console.error('[profile-store] Encrypted store present but OS encryption is unavailable');
        return {
          profiles: [],
          contentLibrary: emptyLibrary(),
          contentLibraryExclusions: {},
          storeError: { code: 'ENCRYPTION_UNAVAILABLE', message },
        };
      }
      const encrypted = buf.subarray(5);
      let decrypted;
      try {
        decrypted = safeStorage.decryptString(encrypted);
      } catch (err) {
        console.error('[profile-store] Decrypt failed:', err);
        return {
          profiles: [],
          contentLibrary: emptyLibrary(),
          contentLibraryExclusions: {},
          storeError: {
            code: 'DECRYPT_FAILED',
            message: (
              'Could not decrypt your profile data. The file may be corrupted, '
              + 'or it was created under a different Windows user or machine.'
            ),
          },
        };
      }
      let parsed;
      try {
        parsed = JSON.parse(decrypted);
      } catch (err) {
        console.error('[profile-store] JSON parse failed (encrypted payload):', err);
        return {
          profiles: [],
          contentLibrary: emptyLibrary(),
          contentLibraryExclusions: {},
          storeError: {
            code: 'PARSE_FAILED',
            message: 'Decrypted profile data could not be read. The file may be damaged.',
          },
        };
      }
      return buildReadSuccess(parsed);
    }

    let parsed;
    try {
      parsed = JSON.parse(buf.toString('utf8'));
    } catch (err) {
      console.error('[profile-store] JSON parse failed (plain JSON):', err);
      return {
        profiles: [],
        contentLibrary: emptyLibrary(),
        contentLibraryExclusions: {},
        storeError: {
          code: 'PARSE_FAILED',
          message: (
            'Your profiles file could not be parsed. It may be damaged or edited incorrectly.'
          ),
        },
      };
    }
    return buildReadSuccess(parsed);
  } catch (error) {
    console.error('[profile-store] Failed to read profiles:', error);
    return {
      profiles: [],
      contentLibrary: emptyLibrary(),
      contentLibraryExclusions: {},
      storeError: {
        code: 'READ_FAILED',
        message: (
          'Could not read your saved profiles (for example a permission or disk error).'
        ),
      },
    };
  }
};

/**
 * Persist profiles and global content library.
 * @param {{
 *   profiles: unknown[],
 *   contentLibrary: { items: unknown[], folders: unknown[] },
 *   contentLibraryExclusions?: Record<string, string[]>
 * } | unknown[]} payload
 * @returns {unknown[]} sanitized profiles (for callers that still expect an array)
 */
const writeProfilesToDisk = (payload) => {
  let profiles;
  let contentLibrary;
  let contentLibraryExclusions;

  if (Array.isArray(payload)) {
    const disk = readProfilesFromDisk();
    profiles = normalizeProfiles(payload);
    contentLibrary = disk.contentLibrary && typeof disk.contentLibrary === 'object'
      ? disk.contentLibrary
      : emptyLibrary();
    contentLibraryExclusions = disk.contentLibraryExclusions && typeof disk.contentLibraryExclusions === 'object'
      ? disk.contentLibraryExclusions
      : {};
  } else if (payload && typeof payload === 'object') {
    profiles = normalizeProfiles(payload.profiles);
    contentLibrary = payload.contentLibrary && typeof payload.contentLibrary === 'object'
      ? {
        items: Array.isArray(payload.contentLibrary.items) ? payload.contentLibrary.items : [],
        folders: Array.isArray(payload.contentLibrary.folders) ? payload.contentLibrary.folders : [],
      }
      : emptyLibrary();
    contentLibraryExclusions = payload.contentLibraryExclusions && typeof payload.contentLibraryExclusions === 'object'
      ? payload.contentLibraryExclusions
      : {};
  } else {
    throw new Error('Invalid profile store write payload');
  }

  const safeProfiles = profiles.map((p) => sanitizeProfileLaunchFieldsDeep(sanitizeProfileIconPathsDeep(p)));
  const storePath = getProfileStorePath();
  const dirPath = path.dirname(storePath);
  const tempPath = `${storePath}.tmp`;

  fs.mkdirSync(dirPath, { recursive: true });

  const storeBody = {
    version: 1,
    updatedAt: Date.now(),
    profiles: safeProfiles,
    contentLibrary,
    contentLibraryExclusions,
  };

  const json = JSON.stringify(storeBody, null, 2);

  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(JSON.stringify(storeBody));
      const out = Buffer.concat([MAGIC, Buffer.from([FORMAT_VERSION]), encrypted]);
      fs.writeFileSync(tempPath, out);
      fs.renameSync(tempPath, storePath);
      return safeProfiles;
    } catch (error) {
      console.error('[profile-store] Encryption failed, falling back to plain JSON:', error);
    }
  }

  fs.writeFileSync(tempPath, json, 'utf8');
  fs.renameSync(tempPath, storePath);
  return safeProfiles;
};

module.exports = {
  readProfilesFromDisk,
  writeProfilesToDisk,
};
