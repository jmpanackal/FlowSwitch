'use strict';

const path = require('path');
const fs = require('fs');
const { app, nativeImage } = require('electron');
const {
  getShellItemIconDataUrl,
  isSafeWindowsAppsFolderMoniker,
} = require('./windows-shell-item-icon');
const { getAppxUserPackageLookup } = require('./windows-appx-user-package-index');

const createIconPathAndAppHelpers = ({
  iconDataUrlCache,
  maxUrlLength,
  maxShortcutPathLength,
  publicDir,
  windowsShellIconScriptPath,
}) => {
  const SHELL_HOST_EXECUTABLES = new Set([
    'cmd.exe',
    'powershell.exe',
    'pwsh.exe',
    'wscript.exe',
    'cscript.exe',
    'conhost.exe',
  ]);

  const safeLimitedString = (value, maxLength) => {
    const str = String(value || '').trim();
    if (!str) return '';
    return str.slice(0, Math.max(1, Number(maxLength || 1)));
  };

  const isSafeExternalHttpUrl = (value) => {
    const candidate = safeLimitedString(value, maxUrlLength);
    if (!candidate) return false;
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const normalizeSafeUrl = (value) => (
    isSafeExternalHttpUrl(value) ? safeLimitedString(value, maxUrlLength) : ''
  );

  const unpackProfilesReadResult = (value) => {
    if (Array.isArray(value)) {
      return { profiles: value, storeError: null };
    }
    if (value && typeof value === 'object') {
      return {
        profiles: Array.isArray(value.profiles) ? value.profiles : [],
        contentLibrary: value.contentLibrary ?? null,
        contentLibraryExclusions: value.contentLibraryExclusions ?? null,
        storeError: value.storeError || null,
      };
    }
    return { profiles: [], storeError: null };
  };

  const normalizePathForWindows = (value) => (
    String(value || '')
      .replace(/\//g, '\\')
      .trim()
  );

  const expandWindowsEnvVars = (raw = '') => (
    String(raw).replace(/%([^%]+)%/g, (_match, varName) => process.env[varName] || '')
  );

  /**
   * Store / AppX layouts are ACL-gated; Node often cannot stat them even when the path is real.
   * Skip strict exists checks so discovery can still attach icons and launch targets.
   */
  const isWindowsPackagedOrSystemAppsPath = (normalized = '') => {
    const lc = String(normalized || '').toLowerCase().replace(/\//g, '\\');
    return lc.includes('\\windowsapps\\') || lc.includes('\\windows\\systemapps\\');
  };

  const extractPathFromRawValue = (raw, allowedExtensions) => {
    if (!raw) return null;
    const rawValue = expandWindowsEnvVars(String(raw).trim());
    if (!rawValue || rawValue.includes('\0')) return null;

    const extAlternation = allowedExtensions
      .map((ext) => ext.replace('.', '\\.'))
      .join('|');
    const pathRegex = new RegExp(`([a-zA-Z]:\\\\[^,\\r\\n]*?\\.(?:${extAlternation}))`, 'i');
    const quotedRegex = new RegExp(`"([^"]+\\.(?:${extAlternation}))"`, 'i');

    const sanitized = rawValue.replace(/^"(.*)"$/, '$1').trim();
    const withoutIconIndex = sanitized.split(',')[0]?.trim() || '';

    const quotedMatch = rawValue.match(quotedRegex);
    const unquotedMatch = rawValue.match(pathRegex);
    const candidates = [
      quotedMatch?.[1],
      unquotedMatch?.[1],
      withoutIconIndex,
    ].filter(Boolean);

    let resolvedPath = null;
    for (const candidate of candidates) {
      const normalized = normalizePathForWindows(candidate);
      const lower = normalized.toLowerCase();
      const hasAllowedExtension = allowedExtensions.some((ext) => lower.endsWith(ext));
      if (!hasAllowedExtension) continue;
      if (normalized.startsWith('\\\\') || normalized.startsWith('\\\\?\\')) continue;
      if (!path.isAbsolute(normalized)) continue;
      if (isWindowsPackagedOrSystemAppsPath(normalized)) {
        resolvedPath = normalized;
        break;
      }
      if (!fs.existsSync(normalized)) continue;
      try {
        if (!fs.statSync(normalized).isFile()) continue;
      } catch {
        continue;
      }
      resolvedPath = normalized;
      break;
    }

    if (!resolvedPath) return null;
    return resolvedPath;
  };

  const extractExecutablePath = (raw) => {
    const exePath = extractPathFromRawValue(raw, ['.exe']);
    if (!exePath) return null;
    if (isWindowsPackagedOrSystemAppsPath(exePath)) {
      return exePath;
    }
    try {
      if (!fs.statSync(exePath).isFile()) return null;
    } catch {
      return null;
    }
    return exePath;
  };

  /**
   * Some inbox / shim shortcuts store only `taskmgr.exe` (no drive path). Our path parser
   * requires absolute paths, so map those to %WINDIR%\System32 when the file exists.
   */
  const resolveBareSystemExecutableFromShimTarget = (rawTarget = '') => {
    if (process.platform !== 'win32') return null;
    const t = normalizePathForWindows(String(rawTarget || '').trim());
    if (!t || t.includes('\\') || t.includes('/')) return null;
    if (!/\.exe$/i.test(t)) return null;
    if (t.startsWith('%')) return null;
    const windir = normalizePathForWindows(
      process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows',
    );
    const candidates = [
      path.join(windir, 'System32', t),
      path.join(windir, 'Sysnative', t),
      path.join(windir, 'SysWOW64', t),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
      } catch {
        // ignore
      }
    }
    return null;
  };

  /**
   * Discord and many Electron (Squirrel) apps use `Update.exe --processStart RealApp.exe`.
   * Icons on Update.exe are wrong or generic; resolve the real binary under `app-*` when needed.
   */
  const resolveUpdateStyleProcessStartChildExe = (targetExePath, rawArgs = '') => {
    if (!targetExePath || process.platform !== 'win32') return null;
    const launcherBase = path.basename(targetExePath).toLowerCase();
    if (launcherBase !== 'update.exe' && launcherBase !== 'discordupdate.exe') {
      return null;
    }
    const argsStr = String(rawArgs || '').trim();
    const m = argsStr.match(/--processStart(?:=|\s+)(?:"([^"]+\.exe)"|(\S+\.exe))/i);
    if (!m) return null;
    const token = String(m[1] || m[2] || '').trim().replace(/^"|"$/g, '');
    if (!token) return null;
    const childBase = path.basename(token);
    if (!childBase.toLowerCase().endsWith('.exe')) return null;
    const root = path.dirname(normalizePathForWindows(targetExePath));

    const direct = path.join(root, childBase);
    try {
      if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
    } catch {
      // continue
    }

    try {
      const names = fs.readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^app-/i.test(d.name))
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
      for (let i = names.length - 1; i >= 0; i -= 1) {
        const candidate = path.join(root, names[i], childBase);
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
        } catch {
          // try next
        }
      }
    } catch {
      return null;
    }
    return null;
  };

  const isDisallowedLaunchExecutablePath = (value = '') => {
    const normalized = normalizePathForWindows(value).toLowerCase();
    if (!normalized) return true;
    const base = path.basename(normalized);
    return SHELL_HOST_EXECUTABLES.has(base);
  };

  const resolveShortcutPathForLaunch = (raw) => {
    const s = safeLimitedString(raw, maxShortcutPathLength);
    if (!s) return null;
    const normalized = normalizePathForWindows(s);
    if (!normalized.toLowerCase().endsWith('.lnk')) return null;
    if (normalized.includes('..')) return null;
    try {
      if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) return null;
    } catch {
      return null;
    }
    return normalized;
  };

  /**
   * When the profile only has a .lnk (no stored exe), Get-Process must still use the real image name
   * (e.g. brave / chrome / msedge) or Chromium placement never runs and the wrong HWND gets moved (gray window).
   */
  const inferBrowserProcessKeyFromHints = (launchItem) => {
    const name = String(launchItem.appName || '').toLowerCase();
    const sc = String(launchItem.shortcutPath || '').toLowerCase();
    const base = path.basename(sc, '.lnk').toLowerCase();
    const hay = `${name}\n${sc}\n${base}`;

    if (/\bbrave\b/.test(hay) || hay.includes('brave-browser')) return 'brave';
    if (hay.includes('msedge') || hay.includes('microsoft edge')) return 'msedge';
    if (hay.includes('microsoft\\edge\\') || hay.includes('/edge/application/')) return 'msedge';
    if (hay.includes('vivaldi')) return 'vivaldi';
    if (hay.includes('chromium')) return 'chrome';
    if (hay.includes('opera') || hay.includes('operagx')) return 'opera';
    if (hay.includes('arc')) return 'arc';
    if (hay.includes('chrome')) return 'chrome';

    return null;
  };

  /**
   * Basename for window placement / duplicate detection (steam URL groups as "steam").
   * @param {{ executablePath?: string | null; launchUrl?: string | null; shortcutPath?: string | null; appName?: string }} launchItem
   * @returns {string}
   */
  const getPlacementProcessKey = (launchItem) => {
    if (launchItem.executablePath) {
      return path.basename(launchItem.executablePath, path.extname(launchItem.executablePath)).toLowerCase();
    }
    const url = String(launchItem.launchUrl || '').toLowerCase();
    if (url.includes('steam://') || url.includes('rungameid')) return 'steam';

    const inferred = inferBrowserProcessKeyFromHints(launchItem);
    if (inferred) return inferred;

    return 'app';
  };

  const extractIconSourcePath = (raw) => (
    extractPathFromRawValue(raw, [
      '.exe',
      '.ico',
      '.dll',
      '.png',
      '.jpg',
      '.jpeg',
      '.webp',
      '.bmp',
      // Shell-resolved icons (Explorer / taskbar); previously omitted so .lnk fallback never ran.
      '.lnk',
      '.url',
    ])
  );

  /**
   * When Uninstall only has InstallLocation (folder), pick a plausible main .exe — common for
   * per-user installers (Spotify: %LocalAppData%\Spotify with Spotify.exe inside).
   * Also checks one directory level (and shallow `app-*` children) when the root only has
   * updaters like Update.exe.
   */
  const probeInstallFolderForWindowsExe = (dirRaw) => {
    if (!dirRaw || process.platform !== 'win32') return null;
    const expanded = expandWindowsEnvVars(String(dirRaw).trim());
    if (!expanded) return null;
    const normalized = normalizePathForWindows(expanded);
    if (normalized.includes('..')) return null;
    const folderHint = path.basename(normalized.replace(/[/\\]+$/, '')).toLowerCase();

    const deprioritizeFilename = new Set([
      'uninstall.exe',
      'unins000.exe',
      'unins001.exe',
      'setup.exe',
      'update.exe',
      'discordupdate.exe',
    ]);

    const listExePathsInDir = (dir) => {
      let dirents;
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return [];
      }
      return dirents
        .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.exe'))
        .map((d) => path.join(dir, d.name));
    };

    const pickPreferredExe = (exePaths) => {
      if (!exePaths.length) return null;
      const lowBase = (p) => path.basename(p).toLowerCase();
      const hintExe = `${folderHint}.exe`;
      const byHint = exePaths.find((p) => lowBase(p) === hintExe);
      if (byHint) return byHint;
      const byStem = exePaths.find(
        (p) => path.basename(p, path.extname(p)).toLowerCase() === folderHint,
      );
      if (byStem) return byStem;
      const good = exePaths.filter((p) => !deprioritizeFilename.has(lowBase(p)));
      if (good.length) return good[0];
      return exePaths[0];
    };

    let st;
    try {
      st = fs.statSync(normalized);
    } catch {
      return null;
    }
    if (!st.isDirectory()) return null;

    const rootExePaths = listExePathsInDir(normalized);
    if (rootExePaths.length) {
      const pick = pickPreferredExe(rootExePaths);
      if (!deprioritizeFilename.has(path.basename(pick).toLowerCase())) {
        return pick;
      }
    }

    let dirents;
    try {
      dirents = fs.readdirSync(normalized, { withFileTypes: true });
    } catch {
      return rootExePaths.length ? pickPreferredExe(rootExePaths) : null;
    }

    const skipDirs = new Set([
      'node_modules',
      '.git',
      'locales',
      '__pycache__',
      'swiftshader',
    ]);

    const subdirs = dirents
      .filter(
        (d) => d.isDirectory()
          && !d.name.startsWith('.')
          && !skipDirs.has(d.name.toLowerCase()),
      )
      .slice(0, 48);

    let bestDeprioritized = null;
    for (const sd of subdirs) {
      const subPath = path.join(normalized, sd.name);
      const subExes = listExePathsInDir(subPath);
      if (!subExes.length) continue;
      const subPick = pickPreferredExe(subExes);
      if (!subPick) continue;
      if (!deprioritizeFilename.has(path.basename(subPick).toLowerCase())) {
        return subPick;
      }
      if (!bestDeprioritized) bestDeprioritized = subPick;

      if (/^app-[\d.]+$/i.test(sd.name)) {
        let nested;
        try {
          nested = fs.readdirSync(subPath, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const n of nested) {
          if (!n.isDirectory()) continue;
          const deepPath = path.join(subPath, n.name);
          const deepExes = listExePathsInDir(deepPath);
          const deepPick = pickPreferredExe(deepExes);
          if (deepPick && !deprioritizeFilename.has(path.basename(deepPick).toLowerCase())) {
            return deepPick;
          }
        }
      }
    }

    if (rootExePaths.length) {
      return pickPreferredExe(rootExePaths);
    }
    return bestDeprioritized;
  };

  const windowsAppsShimDir = () => path.join(
    process.env.LOCALAPPDATA || '',
    'Microsoft',
    'WindowsApps',
  );

  /**
   * Resolve a per-user launcher `.exe` for Store / MSIX apps when ARP `InstallLocation` is not a
   * readable folder (ACL) or points at `%LocalAppData%\Packages\<PFN>` instead of `Program Files\WindowsApps`.
   */
  const inferMsixUserWindowsAppsShimFromPackageDir = (dirRaw) => {
    if (!dirRaw || process.platform !== 'win32') return null;
    const expanded = expandWindowsEnvVars(String(dirRaw).trim());
    const normalized = normalizePathForWindows(expanded);
    const lc = normalized.toLowerCase().replace(/\//g, '\\');

    // Store registration often uses `%LocalAppData%\Packages\<PackageFamilyName>` — shim is `<PFN>.exe`.
    if (lc.includes('\\appdata\\local\\packages\\')) {
      const pkgBase = path.basename(normalized.replace(/[/\\]+$/, ''));
      if (pkgBase && !pkgBase.includes('..')) {
        const directShim = path.join(windowsAppsShimDir(), `${pkgBase}.exe`);
        try {
          if (fs.existsSync(directShim) && fs.statSync(directShim).isFile()) return directShim;
        } catch {
          // continue
        }
      }
    }

    if (!lc.includes('\\windowsapps\\')) return null;
    const base = path.basename(normalized.replace(/[/\\]+$/, ''));
    const waDir = windowsAppsShimDir();

    const pickFromFamilyPrefix = (family) => {
      const fam = String(family || '').trim();
      if (!fam) return null;
      let dirents;
      try {
        dirents = fs.readdirSync(waDir, { withFileTypes: true });
      } catch {
        return null;
      }
      const prefix = `${fam}_`.toLowerCase();
      const matches = dirents
        .filter((d) => (d.isFile() || d.isSymbolicLink()) && d.name.toLowerCase().endsWith('.exe'))
        .filter((d) => d.name.toLowerCase().startsWith(prefix));
      if (!matches.length) return null;
      matches.sort((a, b) => a.name.length - b.name.length);
      const pick = path.join(waDir, matches[0].name);
      try {
        if (fs.statSync(pick).isFile()) return pick;
      } catch {
        return null;
      }
      return null;
    };

    const parts = base.split('__');
    if (parts.length === 2) {
      const publisher = parts[1].trim();
      const left = parts[0].trim();
      if (publisher && left) {
        const archMatch = left.match(/^(.*)_(x64|x86|arm64|arm|neutral)$/i);
        const withoutArch = archMatch ? archMatch[1] : left;
        const verMatch = withoutArch.match(/^(.*)_(\d+(?:\.\d+)*)$/);
        const family = (verMatch ? verMatch[1] : withoutArch).trim();
        if (family) {
          const shimName = `${family}_${publisher}.exe`;
          const shimPath = path.join(waDir, shimName);
          try {
            if (fs.existsSync(shimPath) && fs.statSync(shimPath).isFile()) return shimPath;
          } catch {
            // fall through to prefix scan
          }
          const fuzzy = pickFromFamilyPrefix(family);
          if (fuzzy) return fuzzy;
        }
      }
    }

    // Odd package folder shapes (no `__` publisher split): best-effort prefix on first `_` segment.
    if (parts.length !== 2) {
      const head = base.split('_')[0];
      return pickFromFamilyPrefix(head);
    }
    return null;
  };

  const imageMimeTypeByExt = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };

  const toImageDataUrlFromFile = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    // Let Electron/nativeImage handle .ico so we don't accidentally use a tiny embedded frame.
    if (ext === '.ico') return null;
    const mime = imageMimeTypeByExt[ext];
    if (!mime) return null;
    try {
      const binary = fs.readFileSync(filePath);
      return `data:${mime};base64,${binary.toString('base64')}`;
    } catch {
      return null;
    }
  };

  const findAppxPackageRootFromExeSync = (startExe) => {
    if (!startExe || process.platform !== 'win32') return null;
    let dir = path.dirname(String(startExe).replace(/\//g, '\\'));
    for (let depth = 0; depth < 20; depth += 1) {
      try {
        if (fs.existsSync(path.join(dir, 'AppxManifest.xml'))) return dir;
      } catch {
        return null;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  };

  const resolveLocalPackagesRootForStoreTargetExe = (exePath) => {
    const norm = String(exePath || '').replace(/\//g, '\\');
    const local = process.env.LOCALAPPDATA;
    if (!local) return null;
    const pkRoot = path.join(local, 'Packages');
    let waFolder = null;
    const nested = norm.match(/\\WindowsApps\\([^\\]+)\\[^\\/]+\.exe$/i);
    if (nested) {
      [, waFolder] = nested;
    } else {
      const flat = norm.match(/\\Microsoft\\WindowsApps\\([^\\/]+\.exe)$/i);
      if (flat) waFolder = path.basename(flat[1], '.exe');
    }
    if (!waFolder) return null;
    const direct = path.join(pkRoot, waFolder);
    try {
      if (fs.existsSync(path.join(direct, 'AppxManifest.xml'))) return direct;
    } catch {
      /* ignore */
    }
    const fam = waFolder.split('_')[0];
    if (!fam) return null;
    try {
      const hit = fs.readdirSync(pkRoot).find((n) => n.toLowerCase().startsWith(`${fam.toLowerCase()}_`));
      if (!hit) return null;
      const d = path.join(pkRoot, hit);
      return fs.existsSync(path.join(d, 'AppxManifest.xml')) ? d : null;
    } catch {
      return null;
    }
  };

  const readFirstVisualElementsLogoAbsPathSync = (pkgRoot, manifestPath) => {
    let xml;
    try {
      xml = fs.readFileSync(manifestPath, 'utf8');
    } catch {
      return null;
    }
    const chunks = [];
    try {
      const iter = String(xml).matchAll(/<(?:[\w]+:)?VisualElements([^>]+)>/gi);
      for (const m of iter) {
        chunks.push(m[1]);
      }
    } catch {
      const once = /<(?:[\w]+:)?VisualElements([^>]+)>/i.exec(String(xml));
      if (once) chunks.push(once[1]);
    }
    if (!chunks.length) {
      const once = /<(?:[\w]+:)?VisualElements([^>]+)>/i.exec(String(xml));
      if (once) chunks.push(once[1]);
    }
    const attrs = chunks.join(' ');
    if (!attrs) return null;
    const pickAttr = (label) => {
      const r = new RegExp(`${label}\\s*=\\s*"([^"]*)"`, 'i');
      const hit = r.exec(attrs);
      return hit ? hit[1].trim().replace(/\//g, '\\') : null;
    };
    const rel = pickAttr('Square44x44Logo')
      || pickAttr('Square150x150Logo')
      || pickAttr('AppListIcon')
      || pickAttr('Square30x30Logo')
      || pickAttr('Square310x310Logo')
      || pickAttr('Logo');
    if (!rel || /^ms-appx:/i.test(rel)) return null;
    const candidate = path.normalize(path.join(pkgRoot, rel));
    const rootLower = pkgRoot.replace(/\//g, '\\').toLowerCase();
    const candLower = candidate.replace(/\//g, '\\').toLowerCase();
    if (!candLower.startsWith(`${rootLower}\\`)) return null;
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      return null;
    }
    const logoDir = path.dirname(candidate);
    const stem = path.basename(candidate, path.extname(candidate));
    let names;
    try {
      names = fs.readdirSync(logoDir);
    } catch {
      return null;
    }
    const alt = names.find(
      (n) => n.toLowerCase().startsWith(stem.toLowerCase()) && /\.(png|jpg|jpeg|webp)$/i.test(n),
    );
    return alt ? path.join(logoDir, alt) : null;
  };

  const dataUrlFromMsixInstallRootSync = (pkgRoot) => {
    if (!pkgRoot || process.platform !== 'win32') return null;
    const root = String(pkgRoot).replace(/\//g, '\\');
    const manifestPath = path.join(root, 'AppxManifest.xml');
    try {
      if (!fs.existsSync(manifestPath)) return null;
    } catch {
      return null;
    }
    const logoPath = readFirstVisualElementsLogoAbsPathSync(root, manifestPath);
    if (!logoPath) return null;
    return toImageDataUrlFromFile(logoPath);
  };

  const dataUrlFromMsixVisualLogoNearExeSync = (exePath, appxLookup) => {
    if (!exePath || process.platform !== 'win32') return null;
    const raw = String(exePath).replace(/\//g, '\\');
    let resolved = raw;
    try {
      resolved = fs.realpathSync.native ? fs.realpathSync.native(raw) : fs.realpathSync(raw);
    } catch {
      resolved = raw;
    }
    const idxLoc = appxLookup?.getInstallLocationForExe?.(raw)
      || appxLookup?.getInstallLocationForExe?.(resolved);
    if (idxLoc) {
      const fromIdx = dataUrlFromMsixInstallRootSync(idxLoc);
      if (fromIdx) return fromIdx;
    }
    let pkgRoot = findAppxPackageRootFromExeSync(resolved);
    if (!pkgRoot) {
      pkgRoot = resolveLocalPackagesRootForStoreTargetExe(resolved);
    }
    if (!pkgRoot) {
      pkgRoot = resolveLocalPackagesRootForStoreTargetExe(raw);
    }
    if (!pkgRoot) return null;
    return dataUrlFromMsixInstallRootSync(pkgRoot);
  };

  const likelyMsixLayoutExePath = (p) => {
    const lc = String(p || '').toLowerCase().replace(/\//g, '\\');
    return (
      lc.endsWith('.exe')
      && (
        lc.includes('\\windowsapps\\')
        || lc.includes('\\systemapps\\')
        || lc.includes('\\appdata\\local\\packages\\')
        || lc.includes('\\microsoft\\windowsapps\\')
      )
    );
  };

  const getWindowIconPath = () => {
    // Prefer the 1024px taskbar PNG for the HWND icon (same art as flowswitch-logo.png):
    // Chromium often picks a tiny layer from multi-size .ico. Packaged .exe uses flowswitch.ico.
    if (process.platform === 'win32') {
      const taskbarPath = path.join(publicDir, 'flowswitch-taskbar.png');
      if (fs.existsSync(taskbarPath)) return taskbarPath;
      const icoPath = path.join(publicDir, 'flowswitch.ico');
      if (fs.existsSync(icoPath)) return icoPath;
    }
    const logoPath = path.join(publicDir, 'flowswitch-logo.png');
    if (fs.existsSync(logoPath)) return logoPath;
    return undefined;
  };

  /** Absolute path for Jump List / User Tasks icons (must not be electron.exe). */
  const getJumpListIconPath = () => {
    if (process.platform !== 'win32') return null;
    const icoPath = path.join(publicDir, 'flowswitch.ico');
    if (fs.existsSync(icoPath)) return path.resolve(icoPath);
    const pngPath = path.join(publicDir, 'flowswitch-logo.png');
    if (fs.existsSync(pngPath)) return path.resolve(pngPath);
    return null;
  };

  const getSafeIconDataUrl = async (iconSourcePath) => {
    const shellMonikerCandidate = String(iconSourcePath || '').trim();
    const shellMoniker = (
      process.platform === 'win32'
      && isSafeWindowsAppsFolderMoniker(shellMonikerCandidate)
    ) ? shellMonikerCandidate : null;
    const extracted = shellMoniker || extractIconSourcePath(iconSourcePath);
    if (!extracted) return null;
    let resolvedPath = extracted;
    if (process.platform === 'win32' && !shellMoniker) {
      try {
        const rp = fs.realpathSync.native
          ? fs.realpathSync.native(extracted)
          : fs.realpathSync(extracted);
        if (rp) resolvedPath = rp;
      } catch {
        resolvedPath = extracted;
      }
    }
    const probeOrder = resolvedPath !== extracted
      ? [resolvedPath, extracted]
      : [resolvedPath];

    let appxLookup = null;
    if (process.platform === 'win32') {
      try {
        appxLookup = await getAppxUserPackageLookup();
      } catch {
        appxLookup = null;
      }
    }

    const tryShellIconForPath = async (safePath) => {
      if (
        process.platform !== 'win32'
        || !windowsShellIconScriptPath
        || !fs.existsSync(windowsShellIconScriptPath)
      ) {
        return null;
      }
      return getShellItemIconDataUrl(windowsShellIconScriptPath, safePath);
    };

    // Packaged-app shims (App Execution Aliases, WindowsApps shims, registry-detected MSIX
    // exes) return the *generic* Windows exe icon from SHGetFileInfo. That generic icon is
    // non-null, which would poison the normal probe chain. For any MSIX-layout path we have
    // an AUMID for, resolve the Shell icon from `shell:AppsFolder\<AUMID>` first — this is
    // the same path Windows Search / Start Menu render.
    const resolveMsixShellMonikerForPath = (safePath) => {
      if (process.platform !== 'win32') return null;
      if (shellMoniker) return null;
      if (!appxLookup || appxLookup.empty) return null;
      if (!likelyMsixLayoutExePath(safePath)) return null;
      const aumid = appxLookup.getPreferredAppUserModelIdForExe?.(safePath) || null;
      if (!aumid) return null;
      if (!/^[A-Za-z0-9._-]+![A-Za-z0-9._-]+$/.test(aumid)) return null;
      const moniker = `shell:AppsFolder\\${aumid}`;
      return isSafeWindowsAppsFolderMoniker(moniker) ? moniker : null;
    };

    const tryOneProbePath = async (safePath) => {
      const cached = iconDataUrlCache.get(safePath);
      if (cached !== undefined) return cached;

      try {
        const directImageDataUrl = toImageDataUrlFromFile(safePath);
        if (directImageDataUrl) {
          iconDataUrlCache.set(safePath, directImageDataUrl);
          return directImageDataUrl;
        }

        // Must run BEFORE SHGetFileInfo on the exe — Store shims return the generic exe icon,
        // so preferring AUMID here is the only way packaged apps get their real icon.
        const aumidMoniker = resolveMsixShellMonikerForPath(safePath);
        if (aumidMoniker) {
          const cachedForMoniker = iconDataUrlCache.get(aumidMoniker);
          if (cachedForMoniker !== undefined && cachedForMoniker !== null) {
            iconDataUrlCache.set(safePath, cachedForMoniker);
            return cachedForMoniker;
          }
          const aumidUrl = await tryShellIconForPath(aumidMoniker);
          if (aumidUrl) {
            iconDataUrlCache.set(aumidMoniker, aumidUrl);
            iconDataUrlCache.set(safePath, aumidUrl);
            return aumidUrl;
          }
        }

        if (!shellMoniker && likelyMsixLayoutExePath(safePath)) {
          const msixLogo = dataUrlFromMsixVisualLogoNearExeSync(safePath, appxLookup);
          if (msixLogo) {
            iconDataUrlCache.set(safePath, msixLogo);
            return msixLogo;
          }
        }

        const shellUrl = await tryShellIconForPath(safePath);
        if (shellUrl) {
          iconDataUrlCache.set(safePath, shellUrl);
          return shellUrl;
        }

        let nativeIcon = await app.getFileIcon(safePath, { size: 'large' });
        if (!nativeIcon || nativeIcon.isEmpty()) {
          nativeIcon = await app.getFileIcon(safePath, { size: 'normal' });
        }
        if (!nativeIcon || nativeIcon.isEmpty()) {
          const imageFallback = nativeImage.createFromPath(safePath);
          if (imageFallback && !imageFallback.isEmpty()) {
            const fallbackDataUrl = imageFallback.toDataURL();
            iconDataUrlCache.set(safePath, fallbackDataUrl);
            return fallbackDataUrl;
          }
          iconDataUrlCache.set(safePath, null);
          return null;
        }
        const dataUrl = nativeIcon.toDataURL();
        iconDataUrlCache.set(safePath, dataUrl);
        return dataUrl;
      } catch {
        iconDataUrlCache.set(safePath, null);
        return null;
      }
    };

    let lastNonNull = null;
    for (const probePath of probeOrder) {
      const url = await tryOneProbePath(probePath);
      if (url) {
        lastNonNull = url;
        break;
      }
    }
    if (lastNonNull) {
      for (const p of probeOrder) {
        iconDataUrlCache.set(p, lastNonNull);
      }
      iconDataUrlCache.set(extracted, lastNonNull);
      return lastNonNull;
    }
    for (const p of probeOrder) {
      if (iconDataUrlCache.get(p) === undefined) iconDataUrlCache.set(p, null);
    }
    iconDataUrlCache.set(extracted, null);
    return null;
  };

  const isInstallerLikeExecutable = (filePath = '') => {
    if (!filePath) return false;
    const exeCandidate = extractExecutablePath(filePath) || String(filePath).trim();
    const baseName = path.basename(String(exeCandidate), path.extname(String(exeCandidate))).toLowerCase();
    if (!baseName) return false;
    // `msiexec` contains the substring "install" but is the normal Windows Installer host for ARP rows.
    return (
      baseName.includes('setup')
      || (baseName.includes('install') && baseName !== 'msiexec')
      || baseName.includes('uninstall')
      || baseName.includes('repair')
      || baseName.includes('prereq')
      || baseName === 'vc_redist.x64'
      || baseName === 'vc_redist.x86'
      || baseName === 'vcredist_x64'
      || baseName === 'vcredist_x86'
      || baseName === 'launcherprereqsetup_x64'
    );
  };

  const parseInternetShortcut = (shortcutPath) => {
    try {
      const rawContent = fs.readFileSync(shortcutPath, 'utf8');
      const values = {};
      for (const line of rawContent.split(/\r?\n/)) {
        const idx = line.indexOf('=');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (!key) continue;
        values[key] = value;
      }
      return {
        url: values.URL || '',
        iconFile: expandWindowsEnvVars(values.IconFile || ''),
      };
    } catch {
      return { url: '', iconFile: '' };
    }
  };

  const isAppProtocolUrl = (value = '') => {
    const raw = String(value || '').trim();
    const match = raw.match(/^([a-z][a-z0-9+.-]*):\/\//i);
    if (!match) return false;
    const protocol = match[1].toLowerCase();
    return protocol !== 'http' && protocol !== 'https' && protocol !== 'file';
  };

  /**
   * Normalize human-facing names so Start Menu vs Uninstall duplicates collapse to one row
   * (e.g. "Windsurf (User)" vs "Windsurf", "Overwatch® 2" vs registry typos near trademark).
   */
  const normalizeDisplayNameForCatalogDedupe = (raw = '') => {
    let s = String(raw || '').trim();
    s = s.normalize('NFC');
    s = s.replace(/[\u200b-\u200d\ufeff]/g, '');
    s = s.replace(/\u00a0/g, ' ');
    s = s.replace(/[\u00ae\u2122\u00a9]/gi, '');
    s = s.replace(/\s*\(user\)\s*$/i, '');
    s = s.replace(/\s*\(current user\)\s*$/i, '');
    s = s.replace(/\s*\(administrator\)\s*$/i, '');
    s = s.replace(/\s*\(all users\)\s*$/i, '');
    s = s.replace(/\s*\(machine\)\s*$/i, '');
    s = s.replace(/\.{3,}\s*$/g, '').trim();
    s = s.replace(/…+$/u, '').trim();
    return s.trim();
  };

  const getCanonicalAppKey = (value = '') => {
    const cleaned = normalizeDisplayNameForCatalogDedupe(value);
    return String(cleaned || '')
      .toLowerCase()
      // Drop common trailing version tokens: "App 1.2.3", "App v2", "App (64-bit)".
      .replace(/\s+v?\d+([._-]\d+)*(\s*(x64|x86|64-bit|32-bit))?$/i, '')
      .replace(/\s+\(?(x64|x86|64-bit|32-bit)\)?$/i, '')
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .trim();
  };

  const SERVICE_LIKE_EXECUTABLE_TOKENS = [
    'service',
    'helper',
    'container',
    'telemetry',
    'runtimebroker',
    'crashpad',
  ];

  /**
   * Inbox / common tools that live under System32/SysWOW64 but should stay discoverable.
   * (A blanket block on those folders hid Task Manager, Notepad, etc.)
   */
  const SYSTEM32_USER_FACING_EXE_BASENAMES = new Set([
    'taskmgr.exe',
    'notepad.exe',
    'mspaint.exe',
    'wmplayer.exe',
    'write.exe',
    'magnify.exe',
    'osk.exe',
    'narrator.exe',
    'snippingtool.exe',
    'charmap.exe',
    'dxdiag.exe',
    'cleanmgr.exe',
    'dfrgui.exe',
    'resmon.exe',
    'perfmon.exe',
    'msinfo32.exe',
    'optionalfeatures.exe',
    'explorer.exe',
    'eudcedit.exe',
    'psr.exe',
    'msdt.exe',
  ]);

  /**
   * Executable images that are not end-user “apps” for layout/picker purposes.
   */
  const NON_USER_APP_EXE_BASENAMES = new Set([
    'systemsettings.exe',
    'wsreset.exe',
    'musnotification.exe',
    'musnotifyicon.exe',
    'deviceenroller.exe',
    'devicecensus.exe',
    'svchost.exe',
    'dllhost.exe',
    'runtimebroker.exe',
    'searchapp.exe',
    'searchhost.exe',
    'lockapp.exe',
    'shellexperiencehost.exe',
    'nvcontainer.exe',
    'nvbackend.exe',
    'nvidia share.exe',
    'nvidia web helper.exe',
    'nvdisplay.container.exe',
    'nvtelemetrycontainer.exe',
    'jucheck.exe',
    'javaws.exe',
    'jp2launcher.exe',
  ]);

  /**
   * Display names / shortcut titles that are maintenance, OEM junk, or non-launchable shells.
   */
  const NON_USER_APP_NAME_REGEXES = [
    /\buninstall(er)?\b/i,
    /\buninst(aller)?\b/i,
    /\bremove\b.*\b(app|program|product|software)\b/i,
    /\brepair\b/i,
    /\bmodify\b.*\b(install|setup)\b/i,
    /^about\s+/i,
    /\babout\s+(java|jre|jdk|adobe|acrobat|reader|flash|silverlight)\b/i,
    /\b(check|look)\s+for\s+updates\b/i,
    /\bsoftware\s+update\b/i,
    /\b(update|auto)\s*-\s*helper\b/i,
    /\bjava\s+(update|uninstall|install|configure|setup|remove)\b/i,
    /\b(configure|install|remove)\s+java\b/i,
    /\bjava\s+unn?install\b/i,
    /\bjava\s+update\s+checker\b/i,
    /\b(nvidia|geforce)\s+(overlay|share|broadcast)\b/i,
    /\bnvidia\s+control\s+panel\b/i,
    /\bnvidia\s+app\s*-\s*(settings|preferences|about)\b/i,
    /\badobe\s+acrobat\b.*\b(repair|update)\b/i,
    /\bmicrosoft\s+edge\s+update\b/i,
    /\bwindows\s+defender\b/i,
    /^settings$/i,
    /\bwindows\s+settings\b/i,
    /\b(system|windows)\s+settings\b/i,
    /\bfeedback\s+hub\b/i,
    /\bget\s+help\b/i,
    /\b(readme|documentation|release notes|license)\b/i,
    /\btelemetry\b/i,
    /\bdiagnostic(s)?\s+data\s+viewer\b/i,
    /\brepair\s+tool\b/i,
    /\bmaintenance\b/i,
    /\bquick\s*start\s*guide\b/i,
    // Apple Bonjour / mDNS background service rows (not a user-facing desktop app).
    /^bonjour$/i,
    /^bonjour\s+service$/i,
  ];

  const isLikelyBackgroundBinary = (filePath = '') => {
    if (!filePath) return false;
    const baseName = path.basename(String(filePath), path.extname(String(filePath))).toLowerCase();
    const baseFull = path.basename(String(filePath)).toLowerCase();
    // Substrings like "helper" match "SpotifyHelper" / "TeamsHelper" — those are still user-facing app images.
    if (
      baseFull === 'spotifyhelper.exe'
      || baseFull === 'spotify.exe'
      || baseFull === 'discord.exe'
      || baseFull === 'slack.exe'
      || baseFull === 'teams.exe'
    ) {
      return false;
    }
    return SERVICE_LIKE_EXECUTABLE_TOKENS.some((token) => baseName.includes(token));
  };

  const basenameLower = (filePath = '') => {
    const b = path.basename(String(filePath || ''));
    return b ? b.toLowerCase() : '';
  };

  const pathIsWindowsSystem32Family = (p = '') => {
    const lc = String(p || '').toLowerCase().replace(/\//g, '\\');
    return lc.includes('\\windows\\system32\\') || lc.includes('\\windows\\syswow64\\');
  };

  const isDeniedNonUserExecutableBasename = (filePath = '') => {
    const base = basenameLower(filePath);
    return !!(base && NON_USER_APP_EXE_BASENAMES.has(base));
  };

  const isSystem32PathAllowedUserExe = (filePath = '') => {
    const base = basenameLower(filePath);
    return !!(base && SYSTEM32_USER_FACING_EXE_BASENAMES.has(base));
  };

  const matchesNonUserAppDisplayName = (name = '') => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    return NON_USER_APP_NAME_REGEXES.some((re) => re.test(trimmed));
  };

  /**
   * Low-value shims under `%LOCALAPPDATA%\\Microsoft\\WindowsApps` (package infra, not end-user apps).
   * Only applied when `context.source === 'windows-apps-shim'`.
   */
  const isWindowsAppsCatalogNoiseBasename = (exeBase = '') => {
    const low = String(exeBase || '').toLowerCase();
    if (!low.endsWith('.exe')) return false;
    const s = low.slice(0, -4);
    if (s === 'winget' || s === 'wt') return true;
    if (s.startsWith('windowspackagemanager')) return true;
    if (s.startsWith('xboxpcappadmin') || s.startsWith('xboxpcappce')) return true;
    if (s.startsWith('xboxpcapp') && /(admin|service|broker|helper|svr|runtime)$/i.test(s)) return true;
    if (s === 'python' || s === 'python3' || s === 'pythonw') return true;
    if (/^python\d/.test(s)) return true;
    return false;
  };

  const matchesNonUserAppPathHaystack = (haystack = '') => {
    const lc = String(haystack || '').toLowerCase().replace(/\//g, '\\');
    if (!lc) return false;
    if (lc.includes('\\immersivecontrolpanel\\')) return true;
    if (lc.includes('\\windows\\systemapps\\') && lc.includes('windows.immersivecontrolpanel')) return true;
    if (/\\nvidia corporation\\(installer|nodejs|nvbackend|nvnode|update core)/i.test(lc)) return true;
    if (/\\nvidia corporation\\nvidia app\\/i.test(lc) && /\\cef\\/i.test(lc)) return true;
    if (lc.includes('\\programdata\\microsoft\\windows\\start menu\\programs\\accessories\\system tools\\')
      && /\bwindows\s+defender\b/i.test(lc)) {
      return true;
    }
    return false;
  };

  /**
   * Start Menu .lnk titles for Windows inbox tools that often have no resolvable .exe target
   * (shell:AppsFolder, packaged apps, or Shortcut.exe leaving TargetPath empty).
   */
  const INBOX_START_MENU_APP_LABELS = [
    'Task Manager',
    'File Explorer',
    'Notepad',
    'Paint',
    'Paint 3D',
    'Snipping Tool',
    'Snip & Sketch',
    'Screen Sketch',
    'Windows Media Player',
    'Media Player',
    'Calculator',
    'WordPad',
    'Character Map',
    'Remote Desktop Connection',
    'Windows Terminal',
    'Quick Assist',
    'Steps Recorder',
    'Math Input Panel',
    'XPS Viewer',
    'Magnifier',
    'On-Screen Keyboard',
    'Narrator',
    'Sticky Notes',
    'Voice Recorder',
    'Sound Recorder',
    'Windows Fax and Scan',
    'Disk Cleanup',
    'Defragment and Optimize Drives',
    'Resource Monitor',
    'Performance Monitor',
    'System Information',
    'System Configuration',
    'Registry Editor',
    'Component Services',
    'Windows Media Player Legacy',
    'Notepad (Windows 11)',
    'Windows Notepad',
    'Movies & TV',
    'Films & TV',
    'Film & TV',
    'Groove Music',
    'Microsoft Clipchamp',
    'Spotify',
    'Spotify Music',
    'Spotify Premium',
    'Microsoft Spotify',
    'Spotify AB',
    'Microsoft Movies & TV',
    'Zune Video',
  ];
  const INBOX_SHORTCUT_CANONICAL_KEYS = new Set(
    INBOX_START_MENU_APP_LABELS.map((label) => getCanonicalAppKey(label)).filter(Boolean),
  );

  const isLikelyUserApp = (name, sourcePath = '', context = {}) => {
    const safeName = String(name || '').trim();
    if (!safeName) return false;

    if (matchesNonUserAppDisplayName(safeName)) {
      return false;
    }

    if (context.source === 'windows-apps-shim') {
      const shimBase = basenameLower(context.targetExe || sourcePath);
      if (isWindowsAppsCatalogNoiseBasename(shimBase)) {
        return false;
      }
    }

    const targetExeRaw = normalizePathForWindows(context.targetExe || '');
    const targetExe = targetExeRaw.toLowerCase();
    if (targetExe && SHELL_HOST_EXECUTABLES.has(path.basename(targetExe))) {
      return false;
    }
    if (targetExe && isLikelyBackgroundBinary(targetExe)) {
      return false;
    }
    if (targetExe && isDeniedNonUserExecutableBasename(targetExe)) {
      return false;
    }

    const lowerSourcePath = String(sourcePath || '').toLowerCase().replace(/\//g, '\\');
    const pathHaystack = `${lowerSourcePath}\n${targetExe}`;

    if (matchesNonUserAppPathHaystack(pathHaystack)) {
      return false;
    }

    if (lowerSourcePath.includes('\\programdata\\package cache\\')) {
      return false;
    }

    // Only treat System32/SysWOW64 as non-user when the path points at a real .exe image.
    // Icons often live in System32 DLLs; blocking those paths hid legitimate third‑party apps.
    const system32ExePaths = [lowerSourcePath, targetExe].filter(
      (p) => p && pathIsWindowsSystem32Family(p) && p.endsWith('.exe'),
    );
    for (const p of system32ExePaths) {
      // ARP rows often list `MsiExec.exe /X{...}` as UninstallString; that must not veto the app.
      if (basenameLower(p) === 'msiexec.exe') continue;
      if (!isSystem32PathAllowedUserExe(p)) {
        return false;
      }
    }

    if (lowerSourcePath.endsWith('.exe') && isDeniedNonUserExecutableBasename(lowerSourcePath)) {
      return false;
    }

    if (isInstallerLikeExecutable(sourcePath)) {
      return false;
    }

    const registryMeta = context.registryMeta || null;
    if (registryMeta) {
      const registryHaystack = (
        `${lowerSourcePath}\n${targetExe}\n${String(registryMeta.uninstallString || '').toLowerCase()}\n${String(registryMeta.quietUninstallString || '').toLowerCase()}\n${String(registryMeta.iconSource || '').toLowerCase()}\n${String(registryMeta.installLocation || '').toLowerCase()}`
      ).replace(/\//g, '\\');
      if (
        /mdnsresponder\.exe/i.test(registryHaystack)
        && /(?:[/\\]|^)bonjour(?:[/\\]|$)/i.test(registryHaystack)
      ) {
        return false;
      }
      const packagedOrStoreInstall = (
        /\\windowsapps\\/i.test(registryHaystack)
        || /\\windows\\systemapps\\/i.test(registryHaystack)
        || /\\appdata\\local\\packages\\/i.test(registryHaystack)
      );
      const nameLc = safeName.toLowerCase();
      const mediaOrSpotifyByName = (
        nameLc.includes('spotify')
        || (nameLc.includes('movies') && nameLc.includes('tv'))
        || (nameLc.includes('film') && nameLc.includes('tv'))
        || nameLc.includes('zune')
        || nameLc.includes('groove')
      );
      if (registryMeta.systemComponent && !packagedOrStoreInstall) return false;
      if (registryMeta.parentKeyName && !packagedOrStoreInstall && !mediaOrSpotifyByName) return false;
      const releaseType = String(registryMeta.releaseType || '').toLowerCase();
      if (
        !packagedOrStoreInstall
        && (
          releaseType.includes('update')
          || releaseType.includes('hotfix')
          || releaseType.includes('security')
        )
      ) {
        return false;
      }
    }

    if (context.source === 'start-menu-shortcut') {
      const sc = String(context.shortcutPath || '').toLowerCase().replace(/\//g, '\\');
      const argsLc = String(context.rawShortcutArgs || '').toLowerCase();
      const rawT = String(context.rawShortcutTarget || '').toLowerCase();
      const storeOrAppxHaystack = `${lowerSourcePath}\n${targetExe}\n${sc}\n${argsLc}\n${rawT}`;
      if (
        /\\windowsapps\\|\\windows\\systemapps\\/i.test(storeOrAppxHaystack)
        || /shell:appsfolder/i.test(storeOrAppxHaystack)
        || (/\bexplorer\.exe\b/i.test(targetExe) && /microsoft\.\w+!/i.test(argsLc))
        || /microsoft\.\w+!/i.test(storeOrAppxHaystack)
      ) {
        return true;
      }
      if (context.shortcutPath) {
        const underKnownStartAreas = (
          sc.includes('start menu')
          && (sc.includes('\\programs\\') || sc.endsWith('\\programs') || sc.includes('\\programme\\') || sc.endsWith('\\programme'))
        )
          || sc.includes('user pinned\\taskbar')
          || sc.includes('implicitappshortcuts');
        if (underKnownStartAreas && !context.targetExe) {
          const ck = getCanonicalAppKey(safeName);
          if (ck && INBOX_SHORTCUT_CANONICAL_KEYS.has(ck)) {
            return true;
          }
        }
      }
    }

    if (
      context.source === 'start-menu-shortcut'
      && !context.targetExe
      && !context.iconSource
      && !context.hasShortcutIcon
    ) {
      return false;
    }

    if (context.source === 'start-menu-url' && !context.isAppProtocol) {
      return false;
    }

    return true;
  };

  return {
    safeLimitedString,
    isSafeExternalHttpUrl,
    normalizeSafeUrl,
    unpackProfilesReadResult,
    extractExecutablePath,
    resolveBareSystemExecutableFromShimTarget,
    resolveUpdateStyleProcessStartChildExe,
    isDisallowedLaunchExecutablePath,
    resolveShortcutPathForLaunch,
    getPlacementProcessKey,
    extractIconSourcePath,
    probeInstallFolderForWindowsExe,
    inferMsixUserWindowsAppsShimFromPackageDir,
    getWindowIconPath,
    getJumpListIconPath,
    getSafeIconDataUrl,
    parseInternetShortcut,
    isAppProtocolUrl,
    getCanonicalAppKey,
    isLikelyBackgroundBinary,
    isLikelyUserApp,
  };
};

module.exports = { createIconPathAndAppHelpers };
