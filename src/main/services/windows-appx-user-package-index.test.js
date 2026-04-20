const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLookup,
  getInstallLocationAndDisplayForExe,
} = require('./windows-appx-user-package-index');

test('lookup matches flat WindowsApps shim by PackageFamilyName', () => {
  const rows = [
    {
      FamilyName: 'OpenAI.ChatGPT_8wekyb3d8bbwe',
      FullName: 'OpenAI.ChatGPT_1_x64__8wekyb3d8bbwe',
      InstallLocation: 'C:\\Users\\x\\AppData\\Local\\Packages\\OpenAI.ChatGPT_8wekyb3d8bbwe',
      DisplayName: 'ChatGPT',
      AppUserModelIds: ['OpenAI.ChatGPT_8wekyb3d8bbwe!App'],
    },
  ];
  const lookup = buildLookup(rows);
  const shim = 'C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\OpenAI.ChatGPT_8wekyb3d8bbwe.exe';
  const got = getInstallLocationAndDisplayForExe(shim, lookup);
  assert.equal(got.displayName, 'ChatGPT');
  assert.equal(got.appUserModelId, 'OpenAI.ChatGPT_8wekyb3d8bbwe!App');
  assert.ok(got.installLocation.includes('Packages'));
});

test('lookup matches nested WindowsApps exe by PackageFullName folder', () => {
  const rows = [
    {
      FamilyName: 'SpotifyAB.SpotifyMusic_zyx',
      FullName: 'SpotifyAB.SpotifyMusic_1.2.3.4_x64__zyx',
      InstallLocation: 'C:\\Users\\x\\AppData\\Local\\Packages\\SpotifyAB.SpotifyMusic_zyx',
      DisplayName: 'Spotify',
      AppUserModelIds: ['SpotifyAB.SpotifyMusic_zyx!Spotify'],
    },
  ];
  const lookup = buildLookup(rows);
  const exe = 'C:\\Program Files\\WindowsApps\\SpotifyAB.SpotifyMusic_1.2.3.4_x64__zyx\\Spotify.exe';
  const got = getInstallLocationAndDisplayForExe(exe, lookup);
  assert.equal(got.displayName, 'Spotify');
  assert.equal(got.appUserModelId, 'SpotifyAB.SpotifyMusic_zyx!Spotify');
  assert.ok(String(got.installLocation).includes('Packages'));
});

test('lookup maps App Execution Alias shim stem to owning package', () => {
  // `SnippingTool.exe` lives under %LOCALAPPDATA%\Microsoft\WindowsApps but shares
  // no prefix with the Package Family Name — only the manifest alias connects them.
  const rows = [
    {
      FamilyName: 'Microsoft.ScreenSketch_8wekyb3d8bbwe',
      FullName: 'Microsoft.ScreenSketch_11.2601.12.0_x64__8wekyb3d8bbwe',
      InstallLocation: 'C:\\Program Files\\WindowsApps\\Microsoft.ScreenSketch_11.2601.12.0_x64__8wekyb3d8bbwe',
      DisplayName: 'Snipping Tool',
      AppUserModelIds: ['Microsoft.ScreenSketch_8wekyb3d8bbwe!App'],
      ExecutionAliases: ['SnippingTool.exe'],
    },
  ];
  const lookup = buildLookup(rows);
  const shim = 'C:\\Users\\x\\AppData\\Local\\Microsoft\\WindowsApps\\SnippingTool.exe';
  const got = getInstallLocationAndDisplayForExe(shim, lookup);
  assert.equal(got.displayName, 'Snipping Tool');
  assert.equal(got.appUserModelId, 'Microsoft.ScreenSketch_8wekyb3d8bbwe!App');
});

test('lookup exposes byAliasStemLc index', () => {
  const rows = [
    {
      FamilyName: 'OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0',
      FullName: 'OpenAI.ChatGPT-Desktop_1.2026.43.0_x64__2p2nqsd0c76g0',
      InstallLocation: 'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT-Desktop_1.2026.43.0_x64__2p2nqsd0c76g0',
      DisplayName: 'ChatGPT',
      AppUserModelIds: ['OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0!ChatGPT'],
      ExecutionAliases: ['chatgpt.exe'],
    },
  ];
  const lookup = buildLookup(rows);
  assert.ok(lookup.byAliasStemLc);
  assert.equal(lookup.byAliasStemLc.get('chatgpt')?.familyName, 'OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0');
});

test('buildLookup tolerates rows without ExecutionAliases field', () => {
  const rows = [
    {
      FamilyName: 'FooAB.Foo_abc',
      FullName: 'FooAB.Foo_1.0_x64__abc',
      InstallLocation: 'C:\\Packages\\FooAB.Foo_abc',
      DisplayName: 'Foo',
      AppUserModelIds: ['FooAB.Foo_abc!App'],
    },
  ];
  const lookup = buildLookup(rows);
  assert.ok(lookup.byAliasStemLc instanceof Map);
  assert.equal(lookup.byAliasStemLc.size, 0);
  assert.equal(lookup.list[0].executionAliases.length, 0);
});
