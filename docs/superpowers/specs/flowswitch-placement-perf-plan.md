# FlowSwitch — Launch & Placement Performance Plan

> **Goal:** Dramatically reduce wall-clock time for the place/verify step without breaking
> existing reliability guarantees (stability count, Chromium fallback, modal detection).
>
> **Approach:** No behavior changes until each optimization is proven safe in isolation.
> Phases are ordered by impact-to-risk ratio. Phase 1 can ship alone.

---

## What's NOT changing

These correctness features are preserved in every phase:

- `stableCount >= 2` requirement before ready-gate exits
- Modal blocker detection path
- `verifyAndCorrectWindowPlacement` logic (just the transport layer changes)
- All timeout upper bounds (`readyGateTimeoutMs`, etc.)
- Profile-level app sequencing (apps launch in order)
- The `launch-latest.jsonl` diagnostic log
- `placedHandlesInRun` quarantine (no sibling handle theft)

---

## Phase 1 — Instrumentation (do this first, no risk)

**Why first:** You don't know the actual per-phase breakdown for your real profile mixes yet.
Measurements tell you where to spend effort.

### 1a. Add phase timestamps to `launch-latest.jsonl`

In `profile-launch-runner.js`, wrap each major phase with a `Date.now()` pair and emit to the
diagnostics log via the existing `launchDiagnostics` object (same `event` pattern as existing
entries). Target these phases per app:

| Phase key | Code location |
|-----------|---------------|
| `reuse-poll` | The 3-poll `findStableExistingMainWindowHandle` loop |
| `ready-gate` | `waitForMainWindowReadyOrBlocker` call |
| `primary-move` | `moveSpecificWindowHandleToBounds` on the ready handle |
| `known-handle-stabilize` | `stabilizeKnownHandlePlacement` call |
| `verify` | `verifyAndCorrectWindowPlacement` call |
| `chromium-reassert` | The 260ms sleep + reassert move |
| `slow-stabilize` | `stabilizePlacementForSlowLaunch` call |
| `maximized-stabilize` | The maximized stabilization loop |
| `post-placement-scan` | `postPlacementRows` enumeration |

Emit as:
```js
launchDiagnostics.timing({ phase: 'ready-gate', ms: t1 - t0, processHintLc });
```

Add a `.timing()` method to the diagnostics factory that writes `{ event: 'phase-timing', ... }`.

### 1b. Count PowerShell spawns per app launch

Add a mutable counter object `{ count: 0 }` to `createWindowPlacementRuntime`. Increment it
inside every `execFile('powershell.exe', ...)` call. Pass it through via deps so the runner can
read and emit `{ event: 'powershell-spawn-count', count, processHintLc }` after each app
placement completes.

**Commit prefix:** `chore: add phase timing and spawn counts to launch diagnostics`

**Verification:** Launch a 3-app profile (one Chromium, one Win32, one shortcut). Open
`%APPDATA%/FlowSwitch/logs/launch-latest.jsonl`. Confirm per-app timing for each phase and
total spawn count.

---

## Phase 2 — Replace `getWindowPlacementRectsByHandle` with in-process FFI (highest impact, medium risk)

**Why this is Phase 2, not Phase 3:** Instrumentation (Phase 1) will almost certainly confirm
this is the single biggest per-call cost. It's called in:
- `stabilizeKnownHandlePlacement` inner loop (every 180ms)
- `verifyAndCorrectWindowPlacement` (per correction attempt)
- `stabilizePlacementForSlowLaunch` inner loop (per candidate, per iteration)
- Late-verify fallback
- Salvage scan (up to 22 candidates!)
- Final validation rect read
- Delayed Chromium maximize check

Each call currently spawns PowerShell + `Add-Type` C# compilation. Measured at 200–600ms
per call. A 3-app normal profile can easily trigger **20–40 rect reads** in a single run.

### Tech choice: `koffi`

- Pure JS bindings, no node-gyp, works with Electron 33 / Node 20
- Add to `dependencies` (not devDeps)
- `package.json` already has `asarUnpack: ["**/*.node"]`

```
npm install koffi
```

### Shared FFI bootstrap: `src/main/services/win32-ffi.js` (Phase 2 — required)

Load `user32.dll` / `dwmapi.dll` **once** and define shared types (`HWND`, `RECT`) once. Both
`win32-window-rect.js` and `win32-window-move.js` import from this module so koffi does not
register duplicate type names and future `EnumWindows` work can reuse the same handles.

