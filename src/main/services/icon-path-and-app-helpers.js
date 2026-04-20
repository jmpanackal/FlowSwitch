'use strict';

const path = require('path');
const fs = require('fs');
const { app, nativeImage } = require('electron');
const { getShellItemIconDataUrl } = require('./windows-shell-item-icon');

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

    const tryShellIcon = async () => {
      if (
        process.platform !== 'win32'
        || !windowsShellIconScriptPath
        || !fs.existsSync(windowsShellIconScriptPath)
      ) {
        return null;
      }
      // SHGetFileInfo (via PowerShell): same family of resolution Explorer / Start uses for a path.
      return getShellItemIconDataUrl(windowsShellIconScriptPath, safePath);
    };

    try {
      const directImageDataUrl = toImageDataUrlFromFile(safePath);
      if (directImageDataUrl) {
        iconDataUrlCache.set(safePath, directImageDataUrl);
        return directImageDataUrl;
      }

      const shellUrl = await tryShellIcon();
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
    'msiexec.exe',
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

    if (context.source === 'start-menu-shortcut') {
      const sc = String(context.shortcutPath || '').toLowerCase().replace(/\//g, '\\');
      const storeOrAppxHaystack = `${lowerSourcePath}\n${targetExe}\n${sc}`;
      if (/\\windowsapps\\|\\windows\\systemapps\\/i.test(storeOrAppxHaystack)) {
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
    getWindowIconPath,
    getSafeIconDataUrl,
    parseInternetShortcut,
    isAppProtocolUrl,
    getCanonicalAppKey,
    isLikelyBackgroundBinary,
    isLikelyUserApp,
  };
};

module.exports = { createIconPathAndAppHelpers };
