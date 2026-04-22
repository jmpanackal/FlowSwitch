/**
 * Copy Windows artifacts from release/ into website/downloads/ for static hosting.
 * Run after: npm run dist:win
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const releaseDir = path.join(root, 'release');
const outDir = path.join(root, 'website', 'downloads');

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
if (!version) throw new Error('package.json missing version');

if (!existsSync(releaseDir)) {
  throw new Error(`Missing ${releaseDir}. Run npm run dist:win first.`);
}

const want = new Set([
  `FlowSwitch-${version}-win-x64-installer.exe`,
  `FlowSwitch-${version}-win-x64-portable.exe`,
]);

const names = readdirSync(releaseDir).filter((n) => want.has(n));
if (names.length !== want.size) {
  const missing = [...want].filter((n) => !names.includes(n));
  throw new Error(
    `Expected both Windows artifacts in release/. Missing: ${missing.join(', ')}. Run npm run dist:win.`,
  );
}

mkdirSync(outDir, { recursive: true });
for (const name of names) {
  const from = path.join(releaseDir, name);
  const to = path.join(outDir, name);
  copyFileSync(from, to);
  console.log('Copied', path.relative(root, to));
}
