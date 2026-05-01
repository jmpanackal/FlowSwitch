const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createIconPathAndAppHelpers } = require('./icon-path-and-app-helpers');

const helpers = createIconPathAndAppHelpers({
  iconDataUrlCache: new Map(),
  maxUrlLength: 2048,
  maxShortcutPathLength: 4096,
  publicDir: '.',
});

test('getCanonicalAppKey matches Windsurf display name variants', () => {
  assert.equal(
    helpers.getCanonicalAppKey('Windsurf (User)'),
    helpers.getCanonicalAppKey('Windsurf'),
  );
});

test('getCanonicalAppKey strips trademark symbols before folding', () => {
  assert.equal(
    helpers.getCanonicalAppKey('Overwatch® 2'),
    helpers.getCanonicalAppKey('Overwatch 2'),
  );
});

test('getCanonicalAppKey trims ellipsis-style truncation markers', () => {
  assert.equal(
    helpers.getCanonicalAppKey('Windows Media Play...'),
    helpers.getCanonicalAppKey('Windows Media Play'),
  );
});

test('isLikelyUserApp allows Spotify when icon is under LocalAppData\\Spotify', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Spotify',
      'C:\\Users\\Someone\\AppData\\Local\\Spotify\\Spotify.exe',
      { source: 'registry', registryMeta: { systemComponent: false, releaseType: '' } },
    ),
    true,
  );
});

test('isLikelyUserApp allows Spotify registry row with InstallLocation folder when targetExe is probed', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Spotify',
      'C:\\Users\\Someone\\AppData\\Local\\Spotify',
      {
        source: 'registry',
        registryMeta: {
          systemComponent: false,
          releaseType: '',
          installLocation: 'C:\\Users\\Someone\\AppData\\Local\\Spotify',
          uninstallString: '',
          iconSource: '',
        },
        targetExe: 'C:\\Users\\Someone\\AppData\\Local\\Spotify\\Spotify.exe',
      },
    ),
    true,
  );
});

test('isLikelyUserApp allows packaged registry row when ReleaseType contains update substring', () => {
  const icon = 'C:\\Program Files\\WindowsApps\\Microsoft.ZuneVideo_8wekyb3d8bbwe\\Assets\\StoreLogo.png';
  assert.equal(
    helpers.isLikelyUserApp('Movies & TV', icon, {
      source: 'registry',
      registryMeta: {
        systemComponent: true,
        parentKeyName: 'bundle',
        releaseType: 'Feature Update',
        uninstallString: '',
        iconSource: icon,
        installLocation: '',
      },
    }),
    true,
  );
});

test('isLikelyUserApp allows Movies & TV registry row with systemComponent when under WindowsApps', () => {
  const icon = 'C:\\Program Files\\WindowsApps\\Microsoft.ZuneVideo_8wekyb3d8bbwe\\Assets\\StoreLogo.png';
  assert.equal(
    helpers.isLikelyUserApp('Movies & TV', icon, {
      source: 'registry',
      registryMeta: {
        systemComponent: true,
        parentKeyName: 'SomeBundle',
        uninstallString: '',
        iconSource: icon,
        releaseType: '',
      },
    }),
    true,
  );
});

test('isLikelyUserApp allows explorer shell AUMID shortcuts for packaged inbox apps', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Movies & TV',
      'C:\\Windows\\explorer.exe',
      {
        source: 'start-menu-shortcut',
        shortcutPath: 'C:\\Users\\Someone\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Movies & TV.lnk',
        targetExe: 'C:\\Windows\\explorer.exe',
        rawShortcutArgs: 'shell:AppsFolder\\Microsoft.ZuneVideo_8wekyb3d8bbwe!Microsoft.ZuneVideo',
        iconSource: null,
        hasShortcutIcon: true,
      },
    ),
    true,
  );
});

