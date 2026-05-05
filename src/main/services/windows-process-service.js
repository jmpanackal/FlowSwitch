const { execFile } = require('child_process');

const hiddenProcessNamePatterns = [
  /^electron$/i,
  /helper$/i,
  /updater$/i,
  /crashpad/i,
  /^runtimebroker$/i,
  /^shellexperiencehost$/i,
  /^searchhost$/i,
  /^searchapp$/i,
  /^textinputhost$/i,
  /^ctfmon$/i,
  /^lockapp$/i,
  /^widgetboard$/i,
  /^applicationframehost$/i,
  /^startmenuexperiencehost$/i,
  // Windows Settings (modern SystemSettings.exe) — OS UI, not a workspace app
  /^systemsettings$/i,
  /^flowswitch$/i, // Exclude FlowSwitch itself from window placement
  // NVIDIA / GeForce satellite processes (layout capture; not user-facing apps)
  /^nvrla$/i,
  /^nvsphelper/i,
  /^nvbroadcast/i,
  /^nvoawrapper/i,
  /^nvdisplay\.container/i,
  /^nvidia nvdlisr/i,
  /nvidia\s*message\s*bus/i,
  /^nvcontainer$/i,
  /^nvidia$/i,
];

const hiddenWindowTitlePatterns = [
  /^textinput/i,
  /^default ime/i,
  /^microsoft text input application/i,
  /^program manager$/i,
  // Do not match "FlowSwitch" in titles: other apps (e.g. Cursor) include the repo/product name.
  // The FlowSwitch app itself is excluded via /^flowswitch$/i in hiddenProcessNamePatterns.
  /^loading$/i, // Loading windows
  /splash/i, // Splash screens
  /please wait/i, // Loading indicators
  /starting up/i, // Startup windows
  /initializing/i, // Initialization windows
  /nvidia.*overlay/i,
  /geforce.*overlay/i,
  /in-game\s+overlay/i,
  /^nvidia geforce overlay$/i,
];

