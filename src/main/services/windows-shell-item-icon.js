'use strict';

const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const systemPowerShellExe = () => {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
};

const APPS_FOLDER_MONIKER_RE = /^shell:AppsFolder\\([A-Za-z0-9._-]+![A-Za-z0-9._-]+)$/i;

const isSafeWindowsAppsFolderMoniker = (value) => {
  if (!value || typeof value !== 'string') return false;
  const n = value.trim();
  if (!n || n.length > 512) return false;
  if (n.includes('..') || n.includes('/') || n.includes('"') || n.includes('\0')) return false;
  return APPS_FOLDER_MONIKER_RE.test(n);
};

/**
 * Paths we allow the Shell icon helper to touch (same surfaces as Start Menu / picker).
 */
const isSafeWindowsShellIconProbePath = (absPath) => {
  if (isSafeWindowsAppsFolderMoniker(absPath)) return true;
  if (!absPath || typeof absPath !== 'string') return false;
  const n = absPath.replace(/\//g, '\\').trim();
  if (n.includes('..') || n.startsWith('\\\\')) return false;
  if (!/^[A-Za-z]:\\/.test(n)) return false;
  if (n.length > 4096) return false;
  const ext = path.extname(n).toLowerCase();
  return ['.lnk', '.url', '.exe', '.dll', '.ico'].includes(ext);
};

const isProbeableShellIconFile = (absolutePath) => {
  if (isSafeWindowsAppsFolderMoniker(absolutePath)) return true;
  if (!isSafeWindowsShellIconProbePath(absolutePath)) return false;
  try {
    const st = fs.lstatSync(absolutePath);
    if (st.isFile()) return true;
    // Store / App Execution Alias shims are often symlinks; SHGetFileInfo still works on the link path.
    if (st.isSymbolicLink() && absolutePath.toLowerCase().endsWith('.exe')) return true;
    return false;
  } catch {
    return false;
  }
};

const decodeShellStdoutLineToDataUrl = (line) => {
  const b64 = String(line || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\s+/g, '');
  if (!b64 || b64.length < 64) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 32) return null;
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
};

/** Coalesce concurrent Shell lookups so one PowerShell run handles many SHGetFileInfo calls. */
const BATCH_DEBOUNCE_MS = 12;
const MAX_PATHS_PER_BATCH = 64;

const waiting = [];
let debounceTimer = null;
let chain = Promise.resolve();

const shellBatchTimeoutMs = (n) => Math.min(120_000, 22_000 + n * 2200);

const runShellIconsBatchFile = (scriptPath, paths, iconSizePx, timeoutMs) => {
  const ps = systemPowerShellExe();
  if (!ps || !fs.existsSync(ps)) {
    return Promise.resolve(new Map(paths.map((p) => [p, null])));
  }
  const inputFile = path.join(
    os.tmpdir(),
    `fs-shell-ico-${process.pid}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}.txt`,
  );
  fs.writeFileSync(inputFile, paths.join('\n'), 'utf8');
  const maxBuffer = Math.max(12 * 1024 * 1024, paths.length * 600 * 1024);
  return new Promise((resolve) => {
    execFile(
      ps,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-PathsFile',
        inputFile,
        '-IconSize',
        String(iconSizePx),
      ],
      {
        encoding: 'utf8',
        maxBuffer,
        timeout: timeoutMs,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        try {
          fs.unlinkSync(inputFile);
        } catch {
          // ignore
        }
        const out = new Map();
        if (err) {
          if (process.env.FLOWSWITCH_SHELL_ICON_DEBUG === '1') {
            console.warn('[ShellIconBatch]', err?.message || err, stderr || '');
          }
          for (const p of paths) out.set(p, null);
          return resolve(out);
        }
        let lines = String(stdout || '').replace(/\r/g, '').split('\n');
        while (lines.length && lines[lines.length - 1] === '') lines.pop();
        for (let i = 0; i < paths.length; i += 1) {
          out.set(paths[i], decodeShellStdoutLineToDataUrl(lines[i] || ''));
        }
        return resolve(out);
      },
    );
  });
};

const drainShellIconQueue = async (scriptPath) => {
  while (waiting.length) {
    const byPath = new Map();
    let slotCount = 0;
    while (waiting.length && slotCount < MAX_PATHS_PER_BATCH) {
      const item = waiting.shift();
      const p = item.path;
      if (!byPath.has(p)) {
        byPath.set(p, []);
        slotCount += 1;
      }
      byPath.get(p).push(item.resolve);
    }
    const paths = [...byPath.keys()];
    const timeoutMs = shellBatchTimeoutMs(paths.length);
    let results;
    try {
      results = await runShellIconsBatchFile(scriptPath, paths, 256, timeoutMs);
    } catch {
      results = new Map(paths.map((p) => [p, null]));
    }
    for (const p of paths) {
      const url = results.get(p) ?? null;
      for (const res of byPath.get(p)) {
        res(url);
      }
    }
  }
};

const scheduleShellIconLookup = (scriptPath, absolutePath) => new Promise((resolve) => {
  waiting.push({ path: absolutePath, resolve });
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    chain = chain.then(() => drainShellIconQueue(scriptPath)).catch(() => {
      const stuck = waiting.splice(0);
      for (const { resolve: r } of stuck) r(null);
    });
  }, BATCH_DEBOUNCE_MS);
});

/**
 * Uses Windows Shell (SHGetFileInfo → icon handle), the same classic path Explorer uses for
 * many filesystem items, and returns a PNG data URL, or null on failure.
 * Requests are debounced and batched into a single PowerShell process per batch (see script
 * -PathsFile mode) to avoid spawning hundreds of short-lived shells during installed-app scans.
 */
const getShellItemIconDataUrl = (scriptPath, absolutePath) => {
  if (process.platform !== 'win32') return Promise.resolve(null);
  if (!scriptPath || !fs.existsSync(scriptPath)) return Promise.resolve(null);
  if (!isProbeableShellIconFile(absolutePath)) return Promise.resolve(null);

  const ps = systemPowerShellExe();
  if (!ps || !fs.existsSync(ps)) return Promise.resolve(null);

  return scheduleShellIconLookup(scriptPath, absolutePath);
};

module.exports = {
  getShellItemIconDataUrl,
  isSafeWindowsShellIconProbePath,
  isSafeWindowsAppsFolderMoniker,
  systemPowerShellExe,
};