```js
'use strict';

const koffi = require('koffi');

const user32 = koffi.load('user32.dll');
const dwmapi = koffi.load('dwmapi.dll');
const HWND = koffi.pointer('HWND', koffi.opaque());
const RECT = koffi.struct('RECT', {
  left: 'int32', top: 'int32', right: 'int32', bottom: 'int32',
});

module.exports = { koffi, user32, dwmapi, HWND, RECT };
**Also:** bind `GetWindowPlacement` / `WINDOWPLACEMENT` in this module when implementing Phase 3
(move settling), so rect and move share one `user32` load and one `HWND` type.

### Implementation: `src/main/services/win32-window-rect.js`

**CRITICAL: HWND is pointer-sized (8 bytes on x64).** Do NOT use `uint32`. HWND conversion is
proven by the smoke test in **Implementation gotchas §A** — do **not** hard-code a specific
koffi API until that smoke test passes.

```js
'use strict';

const { user32, dwmapi, HWND, RECT } = require('./win32-ffi');

const GetWindowRect = user32.func(
  'bool __stdcall GetWindowRect(HWND hwnd, _Out_ RECT *rect)'
);
const DwmGetWindowAttribute = dwmapi.func(
  'long __stdcall DwmGetWindowAttribute(HWND hwnd, uint32 dwAttribute, _Out_ RECT *pvAttribute, uint32 cbAttribute)'
);

const DWMWA_EXTENDED_FRAME_BOUNDS = 9;

/**
 * In-process replacement for the PowerShell getWindowPlacementRectsByHandle.
 * Returns { outerRect, visibleRect } matching the existing contract shape,
 * or { outerRect: null, visibleRect: null } on failure.
 *
 * @param {string} handleDecimal - Window handle as a decimal string (from EnumWindows).
 */
function getWindowPlacementRects(handleDecimal) {
  const hwndBigInt = BigInt(handleDecimal || '0');
  if (hwndBigInt === 0n) return { outerRect: null, visibleRect: null };

  const hwnd = handleBigIntToHwnd(hwndBigInt); // single helper; body from §A smoke test

  let outerRect = null;
  try {
    const wr = {};
    const ok = GetWindowRect(hwnd, wr);
    if (ok) {
      outerRect = {
        left: wr.left,
        top: wr.top,
        width: wr.right - wr.left,
        height: wr.bottom - wr.top,
      };
    }
  } catch { /* invalid handle */ }

  let visibleRect = null;
  try {
    const fr = {};
    const hr = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, fr, koffi.sizeof(RECT));
    if (hr === 0) {
      visibleRect = {
        left: fr.left,
        top: fr.top,
        width: fr.right - fr.left,
        height: fr.bottom - fr.top,
      };
    }
  } catch { /* DWM unavailable or invalid handle */ }

  if (!visibleRect && outerRect) visibleRect = { ...outerRect };
  if (!outerRect && visibleRect) outerRect = { ...visibleRect };

  return { outerRect, visibleRect };
}

module.exports = { getWindowPlacementRects };
```

### Integration in `window-placement-runtime.js`

Replace the `getWindowPlacementRectsByHandle` implementation. Keep PowerShell as fallback.

**Environment flag:** `FLOWSWITCH_USE_RECT_FFI=0` forces the PowerShell path (workaround for a
bad koffi/OS combo without uninstalling the package). When unset, use FFI after successful
`require` (or, during initial soak only, require `FLOWSWITCH_USE_RECT_FFI=1` before attempting
FFI — remove that guard once validated).

**Three-state lazy load** (`null` = untried, module object = loaded, `undefined` = failed):

```js
let _win32Rect = null;
function loadWin32Rect() {
  if (process.env.FLOWSWITCH_USE_RECT_FFI === '0') return null;
  if (_win32Rect !== null) return _win32Rect || null;
  try {
    _win32Rect = require('./win32-window-rect');
  } catch {
    _win32Rect = undefined;
  }
  return _win32Rect || null;
}

