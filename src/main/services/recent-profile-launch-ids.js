'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILENAME = 'recent-profile-launch-ids.v1.json';
const MAX_RECENT = 3;

const getStorePath = () => path.join(app.getPath('userData'), FILENAME);

const readRecentProfileLaunchIds = () => {
  try {
    const filePath = getStorePath();
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
};

const writeRecentProfileLaunchIds = (ids) => {
  const safe = (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .slice(0, MAX_RECENT);
  const filePath = getStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(safe, null, 2), 'utf8');
  return safe;
};

const recordRecentProfileLaunchId = (profileId) => {
  const id = String(profileId || '').trim();
  if (!id) return readRecentProfileLaunchIds();
  const prev = readRecentProfileLaunchIds().filter((x) => x !== id);
  prev.unshift(id);
  return writeRecentProfileLaunchIds(prev);
};

module.exports = {
  MAX_RECENT,
  readRecentProfileLaunchIds,
  recordRecentProfileLaunchId,
};
