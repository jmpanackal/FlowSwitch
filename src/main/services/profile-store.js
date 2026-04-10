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

/**
 * Read profiles from disk. Never silently drops encrypted data: if the OS cannot
 * decrypt, `storeError` is set and `profiles` is empty.
 * @returns {{ profiles: unknown[], storeError: ProfileStoreReadError | null }}
 */
const readProfilesFromDisk = () => {
  const storePath = getProfileStorePath();
  if (!fs.existsSync(storePath)) {
    return { profiles: [], storeError: null };
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
          storeError: {
            code: 'PARSE_FAILED',
            message: 'Decrypted profile data could not be read. The file may be damaged.',
          },
        };
      }
      const profiles = parseProfilesPayload(parsed);
      return {
        profiles: mapSanitizedProfiles(profiles),
        storeError: null,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(buf.toString('utf8'));
    } catch (err) {
      console.error('[profile-store] JSON parse failed (plain JSON):', err);
      return {
        profiles: [],
        storeError: {
          code: 'PARSE_FAILED',
          message: (
            'Your profiles file could not be parsed. It may be damaged or edited incorrectly.'
          ),
        },
      };
    }
    const profiles = parseProfilesPayload(parsed);
    return {
      profiles: mapSanitizedProfiles(profiles),
      storeError: null,
    };
  } catch (error) {
    console.error('[profile-store] Failed to read profiles:', error);
    return {
      profiles: [],
      storeError: {
        code: 'READ_FAILED',
        message: (
          'Could not read your saved profiles (for example a permission or disk error).'
        ),
      },
    };
  }
};

const writeProfilesToDisk = (profiles) => {
  const safeProfiles = normalizeProfiles(profiles).map((p) => sanitizeProfileLaunchFieldsDeep(sanitizeProfileIconPathsDeep(p)));
  const storePath = getProfileStorePath();
  const dirPath = path.dirname(storePath);
  const tempPath = `${storePath}.tmp`;

  fs.mkdirSync(dirPath, { recursive: true });

  const payload = {
    version: 1,
    updatedAt: Date.now(),
    profiles: safeProfiles,
  };

  const json = JSON.stringify(payload, null, 2);

  if (safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = safeStorage.encryptString(JSON.stringify({
        version: payload.version,
        updatedAt: payload.updatedAt,
        profiles: safeProfiles,
      }));
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
