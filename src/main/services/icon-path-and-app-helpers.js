'use strict';

const path = require('path');
const fs = require('fs');
const { app, nativeImage } = require('electron');

const createIconPathAndAppHelpers = ({
  iconDataUrlCache,
  maxUrlLength,
  maxShortcutPathLength,
  publicDir,
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

  const extractPathFromRawValue = (raw, allowedExtensions) => {
    if (!raw) return null;
    const rawValue = String(raw).trim();
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
      if (!path.isAbsolute(normalized) || !fs.existsSync(normalized)) continue;
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
    try {
      if (!fs.statSync(exePath).isFile()) return null;
    } catch {
      return null;
    }
    return exePath;
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
    extractPathFromRawValue(raw, ['.exe', '.ico', '.dll', '.png', '.jpg', '.jpeg', '.webp', '.bmp'])
  );

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

  const getWindowIconPath = () => {
    // Windows scales the whole bitmap into a fixed taskbar slot; a trimmed asset
    // makes the mark read larger than the full-canvas logo used in the renderer.
    if (process.platform === 'win32') {
      const taskbarPath = path.join(publicDir, 'flowswitch-taskbar.png');
      if (fs.existsSync(taskbarPath)) return taskbarPath;
    }
    const logoPath = path.join(publicDir, 'flowswitch-logo.png');
    if (fs.existsSync(logoPath)) return logoPath;
    return undefined;
  };

  const getSafeIconDataUrl = async (iconSourcePath) => {
    const safePath = extractIconSourcePath(iconSourcePath);
    if (!safePath) return null;

    const cached = iconDataUrlCache.get(safePath);
    if (cached !== undefined) return cached;

    try {
      const directImageDataUrl = toImageDataUrlFromFile(safePath);
      if (directImageDataUrl) {
        iconDataUrlCache.set(safePath, directImageDataUrl);
        return directImageDataUrl;
      }

      // Prefer large icons for sharper rendering in monitor layout previews.
      let nativeIcon = await app.getFileIcon(safePath, { size: 'large' });
      if (!nativeIcon || nativeIcon.isEmpty()) {
        nativeIcon = await app.getFileIcon(safePath, { size: 'normal' });
      }
      if (!nativeIcon || nativeIcon.isEmpty()) {
        // Fallback for files that can be loaded directly as image assets.
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

  const isInstallerLikeExecutable = (filePath = '') => {
    if (!filePath) return false;
    const baseName = path.basename(String(filePath), path.extname(String(filePath))).toLowerCase();
    if (!baseName) return false;
    return (
      baseName.includes('setup')
      || baseName.includes('install')
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

  const expandWindowsEnvVars = (raw = '') => (
    String(raw).replace(/%([^%]+)%/g, (_match, varName) => process.env[varName] || '')
  );

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

  const getCanonicalAppKey = (value = '') => (
    String(value || '')
      .toLowerCase()
      // Drop common trailing version tokens: "App 1.2.3", "App v2", "App (64-bit)".
      .replace(/\s+v?\d+([._-]\d+)*(\s*(x64|x86|64-bit|32-bit))?$/i, '')
      .replace(/\s+\(?(x64|x86|64-bit|32-bit)\)?$/i, '')
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .trim()
  );

  const SERVICE_LIKE_EXECUTABLE_TOKENS = [
    'service',
    'helper',
    'container',
    'telemetry',
    'runtimebroker',
    'crashpad',
  ];

  const isLikelyBackgroundBinary = (filePath = '') => {
    if (!filePath) return false;
    const baseName = path.basename(String(filePath), path.extname(String(filePath))).toLowerCase();
    return SERVICE_LIKE_EXECUTABLE_TOKENS.some((token) => baseName.includes(token));
  };

  const parseSteamGameId = (value = '') => {
    const match = String(value).match(/steam:\/\/rungameid\/(\d+)/i);
    return match?.[1] || null;
  };

  const getSteamInstallCandidates = () => {
    const candidates = [
      path.join(process.env['ProgramFiles(x86)'] || '', 'Steam'),
      path.join(process.env.ProgramFiles || '', 'Steam'),
      path.join(process.env.LOCALAPPDATA || '', 'Steam'),
    ].filter(Boolean);
    return [...new Set(candidates)];
  };

  const resolveSteamGameIconPath = (appId) => {
    if (!appId) return null;
    const roots = getSteamInstallCandidates();
    const relativeCandidates = [
      path.join('steam', 'games', `${appId}.ico`),
      path.join('appcache', 'librarycache', `${appId}_icon.jpg`),
      path.join('appcache', 'librarycache', `${appId}_icon.png`),
      path.join('steamapps', 'librarycache', `${appId}_icon.jpg`),
      path.join('steamapps', 'librarycache', `${appId}_icon.png`),
      path.join('steamapps', 'librarycache', `${appId}.jpg`),
    ];

    for (const root of roots) {
      for (const rel of relativeCandidates) {
        const full = path.join(root, rel);
        if (fs.existsSync(full)) return full;
      }
    }
    return null;
  };

  const isLikelyUserApp = (name, sourcePath = '', context = {}) => {
    const safeName = String(name || '').trim();
    if (!safeName) return false;

    const targetExe = normalizePathForWindows(context.targetExe || '').toLowerCase();
    if (targetExe && SHELL_HOST_EXECUTABLES.has(path.basename(targetExe))) {
      return false;
    }
    if (targetExe && isLikelyBackgroundBinary(targetExe)) {
      return false;
    }

    const lowerSourcePath = String(sourcePath || '').toLowerCase();
    if (
      lowerSourcePath.includes('\\windows\\system32\\')
      || lowerSourcePath.includes('\\windows\\syswow64\\')
      || lowerSourcePath.includes('\\programdata\\package cache\\')
    ) {
      return false;
    }

    if (isInstallerLikeExecutable(sourcePath)) {
      return false;
    }

    const registryMeta = context.registryMeta || null;
    if (registryMeta) {
      if (registryMeta.systemComponent) return false;
      if (registryMeta.parentKeyName) return false;
      const releaseType = String(registryMeta.releaseType || '').toLowerCase();
      if (
        releaseType.includes('update')
        || releaseType.includes('hotfix')
        || releaseType.includes('security')
      ) {
        return false;
      }
      if (isInstallerLikeExecutable(registryMeta.uninstallString || '')) {
        return false;
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
    isDisallowedLaunchExecutablePath,
    resolveShortcutPathForLaunch,
    getPlacementProcessKey,
    extractIconSourcePath,
    getWindowIconPath,
    getSafeIconDataUrl,
    parseInternetShortcut,
    isAppProtocolUrl,
    getCanonicalAppKey,
    isLikelyBackgroundBinary,
    parseSteamGameId,
    resolveSteamGameIconPath,
    isLikelyUserApp,
  };
};

module.exports = { createIconPathAndAppHelpers };