const getWindowPlacementRectsByHandle = (handle) => {
  const ffi = loadWin32Rect();
  if (ffi) {
    try {
      const result = ffi.getWindowPlacementRects(String(handle || '').trim());
      return Promise.resolve(result);
    } catch { /* fall through to PowerShell */ }
  }
  // ... existing PowerShell execFile implementation unchanged ...
};
```

**Expected gain:** ~200–600ms per call → <1ms. Over 20–40 calls per profile, that's
**4–24 seconds** saved per launch.

**Risk:** Medium. HWND ABI and koffi’s accepted JS representation must match (see §A). `RECT`
struct layout is stable Win32 ABI. Invalid handles return false/HRESULT error and are caught.
PowerShell + env-flag off means dev environments and edge cases still work.

**Commit prefix:** `feat: replace PowerShell rect reads with koffi in-process FFI`

**Verification:**
1. `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build`
2. Launch 3-app profile; check `launch-latest.jsonl` — phase timings for verify/stabilize
   should drop to near-zero
3. Window positions identical to before
4. Kill an app mid-stabilize → confirm no crash from reading closed handle

---

## Phase 3 — Replace `moveSpecificWindowHandleToBounds` with in-process FFI (high impact, medium risk)

**Why this matters:** This function is called on every placement attempt, correction, and
stabilizer iteration. Each call compiles C# (`SetWindowPos`, `ShowWindowAsync`) and has
internal `Start-Sleep` commands (70ms + 95ms + 85ms + 65ms for maximized cross-monitor
re-anchor). It's the **write** counterpart to Phase 2's **read** — equally expensive and
equally frequent.

### Implementation: `src/main/services/win32-window-move.js`

Import shared bindings from `./win32-ffi` (same `user32` / `HWND` as rect reads).

**Critical: `ShowWindowAsync` is asynchronous.** It posts to the **target** window’s queue and
returns immediately. The next-line `SetWindowPos` races restore/maximize animations and causes
intermittent failures (Electron, IDEs, DWM cross-monitor). **Do not** claim in-process calls
make fixed sleeps unnecessary.

**Use verify-after-command polling instead:** bind `GetWindowPlacement`, set
`WINDOWPLACEMENT.length` per MSDN, and after each `ShowWindowAsync` that must settle (e.g.
`SW_RESTORE` before sizing), poll until `showCmd` matches the predicate (not minimized / matches
maximized), **~500ms cap**, **10–20ms** between polls. Then `SetWindowPos`, final
`ShowWindowAsync`, poll again if needed. With Phase 2, reads are cheap so this beats blind 70–95ms
sleeps.

Export **`async function moveWindowHandleToBounds(...)`** → `Promise<{ applied, handle }>`.

(Sketch — fill in `WINDOWPLACEMENT` struct + `GetWindowPlacement` in this file or `win32-ffi.js`,
and `handleBigIntToHwnd` from §A:)

```js
'use strict';

const { user32 /* , WINDOWPLACEMENT, GetWindowPlacement */ } = require('./win32-ffi');

async function waitUntilShowCmdPred(hwnd, pred, timeoutMs, sleepMs = 16) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const wp = readWindowPlacement(hwnd); // GetWindowPlacement + validate
    if (pred(wp.showCmd)) return true;
    await new Promise((r) => setTimeout(r, sleepMs));
  }
  return false;
}

async function moveWindowHandleToBounds(handleDecimal, bounds, options = {}) {
  // ... SetWindowPos, ShowWindowAsync, flags, compute geometry ...
  // After ShowWindowAsync(SW_RESTORE): await waitUntilShowCmdPred(hwnd, ..., 500);
  // SetWindowPos(...); ShowWindowAsync(windowState); optionally await for SW_MAXIMIZE
  return { applied: true, handle: handleDecimal };
}

