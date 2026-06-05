'use strict';

const fs = require('fs');
const path = require('path');

/** Runtime hosts that rarely identify the user-facing app on their own. */
const GENERIC_CAPTURE_PROCESS_BASENAMES = new Set([
  'python',
  'pythonw',
  'python3',
  'py',
  'electron',
  'java',
  'javaw',
  'node',
  'nw',
  'ruby',
  'perl',
  'dotnet',
  'mono',
]);

const INSTALL_PATH_SKIP_SEGMENTS = new Set([
  'program files',
  'program files (x86)',
  'common files',
  'windowsapps',
  'application',
  'applications',
  'app',
  'apps',
  'bin',
  'binaries',
  'runtime',
  'runtimes',
  'lib',
  'libs',
  'library',
  'libraries',
  'resources',
  'data',
  'local',
  'locallow',
  'roaming',
  'appdata',
  'users',
  'user',
  'packages',
  'programs',
  'program',
  'common',
  'steam',
  'steamapps',
  'version',
  'versions',
  'x64',
  'x86',
  'win64',
  'win32',
  'win',
  'linux',
  'mac',
  'dist',
  'release',
  'debug',
]);

const normalizeProcessBasename = (processName) => (
  String(processName || '').trim().toLowerCase().replace(/\.exe$/i, '')
);

const isGenericCaptureProcessName = (processName) => (
  GENERIC_CAPTURE_PROCESS_BASENAMES.has(normalizeProcessBasename(processName))
);

