const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const buildScreenshotPowerShellScript = (outputPath) => {
  const safeOutPath = String(outputPath || '').replace(/'/g, "''");
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class DpiAwareness {',
    '  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
    '  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);',
    '}',
    '"@',
    'try { [void][DpiAwareness]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}',
    'try { [void][DpiAwareness]::SetProcessDPIAware() } catch {}',
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    `$outPath = '${safeOutPath}'`,
    '$screens = [System.Windows.Forms.Screen]::AllScreens',
    "if (-not $screens -or $screens.Count -lt 1) { throw 'No displays detected.' }",
    '$minX = ($screens | ForEach-Object { $_.Bounds.Left } | Measure-Object -Minimum).Minimum',
    '$minY = ($screens | ForEach-Object { $_.Bounds.Top } | Measure-Object -Minimum).Minimum',
    '$maxRight = ($screens | ForEach-Object { $_.Bounds.Right } | Measure-Object -Maximum).Maximum',
    '$maxBottom = ($screens | ForEach-Object { $_.Bounds.Bottom } | Measure-Object -Maximum).Maximum',
    '$width = [Math]::Max(1, [int]($maxRight - $minX))',
    '$height = [Math]::Max(1, [int]($maxBottom - $minY))',
    '$bitmap = New-Object System.Drawing.Bitmap($width, $height)',
    '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
    '$graphics.Clear([System.Drawing.Color]::Black)',
    'foreach ($screen in $screens) {',
    '  $srcX = [int]$screen.Bounds.Left',
    '  $srcY = [int]$screen.Bounds.Top',
    '  $dstX = [int]($screen.Bounds.Left - $minX)',
    '  $dstY = [int]($screen.Bounds.Top - $minY)',
    '  $copySize = New-Object System.Drawing.Size([int]$screen.Bounds.Width, [int]$screen.Bounds.Height)',
    '  $graphics.CopyFromScreen($srcX, $srcY, $dstX, $dstY, $copySize)',
    '}',
    '$bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)',
    '$graphics.Dispose()',
    '$bitmap.Dispose()',
    '$screenSummary = @($screens | ForEach-Object {',
    '  [PSCustomObject]@{',
    '    left = [int]$_.Bounds.Left',
    '    top = [int]$_.Bounds.Top',
    '    width = [int]$_.Bounds.Width',
    '    height = [int]$_.Bounds.Height',
    '  }',
    '})',
    '$result = [PSCustomObject]@{',
    '  monitorCount = [int]$screens.Count',
    '  virtualBounds = [PSCustomObject]@{ left = [int]$minX; top = [int]$minY; width = [int]$width; height = [int]$height }',
    '  monitors = $screenSummary',
    '}',
    '$result | ConvertTo-Json -Depth 6',
  ].join('\n');
};

const captureAllMonitorsScreenshot = (outputPath) => (
  new Promise((resolve) => {
    const targetPath = path.resolve(String(outputPath || '').trim());
    if (!targetPath) {
      resolve({ ok: false, error: 'Missing screenshot path.' });
      return;
    }
    if (process.platform !== 'win32') {
      resolve({ ok: false, error: 'Desktop screenshot helper currently supports Windows only.' });
      return;
    }

    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    } catch (error) {
      resolve({ ok: false, error: String(error?.message || error), outputPath: targetPath });
      return;
    }

    const script = buildScreenshotPowerShellScript(targetPath);
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 20000 },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            outputPath: targetPath,
            error: String(error?.message || error),
            stderr: String(stderr || '').trim() || null,
          });
          return;
        }
        resolve({
          // Keep stdout fallback for raw troubleshooting, but parse structured metadata when present.
          ...(() => {
            try {
              const parsed = JSON.parse(String(stdout || '').trim() || '{}');
              return {
                monitorCount: Number(parsed?.monitorCount || 0),
                virtualBounds: parsed?.virtualBounds || null,
                monitors: Array.isArray(parsed?.monitors) ? parsed.monitors : [],
              };
            } catch {
              return {};
            }
          })(),
          ok: true,
          outputPath: targetPath,
          stdout: String(stdout || '').trim() || null,
        });
      },
    );
  })
);

module.exports = {
  captureAllMonitorsScreenshot,
};