module.exports = { moveWindowHandleToBounds };
```

**Aggressive maximize:** keep retry loop in **caller**; on verify miss, **re-enumerate and rebind
HWND** (see gotchas §B).

### Environment flag and lazy load

`FLOWSWITCH_USE_MOVE_FFI=0` forces PowerShell. `loadWin32Move()` uses the same three-state
pattern as `loadWin32Rect()` (`null` / module / `undefined`).

### Integration

`moveSpecificWindowHandleToBounds` must **`await ffi.moveWindowHandleToBounds(...)`** (async FFI).

```js
const moveSpecificWindowHandleToBounds = async ({ handle, bounds, ... }) => {
  const ffi = loadWin32Move();
  if (ffi) {
    const commandBounds = frameCompensationMode === 'none' ? bounds : getPlacementCommandBounds(bounds, processKey);
    let result = await ffi.moveWindowHandleToBounds(handle, commandBounds, { aggressiveMaximize, positionOnlyBeforeMaximize, skipFrameChanged });

    if (aggressiveMaximize && commandBounds.state === 'maximized') {
      for (let mx = 0; mx < 3; mx++) {
        await sleep(80);
        await ffi.moveWindowHandleToBounds(handle, { ...commandBounds, state: 'normal' }, {});
        await sleep(80);
        result = await ffi.moveWindowHandleToBounds(handle, commandBounds, {});
        // On placement-verify miss: rebind handle from enum before next mx
      }
    }
    return result;
  }
  // ... existing PowerShell fallback ...
};
```

**Expected gain:** Removes PowerShell **spawn + Add-Type** per move; keeps only **necessary**
settling time (polled, bounded). Net win stays large because moves are frequent.

**Commit prefix:** `feat: replace PowerShell window move with koffi in-process FFI`

---

## Phase 4 — Shorten stabilization (high impact, low risk)

**Target:** The post-placement cascade spends multiple seconds in `stabilizePlacementForSlowLaunch`
even when verify passed. **Do not** remove the stabilizer — apps can self-resize after verify.
Instead, shrink `durationMs` now that inner-loop reads are cheap (Phase 2).

### Current flow (normal state, non-Chromium):
1. `stabilizeKnownHandlePlacement` — 2200ms budget
2. `verifyAndCorrectWindowPlacement` — up to 3 correction rounds
3. `stabilizePlacementForSlowLaunch` — **5600ms** budget

### 4a. Early-exit `stabilizeKnownHandlePlacement` on first verified poll

The function already returns early when `onTarget && closeEnough` is true. But its first action
is always a `moveSpecificWindowHandleToBounds` call **before** checking. Change it to: **read
rect first, return immediately if already correct.** This avoids the move and 180ms sleep when
placement was already good.

In `stabilizeKnownHandlePlacement`, move the rect-read-and-verify check **before** the move:

```js
while (Date.now() <= deadline) {
  const placementRects = await getWindowPlacementRectsByHandle(safeHandle);
  const measuredRect = placementRects?.visibleRect || placementRects?.outerRect || null;
  if (measuredRect) {
    const onTarget = isWindowOnTargetMonitor({ rect: measuredRect, monitor, bounds });
    const closeEnough = bounds.state === 'normal' ? isRectCloseToTargetBounds(measuredRect, bounds, 8) : true;
    if (onTarget && closeEnough) {
      return { verified: true, corrected, handle: safeHandle };
    }
    // ... stagnation check ...
  }
  // Only move if NOT on target
  await moveSpecificWindowHandleToBounds({ ... });
  corrected = true;
  await sleep(180);
}
```

This is already how it works (the code does read-first). The stagnation break after
`stagnantMeasurementCount >= 1` already provides early exit. **No code change needed here.**

### 4b. **Do not** skip `stabilizePlacementForSlowLaunch` entirely after verify passes

**Why:** Many apps (Electron, JetBrains, heavy UIs) resize *after* an initial “good” placement.
Verify can pass, then 300–800ms later the process applies saved geometry and drifts off target.
The long stabilizer exists to **catch late self-relayout**. Skipping it trades a common class of
regression for a little wall-clock.

**Instead:** Keep the stabilizer **always**, but **shorten** it now that Phase 2 makes inner-loop
rect reads cheap — the *same* wall-time budget can run **many more** correction iterations.

### 4c. Reduce `stabilizePlacementForSlowLaunch` duration (primary optimization)

Replace the old 5600ms / 2000ms defaults with tiered budgets, for example:

- **Verify passed:** `1000ms` (non-Chromium normal), `900ms` (Chromium normal) — still many polls.
- **Verify did not pass:** `2000ms` / `1600ms` respectively.

Tune from Phase 1 timings; the point is **shorter calendar time**, not **zero** stabilizer.

```js
const stabilizationDurationMs = placementVerified
  ? (isChromiumFamily ? 900 : 1000)
  : (isChromiumFamily ? 1600 : 2000);

