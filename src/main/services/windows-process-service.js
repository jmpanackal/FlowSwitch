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
  /^flowswitch$/i, // Exclude FlowSwitch itself from window placement
];

const hiddenWindowTitlePatterns = [
  /^textinput/i,
  /^default ime/i,
  /^microsoft text input application/i,
  /^program manager$/i,
  /flowswitch/i, // Exclude FlowSwitch windows by title
  /^loading$/i, // Loading windows
  /splash/i, // Splash screens
  /please wait/i, // Loading indicators
  /starting up/i, // Startup windows
  /initializing/i, // Initialization windows
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
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 0 } | ForEach-Object {
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
      $dedupeKey = "$($_.Id)|$($_.MainWindowTitle)|$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
      if ($seen.Add($dedupeKey)) {
        $items += [pscustomobject]@{
          ProcessName = $_.ProcessName
          Id = $_.Id
          MainWindowTitle = $_.MainWindowTitle
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
  $enumProc = [Win32+EnumWindowsProc]{
    param([System.IntPtr]$hWnd, [System.IntPtr]$lParam)
    try {
      if ($hWnd -eq [System.IntPtr]::Zero -or $hWnd -eq $shellWindow) { return $true }
      if (-not [Win32]::IsWindowVisible($hWnd)) { return $true }
      $titleLen = [Win32]::GetWindowTextLength($hWnd)
      if ($titleLen -le 0) { return $true }
      $titleBuilder = New-Object System.Text.StringBuilder ($titleLen + 1)
      [void][Win32]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
      $title = $titleBuilder.ToString()
      if ([string]::IsNullOrWhiteSpace($title)) { return $true }

      $rect = New-Object RECT
      if (-not [Win32]::GetWindowRect($hWnd, [ref]$rect)) { return $true }
      $width = $rect.Right - $rect.Left
      $height = $rect.Bottom - $rect.Top
      if ($width -le 0 -or $height -le 0) { return $true }

      [uint32]$pid = 0
      [void][Win32]::GetWindowThreadProcessId($hWnd, [ref]$pid)
      if ($pid -le 0) { return $true }

      $proc = [System.Diagnostics.Process]::GetProcessById([int]$pid)
      if ($proc.ProcessName -ine 'explorer') { return $true }
      $processPath = $null
      try { $processPath = $proc.Path } catch { $processPath = $null }

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

      $dedupeKey = "$($proc.Id)|$title|$($rect.Left),$($rect.Top),$($rect.Right),$($rect.Bottom)"
      if ($seen.Add($dedupeKey)) {
        $items += [pscustomobject]@{
          ProcessName = $proc.ProcessName
          Id = $proc.Id
          MainWindowTitle = $title
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
