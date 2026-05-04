/**
 * Resolves filesystem folder paths for File Explorer windows (including Win11 tabs)
 * via Shell.Application + root HWND matching. Used by layout capture only.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const isSafeHwndString = (value) => {
  const s = String(value || '').trim();
  if (!s) return false;
  if (!/^\d{1,20}$/.test(s)) return false;
  try {
    const n = BigInt(s);
    return n > 0n && n <= 0xffffffffn;
  } catch {
    return false;
  }
};

/**
 * @param {string} rootHwndStr - Top-level Explorer window handle (decimal string).
 * @returns {Promise<string[]>} Deduped absolute folder paths that exist on disk.
 */
function listExplorerFilesystemFolderPathsForRootHwnd(rootHwndStr) {
  if (process.platform !== 'win32') {
    return Promise.resolve([]);
  }
  if (!isSafeHwndString(rootHwndStr)) {
    return Promise.resolve([]);
  }

  const psHwnd = String(rootHwndStr).trim();
  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
  public const uint GA_ROOT = 2;
}
"@
$root = [IntPtr]::new([int64]'${psHwnd.replace(/'/g, "''")}')
$shell = New-Object -ComObject Shell.Application
$paths = New-Object System.Collections.Generic.List[string]
$seen = New-Object 'System.Collections.Generic.HashSet[string]'

foreach ($w in $shell.Windows()) {
  try {
    $wh = [IntPtr]::Zero
    try { $wh = [IntPtr]::new([int64]$w.HWND) } catch { continue }
    if ($wh -eq [IntPtr]::Zero) { continue }
    $anc = [Win]::GetAncestor($wh, [Win]::GA_ROOT)
    if ($anc -ne $root) { continue }

    $loc = $null
    try { $loc = $w.LocationURL } catch { $loc = $null }
    if ([string]::IsNullOrWhiteSpace($loc)) { continue }

    $fsPath = $null
    if ($loc -match '^file:///') {
      try {
        $uri = New-Object Uri $loc
        $fsPath = [Uri]::UnescapeDataString($uri.LocalPath) -replace '/','\\'
      } catch {}
    }

    if ([string]::IsNullOrWhiteSpace($fsPath)) { continue }
    $norm = $fsPath.Trim()
    $key = $norm.ToLowerInvariant()
    if ($seen.Contains($key)) { continue }
    if (-not (Test-Path -LiteralPath $norm)) { continue }
    try {
      if (-not ((Get-Item -LiteralPath $norm) -is [System.IO.DirectoryInfo])) { continue }
    } catch { continue }
    [void]$seen.Add($key)
    [void]$paths.Add($norm)
  } catch {}
}

if ($paths.Count -eq 0) { Write-Output '[]'; exit 0 }
ConvertTo-Json -InputObject (@($paths)) -Compress
`;

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 12000, maxBuffer: 512 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        try {
          const raw = stdout.trim();
          if (!raw || raw === '[]') {
            resolve([]);
            return;
          }
          const parsed = JSON.parse(raw);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const out = [];
          const seen = new Set();
          for (const p of arr) {
            const s = String(p || '').trim().replace(/\//g, '\\');
            if (!s) continue;
            const k = s.toLowerCase();
            if (seen.has(k)) continue;
            try {
              if (!fs.existsSync(s) || !fs.statSync(s).isDirectory()) continue;
            } catch {
              continue;
            }
            seen.add(k);
            out.push(path.normalize(s));
          }
          resolve(out);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

module.exports = {
  listExplorerFilesystemFolderPathsForRootHwnd,
  isSafeHwndString,
};