const stabilized = await stabilizePlacementForSlowLaunch({
  ...
  durationMs: stabilizationDurationMs,
});
```

Optional: further reduce when `result.handle` is known and not duplicate-process, but keep a
**non-zero** floor.

### 4d. Skip maximized stabilization for reused-existing windows (normal state too)

The code already skips maximized stabilization for `reusedAlreadyWithinTolerance` (line 3527).
Extend this skip to **normal state** as well — if the reused window was already within tolerance,
no stabilization is needed.

**Change in runner (~line 3239):**

```js
if (
  result.applied
  && result.handle
  && launchItem.monitor
  && placementBounds.state === 'normal'
  && !shouldDelayChromiumMaximize
  && !reusedAlreadyWithinTolerance  // <-- skip known-handle stabilize for reuse+tolerance
) {
  const knownHandleStabilized = await stabilizeKnownHandlePlacement({ ... });
  ...
}
```

**Commit prefix:** `fix: shorten stabilizer budgets; skip only reuse+tolerance known-handle pass`

---

## Phase 5 — Short-TTL enumeration cache for `getVisibleWindowInfos` (medium impact, low risk)

**Target:** Eliminate redundant `getVisibleWindowInfos` calls within a single launch step.

### Where it helps most

- `stabilizePlacementForSlowLaunch`: calls `getVisibleWindowInfos` every 220ms loop, then
  inside that loop calls `getWindowPlacementRectsByHandle` per candidate (already fast after
  Phase 2). The **enum call** is still expensive if still PowerShell.
- `placeChromiumByRankedWindows`: calls `getVisibleWindowInfos` every 120ms round.
- Salvage scan (line 3068): full enum right after a move attempt.

### Implementation: `src/main/services/window-enum-cache.js`

```js
'use strict';

const _cache = new Map();
const DEFAULT_TTL_MS = 150;

function getCachedEnum(hint, runId) {
  const key = `${hint}::${runId}`;
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > DEFAULT_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.rows;
}

function setCachedEnum(hint, runId, rows) {
  _cache.set(`${hint}::${runId}`, { ts: Date.now(), rows });
}

function invalidateEnumHint(hint, runId) {
  _cache.delete(`${hint}::${runId}`);
}

function clearRunCache(runId) {
  for (const key of [..._cache.keys()]) {
    if (key.endsWith(`::${runId}`)) _cache.delete(key);
  }
}

module.exports = { getCachedEnum, setCachedEnum, invalidateEnumHint, clearRunCache };
```

### Integration

Thread `runId` into `getVisibleWindowInfos` via an options field. Check cache before spawning
PowerShell; fill cache after successful parse. **`invalidateEnumHint(processHintLc, runId)`**
must be called from the move wrapper **after any successful `moveSpecificWindowHandleToBounds` /
`moveWindowToBounds` for that hint** (and optionally after failed moves if you still changed
window state) so post-move enumerations never see **stale positions** within TTL.

`clearRunCache(runId)` at run end.

**Stronger alternative (future):** `batchEnum([hints], runId)` — one PS call per ready-gate
`Promise.all` batch — avoids TTL edge cases entirely.

**TTL rationale:** 150ms is shorter than ready-gate poll (`260ms`) and stabilizer loop sleep
(`220ms`), so TTL alone does not span polls — but **invalidation after writes is still required**
because FFI moves can complete in &lt;1ms and re-read the cache immediately.

**Environment flag:** honor `FLOWSWITCH_USE_ENUM_CACHE=0` to disable caching (debug / regression
isolate).

**Commit prefix:** `feat: add short-TTL window enum cache scoped to launch runId`

---

## Phase 6 — Persistent PowerShell runspace for `getVisibleWindowInfos` (high impact, high risk)

**Target:** After Phases 2–3 make rect reads and window moves fast, the remaining expensive
operation is `getVisibleWindowInfos` (full `EnumWindows` via PowerShell).

### Approach: persistent process with pre-compiled C# assembly

Spawn one PowerShell process at app startup. The `Add-Type` C# compilation happens once.
Subsequent queries send a process name over stdin, receive JSON rows over stdout.

### Protocol

**Request (one JSON line on stdin):**
```json
{"id": 1, "processName": "chrome", "includeNonVisible": false}
```

**Response (one JSON line on stdout):**
```json
{"id": 1, "rows": [...]}
```

The PowerShell init script handles `Get-Process -Name` internally (as it does today), so
callers just send the process name string.

### Implementation sketch: `src/main/services/ps-runspace.js`

```js
'use strict';

const { spawn } = require('child_process');

let _proc = null;
let _buf = '';
let _reqId = 0;
const _pending = new Map();
let _runspaceGen = 0;
let _runspaceDisabled = false;
let _restartCount = 0;
let _restartWindowStart = 0;
let _winEnumCSharpRef = '';
const MAX_RESTARTS_PER_WINDOW = 3;
const RESTART_WINDOW_MS = 60_000;