const normalizeExePathKey = (exePath) => {
  const raw = String(exePath || '').trim();
  if (!raw) return '';
  try {
    return path.win32.normalize(raw.replace(/\//g, '\\')).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
};

const titleCaseSegment = (segment) => {
  const s = String(segment || '').trim();
  if (!s) return '';
  if (/^[A-Z0-9][A-Za-z0-9+.#]*$/.test(s)) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Derive a human app label from an install folder segment (e.g. .../Anki/pythonw.exe).
 * @param {string | null | undefined} executablePath
 * @returns {string | null}
 */
const inferAppNameFromExecutablePath = (executablePath) => {
  const norm = normalizeExePathKey(executablePath);
  if (!norm) return null;
  const parts = norm.split('\\').filter(Boolean);
  if (parts.length < 2) return null;

  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const segment = parts[i];
    const lc = segment.toLowerCase();
    if (INSTALL_PATH_SKIP_SEGMENTS.has(lc)) continue;
    if (/^\d+([._-]\d+)*$/.test(segment)) continue;
    if (segment.length < 2 || segment.length > 48) continue;
    return titleCaseSegment(segment);
  }
  return null;
};

/**
 * Pull an app label from a window title. Prefers the trailing segment in
 * "Document - App Name" style titles common on Windows.
 * @param {string | null | undefined} title
 * @returns {string | null}
 */
const deriveDisplayNameFromWindowTitle = (title) => {
  const raw = String(title || '').trim();
  if (!raw) return null;
  if (/^(program manager|default ime|microsoft text input application)$/i.test(raw)) return null;

  const segments = raw
    .split(/\s+[-–—|]\s+/)
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  if (segments.length >= 2) {
    const last = segments[segments.length - 1];
    if (last.length >= 2 && last.length <= 48) return last;
  }
  if (raw.length >= 2 && raw.length <= 64) return raw;
  return raw.slice(0, 64).trim();
};

const buildCaptureCatalogIndex = (catalog, getCanonicalAppKey) => {
  const byCanonicalKey = new Map();
  const byExePath = new Map();
  const byFolderSegment = new Map();

  const addFolderSegment = (segment, entry) => {
    const key = String(segment || '').trim().toLowerCase();
    if (!key || key.length < 2) return;
    const bucket = byFolderSegment.get(key) || [];
    bucket.push(entry);
    byFolderSegment.set(key, bucket);
  };

  for (const entry of catalog || []) {
    const name = String(entry?.name || '').trim();
    if (!name) continue;
    const canonical = getCanonicalAppKey(name);
    if (!canonical) continue;
    if (!byCanonicalKey.has(canonical)) {
      byCanonicalKey.set(canonical, entry);
    }

    const exePath = normalizeExePathKey(entry?.executablePath);
    if (exePath) {
      byExePath.set(exePath, entry);
      const parts = exePath.split('\\').filter(Boolean);
      for (const segment of parts) {
        addFolderSegment(segment.replace(/\.exe$/i, ''), entry);
      }
    }
  }

  return { byCanonicalKey, byExePath, byFolderSegment };
};

const findCatalogEntryByCanonicalName = (index, name, getCanonicalAppKey) => {
  const key = getCanonicalAppKey(name);
  if (!key) return null;
  return index.byCanonicalKey.get(key) || null;
};

const findCatalogEntryForExecutablePath = (index, executablePath) => {
  const norm = normalizeExePathKey(executablePath);
  if (!norm) return null;
  const direct = index.byExePath.get(norm);
  if (direct) return direct;

  for (const [catalogExePath, entry] of index.byExePath.entries()) {
    if (norm.endsWith(catalogExePath) || catalogExePath.endsWith(norm)) return entry;
    const catalogDir = catalogExePath.slice(0, Math.max(0, catalogExePath.lastIndexOf('\\')));
    if (catalogDir && norm.startsWith(`${catalogDir}\\`)) return entry;
  }
  return null;
};

const findCatalogEntryForFolderHint = (index, folderHint, getCanonicalAppKey) => {
  const hintKey = getCanonicalAppKey(folderHint);
  if (!hintKey) return null;
  const bucket = index.byFolderSegment.get(hintKey) || [];
  if (bucket.length === 1) return bucket[0];
  if (bucket.length > 1) {
    const exact = bucket.find((entry) => getCanonicalAppKey(entry.name) === hintKey);
    return exact || bucket[0];
  }
  return findCatalogEntryByCanonicalName(index, folderHint, getCanonicalAppKey);
};

/**
 * When a generic runtime host lives in an app install folder, prefer a sibling
 * launch executable such as Anki/anki.exe next to pythonw.exe.
 * @param {string | null | undefined} executablePath
 * @param {string | null | undefined} appName
 * @returns {string | null}
 */
const inferSiblingLaunchExecutable = (executablePath, appName) => {
  const raw = String(executablePath || '').trim();
  if (!raw) return null;
  const basename = path.win32.basename(raw);
  if (!isGenericCaptureProcessName(basename)) return raw;

  let dir;
  try {
    dir = path.win32.dirname(raw.replace(/\//g, '\\'));
  } catch {
    return raw;
  }
  if (!dir) return raw;

  const folderHint = inferAppNameFromExecutablePath(raw);
  const nameHint = String(appName || '').trim();
  const stems = new Set(
    [folderHint, nameHint]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .flatMap((value) => [value, value.toLowerCase(), value.replace(/\s+/g, '')]),
  );

  for (const stem of stems) {
    const candidate = path.win32.join(dir, `${stem}.exe`);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore unreadable paths
    }
  }
  return raw;
};

const capitalizeProcessDisplayName = (processName) => {
  const base = normalizeProcessBasename(processName);
  if (!base) return '';
  if (base === 'msedge') return 'Microsoft Edge';
  if (base === 'chrome') return 'Google Chrome';
  if (base === 'firefox') return 'Firefox';
  if (base === 'code') return 'Visual Studio Code';
  return titleCaseSegment(base);
};

/**
 * Resolve a captured running window to a user-facing app identity.
 *
 * @param {{
 *   name?: string,
 *   title?: string,
 *   executablePath?: string | null,
 * }} windowInfo
 * @param {Array<{ name?: string, iconPath?: string | null, executablePath?: string | null }>} catalog
 * @param {{ getCanonicalAppKey: (value?: string) => string, normalizeCatalogDisplayName?: (value?: string) => string }} helpers
 * @returns {{
 *   name: string,
 *   executablePath: string | null,
 *   iconPath: string | null,
 *   identitySource: string,
 * }}
 */
const resolveCaptureAppIdentity = (windowInfo, catalog, helpers) => {
  const getCanonicalAppKey = helpers.getCanonicalAppKey;
  const normalizeCatalogDisplayName = helpers.normalizeCatalogDisplayName
    || ((value) => String(value || '').trim());
  const index = buildCaptureCatalogIndex(catalog, getCanonicalAppKey);

  const processName = String(windowInfo?.name || '').trim();
  const processLc = normalizeProcessBasename(processName);
  const title = String(windowInfo?.title || '').trim();
  const executablePath = windowInfo?.executablePath || null;

  if (processLc === 'steamwebhelper' || processLc === 'steam') {
    const steamEntry = findCatalogEntryByCanonicalName(index, 'Steam', getCanonicalAppKey);
    return {
      name: 'Steam',
      executablePath: steamEntry?.executablePath || executablePath || null,
      iconPath: steamEntry?.iconPath || null,
      identitySource: steamEntry ? 'catalog-process-alias' : 'process-alias',
    };
  }

  const candidates = [];

  const pushCandidate = (entry, source, preferredName = null) => {
    if (!entry?.name) return;
    candidates.push({
      entry,
      source,
      preferredName: preferredName ? normalizeCatalogDisplayName(preferredName) : null,
    });
  };

  pushCandidate(findCatalogEntryForExecutablePath(index, executablePath), 'catalog-exe-path');
  pushCandidate(
    findCatalogEntryForFolderHint(index, inferAppNameFromExecutablePath(executablePath), getCanonicalAppKey),
    'catalog-install-folder',
    inferAppNameFromExecutablePath(executablePath),
  );

  const titleDerived = deriveDisplayNameFromWindowTitle(title);
  if (titleDerived) {
    pushCandidate(findCatalogEntryByCanonicalName(index, titleDerived, getCanonicalAppKey), 'catalog-title', titleDerived);
  }

  if (!isGenericCaptureProcessName(processName)) {
    pushCandidate(findCatalogEntryByCanonicalName(index, processName, getCanonicalAppKey), 'catalog-process-name');
  }

  if (candidates.length > 0) {
    const best = candidates[0];
    const resolvedName = best.preferredName || best.entry.name;
    return {
      name: normalizeCatalogDisplayName(resolvedName),
      executablePath: best.entry.executablePath || executablePath || null,
      iconPath: best.entry.iconPath || null,
      identitySource: best.source,
    };
  }

  if (isGenericCaptureProcessName(processName)) {
    const folderHint = inferAppNameFromExecutablePath(executablePath);
    if (titleDerived) {
      return {
        name: normalizeCatalogDisplayName(titleDerived),
        executablePath: inferSiblingLaunchExecutable(executablePath, titleDerived),
        iconPath: null,
        identitySource: 'window-title',
      };
    }
    if (folderHint) {
      return {
        name: normalizeCatalogDisplayName(folderHint),
        executablePath: inferSiblingLaunchExecutable(executablePath, folderHint),
        iconPath: null,
        identitySource: 'install-folder',
      };
    }
  }

  const fallbackName = isGenericCaptureProcessName(processName)
    ? (titleDerived || capitalizeProcessDisplayName(processName) || processName)
    : (capitalizeProcessDisplayName(processName) || processName);

  const fallbackExecutablePath = inferSiblingLaunchExecutable(
    executablePath,
    fallbackName,
  );

  return {
    name: normalizeCatalogDisplayName(fallbackName),
    executablePath: fallbackExecutablePath,
    iconPath: null,
    identitySource: isGenericCaptureProcessName(processName) ? 'generic-process-fallback' : 'process-name',
  };
};

module.exports = {
  GENERIC_CAPTURE_PROCESS_BASENAMES,
  isGenericCaptureProcessName,
  inferAppNameFromExecutablePath,
  deriveDisplayNameFromWindowTitle,
  buildCaptureCatalogIndex,
  resolveCaptureAppIdentity,
  inferSiblingLaunchExecutable,
};
