'use strict';

const { spawn } = require('child_process');

const MAX_RESTARTS_PER_WINDOW = 3;
const RESTART_WINDOW_MS = 60_000;

let _proc = null;
let _buf = '';
let _reqId = 0;
let _runspaceGen = 0;
let _runspaceDisabled = false;
let _restartCount = 0;
let _restartWindowStart = 0;
let _winEnumCSharpRef = '';
const _pending = new Map();

const getInitScript = (winEnumCSharp) => `
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

const scheduleRestartIfEligible = () => {
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
    try {
      start(_winEnumCSharpRef);
    } catch {
      _runspaceDisabled = true;
    }
  }, 400);
};

const start = (winEnumCSharp) => {
  if (_runspaceDisabled) return;
  if (_proc) return;
  _winEnumCSharpRef = winEnumCSharp;
  const initScript = getInitScript(winEnumCSharp);
  _proc = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', initScript],
    { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true },
  );
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
        const pending = _pending.get(msg.id);
        if (!pending || msg.gen !== pending.gen) continue;
        _pending.delete(msg.id);
        clearTimeout(pending.timer);
        pending.resolve(Array.isArray(msg.rows) ? msg.rows : []);
      } catch {
        // Ignore malformed line.
      }
    }
  });

  _proc.on('exit', () => {
    for (const pending of _pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('ps-runspace-exited'));
    }
    _pending.clear();
    _proc = null;
    scheduleRestartIfEligible();
  });
};

const query = (processName, includeNonVisible, timeoutMs, legacyEnumerate) => {
  const safeFallback = typeof legacyEnumerate === 'function'
    ? legacyEnumerate
    : (() => Promise.resolve([]));
  if (_runspaceDisabled || !_proc) {
    return safeFallback(processName, includeNonVisible);
  }

  const id = ++_reqId;
  const gen = _runspaceGen;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        safeFallback(processName, includeNonVisible).then(resolve, reject);
      }
    }, Math.max(100, Number(timeoutMs || 0)));

    _pending.set(id, {
      gen,
      timer,
      resolve: (rows) => {
        clearTimeout(timer);
        resolve(rows);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });

    try {
      _proc.stdin.write(JSON.stringify({
        id,
        gen,
        processName,
        includeNonVisible: Boolean(includeNonVisible),
      }) + '\n');
    } catch {
      _pending.delete(id);
      clearTimeout(timer);
      safeFallback(processName, includeNonVisible).then(resolve, reject);
    }
  });
};

const stop = () => {
  if (_proc) {
    try { _proc.stdin.end(); } catch (_error) { void _error; }
    try { _proc.kill(); } catch (_error) { void _error; }
    _proc = null;
  }
};

module.exports = {
  start,
  query,
  stop,
  isDisabled: () => _runspaceDisabled,
};