function getInitScript(winEnumCSharp) {
  return `
Add-Type -TypeDefinition @"
${winEnumCSharp}
"@
while ($true) {
  $line = [Console]::ReadLine()
  if ($null -eq $line) { break }
  try {
    $req = $line | ConvertFrom-Json
    $pids = New-Object 'System.Collections.Generic.HashSet[uint32]'
    try {
      $procs = Get-Process -Name $req.processName -ErrorAction SilentlyContinue
      foreach ($p in $procs) { [void]$pids.Add([uint32]$p.Id) }
    } catch {}
    if ($pids.Count -eq 0) {
      [Console]::WriteLine(('{"id":' + $req.id + ',"gen":' + $req.gen + ',"rows":[]}'))
      continue
    }
    $rows = [WinEnum]::FindVisibleWindows($pids, [bool]$req.includeNonVisible)
    $result = @{ id = $req.id; gen = $req.gen; rows = $rows } | ConvertTo-Json -Depth 5 -Compress
    [Console]::WriteLine($result)
  } catch {
    [Console]::WriteLine(('{"id":' + $req.id + ',"gen":' + $req.gen + ',"rows":[],"error":"' + $_.Exception.Message + '"}'))
  }
}
`;
}

function start(winEnumCSharp) {
  _winEnumCSharpRef = winEnumCSharp;
  const initScript = getInitScript(winEnumCSharp);
  _proc = spawn('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', initScript
  ], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  _runspaceGen += 1;

  _proc.stdout.on('data', (chunk) => {
    _buf += chunk.toString();
    let nl;
    while ((nl = _buf.indexOf('\n')) !== -1) {
      const line = _buf.slice(0, nl).trim();
      _buf = _buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        const p = _pending.get(msg.id);
        if (!p || msg.gen !== p.gen) continue; // stale after restart or spurious line
        _pending.delete(msg.id);
        clearTimeout(p.timer);
        p.resolve(msg.rows || []);
      } catch { /* ignore malformed */ }
    }
  });

  _proc.on('exit', () => {
    for (const [, p] of _pending) {
      clearTimeout(p.timer);
      p.reject(new Error('ps-runspace-exited'));
    }
    _pending.clear();
    _proc = null;
    scheduleRestartIfEligible();
  });
}

function scheduleRestartIfEligible() {
  if (_runspaceDisabled) return;
  if (!_restartWindowStart) _restartWindowStart = Date.now();
  if (Date.now() - _restartWindowStart > RESTART_WINDOW_MS) {
    _restartCount = 0;
    _restartWindowStart = Date.now();
  }
  if (_restartCount >= MAX_RESTARTS_PER_WINDOW) {
    _runspaceDisabled = true;
    return;
  }
  _restartCount += 1;
  setTimeout(() => {
    try { start(_winEnumCSharpRef); } catch { _runspaceDisabled = true; }
  }, 400);
}

/**
 * Never return [] when enumeration failed opaquely — that starves the ready gate.
 * If the runspace is down or exhausted retries, call the existing `execFile` enumeration path.
 */
async function query(processName, includeNonVisible, timeoutMs, legacyEnumerate) {
  if (_runspaceDisabled) {
    return legacyEnumerate(processName, includeNonVisible);
  }
  if (!_proc) {
    return legacyEnumerate(processName, includeNonVisible);
  }
  const id = ++_reqId;
  const gen = _runspaceGen;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        legacyEnumerate(processName, includeNonVisible).then(resolve, reject);
      }
    }, timeoutMs);
    _pending.set(id, {
      gen,
      timer,
      resolve: (rows) => { clearTimeout(timer); resolve(rows); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    try {
      _proc.stdin.write(JSON.stringify({ id, gen, processName, includeNonVisible }) + '\n');
    } catch {
      _pending.delete(id);
      clearTimeout(timer);
      legacyEnumerate(processName, includeNonVisible).then(resolve, reject);
    }
  });
}

function stop() {
  if (_proc) { _proc.stdin.end(); _proc.kill(); _proc = null; }
}

**Runspace is an optimization, not a requirement:** `query(..., legacyEnumerate)` must **never**
return `[]` as a stand-in for “runspace down” — that starves `waitForMainWindowReadyOrBlocker`. On
process exit, reject pending, restart with backoff (bounded), then **permanently** fall back to
the existing `execFile` enumerator when retry budget is exhausted (`_runspaceDisabled`). Under
normal load, stdin queues requests serially in PowerShell (no parallelism); expect added latency,
not wrongness.

### Gating

