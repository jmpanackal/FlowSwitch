'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILENAME = 'app-preferences.v1.json';

const defaultPreferences = () => ({
  /** When true, main window is raised and kept above normal windows during profile launch. */
  pinMainWindowDuringProfileLaunch: true,
});

const getPreferencesPath = () => path.join(app.getPath('userData'), FILENAME);

const readAppPreferences = () => {
  const filePath = getPreferencesPath();
  let parsed = {};
  try {
    if (fs.existsSync(filePath)) {
      parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {
    parsed = {};
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...defaultPreferences(), ...parsed };
  }
  return { ...defaultPreferences() };
};

const writeAppPreferences = (partial) => {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    throw new Error('Invalid preferences patch');
  }
  const next = { ...readAppPreferences(), ...partial };
  const filePath = getPreferencesPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

module.exports = {
  defaultPreferences,
  readAppPreferences,
  writeAppPreferences,
};
