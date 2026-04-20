'use strict';

/**
 * One-shot (cached) index of the current user's AppX packages via WinRT PackageManager.
 * Provides the same localized DisplayName and InstallLocation Windows uses for Start / Search,
 * and a stable readable root for manifest logos when %ProgramFiles%\WindowsApps is ACL-blocked for Node.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

let electronApp;
try {
  electronApp = require('electron').app;
} catch {
  electronApp = null;
}

const resolveWindowsAppxPackageIndexScriptPath = () => {
  if (process.platform !== 'win32') return null;
  const name = 'windows-appx-package-index.ps1';
  const candidates = [
    path.join(__dirname, '../../scripts', name),
    path.join(__dirname, '../scripts', name),
    path.join(process.cwd(), 'scripts', name),
  ];
  if (typeof process.resourcesPath === 'string') {
    candidates.push(
      path.join(process.resourcesPath, 'scripts', name),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'scripts', name),
    );
  }
  try {
    if (electronApp?.getAppPath) {
      candidates.push(path.join(electronApp.getAppPath(), 'scripts', name));
    }
  } catch {
    // ignore
  }
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
};

const systemPowerShellExe = () => {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
};

const buildLookup = (rows) => {
  const byFamilyLc = new Map();
  const byFullNameLc = new Map();
  // App Execution Alias shim stem → owning entry. Lets us map the
  // %LocalAppData%\Microsoft\WindowsApps\<Alias>.exe reparse points (whose stems
  // bear no relation to PackageFamilyName) back to their real AUMID.
  const byAliasStemLc = new Map();
  const list = [];
  if (!Array.isArray(rows)) {
    return {
      byFamilyLc, byFullNameLc, byAliasStemLc, list, empty: true,
    };
  }
  for (const r of rows) {
    const fam = String(r.FamilyName || '').trim();
    const full = String(r.FullName || '').trim();
    const loc = String(r.InstallLocation || '').replace(/\//g, '\\').trim();
    const dn = String(r.DisplayName || '').trim();
    const appUserModelIds = Array.isArray(r.AppUserModelIds)
      ? [...new Set(
        r.AppUserModelIds
          .map((id) => String(id || '').trim())
          .filter(Boolean),
      )]
      : [];
    const executionAliases = Array.isArray(r.ExecutionAliases)
      ? [...new Set(
        r.ExecutionAliases
          .map((a) => String(a || '').trim())
          .filter(Boolean),
      )]
      : [];
    if (!loc) continue;
    const entry = {
      familyName: fam,
      fullName: full,
      installLocation: loc,
      displayName: dn,
      appUserModelIds,
      executionAliases,
    };
    list.push(entry);
    if (fam) byFamilyLc.set(fam.toLowerCase(), entry);
    if (full) byFullNameLc.set(full.toLowerCase(), entry);
    for (const alias of executionAliases) {
      // Manifest aliases come with `.exe`; the filesystem shim share the same stem.
      const stem = alias.toLowerCase().endsWith('.exe')
        ? alias.slice(0, -4).toLowerCase()
        : alias.toLowerCase();
      if (stem && !byAliasStemLc.has(stem)) {
        byAliasStemLc.set(stem, entry);
      }
    }
  }
  return {
    byFamilyLc, byFullNameLc, byAliasStemLc, list, empty: list.length === 0,
  };
};

const getInstallLocationAndDisplayForExe = (exePath, lookup) => {
  if (!exePath || !lookup || lookup.empty) {
    return { installLocation: null, displayName: null, appUserModelId: null };
  }
  const norm = String(exePath).replace(/\//g, '\\');
  const lc = norm.toLowerCase();

  const mPkg = lc.match(/\\packages\\([^\\]+)\\/);
  if (mPkg) {
    const key = mPkg[1].toLowerCase();
    const e = lookup.byFamilyLc.get(key) || lookup.byFullNameLc.get(key);
    if (e) {
      return {
        installLocation: e.installLocation,
        displayName: e.displayName || null,
        appUserModelId: e.appUserModelIds?.[0] || null,
      };
    }
  }

  const nest = lc.match(/\\windowsapps\\([^\\]+)\\[^\\]+\.exe$/);
  if (nest) {
    const dir = nest[1].toLowerCase();
    const e = lookup.byFullNameLc.get(dir) || lookup.byFamilyLc.get(dir);
    if (e) {
      return {
        installLocation: e.installLocation,
        displayName: e.displayName || null,
        appUserModelId: e.appUserModelIds?.[0] || null,
      };
    }
  }

  const flat = lc.match(/\\microsoft\\windowsapps\\([^\\/]+\.exe)$/);
  if (flat) {
    const stem = path.basename(flat[1], '.exe').toLowerCase();
    // 1) Direct PFN / full-name stem (e.g. SpotifyAB.SpotifyMusic_zpdnekdrzrea0.exe).
    let e = lookup.byFamilyLc.get(stem) || lookup.byFullNameLc.get(stem);
    if (e) {
      return {
        installLocation: e.installLocation,
        displayName: e.displayName || null,
        appUserModelId: e.appUserModelIds?.[0] || null,
      };
    }
    // 2) App Execution Alias stem (e.g. SnippingTool.exe → Microsoft.ScreenSketch_*).
    //    This is the key path for Store apps that ship aliases instead of PFN-named shims.
    if (lookup.byAliasStemLc) {
      e = lookup.byAliasStemLc.get(stem);
      if (e) {
        return {
          installLocation: e.installLocation,
          displayName: e.displayName || null,
          appUserModelId: e.appUserModelIds?.[0] || null,
        };
      }
    }
    // 3) Family-prefix fallback (covers odd shim naming where the stem shares just the family head).
    const famPrefix = stem.split('_')[0];
    if (famPrefix) {
      const prefix = `${famPrefix.toLowerCase()}_`;
      for (const [k, v] of lookup.byFamilyLc) {
        if (k.startsWith(prefix)) {
          return {
            installLocation: v.installLocation,
            displayName: v.displayName || null,
            appUserModelId: v.appUserModelIds?.[0] || null,
          };
        }
      }
    }
  }

  return { installLocation: null, displayName: null, appUserModelId: null };
};

let cache = null;
let cacheAt = 0;
let inflight = null;
const TTL_MS = 12 * 60 * 1000;

const fetchJsonFromPowerShell = () => new Promise((resolve) => {
  const script = resolveWindowsAppxPackageIndexScriptPath();
  const ps = systemPowerShellExe();
  if (!script || !ps || !fs.existsSync(ps)) {
    return resolve(null);
  }
  execFile(
    ps,
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', script],
    {
      encoding: 'utf8',
      maxBuffer: 48 * 1024 * 1024,
      timeout: 180000,
      windowsHide: true,
    },
    (err, stdout, stderr) => {
      if (err) {
        if (process.env.FLOWSWITCH_APPX_INDEX_DEBUG === '1') {
          console.warn('[AppxIndex]', err?.message || err, stderr || '');
        }
        return resolve(null);
      }
      try {
        const j = JSON.parse(String(stdout || '').trim());
        resolve(j);
      } catch {
        resolve(null);
      }
    },
  );
});

const getAppxUserPackageLookup = async (options = {}) => {
  const { force = false } = options;
  if (process.platform !== 'win32') return null;
  const now = Date.now();
  if (!force && cache && now - cacheAt < TTL_MS) {
    return cache;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const raw = await fetchJsonFromPowerShell();
      const built = buildLookup(raw);
      const api = {
        ...built,
        getInstallLocationForExe(p) {
          return getInstallLocationAndDisplayForExe(p, built).installLocation;
        },
        getDisplayNameForExe(p) {
          return getInstallLocationAndDisplayForExe(p, built).displayName;
        },
        getPreferredAppUserModelIdForExe(p) {
          return getInstallLocationAndDisplayForExe(p, built).appUserModelId;
        },
      };
      cache = api;
      cacheAt = Date.now();
      return api;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
};

const invalidateAppxUserPackageLookupCache = () => {
  cache = null;
  cacheAt = 0;
};

module.exports = {
  getAppxUserPackageLookup,
  invalidateAppxUserPackageLookupCache,
  getInstallLocationAndDisplayForExe,
  buildLookup,
  resolveWindowsAppxPackageIndexScriptPath,
};