Behind `FLOWSWITCH_USE_PS_RUNSPACE=1` env flag initially. When the flag is unset, existing
`execFile` path is used unchanged. This allows fallback if the runspace causes issues.

**Expected gain:** `Add-Type` cost (~200–400ms) paid once at startup. Each subsequent poll is
a stdin/stdout round-trip (~10–30ms including `Get-Process` + `EnumWindows` execution time).

**Commit prefix:** `feat: persistent PowerShell runspace for window enumeration (opt-in)`

---

## Phase 7 — Chromium and stabilizer tuning (low risk, medium gain)

### 7a. Cap `placeChromiumByRankedWindows` rounds when the ready gate **already** chose a handle

This fallback runs when `!result.applied && isChromiumFamily` — e.g. move failed after the gate
returned a concrete HWND. **Do not** shorten rounds when the gate **timed out** (the window was
especially hard to surface); keep the higher budget there.

**Cap when** `readyGate?.ready && readyGate?.handle` — you are not discovering which window;
you are retrying placement on a **known** root window list.

```js
const hasReadyHandle = Boolean(readyGate?.ready && String(readyGate?.handle || '').trim());
const maxRounds = hasReadyHandle ? 6 : 26;
const candidateSlice = hasReadyHandle ? 3 : 12;
```

Pass `readyGate` (subset fields only) into `placeChromiumByRankedWindows`. If the profile flow had
a modal blocker (`blocked: true`), the ranked fallback should not run at all — that path is
orthogonal; this tuning assumes the caller only enters fallback when placement—not modal
orchestration—failed.

**Note:** The earlier “cap when `readyGateTimedOut`” rationale was inverted and has been
removed.

### 7b. Skip Chromium normal soft-reassert when verify passed

The "re-assert bounds once" block (line 3314–3336) runs a 260ms sleep + another
`moveSpecificWindowHandleToBounds` even when `verifyAndCorrectWindowPlacement` already
confirmed position. Guard it:

```js
if (
  result.applied
  && result.handle
  && isChromiumFamily
  && placementBounds.state === 'normal'
  && !shouldDelayChromiumMaximize
  && !placementVerified             // <-- skip if verify already passed
) {
  await sleep(260);
  await moveSpecificWindowHandleToBounds({ ... });
}
```

### 7c. Reduce `waitForWindowResponsive` timeout for delayed Chromium maximize

Currently 2200ms. The window is already known to exist (ready gate returned it). Reduce to
1200ms:

```js
await waitForWindowResponsive(processHintLc, result.handle, 1200, { ... });
```

**Commit prefix:** `fix: cap chromium fallback rounds and skip redundant reassert`

---

## Implementation order and branching

```
feature/profile-launch-placement-speed (current branch)
 └─ Phase 1: chore/launch-phase-timing
 └─ Phase 2: feat/win32-rect-ffi
 └─ Phase 3: feat/win32-move-ffi
 └─ Phase 4: fix/stabilizer-shorten-budgets
 └─ Phase 5: feat/window-enum-cache
 └─ Phase 6: feat/ps-runspace (opt-in flag, longer soak)
 └─ Phase 7: fix/chromium-placement-tuning
```

Phases 2–4 deliver the biggest gains and can be implemented sequentially on one branch.
Phases 5–7 are independent and can be done in parallel after Phase 4 merges.

---

## Expected cumulative gains

| Phase | Target | Expected per-app saving |
|-------|--------|------------------------|
| 1 | — | Enables measurement |
| 2 | Rect reads (20–40 per profile) | ~200–600ms/call → <1ms |
| 3 | Window moves (10–20 per profile) | ~300–800ms/call → <20ms |
| 4 | `stabilizePlacementForSlowLaunch` budgets | Shorter wall-clock; stabilizer still runs (late-resize apps) |
| 5 | Duplicate enums within iterations | 20–30% fewer PS spawns |
| 6 | All `getVisibleWindowInfos` polls | ~300–800ms/poll → ~20ms |
| 7 | Chromium worst-case tail | 1–3s off worst-case |

**Estimated total for a 4-app profile:**
- Before: 20–35s (observed)
- After Phases 2–4: 4–8s
- After Phases 5–7: 2–5s

---

## QA checklist per phase