test('probeInstallFolderForWindowsExe finds nested exe when root only has Update.exe (win32 only)', () => {
  if (process.platform !== 'win32') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-nested-probe-'));
  try {
    fs.writeFileSync(path.join(root, 'Update.exe'), 'u');
    fs.mkdirSync(path.join(root, 'app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app', 'Spotify.exe'), 's');
    assert.equal(
      helpers.probeInstallFolderForWindowsExe(root),
      path.join(root, 'app', 'Spotify.exe'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inferMsixUserWindowsAppsShimFromPackageDir maps Local Packages PFN folder to shim (win32 only)', () => {
  if (process.platform !== 'win32') return;
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-msix-pkg-'));
  try {
    const localApp = path.join(fakeRoot, 'AppData', 'Local');
    const wa = path.join(localApp, 'Microsoft', 'WindowsApps');
    const pkgDir = path.join(localApp, 'Packages', 'Microsoft.ZuneVideo_8wekyb3d8bbwe');
    fs.mkdirSync(wa, { recursive: true });
    fs.mkdirSync(pkgDir, { recursive: true });
    const shimPath = path.join(wa, 'Microsoft.ZuneVideo_8wekyb3d8bbwe.exe');
    fs.writeFileSync(shimPath, 'x');
    const prev = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localApp;
    try {
      assert.equal(
        helpers.inferMsixUserWindowsAppsShimFromPackageDir(pkgDir),
        path.normalize(shimPath),
      );
    } finally {
      process.env.LOCALAPPDATA = prev;
    }
  } finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test('inferMsixUserWindowsAppsShimFromPackageDir falls back to family prefix when publisher hash mismatches (win32 only)', () => {
  if (process.platform !== 'win32') return;
  const fakeLocal = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-msix-fuzzy-'));
  try {
    const wa = path.join(fakeLocal, 'Microsoft', 'WindowsApps');
    fs.mkdirSync(wa, { recursive: true });
    fs.writeFileSync(path.join(wa, 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0.exe'), 'x');
    const prev = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = fakeLocal;
    try {
      const installFull = 'C:\\Program Files\\WindowsApps\\SpotifyAB.SpotifyMusic_1.287.414.0_x64__wrongpublisher';
      assert.equal(
        helpers.inferMsixUserWindowsAppsShimFromPackageDir(installFull),
        path.normalize(path.join(wa, 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0.exe')),
      );
    } finally {
      process.env.LOCALAPPDATA = prev;
    }
  } finally {
    fs.rmSync(fakeLocal, { recursive: true, force: true });
  }
});

test('isLikelyUserApp rejects WindowsApps winget shim as catalog noise', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'winget',
      'C:\\Users\\Someone\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe',
      {
        source: 'windows-apps-shim',
        targetExe: 'C:\\Users\\Someone\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe',
      },
    ),
    false,
  );
});

test('isLikelyUserApp rejects Microsoft Visual C++ redistributable ARP display names', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Microsoft Visual C++ 2015-2022 Redistributable (x64) - 14.44.35211',
      'C:\\ProgramData\\Package Cache\\{abc}\\vc_redist.x64.exe',
      { source: 'registry', registryMeta: { systemComponent: false, releaseType: '' } },
    ),
    false,
  );
});

test('isLikelyUserApp rejects generic redistributable (x64) title noise', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Some Vendor Runtime Redistributable (x86)',
      'C:\\Apps\\thing.exe',
      { source: 'registry', registryMeta: { systemComponent: false, releaseType: '' } },
    ),
    false,
  );
});

test('isLikelyUserApp still allows Visual Studio Code (not VC++ redistributable)', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Visual Studio Code',
      'C:\\Users\\Someone\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
      { source: 'registry', registryMeta: { systemComponent: false, releaseType: '' } },
    ),
    true,
  );
});

test('isLikelyUserApp rejects Bonjour display name (Apple mDNS noise)', () => {
  assert.equal(
    helpers.isLikelyUserApp('Bonjour', 'C:\\Program Files\\Bonjour\\mDNSResponder.exe', { source: 'registry' }),
    false,
  );
});

test('isLikelyUserApp rejects Apple Bonjour registry row by install path', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Bonjour 2.0.5',
      '',
      {
        source: 'registry',
        registryMeta: {
          systemComponent: false,
          releaseType: '',
          uninstallString: '"C:\\Program Files\\Bonjour\\mDNSResponder.exe"',
          installLocation: 'C:\\Program Files\\Bonjour',
          iconSource: '',
        },
      },
    ),
    false,
  );
});

test('isLikelyUserApp allows packaged Start Menu shortcut when shell:AppsFolder is only in raw target', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Movies & TV',
      'C:\\Users\\Someone\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Movies & TV.lnk',
      {
        source: 'start-menu-shortcut',
        shortcutPath: 'C:\\Users\\Someone\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Movies & TV.lnk',
        targetExe: '',
        rawShortcutArgs: '',
        rawShortcutTarget: 'shell:AppsFolder\\Microsoft.ZuneVideo_8wekyb3d8bbwe!Microsoft.ZuneVideo',
        iconSource: null,
        hasShortcutIcon: true,
      },
    ),
    true,
  );
});

