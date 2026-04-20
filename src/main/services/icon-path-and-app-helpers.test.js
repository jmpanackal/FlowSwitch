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
