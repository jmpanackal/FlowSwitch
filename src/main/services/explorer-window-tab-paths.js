/**
 * Resolves filesystem folder paths for File Explorer windows (including Win11 tabs)
 * via Shell.Application + root HWND matching. Used by layout capture only.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Normalize HWND from capture JSON (.NET may emit signed Int32) to an unsigned
 * decimal string for PowerShell `[IntPtr]::new([int64]'…'])`.
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeHwndForShellScript(value) {
  const s = String(value ?? '').trim();
  if (!/^-?\d{1,20}$/.test(s)) return null;
  let n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  // Signed 32-bit HWND from JSON → unsigned (common for high-bit handles)
  if (n < 0 && n >= -0x80000000) {
    n = n + 0x100000000;
  }
  if (n <= 0 || n > 0xffffffff) return null;
  return String(Math.trunc(n));
}

const isSafeHwndString = (value) => normalizeHwndForShellScript(value) != null;

/**
 * @param {string} rootHwndStr - Top-level Explorer window handle (decimal string).
 * @returns {Promise<string[]>} Deduped absolute folder paths that exist on disk.
 */
function listExplorerFilesystemFolderPathsForRootHwnd(rootHwndStr) {
  if (process.platform !== 'win32') {
    return Promise.resolve([]);
  }
  const psHwnd = normalizeHwndForShellScript(rootHwndStr);
  if (!psHwnd) {
    return Promise.resolve([]);
  }

  const psScript = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
  public const uint GA_ROOT = 2;
}
"@
$root = [IntPtr]::new([int64]'${psHwnd.replace(/'/g, "''")}')
$shell = New-Object -ComObject Shell.Application
$paths = New-Object System.Collections.Generic.List[string]
$seen = New-Object 'System.Collections.Generic.HashSet[string]'

function Test-ExplorerShellViewBelongsToFrame {
  param([IntPtr]$shellHwnd, [IntPtr]$frameRoot)
  if ($shellHwnd -eq [IntPtr]::Zero) { return $false }
  if ($shellHwnd -eq $frameRoot) { return $true }
  try {
    if ([Win]::GetAncestor($shellHwnd, [Win]::GA_ROOT) -eq $frameRoot) { return $true }
  } catch {}
  $cur = $shellHwnd
  for ($i = 0; $i -lt 160; $i++) {
    if ($cur -eq $frameRoot) { return $true }
    try {
      $p = [Win]::GetParent($cur)
    } catch { break }
    if ($p -eq [IntPtr]::Zero) { break }
    $cur = $p
  }
  return $false
}

function Get-FilesystemFolderFromShellWindow {
  param($w)
  $fsPath = $null
  $loc = $null
  try { $loc = $w.LocationURL } catch { $loc = $null }
  if (-not [string]::IsNullOrWhiteSpace($loc) -and ($loc -match '^file:')) {
    try {
      $uri = New-Object Uri $loc
      $fsPath = [Uri]::UnescapeDataString($uri.LocalPath) -replace '/','\\'
    } catch {}
  }
  if ([string]::IsNullOrWhiteSpace($fsPath)) {
    try {
      $doc = $w.Document
      if ($null -ne $doc) {
        $fd = $doc.Folder
        if ($null -ne $fd) {
          $sl = $fd.Self
          if ($null -ne $sl) {
            $p2 = [string]$sl.Path
            if (-not [string]::IsNullOrWhiteSpace($p2)) { $fsPath = $p2.Trim() }
          }
        }
      }
    } catch {}
  }
  if ([string]::IsNullOrWhiteSpace($fsPath)) { return $null }
  $norm = ($fsPath.Trim() -replace '/','\\')
  # NOTE: in this JS-template literal we MUST write four backslashes so the
  # generated PowerShell source contains a single-quoted backslash literal.
  # Two-char sequence (backslash + apostrophe) is silently mangled by JS.
  if ($norm.Length -ge 3 -and $norm[0] -eq '\\' -and $norm[1] -match '[a-zA-Z]' -and $norm[2] -eq ':') {
    $norm = $norm.Substring(1)
  }
  if (-not ($norm.StartsWith('\\') -or ($norm.Length -ge 3 -and $norm[1] -eq ':' -and $norm[2] -eq '\\'))) {
    return $null
  }
  if (-not (Test-Path -LiteralPath $norm)) { return $null }
  try {
    if (-not ((Get-Item -LiteralPath $norm) -is [System.IO.DirectoryInfo])) { return $null }
  } catch { return $null }
  return $norm
}

