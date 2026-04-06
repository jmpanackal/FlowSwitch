import { execSync } from 'node:child_process';

const portArg = process.argv[2];
const port = Number(portArg || 5173);

if (!Number.isFinite(port) || port <= 0) {
  console.error(`[free-port] Invalid port: ${portArg}`);
  process.exit(1);
}

if (process.platform !== 'win32') {
  process.exit(0);
}

const safeTrim = (value) => String(value || '').trim();

const getPidsOnPort = (targetPort) => {
  const output = execSync(
    `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${targetPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`,
    {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    },
  );

  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const trimmed = safeTrim(line);
    if (!trimmed) continue;
    const pid = trimmed;
    if (!pid || !/^\d+$/.test(pid) || pid === '0') continue;
    pids.add(pid);
  }
  return [...pids];
};

try {
  const pids = getPidsOnPort(port);
  if (pids.length === 0) {
    process.exit(0);
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
      console.log(`[free-port] Killed PID ${pid} on port ${port}`);
    } catch {
      // Ignore taskkill races/permission differences.
    }
  }
} catch {
  // No matching process or command output format differences.
}

