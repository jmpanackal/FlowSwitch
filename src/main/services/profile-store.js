const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { sanitizeProfileIconPathsDeep } = require('../utils/profile-icon-paths');

const PROFILE_STORE_FILENAME = 'profiles.v1.json';

const MAGIC = Buffer.from([0x46, 0x4c, 0x53, 0x32]); // "FLS2"
const FORMAT_VERSION = 1;

const normalizeProfiles = (raw) => (Array.isArray(raw) ? raw : []);

const getProfileStorePath = () => (
  path.join(app.getPath('userData'), PROFILE_STORE_FILENAME)
);

const parseProfilesPayload = (parsed) => {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.profiles)) return parsed.profiles;
  return [];
};

const readProfilesFromDisk = () => {
  const storePath = getProfileStorePath();
  if (!fs.existsSync(storePath)) return [];

  try {
    const buf = fs.readFileSync(storePath);
    if (buf.length >= 5 && buf.subarray(0, 4).equals(MAGIC) && buf[4] === FORMAT_VERSION) {
      if (!safeStorage.isEncryptionAvailable()) {
        console.error('[profile-store] Encrypted store present but OS encryption is unavailable');
        return [];
      }
      const encrypted = buf.subarray(5);
      const decrypted = safeStorage.decryptString(encrypted);
      const parsed = JSON.parse(decrypted);
      const profiles = parseProfilesPayload(parsed);
      return profiles.map((p) => sanitizeProfileIconPathsDeep(p));
    }

    const content = buf.toString('utf8');
    const parsed = JSON.parse(content);
    const profiles = parseProfilesPayload(parsed);
    return profiles.map((p) => sanitizeProfileIconPathsDeep(p));
  } catch (error) {
    console.error('[profile-store] Failed to read profiles:', error);
    return [];
  }
};

const writeProfilesToDisk = (profiles) => {
  const safeProfiles = normalizeProfiles(profiles).map((p) => sanitizeProfileIconPathsDeep(p));
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