Per `AGENTS.md` Tier 2 requirements:

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run typecheck:full`
- [ ] `npm run test`
- [ ] `npm run build`
- Manual: launch a 3-app profile (one Chromium, one Win32 shortcut, one app-protocol URL)
- Manual: confirm all windows land in correct positions on correct monitors
- Manual: confirm modal blocker detection still fires (app with auth dialog)
- Manual: launch with an invalid shortcut path; confirm graceful failure, no crash
- Manual: check `launch-latest.jsonl` for phase timing entries (Phase 1+)
- Manual: compare window positions before/after (screenshot baseline)
- Manual: launch with a maximized Chromium app; confirm it lands on correct monitor maximized
- Manual: launch profile with reused-existing-window; confirm Phase 4d skips extra work when within tolerance
- Manual: launch profile with a minimized tile; confirm it stays minimized

---

## Implementation gotchas and rollback gates (required)

These are non-negotiable guardrails for implementation safety and fast rollback.

### A) `win32-ffi.js` first, then koffi pointer smoke test

Add `win32-ffi.js` (shared DLL loads + `HWND` + `RECT`) **before** rect/move modules.

Before implementing `win32-window-rect.js` or `win32-window-move.js`, add
`scripts/dev-koffi-hwnd-smoke.mjs` that:

1. Uses the same `HWND` / `user32` bindings as production (`win32-ffi.js`)
2. Calls a safe read (`GetForegroundWindow` + `GetWindowRect` or `GetWindowPlacement`)
3. Confirms the accepted JS value for HWND arguments for this repo’s **pinned** koffi version
   — **do not assume** `koffi.address` is the right API; verify against current docs + runtime

Only proceed after this passes.

### B) Handle churn in aggressive maximize path

For aggressive Chromium maximize retries, do not assume the initial HWND remains valid through
all retry cycles. If a retry fails verification, re-enumerate and attempt to rebind to the best
candidate handle before the next retry round.

### C) Runspace queue, backpressure, restart (Phase 6)

`ps-runspace` is single-threaded in PowerShell. Requests serialize; stdin can queue under load
(extra latency, not “parallel speedup”). **Never** return empty `rows` when the runspace failed —
fall back to `execFile` enumeration. On crash/exit: bounded restarts, then `_runspaceDisabled`
+ legacy path until app restart.

Required behavior:
- Document lack of query parallelism in code comments
- Optionally coalesce stale same-hint requests (latest-wins per `runId + processHint`) where safe

### D) Runspace timeout / stale responses / `gen` token

Include monotonic `gen` (`_runspaceGen`) in each request; PowerShell **echoes `gen` in every
response line**. The stdout handler resolves **only** when `msg.id` matches pending **and**
`msg.gen === p.gen`, so late lines after restart cannot poison a new generation. Keep `_reqId`
monotonic for the process lifetime.

### E) Enum cache: TTL is not enough

TTL (`150ms`) is below ready-gate poll (`260ms`) and stabilizer sleep (`220ms`), but **after any
placement write** you must **`invalidate(processHint, runId)`** (or equivalent) so a sub-millisecond
FFI move cannot be followed by a stale cached enum. Prefer **batch enum** for ready-gate
`Promise.all` if you want to avoid TTL edge cases entirely.

### F) `moveWindowToBounds` is out-of-scope for first pass

`moveWindowToBounds` still uses PowerShell and remains a fallback path. Keep it as-is for initial
rollout, but track it as a follow-up optimization item after Phases 2–4 stabilize.

### G) Feature flags and rollback (Phases 2–6)

**Disable without uninstalling koffi:** `FLOWSWITCH_USE_RECT_FFI=0` and
`FLOWSWITCH_USE_MOVE_FFI=0` force the PowerShell paths.

**Enum / runspace:** `FLOWSWITCH_USE_ENUM_CACHE=0`, `FLOWSWITCH_USE_PS_RUNSPACE` — only use
runspace when `=1` (opt-in); turning the flag off must restore `execFile`-only behavior.

**Soak:** Optionally require `FLOWSWITCH_USE_RECT_FFI=1` / `..._MOVE_FFI=1` during the first PR,
then drop the requirement once stable.

**Semantic rollback:** Disable the relevant flag when manual QA shows placement regressions or
diagnostics show implausible geometry (zero-area rects for visible windows, repeated verify
failures after “successful” moves).

### H) `ShowWindowAsync` is not “fast because FFI is sync”

It posts to the **target** window’s queue. The move implementation **must** await observable
state (e.g. `GetWindowPlacement` / `showCmd`) or bounded polling — not drop the PowerShell sleeps
without replacement. See Phase 3.
