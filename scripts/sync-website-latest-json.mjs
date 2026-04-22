/**
 * Writes website/latest.json from package.json version and optional GitHub repo.
 * Set FLOWSWITCH_GITHUB_REPO to "owner/repo" (defaults to jmpanackal/FlowSwitch).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const websiteDir = path.join(root, 'website');
const outPath = path.join(websiteDir, 'latest.json');

mkdirSync(websiteDir, { recursive: true });

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const version = String(pkg.version || '').trim();
if (!version) {
  throw new Error('package.json missing version');
}

const githubRepository = String(
  process.env.FLOWSWITCH_GITHUB_REPO || 'jmpanackal/FlowSwitch',
).trim();

const downloadBaseUrl = String(process.env.FLOWSWITCH_DOWNLOAD_BASE_URL || '').trim();

const payload = {
  version,
  githubRepository,
  releaseTag: `v${version}`,
  files: {
    installer: `FlowSwitch-${version}-win-x64-installer.exe`,
    portable: `FlowSwitch-${version}-win-x64-portable.exe`,
  },
};

if (downloadBaseUrl) {
  payload.downloadBaseUrl = downloadBaseUrl;
}

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log('Wrote', outPath);