function getRunningWindowProcesses() {
  return new Promise((resolve) => {
    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
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
public static class Win32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
}
"@
$items = @()
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and (($_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 0) -or $_.ProcessName -ieq 'explorer') } | ForEach-Object {
  $rect = New-Object RECT
  $hWnd = [System.IntPtr]::new([int64]$_.MainWindowHandle)
  if ([Win32]::GetWindowRect($hWnd, [ref]$rect)) {
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    $isMinimized = [Win32]::IsIconic($hWnd)
    $normalLeft = $null
    $normalTop = $null
    $normalRight = $null
    $normalBottom = $null
    # Only call GetWindowPlacement for minimized windows (faster + fewer failure points)
    if ($isMinimized) {
      try {
        $placement = New-Object WINDOWPLACEMENT
        try {
          $placement.length = [System.Runtime.InteropServices.Marshal]::SizeOf([WINDOWPLACEMENT])
        } catch {
          # If SizeOf fails, leave length as-is; GetWindowPlacement will just return false.
          $placement.length = 0
        }
        if ([Win32]::GetWindowPlacement($hWnd, [ref]$placement)) {
          $normalLeft = $placement.rcNormalPosition.Left
          $normalTop = $placement.rcNormalPosition.Top
          $normalRight = $placement.rcNormalPosition.Right
          $normalBottom = $placement.rcNormalPosition.Bottom
        }
      } catch {
        # Ignore per-window placement errors; fall back to GetWindowRect.
      }
    }
    if ($width -gt 0 -and $height -gt 0) {
      $classBuilder = New-Object System.Text.StringBuilder 256
      [void][Win32]::GetClassName($hWnd, $classBuilder, $classBuilder.Capacity)
      $windowClass = $classBuilder.ToString()
      if ($_.ProcessName -ieq 'explorer' -and ($width -lt 80 -or $height -lt 80)) {
        return
      }
      $mainTitle = $_.MainWindowTitle
      if ([string]::IsNullOrWhiteSpace($mainTitle) -and $_.ProcessName -ieq 'explorer') {
        $mainTitle = 'File Explorer'
      }
      $dedupeKey = "$($_.Id)|$mainTitle|$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
      if ($seen.Add($dedupeKey)) {
        $items += [pscustomobject]@{
          ProcessName = $_.ProcessName
          Id = $_.Id
          MainWindowHandle = [int64]$_.MainWindowHandle
          MainWindowTitle = $mainTitle
          WindowClass = $windowClass
          Path = $_.Path
          IsMinimized = $isMinimized
          Left = $rect.Left
          Top = $rect.Top
          Right = $rect.Right
          Bottom = $rect.Bottom
          NormalLeft = $normalLeft
          NormalTop = $normalTop
          NormalRight = $normalRight
          NormalBottom = $normalBottom
          Width = $width
          Height = $height
        }
      }
    }
  }
}
# Fallback capture for Explorer windows that can be missed by MainWindowHandle scanning.
try {
  $shellWindow = [Win32]::GetShellWindow()
  [uint32]$shellPid = 0
  if ($shellWindow -ne [System.IntPtr]::Zero) {
    [void][Win32]::GetWindowThreadProcessId($shellWindow, [ref]$shellPid)
  }
  $enumProc = [Win32+EnumWindowsProc]{
    param([System.IntPtr]$hWnd, [System.IntPtr]$lParam)
    try {
      if ($hWnd -eq [System.IntPtr]::Zero -or $hWnd -eq $shellWindow) { return $true }
      if (-not [Win32]::IsWindowVisible($hWnd)) { return $true }
      $rect = New-Object RECT
      if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) { return $true }
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      if ($width -le 0 -or $height -le 0) { return $true }

      # NOTE: $pid is a Constant + AllScope automatic variable in PowerShell. Assigning
      # to it (or passing it to [ref] for an out-parameter) throws and would be silently
      # swallowed by our catch, dropping every Explorer window. Use $processId instead.
      [uint32]$processId = 0
      [void][Win32]::GetWindowThreadProcessId($hWnd, [ref]$processId)
      if ($processId -le 0) { return $true }
      $isShellPid = ($shellPid -gt 0 -and $processId -eq $shellPid)

      $classBuilder = New-Object System.Text.StringBuilder 256
      [void][Win32]::GetClassName($hWnd, $classBuilder, $classBuilder.Capacity)
      $windowClass = $classBuilder.ToString()
      $isExplorerClass = (
        $windowClass -ieq 'CabinetWClass' -or $windowClass -ieq 'ExploreWClass'
      )
      $processName = $null
      $processPath = $null
      if ($isShellPid) {
        $processName = 'explorer'
      } else {
        try {
          $proc = [System.Diagnostics.Process]::GetProcessById([int]$processId)
          $processName = $proc.ProcessName
          try { $processPath = $proc.Path } catch { $processPath = $null }
        } catch {
          $processName = $null
          $processPath = $null
        }
      }
      if (-not $isShellPid -and -not $isExplorerClass -and $processName -ine 'explorer') { return $true }
      if ($width -lt 80 -or $height -lt 80) { return $true }
      $title = ''
      try {
        $titleLen = [Win32]::GetWindowTextLength($hWnd)
        if ($titleLen -gt 0) {
          $titleBuilder = New-Object System.Text.StringBuilder ($titleLen + 1)
          [void][Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
          $title = $titleBuilder.ToString()
        }
      } catch {}
      if ([string]::IsNullOrWhiteSpace($title)) { $title = 'File Explorer' }

      $isMinimized = [Win32]::IsIconic($hWnd)
      $normalLeft = $null
      $normalTop = $null
      $normalRight = $null
      $normalBottom = $null

      if ($isMinimized) {
        $placement = New-Object WINDOWPLACEMENT
        $placement.length = [System.Runtime.InteropServices.Marshal]::SizeOf([WINDOWPLACEMENT])
        if ([Win32]::GetWindowPlacement($hWnd, [ref]$placement)) {
          $normalLeft = $placement.rcNormalPosition.Left
          $normalTop = $placement.rcNormalPosition.Top
          $normalRight = $placement.rcNormalPosition.Right
          $normalBottom = $placement.rcNormalPosition.Bottom
        }
      }

      $dedupeKey = "$processId|$([int64]$hWnd)|$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
      if ($seen.Add($dedupeKey)) {
        $items += [pscustomobject]@{
          ProcessName = $(if ($isShellPid -or $processName -ieq 'explorer' -or $isExplorerClass) { 'explorer' } else { $processName })
          Id = $processId
          MainWindowHandle = [int64]$hWnd
          MainWindowTitle = $title
          WindowClass = $windowClass
          Path = $processPath
          IsMinimized = $isMinimized
          Left = $rect.Left
          Top = $rect.Top
          Right = $rect.Right
          Bottom = $rect.Bottom
          NormalLeft = $normalLeft
          NormalTop = $normalTop
          NormalRight = $normalRight
          NormalBottom = $normalBottom
          Width = $width
          Height = $height
        }
      }
    } catch {}
    return $true
  }
  [void][Win32]::EnumWindows($enumProc, [System.IntPtr]::Zero)
} catch {}

# Shell COM capture for Explorer windows/tabs (reliable even when process/window scans miss).
try {
  $shell = New-Object -ComObject Shell.Application
  foreach ($w in $shell.Windows()) {
    try {
      $hwnd64 = 0
      try { $hwnd64 = [int64]$w.HWND } catch { continue }
      if ($hwnd64 -le 0) { continue }

      $fullName = ''
      try { $fullName = [string]$w.FullName } catch { $fullName = '' }
      if ([string]::IsNullOrWhiteSpace($fullName) -or -not ($fullName.ToLowerInvariant().EndsWith('explorer.exe'))) {
        continue
      }

      $hWnd = [System.IntPtr]::new($hwnd64)
      $rect = New-Object RECT
      if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) { continue }
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      if ($width -lt 80 -or $height -lt 80) { continue }

      # See $pid note above: PowerShell's $pid is Constant/AllScope; use $processId.
      [uint32]$processId = 0
      [void][Win32]::GetWindowThreadProcessId($hWnd, [ref]$processId)

      $title = ''
      try { $title = [string]$w.LocationName } catch { $title = '' }
      if ([string]::IsNullOrWhiteSpace($title)) {
        try {
          $titleLen = [Win32]::GetWindowTextLength($hWnd)
          if ($titleLen -gt 0) {
            $titleBuilder = New-Object System.Text.StringBuilder ($titleLen + 1)
            [void][Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
            $title = $titleBuilder.ToString()
          }
        } catch {}
      }
      if ([string]::IsNullOrWhiteSpace($title)) { $title = 'File Explorer' }

      $isMinimized = [Win32]::IsIconic($hWnd)
      $normalLeft = $null
      $normalTop = $null
      $normalRight = $null
      $normalBottom = $null
      if ($isMinimized) {
        try {
          $placement = New-Object WINDOWPLACEMENT
          $placement.length = [System.Runtime.InteropServices.Marshal]::SizeOf([WINDOWPLACEMENT])
          if ([Win32]::GetWindowPlacement($hWnd, [ref]$placement)) {
            $normalLeft = $placement.rcNormalPosition.Left
            $normalTop = $placement.rcNormalPosition.Top
            $normalRight = $placement.rcNormalPosition.Right
            $normalBottom = $placement.rcNormalPosition.Bottom
          }
        } catch {}
      }

      $dedupeKey = "shell-com|$hwnd64|$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
      if ($seen.Add($dedupeKey)) {
        $items += [pscustomobject]@{
          ProcessName = 'explorer'
          Id = [int]$processId
          MainWindowHandle = $hwnd64
          MainWindowTitle = $title
          WindowClass = 'CabinetWClass'
          Path = $fullName
          IsMinimized = $isMinimized
          Left = $rect.Left
          Top = $rect.Top
          Right = $rect.Right
          Bottom = $rect.Bottom
          NormalLeft = $normalLeft
          NormalTop = $normalTop
          NormalRight = $normalRight
          NormalBottom = $normalBottom
          Width = $width
          Height = $height
        }
      }
    } catch {}
  }
} catch {}
$items | ConvertTo-Json -Depth 3`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', psScript],
      { windowsHide: true, timeout: 7000, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          if (process.env.FLOWSWITCH_CAPTURE_DEBUG === '1') {
            console.warn('[capture] getRunningWindowProcesses failed:', {
              err: err ? String(err.message || err) : null,
              hasStdout: !!stdout,
              stdoutPreview: stdout ? String(stdout).slice(0, 200) : null,
            });
          }
          resolve([]);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          const mapped = rows
            .filter((row) => row && row.ProcessName)
            .map((row) => ({
              name: String(row.ProcessName),
              id: Number(row.Id || 0),
              windowClass: row.WindowClass ? String(row.WindowClass) : '',
              mainWindowHandle: (() => {
                const h = row.MainWindowHandle;
                if (h === undefined || h === null || h === '') return null;
                let n = Number(h);
                if (!Number.isFinite(n) || n === 0) return null;
                if (n < 0 && n >= -0x80000000) {
                  n += 0x100000000;
                }
                if (n <= 0 || n > 0xffffffff) return null;
                return String(Math.trunc(n));
              })(),
              title: row.MainWindowTitle ? String(row.MainWindowTitle) : '',
              executablePath: typeof row.Path === 'string' ? row.Path : null,
              isMinimized: Boolean(row.IsMinimized),
              bounds: {
                x: Number(row.Left || 0),
                y: Number(row.Top || 0),
                width: Number(row.Width || 0),
                height: Number(row.Height || 0),
              },
              normalBounds: (
                Number.isFinite(Number(row.NormalLeft))
                && Number.isFinite(Number(row.NormalTop))
                && Number.isFinite(Number(row.NormalRight))
                && Number.isFinite(Number(row.NormalBottom))
              ) ? {
                x: Number(row.NormalLeft),
                y: Number(row.NormalTop),
                width: Math.max(0, Number(row.NormalRight) - Number(row.NormalLeft)),
                height: Math.max(0, Number(row.NormalBottom) - Number(row.NormalTop)),
              } : null,
            }));
          resolve(mapped);
        } catch {
          resolve([]);
        }
      },
    );
  });
}

module.exports = {
  hiddenProcessNamePatterns,
  hiddenWindowTitlePatterns,
  getRunningWindowProcesses,
};
