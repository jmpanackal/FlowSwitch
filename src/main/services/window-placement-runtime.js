'use strict';

const { execFile } = require('child_process');
const {
  createVerifyAndCorrectWindowPlacement,
  isRectCloseToTargetBounds,
} = require('./placement-orchestrator');

const createWindowPlacementRuntime = (deps) => {
  const {
    isChromiumFamilyProcessKey,
    isChromiumTopLevelWindowRow,
    physicalBoundsFromDip,
    getMonitorPlacementRect,
    isWindowOnTargetMonitor,
    scoreWindowCandidate,
    summarizeWindowRows,
    describeBoundsDelta,
    describeMonitor,
  } = deps;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const normalizeWindowClassName = (value) => String(value || '').trim().toLowerCase();

  const getPlacementCommandBounds = (bounds, processHintLc) => {
    if (!bounds) return bounds;
    if (String(bounds.state || '').toLowerCase() !== 'normal') return bounds;
    if (!isChromiumFamilyProcessKey(String(processHintLc || '').trim().toLowerCase())) return bounds;
    return {
      ...bounds,
      left: Number(bounds.left || 0) - 8,
      width: Math.max(120, Number(bounds.width || 0) + 16),
      height: Math.max(120, Number(bounds.height || 0) + 8),
    };
  };

  /**
   * Edge-aligned rectangles for half-screen "snap" layouts (matches side-by-side / top-bottom presets).
   * Avoids center-percent rounding so each pane uses an exact partition of the work area.
   */
  const trySnapLayoutPartitionBounds = ({
    workArea,
    widthPct,
    heightPct,
    centerXPct,
    centerYPct,
    shouldMinimize,
  }) => {
    if (shouldMinimize) return null;
    const wx = workArea.x;
    const wy = workArea.y;
    const ww = workArea.width;
    const wh = workArea.height;

    const isHalfWidth = widthPct >= 44 && widthPct <= 56;
    const isFullHeight = heightPct >= 95;
    if (isHalfWidth && isFullHeight && centerXPct !== 50) {
      const leftW = Math.floor(ww / 2);
      const rightW = ww - leftW;
      if (centerXPct < 50) {
        return {
          left: wx,
          top: wy,
          width: leftW,
          height: wh,
          state: 'normal',
        };
      }
      if (centerXPct > 50) {
        return {
          left: wx + leftW,
          top: wy,
          width: rightW,
          height: wh,
          state: 'normal',
        };
      }
    }

    // Three side-by-side columns (~33% width each): center-based math leaves gaps; partition exactly.
    const isThirdWidth = widthPct >= 27 && widthPct <= 40;
    if (isThirdWidth && isFullHeight) {
      const w0 = Math.floor(ww / 3);
      const w1 = Math.floor((ww - w0) / 2);
      const w2 = ww - w0 - w1;
      let col = 1;
      if (centerXPct < 37) col = 0;
      else if (centerXPct > 63) col = 2;
      if (col === 0) {
        return { left: wx, top: wy, width: w0, height: wh, state: 'normal' };
      }
      if (col === 1) {
        return { left: wx + w0, top: wy, width: w1, height: wh, state: 'normal' };
      }
      return { left: wx + w0 + w1, top: wy, width: w2, height: wh, state: 'normal' };
    }

    const isHalfHeight = heightPct >= 44 && heightPct <= 56;
    const isFullWidth = widthPct >= 95;
    if (isHalfHeight && isFullWidth && centerYPct !== 50) {
      const topH = Math.floor(wh / 2);
      const bottomH = wh - topH;
      if (centerYPct < 50) {
        return {
          left: wx,
          top: wy,
          width: ww,
          height: topH,
          state: 'normal',
        };
      }
      if (centerYPct > 50) {
        return {
          left: wx,
          top: wy + topH,
          width: ww,
          height: bottomH,
          state: 'normal',
        };
      }
    }

    // Quadrant layouts: half-width + half-height (4-quadrants preset).
    if (isHalfWidth && isHalfHeight) {
      const leftW = Math.floor(ww / 2);
      const rightW = ww - leftW;
      const topH = Math.floor(wh / 2);
      const bottomH = wh - topH;
      const isLeft = centerXPct < 50;
      const isTop = centerYPct < 50;
      return {
        left: isLeft ? wx : wx + leftW,
        top: isTop ? wy : wy + topH,
        width: isLeft ? leftW : rightW,
        height: isTop ? topH : bottomH,
        state: 'normal',
      };
    }

    // Three horizontal rows (~33% height each): partition exactly like 3-columns does for width.
    const isThirdHeight = heightPct >= 27 && heightPct <= 40;
    if (isFullWidth && isThirdHeight) {
      const h0 = Math.floor(wh / 3);
      const h1 = Math.floor((wh - h0) / 2);
      const h2 = wh - h0 - h1;
      let row = 1;
      if (centerYPct < 37) row = 0;
      else if (centerYPct > 63) row = 2;
      if (row === 0) return { left: wx, top: wy, width: ww, height: h0, state: 'normal' };
      if (row === 1) return { left: wx, top: wy + h0, width: ww, height: h1, state: 'normal' };
      return { left: wx, top: wy + h0 + h1, width: ww, height: h2, state: 'normal' };
    }

    // Four vertical panels (25% width each).
    const isQuarterWidth = widthPct >= 20 && widthPct <= 30;
    if (isQuarterWidth && isFullHeight) {
      const w0 = Math.floor(ww / 4);
      const w1 = Math.floor((ww - w0) / 3);
      const w2 = Math.floor((ww - w0 - w1) / 2);
      const w3 = ww - w0 - w1 - w2;
      let col = 0;
      if (centerXPct >= 20 && centerXPct < 45) col = 1;
      else if (centerXPct >= 45 && centerXPct < 70) col = 2;
      else if (centerXPct >= 70) col = 3;
      const widths = [w0, w1, w2, w3];
      let x = wx;
      for (let i = 0; i < col; i++) x += widths[i];
      return { left: x, top: wy, width: widths[col], height: wh, state: 'normal' };
    }

    return null;
  };

  const applySnapZoneOverlapCompensation = ({
    bounds,
    workArea,
    monitor,
    widthPct = 100,
    heightPct = 100,
    processHintLc = '',
  }) => {
    if (!bounds || !workArea) return bounds;
    const dipWidth = Math.max(1, Number(workArea.width || 1));
    const dipHeight = Math.max(1, Number(workArea.height || 1));
    const physicalWidth = Math.max(1, Number(monitor?.workAreaPhysical?.width || dipWidth));
    const physicalHeight = Math.max(1, Number(monitor?.workAreaPhysical?.height || dipHeight));
    const scaleFactorX = physicalWidth / dipWidth;
    const scaleFactorY = physicalHeight / dipHeight;
    // Keep snap partitions geometry-first and avoid pre-inflating tiles.
    // Final correction is handled by placement verification and post-settle audit.
    const targetOverlapPxX = 0;
    const targetOverlapPxY = 0;
    const overlapDipX = clamp(Math.round(targetOverlapPxX / Math.max(0.8, scaleFactorX)), 0, 8);
    const overlapDipY = clamp(Math.round(targetOverlapPxY / Math.max(0.8, scaleFactorY)), 0, 6);

    const workLeft = Number(workArea.x || 0);
    const workTop = Number(workArea.y || 0);
    const workRight = workLeft + Math.max(0, Number(workArea.width || 0));
    const workBottom = workTop + Math.max(0, Number(workArea.height || 0));
    const zoneLeft = Number(bounds.left || 0);
    const zoneTop = Number(bounds.top || 0);
    const zoneRight = zoneLeft + Math.max(0, Number(bounds.width || 0));
    const zoneBottom = zoneTop + Math.max(0, Number(bounds.height || 0));
    const tol = 1;

    // Expand only on internal edges to avoid pushing tiles off monitor outer bounds.
    const leftExpand = Math.abs(zoneLeft - workLeft) <= tol ? 0 : overlapDipX;
    const topExpand = Math.abs(zoneTop - workTop) <= tol ? 0 : overlapDipY;
    const rightExpand = Math.abs(zoneRight - workRight) <= tol ? 0 : overlapDipX;
    const bottomExpand = Math.abs(zoneBottom - workBottom) <= tol ? 0 : overlapDipY;

    const left = zoneLeft - leftExpand;
    const top = zoneTop - topExpand;
    const width = Number(bounds.width || 0) + leftExpand + rightExpand;
    const height = Number(bounds.height || 0) + topExpand + bottomExpand;

    return {
      ...bounds,
      left,
      top,
      width,
      height,
    };
  };

  const buildWindowBoundsForApp = (app, monitor, launchState, options = {}) => {
    const diagnostics = options?.diagnostics || null;
    const diagnosticsContext = options?.diagnosticsContext || {};
    const processHintLc = String(options?.processHintLc || '').trim().toLowerCase();
    const workArea = monitor?.workArea || monitor?.bounds;
    if (!workArea) return null;

    const hasExplicitSize = (
      Number.isFinite(Number(app?.size?.width))
      && Number.isFinite(Number(app?.size?.height))
    );
    const hasExplicitPosition = (
      Number.isFinite(Number(app?.position?.x))
      && Number.isFinite(Number(app?.position?.y))
    );
    const hasSourceGeometry = (
      Number.isFinite(Number(app?.sourceSize?.width))
      && Number.isFinite(Number(app?.sourceSize?.height))
      && Number.isFinite(Number(app?.sourcePosition?.x))
      && Number.isFinite(Number(app?.sourcePosition?.y))
    );

    const appSize = app?.size || {};
    const appPosition = app?.position || app?.sourcePosition || {};
    const widthPct = clamp(Number(appSize.width || 70), 5, 100);
    const heightPct = clamp(Number(appSize.height || 70), 5, 100);
    const centerXPct = clamp(Number(appPosition.x || 50), 0, 100);
    const centerYPct = clamp(Number(appPosition.y || 50), 0, 100);
    const shouldMinimize = (
      launchState === 'minimized'
      || app?.launchBehavior === 'minimize'
      || app?._launchFromMinimizedTray === true
    );
    // Minimize intent wins over maximize/profile defaults.
    const shouldForceFullscreen = !shouldMinimize
      && (launchState === 'maximized' || app?.launchBehavior === 'maximize');
    const looksFullscreenByGeometry = widthPct >= 95 && heightPct >= 95;
    const minimizedWithoutSavedGeometry = (
      shouldMinimize
      && !hasSourceGeometry
      && !(hasExplicitSize && hasExplicitPosition)
    );

    const finalizeBounds = (b) => physicalBoundsFromDip(b, diagnostics, diagnosticsContext);

    if (shouldForceFullscreen || looksFullscreenByGeometry || minimizedWithoutSavedGeometry) {
      return finalizeBounds({
        left: workArea.x,
        top: workArea.y,
        width: workArea.width,
        height: workArea.height,
        state: shouldMinimize ? 'minimized' : 'maximized',
      });
    }

    const snapBounds = trySnapLayoutPartitionBounds({
      workArea,
      widthPct,
      heightPct,
      centerXPct,
      centerYPct,
      shouldMinimize,
    });
    if (snapBounds) {
      const compensatedSnapBounds = applySnapZoneOverlapCompensation({
        bounds: snapBounds,
        workArea,
        monitor,
        widthPct,
        heightPct,
        processHintLc,
      });
      return finalizeBounds(compensatedSnapBounds);
    }

    // Convert from center/size percentages into edge percentages first, then round edges to pixels.
    // This keeps shared boundaries (and monitor edges) aligned without 1px gaps between snapped apps.
    const leftPct = clamp(centerXPct - (widthPct / 2), 0, 100);
    const topPct = clamp(centerYPct - (heightPct / 2), 0, 100);
    const rightPct = clamp(centerXPct + (widthPct / 2), 0, 100);
    const bottomPct = clamp(centerYPct + (heightPct / 2), 0, 100);

    const leftEdge = Math.round(workArea.x + ((leftPct / 100) * workArea.width));
    const topEdge = Math.round(workArea.y + ((topPct / 100) * workArea.height));
    const rightEdge = Math.round(workArea.x + ((rightPct / 100) * workArea.width));
    const bottomEdge = Math.round(workArea.y + ((bottomPct / 100) * workArea.height));

    const width = clamp(rightEdge - leftEdge, 120, workArea.width);
    const height = clamp(bottomEdge - topEdge, 120, workArea.height);

    const boundedLeft = clamp(leftEdge, workArea.x, workArea.x + Math.max(0, workArea.width - width));
    const boundedTop = clamp(topEdge, workArea.y, workArea.y + Math.max(0, workArea.height - height));

    return finalizeBounds({
      left: boundedLeft,
      top: boundedTop,
      width,
      height,
      state: shouldMinimize ? 'minimized' : 'normal',
    });
  };

  const moveWindowToBounds = ({
    pid,
    bounds,
    processNameHint,
    aggressiveMaximize = false,
    positionOnlyBeforeMaximize = false,
    preferNameEnumeration = false,
    excludedWindowHandles = [],
    skipFrameChanged = false,
    allowForegroundFallback = false,
    frameCompensationMode = 'auto',
    diagnostics = null,
    diagnosticsContext = {},
  }) => (
    new Promise((resolve) => {
      const safePid = Number(pid || 0);
      const safeProcessNameHint = String(processNameHint || '')
        .trim()
        .toLowerCase()
        .replace(/\.exe$/i, '');
      if (!bounds || (!Number.isFinite(safePid) && !safeProcessNameHint)) {
        resolve({ applied: false, handle: null });
        return;
      }

      const commandBounds = frameCompensationMode === 'none'
        ? bounds
        : getPlacementCommandBounds(bounds, safeProcessNameHint);
      const left = Number(commandBounds.left || 0);
      const top = Number(commandBounds.top || 0);
      const width = Math.max(120, Number(commandBounds.width || 800));
      const height = Math.max(120, Number(commandBounds.height || 600));
      const minCandidateWidth = 320;
      const minCandidateHeight = 220;
      const forceMaximize = commandBounds.state === 'maximized';
      // SWP_FRAMECHANGED (0x0020) can confuse Chromium's compositor during early resize; optional skip.
      const basePosFlags = 0x0044;
      const setPosFlags = positionOnlyBeforeMaximize
        ? 0x0045
        : (skipFrameChanged ? basePosFlags : (basePosFlags | 0x0020));
      const windowState = commandBounds.state === 'maximized'
        ? 3 // SW_MAXIMIZE
        : commandBounds.state === 'minimized'
          ? 6 // SW_MINIMIZE
          : 5; // SW_SHOW

      const excludedCsv = (Array.isArray(excludedWindowHandles) ? excludedWindowHandles : [])
        .map((h) => String(h || '').trim())
        .filter(Boolean)
        .join(',');

      const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Collections.Generic;
  using System.Runtime.InteropServices;
  using System.Text;

  public static class Win32 {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll", EntryPoint="GetWindowLong")] public static extern int GetWindowLong32(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtr")] public static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);
    public static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
      return IntPtr.Size == 8
        ? GetWindowLongPtr64(hWnd, nIndex)
        : new IntPtr(GetWindowLong32(hWnd, nIndex));
    }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    public static bool IsPlacementCandidate(IntPtr hWnd, int minWidth, int minHeight, HashSet<string> excluded) {
      if (hWnd == IntPtr.Zero) return false;
      if (!IsWindowVisible(hWnd)) return false;
      RECT rect;
      if (!GetWindowRect(hWnd, out rect)) return false;
      int width = rect.Right - rect.Left;
      int height = rect.Bottom - rect.Top;
      if (width < minWidth || height < minHeight) return false;
      long exStyle = GetWindowLongPtr(hWnd, -20).ToInt64();
      bool isToolWindow = (exStyle & 0x00000080L) != 0; // WS_EX_TOOLWINDOW
      if (isToolWindow) return false;
      string hs = ((long)hWnd).ToString();
      if (excluded != null && excluded.Contains(hs)) return false;
      return true;
    }

    public static List<IntPtr> FindVisibleWindowsForPids(HashSet<uint> pids, HashSet<string> excluded) {
      var found = new List<IntPtr>();
      EnumWindows((hWnd, lp) => {
        uint wPid;
        GetWindowThreadProcessId(hWnd, out wPid);
        if (!pids.Contains(wPid)) return true;
        if (!IsPlacementCandidate(hWnd, ${minCandidateWidth}, ${minCandidateHeight}, excluded)) return true;
        found.Add(hWnd);
        return true;
      }, IntPtr.Zero);
      return found;
    }
  }
  "@
  try { [void][Win32]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
  try { [void][Win32]::SetProcessDPIAware() } catch {}
  $excludedSet = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($tok in ("${excludedCsv.replace(/"/g, '`"')}" -split ',')) {
    $t = $tok.Trim()
    if ($t.Length -gt 0) { [void]$excludedSet.Add($t) }
  }

  function Apply-Placement {
    param([IntPtr]$Handle)
    if ($Handle -eq [IntPtr]::Zero) { return $false }
    if (${windowState} -eq 5 -or ${windowState} -eq 3) {
      # If the app restores as maximized/fullscreen on a previous monitor, drop to normal first
      # before attempting cross-monitor placement.
      [void][Win32]::ShowWindowAsync($Handle, 9) # SW_RESTORE
      Start-Sleep -Milliseconds 70
    }
    [void][Win32]::SetWindowPos($Handle, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, ${setPosFlags})
    [void][Win32]::ShowWindowAsync($Handle, ${windowState})
    if (${windowState} -eq 3) {
      # Re-anchor once more: some apps relaunch fullscreen on an old monitor, then ignore
      # the first move while maximized. A second restore->move->maximize pass stabilizes
      # placement on the target monitor and avoids ghost/off-screen compositor surfaces.
      Start-Sleep -Milliseconds 95
      [void][Win32]::ShowWindowAsync($Handle, 9)
      Start-Sleep -Milliseconds 85
      [void][Win32]::SetWindowPos($Handle, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, ${setPosFlags})
      Start-Sleep -Milliseconds 65
      [void][Win32]::ShowWindowAsync($Handle, 3)
    }
    if (${(forceMaximize && aggressiveMaximize) ? '$true' : '$false'}) {
      # Re-assert maximize a few times because Chromium can recreate/restore windows right after launch.
      [void][Win32]::SetWindowPos($Handle, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, 0x0044)
      for ($mx = 0; $mx -lt 3; $mx++) {
        Start-Sleep -Milliseconds 80
        [void][Win32]::ShowWindowAsync($Handle, 9)
        Start-Sleep -Milliseconds 80
        [void][Win32]::ShowWindowAsync($Handle, 3)
      }
    }
    return $true
  }

  $applied = $false
  $appliedHandle = ""
  $maxAttempts = ${preferNameEnumeration ? 28 : 16}
  $sleepMs = ${preferNameEnumeration ? 100 : 90}
  for ($attempt = 0; $attempt -lt $maxAttempts; $attempt++) {
    $candidates = New-Object 'System.Collections.Generic.List[IntPtr]'

    # Strategy 1: PID tree (MainWindowHandle only — fast path for non-Chromium)
    if (${preferNameEnumeration ? '$false' : '$true'} -and ${safePid} -gt 0) {
      $treePids = New-Object 'System.Collections.Generic.HashSet[int]'
      [void]$treePids.Add(${Math.floor(safePid)})
      for ($d = 0; $d -lt 3; $d++) {
        $snap = @($treePids)
        foreach ($pp in $snap) {
          try {
            $children = Get-CimInstance Win32_Process -Filter ("ParentProcessId = " + $pp) -ErrorAction SilentlyContinue
            foreach ($c in $children) { try { [void]$treePids.Add([int]$c.ProcessId) } catch {} }
          } catch {}
        }
      }
      foreach ($tp in $treePids) {
        try {
          $p = Get-Process -Id $tp -ErrorAction SilentlyContinue
          if ($p -and $p.MainWindowHandle -ne 0) {
            $hs = [string]([int64]$p.MainWindowHandle)
            $hPtr = [IntPtr]::new([int64]$p.MainWindowHandle)
            if ([Win32]::IsPlacementCandidate($hPtr, ${minCandidateWidth}, ${minCandidateHeight}, $excludedSet)) {
              [void]$candidates.Add([IntPtr]::new([int64]$p.MainWindowHandle))
            }
          }
        } catch {}
      }
    }

    # Strategy 2: EnumWindows — compiled C# callback finds ALL visible windows, not just MainWindowHandle
    if ($candidates.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace("${safeProcessNameHint.replace(/"/g, '`"')}")) {
      $pids = New-Object 'System.Collections.Generic.HashSet[uint32]'
      try {
        $procs = Get-Process -Name "${safeProcessNameHint.replace(/"/g, '`"')}" -ErrorAction SilentlyContinue
        foreach ($p in $procs) { [void]$pids.Add([uint32]$p.Id) }
      } catch {}
      if ($pids.Count -gt 0) {
        $enumResults = [Win32]::FindVisibleWindowsForPids($pids, $excludedSet)
        foreach ($eh in $enumResults) { [void]$candidates.Add($eh) }
      }
    }

    # Strategy 3: foreground window fallback (disabled by default for deterministic placement)
    if (${allowForegroundFallback ? '$true' : '$false'} -and $candidates.Count -eq 0) {
      try {
        $fg = [Win32]::GetForegroundWindow()
        if ($fg -ne [IntPtr]::Zero) {
          $fgStr = [string]([int64]$fg)
          if (-not $excludedSet.Contains($fgStr)) {
            [void]$candidates.Add($fg)
          }
        }
      } catch {}
    }

    foreach ($candidate in $candidates) {
      if ($candidate -eq [IntPtr]::Zero) { continue }
      if (Apply-Placement -Handle $candidate) {
        $applied = $true
        $appliedHandle = [string]([int64]$candidate)
        break
      }
    }

    if ($applied) { break }
    Start-Sleep -Milliseconds $sleepMs
  }
  if (-not $applied) {
    Write-Output "no-window|"
    exit 0
  }
  Write-Output "ok|$appliedHandle"`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 256 },
        (execError, stdout) => {
          const output = String(stdout || '').trim();
          const [status, handle] = output.split('|');
          const applied = (status || '').toLowerCase() === 'ok';
          if (!applied && diagnostics) {
            diagnostics.failure({
              ...diagnosticsContext,
              strategy: 'move-window-to-bounds',
              reason: 'powershell-placement-not-applied',
              processNameHint: safeProcessNameHint || null,
              pid: Number.isFinite(safePid) ? safePid : null,
              status: status || null,
              handle: handle || null,
              outputSnippet: output ? output.slice(0, 200) : null,
              error: execError ? String(execError.message || execError) : null,
            });
          }
          resolve({
            applied,
            handle: handle || null,
            status: status || null,
            outputSnippet: output ? output.slice(0, 200) : null,
            error: execError ? String(execError.message || execError) : null,
          });
        },
      );
    })
  );

  const moveSpecificWindowHandleToBounds = ({
    handle,
    bounds,
    processHintLc = '',
    aggressiveMaximize = false,
    positionOnlyBeforeMaximize = false,
    skipFrameChanged = false,
    frameCompensationMode = 'auto',
    diagnostics = null,
    diagnosticsContext = {},
  }) => (
    new Promise((resolve) => {
      const safeHandle = String(handle || '').trim();
      if (!safeHandle || !bounds) {
        resolve({ applied: false, handle: null });
        return;
      }

      const processKey = String(processHintLc || diagnosticsContext?.processHintLc || '').trim().toLowerCase();
      const commandBounds = frameCompensationMode === 'none'
        ? bounds
        : getPlacementCommandBounds(bounds, processKey);
      const left = Number(commandBounds.left || 0);
      const top = Number(commandBounds.top || 0);
      const width = Math.max(120, Number(commandBounds.width || 800));
      const height = Math.max(120, Number(commandBounds.height || 600));
      const basePosFlags = 0x0044;
      const setPosFlags = positionOnlyBeforeMaximize
        ? 0x0045
        : (skipFrameChanged ? basePosFlags : (basePosFlags | 0x0020));
      const windowState = commandBounds.state === 'maximized'
        ? 3 // SW_MAXIMIZE
        : commandBounds.state === 'minimized'
          ? 6 // SW_MINIMIZE
          : 5; // SW_SHOW

      const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public static class Win32 {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
  }
  "@
  try { [void][Win32]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
  try { [void][Win32]::SetProcessDPIAware() } catch {}
  $h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
  if ($h -eq [IntPtr]::Zero) { Write-Output "no-window|"; exit 0 }
  if (${windowState} -eq 5 -or ${windowState} -eq 3) {
    # Prevent persisted maximized/fullscreen state from overriding explicit move bounds.
    [void][Win32]::ShowWindowAsync($h, 9) # SW_RESTORE
    Start-Sleep -Milliseconds 70
  }
  [void][Win32]::SetWindowPos($h, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, ${setPosFlags})
  [void][Win32]::ShowWindowAsync($h, ${windowState})
  if (${windowState} -eq 3) {
    # Re-anchor maximized windows once more for apps that respawn fullscreen on the previous
    # monitor and ignore the first cross-monitor move while maximized.
    Start-Sleep -Milliseconds 95
    [void][Win32]::ShowWindowAsync($h, 9)
    Start-Sleep -Milliseconds 85
    [void][Win32]::SetWindowPos($h, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, ${setPosFlags})
    Start-Sleep -Milliseconds 65
    [void][Win32]::ShowWindowAsync($h, 3)
  }
  if (${(commandBounds.state === 'maximized' && aggressiveMaximize) ? '$true' : '$false'}) {
    [void][Win32]::SetWindowPos($h, [IntPtr]::Zero, ${Math.floor(left)}, ${Math.floor(top)}, ${Math.floor(width)}, ${Math.floor(height)}, 0x0044)
    for ($mx = 0; $mx -lt 3; $mx++) {
      Start-Sleep -Milliseconds 80
      [void][Win32]::ShowWindowAsync($h, 9)
      Start-Sleep -Milliseconds 80
      [void][Win32]::ShowWindowAsync($h, 3)
    }
  }
  Write-Output "ok|${safeHandle.replace(/"/g, '`"')}"`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 6000, maxBuffer: 1024 * 128 },
        (execError, stdout) => {
          const output = String(stdout || '').trim();
          const [status, outHandle] = output.split('|');
          const applied = (status || '').toLowerCase() === 'ok';
          if (!applied && diagnostics) {
            diagnostics.failure({
              ...diagnosticsContext,
              strategy: 'move-specific-window-handle',
              reason: 'powershell-placement-not-applied',
              handle: safeHandle,
              status: status || null,
              outputSnippet: output ? output.slice(0, 200) : null,
              error: execError ? String(execError.message || execError) : null,
            });
          }
          resolve({
            applied,
            handle: outHandle || null,
            status: status || null,
            outputSnippet: output ? output.slice(0, 200) : null,
            error: execError ? String(execError.message || execError) : null,
          });
        },
      );
    })
  );

  const maximizeWindowHandle = (handle) => (
    new Promise((resolve) => {
      const safeHandle = String(handle || '').trim();
      if (!safeHandle) {
        resolve(false);
        return;
      }

      const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public static class Win32 {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
  }
  "@
  $h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
  if ($h -eq [IntPtr]::Zero) { Write-Output "no"; exit 0 }
  [void][Win32]::ShowWindowAsync($h, 9) # SW_RESTORE
  Start-Sleep -Milliseconds 90
  [void][Win32]::ShowWindowAsync($h, 3) # SW_MAXIMIZE
  Write-Output "ok"`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 3000, maxBuffer: 1024 * 64 },
        (_error, stdout) => {
          resolve(String(stdout || '').toLowerCase().includes('ok'));
        },
      );
    })
  );

  const bringWindowHandleToFront = async (handle, options = {}) => {
    const safeHandle = String(handle || '').trim();
    if (!safeHandle || process.platform !== 'win32') return false;
    const diagnostics = options?.diagnostics || null;
    const diagnosticsContext = options?.diagnosticsContext || {};
    const maxAttempts = Math.max(1, Number(options?.maxAttempts || 3));

    const nudgeToFront = (mode = 'aggressive') => (
      new Promise((resolve) => {
        const showThenFocus = mode === 'show-then-focus';
        const aggressive = mode === 'aggressive';
        const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public static class Win32 {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  }
  "@
  $h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
  if ($h -eq [IntPtr]::Zero) { Write-Output "no"; exit 0 }
  if ([Win32]::IsIconic($h)) {
    [void][Win32]::ShowWindowAsync($h, 9) # SW_RESTORE
    Start-Sleep -Milliseconds 60
  }
  [void][Win32]::SetForegroundWindow($h)
  if (${showThenFocus ? '$true' : '$false'}) {
    [void][Win32]::ShowWindowAsync($h, 5) # SW_SHOW
    Start-Sleep -Milliseconds 30
    [void][Win32]::SetForegroundWindow($h)
  }
  if (${aggressive ? '$true' : '$false'}) {
    [void][Win32]::ShowWindowAsync($h, 5) # SW_SHOW
    [void][Win32]::BringWindowToTop($h)
    [void][Win32]::SetWindowPos($h, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0003) # TOPMOST, no move/size
    Start-Sleep -Milliseconds 35
    [void][Win32]::SetWindowPos($h, [IntPtr]::new(-2), 0, 0, 0, 0, 0x0003) # NOTOPMOST
    [void][Win32]::SetForegroundWindow($h)
  }
  Write-Output "ok"`;

        execFile(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
          { windowsHide: true, timeout: 3500, maxBuffer: 1024 * 64 },
          () => resolve(),
        );
      })
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const mode = attempt === 1
        ? 'focus-only'
        : attempt === 2
          ? 'show-then-focus'
          : 'aggressive';
      await nudgeToFront(mode);
      await sleep(120);
      const foregroundHandle = await getForegroundWindowHandle();
      if (foregroundHandle === safeHandle) {
        if (diagnostics) {
          diagnostics.result({
            ...diagnosticsContext,
            strategy: 'reuse-existing-foreground',
            reason: 'foreground-applied',
            handle: safeHandle,
            attempts: attempt,
            mode,
          });
        }
        return true;
      }
    }

    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        strategy: 'reuse-existing-foreground',
        reason: 'foreground-not-applied',
        handle: safeHandle,
        attempts: maxAttempts,
      });
    }
    return false;
  };

  const minimizeWindowHandle = (handle) => (
    new Promise((resolve) => {
      const safeHandle = String(handle || '').trim();
      if (!safeHandle) {
        resolve(false);
        return;
      }

      const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public static class Win32 {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int cmd);
  }
  "@
  $h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
  if ($h -eq [IntPtr]::Zero) { Write-Output "no"; exit 0 }
  [void][Win32]::ShowWindowAsync($h, 6) # SW_MINIMIZE
  Start-Sleep -Milliseconds 70
  [void][Win32]::ShowWindowAsync($h, 6) # Re-assert for apps that restore immediately
  Write-Output "ok"`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 3000, maxBuffer: 1024 * 64 },
        (_error, stdout) => {
          resolve(String(stdout || '').toLowerCase().includes('ok'));
        },
      );
    })
  );

  const ensureMinimizedAfterLaunch = async ({
    handle,
    bounds,
    processNameHint,
    pid = 0,
  }) => {
    if (!bounds || bounds.state !== 'minimized') return false;

    let minimized = false;
    const retryScheduleMs = [120, 260, 480, 760, 1100, 1500, 2100];
    for (const delayMs of retryScheduleMs) {
      await sleep(delayMs);
      if (handle) {
        const byHandle = await minimizeWindowHandle(handle);
        minimized = minimized || byHandle;
      }

      // Slow launchers may create the real top-level HWND after splash windows.
      const byName = await moveWindowToBounds({
        pid,
        bounds,
        processNameHint,
        aggressiveMaximize: false,
        positionOnlyBeforeMaximize: false,
        preferNameEnumeration: true,
        excludedWindowHandles: [],
        skipFrameChanged: true,
      });
      minimized = minimized || Boolean(byName?.applied);
      if (minimized) break;
    }

    return minimized;
  };

  const stabilizePlacementForSlowLaunch = async ({
    processHintLc,
    bounds,
    monitor,
    initialHandle = null,
    excludedWindowHandles = [],
    aggressiveMaximize = false,
    positionOnlyBeforeMaximize = false,
    skipFrameChanged = false,
    durationMs = 3200,
    diagnostics = null,
    diagnosticsContext = {},
  }) => {
    const isMeaningfulRectForBounds = (rect, targetBounds) => {
      if (!rect || !targetBounds) return false;
      const rectWidth = Number(rect.width || 0);
      const rectHeight = Number(rect.height || 0);
      const targetWidth = Math.max(1, Number(targetBounds.width || 0));
      const targetHeight = Math.max(1, Number(targetBounds.height || 0));
      const areaRatio = (rectWidth * rectHeight) / (targetWidth * targetHeight);
      const widthRatio = rectWidth / targetWidth;
      const heightRatio = rectHeight / targetHeight;
      return (
        areaRatio >= 0.38
        && widthRatio >= 0.55
        && heightRatio >= 0.45
        && (widthRatio >= 0.72 || heightRatio >= 0.72)
      );
    };

    const safeProcess = String(processHintLc || '').trim().toLowerCase();
    if (!safeProcess || !bounds) {
      return { verified: false, handle: initialHandle ? String(initialHandle) : null };
    }

    const excluded = new Set(
      (Array.isArray(excludedWindowHandles) ? excludedWindowHandles : [])
        .map((h) => String(h || '').trim())
        .filter(Boolean),
    );
    const forcedHandle = initialHandle ? String(initialHandle) : null;
    const deadline = Date.now() + Math.max(1200, Number(durationMs || 0));
    let lastHandle = forcedHandle;
    let lastCandidates = [];
    let verifiedHandle = null;
    let verifiedHandleStableCount = 0;

    while (Date.now() <= deadline) {
      const rows = await getVisibleWindowInfos(safeProcess, {
        diagnostics,
        diagnosticsContext,
      });
      const candidates = rows
        .filter((row) => row?.handle)
        .filter((row) => !row?.isMinimized)
        .filter((row) => (bounds.state !== 'maximized' ? true : (!row?.hasOwner && !row?.topMost)))
        .filter((row) => row.handle === forcedHandle || !excluded.has(row.handle))
        .filter((row) => {
          if (bounds.state !== 'maximized') return true;
          return isMeaningfulRectForBounds(
            {
              width: Number(row?.width || 0),
              height: Number(row?.height || 0),
            },
            bounds,
          );
        })
        .sort((a, b) => (
          scoreWindowCandidate(b, { chromiumProcessHint: safeProcess })
          - scoreWindowCandidate(a, { chromiumProcessHint: safeProcess })
        ));
      lastCandidates = candidates;

      if (bounds.state === 'minimized') {
        // Re-apply minimize against all likely top-level windows in case splash->main handle changes.
        for (const row of candidates.slice(0, 8)) {
          lastHandle = row.handle || lastHandle;
          await moveSpecificWindowHandleToBounds({
            handle: row.handle,
            bounds,
            aggressiveMaximize: false,
            positionOnlyBeforeMaximize: false,
            skipFrameChanged: true,
            diagnostics,
            diagnosticsContext: {
              ...diagnosticsContext,
              strategy: 'stabilize-minimized',
              candidateHandle: row.handle,
            },
          });
        }
        if (lastHandle) {
          await minimizeWindowHandle(lastHandle);
        }
        if (candidates.length > 0) {
          return { verified: true, handle: lastHandle };
        }
        await sleep(220);
        continue;
      }

      if (bounds.state === 'normal' && monitor) {
        for (const row of candidates.slice(0, 6)) {
          lastHandle = row.handle || lastHandle;
          const placementRects = await getWindowPlacementRectsByHandle(row.handle);
          const measuredRect = placementRects?.visibleRect || placementRects?.outerRect || null;
          const onTarget = isWindowOnTargetMonitor({ rect: measuredRect, monitor, bounds });
          const close = isRectCloseToTargetBounds(measuredRect, bounds, 8);
          if (onTarget && close) {
            if (verifiedHandle === row.handle) {
              verifiedHandleStableCount += 1;
            } else {
              verifiedHandle = row.handle;
              verifiedHandleStableCount = 1;
            }
            if (verifiedHandleStableCount >= 2) {
              return { verified: true, handle: row.handle };
            }
            // Already on-target and close for this poll; avoid corrective move thrash while
            // waiting for the second stable confirmation poll.
            continue;
          } else if (verifiedHandle === row.handle) {
            verifiedHandle = null;
            verifiedHandleStableCount = 0;
          }

          await moveSpecificWindowHandleToBounds({
            handle: row.handle,
            bounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged,
            diagnostics,
            diagnosticsContext: {
              ...diagnosticsContext,
              strategy: 'stabilize-normal',
              candidateHandle: row.handle,
            },
          });
        }
      }

      if (bounds.state === 'maximized' && monitor) {
        for (const row of candidates.slice(0, 6)) {
          lastHandle = row.handle || lastHandle;
          const placementRects = await getWindowPlacementRectsByHandle(row.handle);
          const rect = placementRects?.visibleRect || placementRects?.outerRect || await getWindowRectByHandle(row.handle);
          const onTarget = isWindowOnTargetMonitor({ rect, monitor, bounds });
          const meaningful = isMeaningfulRectForBounds(rect, bounds);
          if (onTarget && meaningful) {
            if (verifiedHandle === row.handle) {
              verifiedHandleStableCount += 1;
            } else {
              verifiedHandle = row.handle;
              verifiedHandleStableCount = 1;
            }
            if (verifiedHandleStableCount >= 2) {
              return { verified: true, handle: row.handle };
            }
            // Already maximized-like and on target for this poll; do not reapply placement while
            // waiting for second consecutive stable confirmation.
            continue;
          }
          if (onTarget && !meaningful && diagnostics) {
            diagnostics.decision({
              ...diagnosticsContext,
              strategy: 'stabilize-maximized',
              reason: 'candidate-rejected-underfilled-bounds',
              candidateHandle: row.handle,
              measuredRect: rect,
            });
          }
          if ((!onTarget || !meaningful) && verifiedHandle === row.handle) {
            verifiedHandle = null;
            verifiedHandleStableCount = 0;
          }

          await moveSpecificWindowHandleToBounds({
            handle: row.handle,
            bounds,
            aggressiveMaximize,
            positionOnlyBeforeMaximize,
            skipFrameChanged,
            diagnostics,
            diagnosticsContext: {
              ...diagnosticsContext,
              strategy: 'stabilize-maximized',
              candidateHandle: row.handle,
            },
          });
        }
      }

      await sleep(220);
    }
    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        strategy: 'stabilize-placement',
        reason: 'stabilization-timeout',
        lastHandle,
        candidateCount: lastCandidates.length,
        candidateSample: summarizeWindowRows(lastCandidates, 3),
      });
    }
    return { verified: false, handle: lastHandle };
  };

  const stabilizeKnownHandlePlacement = async ({
    handle,
    bounds,
    monitor,
    aggressiveMaximize = false,
    positionOnlyBeforeMaximize = false,
    skipFrameChanged = false,
    durationMs = 1800,
    diagnostics = null,
    diagnosticsContext = {},
  }) => {
    const safeHandle = String(handle || '').trim();
    const processHintLc = String(diagnosticsContext?.processHintLc || '').trim().toLowerCase();
    if (!safeHandle || !bounds || !monitor) {
      return { verified: false, corrected: false, handle: safeHandle || null };
    }

    const deadline = Date.now() + Math.max(800, Number(durationMs || 0));
    let corrected = false;
    let lastRect = null;
    let previousMeasuredRect = null;
    let stagnantMeasurementCount = 0;
    let stoppedForStagnation = false;

    while (Date.now() <= deadline) {
      const placementRects = await getWindowPlacementRectsByHandle(safeHandle);
      const measuredRect = placementRects?.visibleRect || placementRects?.outerRect || null;
      if (measuredRect) {
        lastRect = measuredRect;
        const onTarget = isWindowOnTargetMonitor({ rect: measuredRect, monitor, bounds });
        const closeEnough = bounds.state === 'normal'
          ? isRectCloseToTargetBounds(measuredRect, bounds, 8)
          : true;
        if (onTarget && closeEnough) {
          return { verified: true, corrected, handle: safeHandle };
        }

        if (previousMeasuredRect) {
          const stagnant = (
            Math.abs(Number(previousMeasuredRect.left || 0) - Number(measuredRect.left || 0)) <= 2
            && Math.abs(Number(previousMeasuredRect.top || 0) - Number(measuredRect.top || 0)) <= 2
            && Math.abs(Number(previousMeasuredRect.width || 0) - Number(measuredRect.width || 0)) <= 2
            && Math.abs(Number(previousMeasuredRect.height || 0) - Number(measuredRect.height || 0)) <= 2
          );
          stagnantMeasurementCount = stagnant ? (stagnantMeasurementCount + 1) : 0;
          if (stagnantMeasurementCount >= 1) {
            stoppedForStagnation = true;
            break;
          }
        }
        previousMeasuredRect = { ...measuredRect };
      }

      await moveSpecificWindowHandleToBounds({
        handle: safeHandle,
        bounds,
        aggressiveMaximize,
        positionOnlyBeforeMaximize,
        skipFrameChanged,
        diagnostics,
        diagnosticsContext: {
          ...diagnosticsContext,
          strategy: 'known-handle-stabilization',
          candidateHandle: safeHandle,
        },
      });
      corrected = true;
      await sleep(180);
    }

    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        strategy: 'known-handle-stabilization',
        reason: stoppedForStagnation
          ? 'known-handle-stabilization-stagnant'
          : 'known-handle-stabilization-timeout',
        handle: safeHandle,
        corrected,
        lastRect,
      });
    }

    return { verified: false, corrected, handle: safeHandle };
  };

  const getWindowRectByHandle = (handle) => (
    new Promise((resolve) => {
      const safeHandle = String(handle || '').trim();
      if (!safeHandle) {
        resolve(null);
        return;
      }

      const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public static class Win32Rect {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  }
  "@
  try { [void][Win32Rect]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
  try { [void][Win32Rect]::SetProcessDPIAware() } catch {}
  $h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
  if ($h -eq [IntPtr]::Zero) { Write-Output "{}"; exit 0 }
  $r = New-Object Win32Rect+RECT
  $ok = [Win32Rect]::GetWindowRect($h, [ref]$r)
  if (-not $ok) { Write-Output "{}"; exit 0 }
  @{
    left = [int]$r.Left
    top = [int]$r.Top
    width = [int]($r.Right - $r.Left)
    height = [int]($r.Bottom - $r.Top)
  } | ConvertTo-Json -Depth 2`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 4000, maxBuffer: 1024 * 128 },
        (_error, stdout) => {
          try {
            const parsed = JSON.parse(String(stdout || '').trim() || '{}');
            if (
              Number.isFinite(Number(parsed?.left))
              && Number.isFinite(Number(parsed?.top))
              && Number.isFinite(Number(parsed?.width))
              && Number.isFinite(Number(parsed?.height))
            ) {
              resolve({
                left: Number(parsed.left),
                top: Number(parsed.top),
                width: Number(parsed.width),
                height: Number(parsed.height),
              });
              return;
            }
            resolve(null);
          } catch {
            resolve(null);
          }
        },
      );
    })
  );

  const getWindowPlacementRectsByHandle = (handle) => (
    new Promise((resolve) => {
      const safeHandle = String(handle || '').trim();
      if (!safeHandle) {
        resolve({ outerRect: null, visibleRect: null });
        return;
      }

      const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public static class Win32PlacementRect {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);
  }
  "@
  try { [void][Win32PlacementRect]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
  try { [void][Win32PlacementRect]::SetProcessDPIAware() } catch {}
  $h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
  if ($h -eq [IntPtr]::Zero) { Write-Output "{}"; exit 0 }
  $outer = New-Object Win32PlacementRect+RECT
  $hasOuter = [Win32PlacementRect]::GetWindowRect($h, [ref]$outer)
  $visible = New-Object Win32PlacementRect+RECT
  $hasVisible = $false
  try {
    # DWMWA_EXTENDED_FRAME_BOUNDS = 9 (visible window frame, excludes resize border padding)
    $hr = [Win32PlacementRect]::DwmGetWindowAttribute($h, 9, [ref]$visible, [System.Runtime.InteropServices.Marshal]::SizeOf([type]([Win32PlacementRect+RECT])))
    $hasVisible = ($hr -eq 0)
  } catch {
    $hasVisible = $false
  }
  if (-not $hasOuter -and -not $hasVisible) { Write-Output "{}"; exit 0 }
  $out = @{}
  if ($hasOuter) {
    $out.outerRect = @{
      left = [int]$outer.Left
      top = [int]$outer.Top
      width = [int]($outer.Right - $outer.Left)
      height = [int]($outer.Bottom - $outer.Top)
    }
  }
  if ($hasVisible) {
    $out.visibleRect = @{
      left = [int]$visible.Left
      top = [int]$visible.Top
      width = [int]($visible.Right - $visible.Left)
      height = [int]($visible.Bottom - $visible.Top)
    }
  }
  $out | ConvertTo-Json -Depth 4`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 4500, maxBuffer: 1024 * 128 },
        (_error, stdout) => {
          try {
            const parsed = JSON.parse(String(stdout || '').trim() || '{}');
            const normalizeRect = (rect) => {
              if (!rect || typeof rect !== 'object') return null;
              if (
                !Number.isFinite(Number(rect.left))
                || !Number.isFinite(Number(rect.top))
                || !Number.isFinite(Number(rect.width))
                || !Number.isFinite(Number(rect.height))
              ) {
                return null;
              }
              return {
                left: Number(rect.left),
                top: Number(rect.top),
                width: Number(rect.width),
                height: Number(rect.height),
              };
            };
            resolve({
              outerRect: normalizeRect(parsed.outerRect),
              visibleRect: normalizeRect(parsed.visibleRect),
            });
          } catch {
            resolve({ outerRect: null, visibleRect: null });
          }
        },
      );
    })
  );

  const getWindowClassNameByHandle = (handle) => (
    new Promise((resolve) => {
      const safeHandle = String(handle || '').trim();
      if (!safeHandle || process.platform !== 'win32') {
        resolve('');
        return;
      }

      const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public static class Win32ClassName {
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  }
  "@
  $h = [IntPtr]::new([int64]"${safeHandle.replace(/"/g, '`"')}")
  if ($h -eq [IntPtr]::Zero) { Write-Output ""; exit 0 }
  $sb = New-Object System.Text.StringBuilder 256
  [void][Win32ClassName]::GetClassName($h, $sb, $sb.Capacity)
  Write-Output $sb.ToString()`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 3000, maxBuffer: 1024 * 64 },
        (_error, stdout) => {
          resolve(normalizeWindowClassName(String(stdout || '').trim()));
        },
      );
    })
  );

  const centerWindowHandleOnMonitor = async ({
    handle,
    monitor,
    processHintLc = '',
    diagnostics = null,
    diagnosticsContext = {},
  }) => {
    const target = getMonitorPlacementRect(monitor);
    const safeHandle = String(handle || '').trim();
    if (!target || !safeHandle) return { applied: false };
    const rects = await getWindowPlacementRectsByHandle(safeHandle);
    const measured = rects?.visibleRect || rects?.outerRect || null;
    const width = clamp(
      Math.round(Number(measured?.width || (Number(target.width || 0) * 0.46))),
      320,
      Math.max(320, Math.round(Number(target.width || 0) * 0.95)),
    );
    const height = clamp(
      Math.round(Number(measured?.height || (Number(target.height || 0) * 0.42))),
      220,
      Math.max(220, Math.round(Number(target.height || 0) * 0.9)),
    );
    const left = Math.round(Number(target.x || 0) + ((Number(target.width || 0) - width) / 2));
    const top = Math.round(Number(target.y || 0) + ((Number(target.height || 0) - height) / 2));
    return moveSpecificWindowHandleToBounds({
      handle: safeHandle,
      bounds: { left, top, width, height, state: 'normal' },
      processHintLc,
      aggressiveMaximize: false,
      positionOnlyBeforeMaximize: false,
      skipFrameChanged: true,
      frameCompensationMode: 'none',
      diagnostics,
      diagnosticsContext: {
        ...diagnosticsContext,
        strategy: 'center-modal-on-monitor',
        candidateHandle: safeHandle,
      },
    });
  };

  const getForegroundWindowHandle = () => (
    new Promise((resolve) => {
      if (process.platform !== 'win32') {
        resolve(null);
        return;
      }

      const psScript = `
  Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  public static class Win32 {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  }
  "@
  $fg = [Win32]::GetForegroundWindow()
  if ($fg -eq [IntPtr]::Zero) {
    Write-Output ""
  } else {
    Write-Output ([string]([int64]$fg))
  }`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 3500, maxBuffer: 1024 * 64 },
        (_error, stdout) => {
          const handle = String(stdout || '').trim();
          resolve(handle || null);
        },
      );
    })
  );

  const verifyAndCorrectWindowPlacement = createVerifyAndCorrectWindowPlacement({
    sleep,
    clamp,
    moveSpecificWindowHandleToBounds,
    getWindowPlacementRectsByHandle,
    getWindowClassNameByHandle,
    describeBoundsDelta,
    describeMonitor,
  });

  const getVisibleWindowInfos = (processName, options = {}) => (
    new Promise((resolve) => {
      const diagnostics = options?.diagnostics || null;
      const diagnosticsContext = options?.diagnosticsContext || {};
      const expectNonEmpty = options?.expectNonEmpty === true;
      const includeNonVisible = options?.includeNonVisible === true;
      const safeName = String(processName || '').trim().toLowerCase().replace(/\.exe$/i, '');
      if (!safeName) { resolve([]); return; }

      const psScript = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Collections.Generic;
  using System.Runtime.InteropServices;
  using System.Text;
  public static class WinEnum {
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public delegate bool EnumWinProc(IntPtr hWnd, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWinProc cb, IntPtr lp);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
    [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);
    public static List<Dictionary<string, object>> FindVisibleWindows(HashSet<uint> pids, bool includeNonVisible) {
      var r = new List<Dictionary<string, object>>();
      EnumWindows((h, l) => {
        if (!includeNonVisible && !IsWindowVisible(h)) return true;
        uint p; GetWindowThreadProcessId(h, out p);
        if (!pids.Contains(p)) return true;
        RECT rect;
        if (!GetWindowRect(h, out rect)) return true;
        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (!includeNonVisible && (width <= 80 || height <= 80)) return true;
        long exStyle = GetWindowLongPtr(h, -20).ToInt64();
        bool isToolWindow = (exStyle & 0x00000080L) != 0; // WS_EX_TOOLWINDOW
        int cloaked = 0;
        try { DwmGetWindowAttribute(h, 14, out cloaked, 4); } catch { cloaked = 0; } // DWMWA_CLOAKED
        var cls = new StringBuilder(256);
        GetClassName(h, cls, cls.Capacity);
        var title = new StringBuilder(256);
        GetWindowText(h, title, title.Capacity);
        int titleLen = GetWindowTextLength(h);
        IntPtr owner = GetWindow(h, 4); // GW_OWNER
        bool hasOwner = owner != IntPtr.Zero;
        bool topMost = (exStyle & 0x00000008L) != 0; // WS_EX_TOPMOST
        var row = new Dictionary<string, object>();
        row["handle"] = ((long)h).ToString();
        row["width"] = width;
        row["height"] = height;
        row["area"] = width * height;
        row["enabled"] = IsWindowEnabled(h);
        row["isMinimized"] = IsIconic(h);
        row["hung"] = IsHungAppWindow(h);
        row["tool"] = isToolWindow;
        row["cloaked"] = cloaked != 0;
        row["className"] = cls.ToString();
        row["title"] = title.ToString();
        row["titleLength"] = titleLen;
        row["hasOwner"] = hasOwner;
        row["topMost"] = topMost;
        row["isWindowVisible"] = IsWindowVisible(h);
        r.Add(row);
        return true;
      }, IntPtr.Zero);
      return r;
    }
  }
  "@
  try { [void][WinEnum]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) } catch {}
  try { [void][WinEnum]::SetProcessDPIAware() } catch {}
  $pids = New-Object 'System.Collections.Generic.HashSet[uint32]'
  try {
    $procs = Get-Process -Name "${safeName.replace(/"/g, '`"')}" -ErrorAction SilentlyContinue
    foreach ($p in $procs) { [void]$pids.Add([uint32]$p.Id) }
  } catch {}
  if ($pids.Count -eq 0) { Write-Output "[]"; exit 0 }
  $includeNonVisible = ${includeNonVisible ? '$true' : '$false'}
  $rows = [WinEnum]::FindVisibleWindows($pids, $includeNonVisible)
  $rows | ConvertTo-Json -Depth 5`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 256 },
        (execError, stdout) => {
          const output = String(stdout || '').trim();
          try {
            const parsed = JSON.parse(output || '[]');
            const rows = Array.isArray(parsed) ? parsed : [parsed];
            const normalizedRows = rows.filter(Boolean).map((row) => ({
              handle: String(row.handle || ''),
              width: Number(row.width || 0),
              height: Number(row.height || 0),
              area: Number(row.area || 0),
              enabled: Boolean(row.enabled),
              isMinimized: Boolean(row.isMinimized),
              hung: Boolean(row.hung),
              tool: Boolean(row.tool),
              cloaked: Boolean(row.cloaked),
              className: String(row.className || ''),
              title: String(row.title || ''),
              titleLength: Number(row.titleLength || 0),
              hasOwner: Boolean(row.hasOwner),
              topMost: Boolean(row.topMost),
              isWindowVisible: Boolean(row.isWindowVisible),
            })).filter((row) => row.handle);
            if (expectNonEmpty && normalizedRows.length === 0 && diagnostics) {
              diagnostics.failure({
                ...diagnosticsContext,
                strategy: 'get-visible-window-infos',
                reason: 'no-visible-windows',
                processName: safeName,
                outputSnippet: output.slice(0, 200) || null,
                error: execError ? String(execError?.message || execError) : null,
              });
            }
            resolve(normalizedRows);
          } catch (parseError) {
            if (diagnostics) {
              diagnostics.failure({
                ...diagnosticsContext,
                strategy: 'get-visible-window-infos',
                reason: 'windows-info-parse-failed',
                processName: safeName,
                outputSnippet: output.slice(0, 200) || null,
                error: String(parseError?.message || parseError || 'parse-error'),
                commandError: execError ? String(execError?.message || execError) : null,
              });
            }
            resolve([]);
          }
        },
      );
    })
  );

  /**
   * Prefer Chromium top-level HWNDs (Chrome_WidgetWin_1) with largest area; avoids narrow strips / blank surfaces.
   */
  const placeChromiumByRankedWindows = async ({
    processHintLc,
    placementBounds,
    aggressiveMaximize,
    positionOnlyBeforeMaximize,
    skipFrameChanged = false,
    diagnostics = null,
    diagnosticsContext = {},
  }) => {
    const maxRounds = 26;
    let lastRankedSample = [];
    for (let round = 0; round < maxRounds; round += 1) {
      const rows = await getVisibleWindowInfos(processHintLc, {
        diagnostics,
        diagnosticsContext: {
          ...diagnosticsContext,
          attemptIndex: round + 1,
        },
      });
      if (rows.length === 0) {
        await sleep(120);
        continue;
      }
      const pool = rows.some(isChromiumTopLevelWindowRow)
        ? rows.filter(isChromiumTopLevelWindowRow)
        : rows;
      const ranked = [...pool].sort(
        (a, b) => scoreWindowCandidate(b, { chromiumProcessHint: processHintLc })
          - scoreWindowCandidate(a, { chromiumProcessHint: processHintLc }),
      );
      lastRankedSample = ranked
        .slice(0, 3)
        .map((row) => ({
          ...row,
          score: scoreWindowCandidate(row, { chromiumProcessHint: processHintLc }),
        }));
      for (const row of ranked.slice(0, 12)) {
        const r = await moveSpecificWindowHandleToBounds({
          handle: row.handle,
          bounds: placementBounds,
          aggressiveMaximize,
          positionOnlyBeforeMaximize,
          skipFrameChanged,
          diagnostics,
          diagnosticsContext: {
            ...diagnosticsContext,
            strategy: 'chromium-ranked-windows',
            attemptIndex: round + 1,
            candidateHandle: row.handle,
          },
        });
        if (r.applied) return r;
      }
      await sleep(120);
    }
    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        strategy: 'chromium-ranked-windows',
        reason: 'ranked-window-placement-exhausted',
        roundsAttempted: maxRounds,
        rankedCandidates: summarizeWindowRows(lastRankedSample, 3),
      });
    }
    return { applied: false, handle: null };
  };

  const waitForWindowResponsive = async (processName, handle, maxWaitMs = 1800, options = {}) => {
    const diagnostics = options?.diagnostics || null;
    const diagnosticsContext = options?.diagnosticsContext || {};
    const safeHandle = String(handle || '').trim();
    if (!safeHandle) return false;

    const deadline = Date.now() + Math.max(0, Number(maxWaitMs || 0));
    let lastRow = null;
    while (Date.now() <= deadline) {
      const rows = await getVisibleWindowInfos(processName, {
        diagnostics,
        diagnosticsContext,
      });
      const row = rows.find((candidate) => String(candidate.handle) === safeHandle);
      if (row) lastRow = row;
      if (row && row.enabled && !row.hung && !row.cloaked && row.area > 80_000) {
        return true;
      }
      await sleep(120);
    }

    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        strategy: 'wait-for-window-responsive',
        reason: 'responsive-timeout',
        handle: safeHandle,
        maxWaitMs,
        lastWindowState: summarizeWindowRows(lastRow ? [lastRow] : [], 1)[0] || null,
      });
    }

    return false;
  };

  return {
    sleep,
    clamp,
    normalizeWindowClassName,
    getPlacementCommandBounds,
    trySnapLayoutPartitionBounds,
    applySnapZoneOverlapCompensation,
    buildWindowBoundsForApp,
    moveWindowToBounds,
    moveSpecificWindowHandleToBounds,
    maximizeWindowHandle,
    bringWindowHandleToFront,
    minimizeWindowHandle,
    ensureMinimizedAfterLaunch,
    stabilizePlacementForSlowLaunch,
    stabilizeKnownHandlePlacement,
    getWindowRectByHandle,
    getWindowPlacementRectsByHandle,
    getWindowClassNameByHandle,
    centerWindowHandleOnMonitor,
    getForegroundWindowHandle,
    verifyAndCorrectWindowPlacement,
    getVisibleWindowInfos,
    placeChromiumByRankedWindows,
    waitForWindowResponsive,
  };
};

module.exports = { createWindowPlacementRuntime };
