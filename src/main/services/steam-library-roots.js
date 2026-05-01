'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Pull quoted "path" values from Steam libraryfolders.vdf (not strict JSON).
 * @param {string} content
 * @returns {string[]}
 */
function parseVdfLibraryFolderPaths(content) {
  const paths = [];
  const re = /"path"\s+"((?:[^"\\]|\\.)*)"/gi;
  let m;
  while ((m = re.exec(String(content || ''))) !== null) {
    paths.push(m[1].replace(/\\\\/g, '\\'));
  }
  return paths;
}

function readSteamPathFromRegistrySync() {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync(
      'reg.exe',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8', timeout: 4000, windowsHide: true },
    );
    const line = String(out || '')
      .split(/\r?\n/)
      .find((l) => /\bSteamPath\b/i.test(l));
    if (!line) return '';
    const m = /REG_SZ\s+(\S.*)$/i.exec(line.trim());
    if (!m) return '';
    return String(m[1] || '').trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * @param {string} steamRoot
 * @returns {string | null}
 */
function steamAppsCommonFromRoot(steamRoot) {
  if (!steamRoot) return null;
  const norm = path.normalize(String(steamRoot).replace(/\//g, '\\').trim());
  const common = path.join(norm, 'steamapps', 'common');
  try {
    if (fs.existsSync(common) && fs.statSync(common).isDirectory()) return common;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Roots under …/steamapps/common for optional deep exe discovery (games on extra drives).
 * @returns {string[]}
 */
function getSteamAppsCommonRootDirsSync() {
  const roots = new Set();
  const add = (p) => {
    const c = steamAppsCommonFromRoot(p);
    if (c) roots.add(c);
  };

  const programFilesX86 = process.env['ProgramFiles(x86)'] || '';
  const programFiles = process.env.ProgramFiles || '';
  const regSteamPath = readSteamPathFromRegistrySync();

  add(path.join(programFilesX86, 'Steam'));
  add(path.join(programFiles, 'Steam'));
  add(regSteamPath);

  const steamRootsToReadVdf = new Set();
  for (const r of [
    path.join(programFilesX86, 'Steam'),
    path.join(programFiles, 'Steam'),
    regSteamPath,
  ]) {
    if (r) steamRootsToReadVdf.add(path.normalize(r.replace(/\//g, '\\')));
  }

  for (const steamRoot of steamRootsToReadVdf) {
    const vdfPath = path.join(steamRoot, 'config', 'libraryfolders.vdf');
    let text = '';
    try {
      if (!fs.existsSync(vdfPath)) continue;
      text = fs.readFileSync(vdfPath, 'utf8');
    } catch {
      continue;
    }
    for (const raw of parseVdfLibraryFolderPaths(text)) {
      const lib = String(raw || '').trim();
      if (!lib || /^\d+$/.test(lib)) continue;
      add(lib);
    }
  }

  return [...roots];
}

module.exports = {
  getSteamAppsCommonRootDirsSync,
  parseVdfLibraryFolderPaths,
};
