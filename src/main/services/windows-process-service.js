const { execFile } = require('child_process');

const hiddenProcessNamePatterns = [
  /^electron$/i,
  /helper$/i,
  /updater$/i,
  /webhelper$/i,
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
];

const hiddenWindowTitlePatterns = [
  /^textinput/i,
  /^default ime/i,
  /^microsoft text input application/i,
  /^program manager$/i,
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
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);
}
"@
$items = @()
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and $_.MainWindowTitle.Trim().Length -gt 0 } | ForEach-Object {
  $rect = New-Object RECT
  if ([Win32]::GetWindowRect($_.MainWindowHandle, [ref]$rect)) {
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    $isMinimized = [Win32]::IsIconic($_.MainWindowHandle)
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
        if ([Win32]::GetWindowPlacement($_.MainWindowHandle, [ref]$placement)) {
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