test('inferMsixUserWindowsAppsShimFromPackageDir maps Program Files package dir to user shim (win32 only)', () => {
  if (process.platform !== 'win32') return;
  const fakeLocal = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-msix-shim-'));
  try {
    const wa = path.join(fakeLocal, 'Microsoft', 'WindowsApps');
    fs.mkdirSync(wa, { recursive: true });
    const shimPath = path.join(wa, 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0.exe');
    fs.writeFileSync(shimPath, 'x');
    const prev = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = fakeLocal;
    try {
      const installFull = 'C:\\Program Files\\WindowsApps\\SpotifyAB.SpotifyMusic_1.287.414.0_x64__zpdnekdrzrea0';
      assert.equal(
        helpers.inferMsixUserWindowsAppsShimFromPackageDir(installFull),
        path.normalize(shimPath),
      );
    } finally {
      process.env.LOCALAPPDATA = prev;
    }
  } finally {
    fs.rmSync(fakeLocal, { recursive: true, force: true });
  }
});

test('isLikelyUserApp allows Store-style ARP when targetExe is only System32 msiexec', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      'Spotify Music',
      'C:\\Program Files\\WindowsApps\\SpotifyAB.SpotifyMusic_1.2.3.4_x64__zpdnekdrzrea0',
      {
        source: 'registry',
        registryMeta: {
          systemComponent: false,
          releaseType: '',
          uninstallString: 'MsiExec.exe /X{ABCDEF12-3456-7890-ABCD-EF1234567890}',
          installLocation: 'C:\\Program Files\\WindowsApps\\SpotifyAB.SpotifyMusic_1.2.3.4_x64__zpdnekdrzrea0',
        },
        targetExe: 'C:\\Windows\\System32\\msiexec.exe',
      },
    ),
    true,
  );
});

test('isLikelyUserApp allows ARP entry whose UninstallString is msiexec (win32-style path)', () => {
  assert.equal(
    helpers.isLikelyUserApp(
      '7-Zip 24.09 (x64 edition)',
      'C:\\Program Files\\7-Zip\\7zFM.exe',
      {
        source: 'registry',
        registryMeta: {
          systemComponent: false,
          releaseType: '',
          uninstallString: 'MsiExec.exe /X{ABCDEF12-3456-7890-ABCD-EF1234567890}',
          iconSource: 'C:\\Program Files\\7-Zip\\7zFM.exe',
          installLocation: 'C:\\Program Files\\7-Zip',
        },
        targetExe: 'C:\\Program Files\\7-Zip\\7zFM.exe',
      },
    ),
    true,
  );
});

test('probeInstallFolderForWindowsExe prefers main exe over Update.exe (win32 only)', () => {
  if (process.platform !== 'win32') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-spotify-probe-'));
  try {
    fs.writeFileSync(path.join(root, 'Update.exe'), 'u');
    fs.writeFileSync(path.join(root, 'Spotify.exe'), 's');
    assert.equal(
      helpers.probeInstallFolderForWindowsExe(root),
      path.join(root, 'Spotify.exe'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('probeInstallFolderForWindowsExe returns null for non-directory (win32 only)', () => {
  if (process.platform !== 'win32') return;
  const f = path.join(os.tmpdir(), `fs-notdir-${Date.now()}.txt`);
  fs.writeFileSync(f, 'x');
  try {
    assert.equal(helpers.probeInstallFolderForWindowsExe(f), null);
  } finally {
    fs.rmSync(f, { force: true });
  }
});

test('resolveUpdateStyleProcessStartChildExe finds newest app-* child (win32 only)', () => {
  if (process.platform !== 'win32') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-discord-'));
  try {
    fs.mkdirSync(path.join(root, 'app-1.0.1'), { recursive: true });
    fs.mkdirSync(path.join(root, 'app-1.0.10'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app-1.0.1', 'Discord.exe'), 'a');
    fs.writeFileSync(path.join(root, 'app-1.0.10', 'Discord.exe'), 'b');
    fs.writeFileSync(path.join(root, 'Update.exe'), 'u');
    const resolved = helpers.resolveUpdateStyleProcessStartChildExe(
      path.join(root, 'Update.exe'),
      '--processStart Discord.exe',
    );
    assert.equal(resolved, path.join(root, 'app-1.0.10', 'Discord.exe'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveUpdateStyleProcessStartChildExe accepts equals form', () => {
  if (process.platform !== 'win32') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-slack-'));
  try {
    fs.mkdirSync(path.join(root, 'app-3.2.0'), { recursive: true });
    fs.writeFileSync(path.join(root, 'app-3.2.0', 'Slack.exe'), 'x');
    fs.writeFileSync(path.join(root, 'Update.exe'), 'u');
    const resolved = helpers.resolveUpdateStyleProcessStartChildExe(
      path.join(root, 'Update.exe'),
      '--processStart=Slack.exe',
    );
    assert.equal(resolved, path.join(root, 'app-3.2.0', 'Slack.exe'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveBareSystemExecutableFromShimTarget maps taskmgr.exe on Windows', () => {
  if (process.platform !== 'win32') return;
  const windir = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  const expected = path.join(windir, 'System32', 'taskmgr.exe');
  if (!fs.existsSync(expected)) return;
  assert.equal(
    helpers.resolveBareSystemExecutableFromShimTarget('taskmgr.exe'),
    path.normalize(expected),
  );
});
