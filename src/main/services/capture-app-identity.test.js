'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createIconPathAndAppHelpers } = require('./icon-path-and-app-helpers');
const {
  isGenericCaptureProcessName,
  inferAppNameFromExecutablePath,
  deriveDisplayNameFromWindowTitle,
  resolveCaptureAppIdentity,
  inferSiblingLaunchExecutable,
} = require('./capture-app-identity');

const helpers = createIconPathAndAppHelpers({
  iconDataUrlCache: new Map(),
  maxUrlLength: 2048,
  maxShortcutPathLength: 4096,
  publicDir: '.',
});

const catalog = [
  {
    name: 'Anki',
    executablePath: 'C:\\Program Files\\Anki\\anki.exe',
    iconPath: 'data:image/png;base64,anki',
  },
  {
    name: 'Visual Studio Code',
    executablePath: 'C:\\Users\\Someone\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    iconPath: 'data:image/png;base64,code',
  },
  {
    name: 'Steam',
    executablePath: 'C:\\Program Files (x86)\\Steam\\steam.exe',
    iconPath: 'data:image/png;base64,steam',
  },
];

test('isGenericCaptureProcessName treats python hosts as generic', () => {
  assert.equal(isGenericCaptureProcessName('pythonw'), true);
  assert.equal(isGenericCaptureProcessName('pythonw.exe'), true);
  assert.equal(isGenericCaptureProcessName('Anki'), false);
  assert.equal(isGenericCaptureProcessName('Code'), false);
});

test('inferAppNameFromExecutablePath reads install folder before generic runtime exe', () => {
  assert.equal(
    inferAppNameFromExecutablePath('C:\\Program Files\\Anki\\pythonw.exe'),
    'Anki',
  );
  assert.equal(
    inferAppNameFromExecutablePath('C:\\Users\\Someone\\AppData\\Local\\Programs\\Anki\\pythonw.exe'),
    'Anki',
  );
});

test('deriveDisplayNameFromWindowTitle prefers trailing app segment', () => {
  assert.equal(deriveDisplayNameFromWindowTitle('User 1 - Anki'), 'Anki');
  assert.equal(deriveDisplayNameFromWindowTitle('Anki'), 'Anki');
  assert.equal(
    deriveDisplayNameFromWindowTitle('README.md - project - Visual Studio Code'),
    'Visual Studio Code',
  );
});

test('resolveCaptureAppIdentity maps pythonw Anki window to catalog Anki entry', () => {
  const resolved = resolveCaptureAppIdentity(
    {
      name: 'pythonw',
      title: 'User 1 - Anki',
      executablePath: 'C:\\Program Files\\Anki\\pythonw.exe',
    },
    catalog,
    helpers,
  );

  assert.equal(resolved.name, 'Anki');
  assert.equal(resolved.executablePath, 'C:\\Program Files\\Anki\\anki.exe');
  assert.equal(resolved.iconPath, 'data:image/png;base64,anki');
  assert.match(resolved.identitySource, /^catalog-/);
});

test('resolveCaptureAppIdentity resolves Anki from install folder when title is generic', () => {
  const resolved = resolveCaptureAppIdentity(
    {
      name: 'pythonw',
      title: 'Browse',
      executablePath: 'C:\\Program Files\\Anki\\pythonw.exe',
    },
    catalog,
    helpers,
  );

  assert.equal(resolved.name, 'Anki');
  assert.equal(resolved.executablePath, 'C:\\Program Files\\Anki\\anki.exe');
});

test('resolveCaptureAppIdentity keeps non-generic process names when catalog match exists', () => {
  const resolved = resolveCaptureAppIdentity(
    {
      name: 'Code',
      title: 'README.md - Visual Studio Code',
      executablePath: 'C:\\Users\\Someone\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    },
    catalog,
    helpers,
  );

  assert.equal(resolved.name, 'Visual Studio Code');
  assert.equal(resolved.iconPath, 'data:image/png;base64,code');
});

test('resolveCaptureAppIdentity maps steamwebhelper to Steam', () => {
  const resolved = resolveCaptureAppIdentity(
    {
      name: 'steamwebhelper',
      title: 'Steam',
      executablePath: 'C:\\Program Files (x86)\\Steam\\bin\\cef\\cef.win64\\steamwebhelper.exe',
    },
    catalog,
    helpers,
  );

  assert.equal(resolved.name, 'Steam');
  assert.equal(resolved.executablePath, 'C:\\Program Files (x86)\\Steam\\steam.exe');
});

test('inferSiblingLaunchExecutable prefers app exe beside generic runtime host', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowswitch-capture-'));
  const ankiDir = path.join(tempDir, 'Anki');
  fs.mkdirSync(ankiDir);
  const runtimePath = path.join(ankiDir, 'pythonw.exe');
  const launchPath = path.join(ankiDir, 'anki.exe');
  fs.writeFileSync(runtimePath, '');
  fs.writeFileSync(launchPath, '');

  assert.equal(
    path.win32.basename(inferSiblingLaunchExecutable(runtimePath, 'Anki') || '').toLowerCase(),
    'anki.exe',
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('resolveCaptureAppIdentity falls back to title for generic hosts without catalog match', () => {
  const resolved = resolveCaptureAppIdentity(
    {
      name: 'pythonw',
      title: 'Custom Tool',
      executablePath: 'C:\\Tools\\CustomTool\\pythonw.exe',
    },
    catalog,
    helpers,
  );

  assert.equal(resolved.name, 'Custom Tool');
  assert.equal(resolved.identitySource, 'window-title');
});