foreach ($w in $shell.Windows()) {
  try {
    $wh = [IntPtr]::Zero
    try { $wh = [IntPtr]::new([int64]$w.HWND) } catch { continue }
    if ($wh -eq [IntPtr]::Zero) { continue }
    if (-not (Test-ExplorerShellViewBelongsToFrame -shellHwnd $wh -frameRoot $root)) { continue }

    $norm = Get-FilesystemFolderFromShellWindow -w $w
    if ([string]::IsNullOrWhiteSpace($norm)) { continue }
    $key = $norm.ToLowerInvariant()
    if ($seen.Contains($key)) { continue }
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

/**
 * Enumerate File Explorer top-level windows directly from Shell COM and group
 * all file-system folder tabs by root frame HWND.
 * @returns {Promise<Array<{
 *   pid: number;
 *   mainWindowHandle: string;
 *   title: string;
 *   executablePath: string | null;
 *   isMinimized: boolean;
 *   bounds: { x: number; y: number; width: number; height: number } | null;
 *   normalBounds: { x: number; y: number; width: number; height: number } | null;
 *   folderPaths: string[];
 * }>>}
 */
function listExplorerShellWindows() {
  if (process.platform !== 'win32') return Promise.resolve([]);

  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public struct POINT { public int X; public int Y; }
public struct WINDOWPLACEMENT {
  public int length;
  public int flags;
  public int showCmd;
  public POINT ptMinPosition;
  public POINT ptMaxPosition;
  public RECT rcNormalPosition;
}
public static class Win {
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  public const uint GA_ROOT = 2;
}
"@

function Get-Title([IntPtr]$hWnd) {
  try {
    $len = [Win]::GetWindowTextLength($hWnd)
    if ($len -le 0) { return '' }
    $sb = New-Object System.Text.StringBuilder ($len + 1)
    [void][Win]::GetWindowText($hWnd, $sb, $sb.Capacity)
    return $sb.ToString()
  } catch {
    return ''
  }
}

function Resolve-FolderPathFromShellWindow($w) {
  $fsPath = $null
  $loc = $null
  try { $loc = $w.LocationURL } catch { $loc = $null }
  if (-not [string]::IsNullOrWhiteSpace($loc) -and ($loc -match '^file:')) {
    try {
      $uri = New-Object Uri $loc
      $fsPath = [Uri]::UnescapeDataString($uri.LocalPath) -replace '/','\\'
    } catch {}
  }
  if ([string]::IsNullOrWhiteSpace($fsPath)) {
    try {
      $doc = $w.Document
      if ($null -ne $doc -and $null -ne $doc.Folder -and $null -ne $doc.Folder.Self) {
        $p2 = [string]$doc.Folder.Self.Path
        if (-not [string]::IsNullOrWhiteSpace($p2)) { $fsPath = $p2.Trim() }
      }
    } catch {}
  }
  if ([string]::IsNullOrWhiteSpace($fsPath)) { return $null }
  $norm = ($fsPath.Trim() -replace '/','\\')
  # See backslash note above: JS template-literal source needs four backslashes
  # to emit a PowerShell single-quoted backslash literal.
  if ($norm.Length -ge 3 -and $norm[0] -eq '\\' -and $norm[1] -match '[a-zA-Z]' -and $norm[2] -eq ':') {
    $norm = $norm.Substring(1)
  }
  if (-not ($norm.StartsWith('\\') -or ($norm.Length -ge 3 -and $norm[1] -eq ':' -and $norm[2] -eq '\\'))) { return $null }
  if (-not (Test-Path -LiteralPath $norm)) { return $null }
  try {
    if (-not ((Get-Item -LiteralPath $norm) -is [System.IO.DirectoryInfo])) { return $null }
  } catch { return $null }
  return $norm
}

$shell = New-Object -ComObject Shell.Application
$grouped = @{}
foreach ($w in $shell.Windows()) {
  try {
    $hwnd = 0
    try { $hwnd = [int64]$w.HWND } catch { continue }
    if ($hwnd -le 0) { continue }

    $fullName = ''
    try { $fullName = [string]$w.FullName } catch { $fullName = '' }
    if ([string]::IsNullOrWhiteSpace($fullName) -or -not ($fullName.ToLowerInvariant().EndsWith('explorer.exe'))) {
      continue
    }

    $h = [IntPtr]::new($hwnd)
    $root = [Win]::GetAncestor($h, [Win]::GA_ROOT)
    if ($root -eq [IntPtr]::Zero) { continue }
    $rootNum = [int64]$root
    $key = [string]$rootNum
    if (-not $grouped.ContainsKey($key)) {
      $rect = New-Object RECT
      $hasRect = [Win]::GetWindowRect($root, [ref]$rect)
      $isMin = [Win]::IsIconic($root)
      $normal = $null
      if ($isMin) {
        try {
          $placement = New-Object WINDOWPLACEMENT
          $placement.length = [System.Runtime.InteropServices.Marshal]::SizeOf([WINDOWPLACEMENT])
          if ([Win]::GetWindowPlacement($root, [ref]$placement)) {
            $normal = @{
              x = [int]$placement.rcNormalPosition.Left
              y = [int]$placement.rcNormalPosition.Top
              width = [int]($placement.rcNormalPosition.Right - $placement.rcNormalPosition.Left)
              height = [int]($placement.rcNormalPosition.Bottom - $placement.rcNormalPosition.Top)
            }
          }
        } catch {}
      }

      # PowerShell's $pid is a Constant + AllScope automatic; assigning to it
      # (or [ref]$pid) throws and would silently drop every Explorer window.
      [uint32]$processId = 0
      [void][Win]::GetWindowThreadProcessId($root, [ref]$processId)
      $grouped[$key] = @{
        pid = [int]$processId
        mainWindowHandle = [string]$rootNum
        title = (Get-Title $root)
        executablePath = $fullName
        isMinimized = [bool]$isMin
        bounds = $(if ($hasRect) {
          @{
            x = [int]$rect.Left
            y = [int]$rect.Top
            width = [int]($rect.Right - $rect.Left)
            height = [int]($rect.Bottom - $rect.Top)
          }
        } else { $null })
        normalBounds = $normal
        folderPaths = New-Object System.Collections.Generic.List[string]
        seen = New-Object 'System.Collections.Generic.HashSet[string]'
      }
    }

    $folderPath = Resolve-FolderPathFromShellWindow $w
    if (-not [string]::IsNullOrWhiteSpace($folderPath)) {
      $k = $folderPath.ToLowerInvariant()
      if ($grouped[$key].seen.Add($k)) {
        [void]$grouped[$key].folderPaths.Add($folderPath)
      }
    }
  } catch {}
}

$out = @()
foreach ($entry in $grouped.Values) {
  $t = [string]$entry.title
  if ([string]::IsNullOrWhiteSpace($t)) { $t = 'File Explorer' }
  $out += [pscustomobject]@{
    pid = [int]$entry.pid
    mainWindowHandle = [string]$entry.mainWindowHandle
    title = $t
    executablePath = [string]$entry.executablePath
    isMinimized = [bool]$entry.isMinimized
    bounds = $entry.bounds
    normalBounds = $entry.normalBounds
    folderPaths = @($entry.folderPaths)
  }
}
if ($out.Count -eq 0) { Write-Output '[]'; exit 0 }
$out | ConvertTo-Json -Depth 6
`;

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { windowsHide: true, timeout: 16000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout || '').trim() || '[]');
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          const out = [];
          for (const row of rows) {
            const bounds = row && row.bounds && Number.isFinite(Number(row.bounds.width))
              ? {
                x: Number(row.bounds.x || 0),
                y: Number(row.bounds.y || 0),
                width: Number(row.bounds.width || 0),
                height: Number(row.bounds.height || 0),
              }
              : null;
            const normalBounds = row && row.normalBounds && Number.isFinite(Number(row.normalBounds.width))
              ? {
                x: Number(row.normalBounds.x || 0),
                y: Number(row.normalBounds.y || 0),
                width: Number(row.normalBounds.width || 0),
                height: Number(row.normalBounds.height || 0),
              }
              : null;
            const folderPaths = [];
            const seen = new Set();
            for (const p of (Array.isArray(row?.folderPaths) ? row.folderPaths : [])) {
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
              folderPaths.push(path.normalize(s));
            }
            out.push({
              pid: Number(row?.pid || 0),
              mainWindowHandle: String(row?.mainWindowHandle || '').trim(),
              title: String(row?.title || 'File Explorer').trim() || 'File Explorer',
              executablePath: typeof row?.executablePath === 'string' ? row.executablePath : null,
              isMinimized: Boolean(row?.isMinimized),
              bounds,
              normalBounds,
              folderPaths,
            });
          }
          resolve(out.filter((r) => r.mainWindowHandle));
        } catch {
          resolve([]);
        }
      },
    );
  });
}

module.exports = {
  listExplorerFilesystemFolderPathsForRootHwnd,
  listExplorerShellWindows,
  isSafeHwndString,
  normalizeHwndForShellScript,
};
