const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const PROFILE_STORE_FILENAME = 'profiles.v1.json';

const normalizeProfiles = (raw) => (Array.isArray(raw) ? raw : []);

const getProfileStorePath = () => (
  path.join(app.getPath('userData'), PROFILE_STORE_FILENAME)
);

const readProfilesFromDisk = () => {
  const storePath = getProfileStorePath();
  if (!fs.existsSync(storePath)) return [];

  try {
    const content = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.profiles)) return parsed.profiles;
    return [];
  } catch (error) {
    console.error('[profile-store] Failed to read profiles:', error);
    return [];
  }
};

const writeProfilesToDisk = (profiles) => {
  const safeProfiles = normalizeProfiles(profiles);
  const storePath = getProfileStorePath();
  const dirPath = path.dirname(storePath);
  const tempPath = `${storePath}.tmp`;

  fs.mkdirSync(dirPath, { recursive: true });

  const payload = {
    version: 1,
    updatedAt: Date.now(),
    profiles: safeProfiles,
  };

  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tempPath, storePath);

  return safeProfiles;
};

module.exports = {
  readProfilesFromDisk,
  writeProfilesToDisk,
};
