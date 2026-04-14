import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitOn from 'wait-on';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const timestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
};

const readLastLines = (filePath, count = 40) => {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, count));
  } catch {
    return [];
  }
};

const killProcessTree = async (pid) => {
  if (!pid) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        shell: true,
      });
      killer.on('exit', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // Ignore cleanup errors.
  }
};

const run = async () => {
  const profileId = String(process.argv[2] || '').trim();
  if (!profileId) {
    console.error('Usage: npm run dev:launch-automation -- <profile-id>');
    process.exit(1);
  }

  const outputDir = path.join(projectRoot, 'artifacts', 'launch-tests', `${timestamp()}-${profileId}`);
  fs.mkdirSync(outputDir, { recursive: true });
  const launchLogFile = path.join(outputDir, 'launch-profile.jsonl');
  const screenshotFile = path.join(outputDir, 'desktop-all-monitors.png');
  const summaryFile = path.join(outputDir, 'automation-summary.json');

  console.log(`[automation] profile: ${profileId}`);
  console.log(`[automation] output dir: ${outputDir}`);

  const frontend = spawn('npm', ['run', 'dev:frontend'], {
    cwd: projectRoot,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });

  let frontendClosed = false;
  frontend.on('exit', () => {
    frontendClosed = true;
  });

  try {
    await waitOn({
      resources: ['http://localhost:5173'],
      timeout: 120000,
      interval: 200,
      validateStatus: (status) => status >= 200 && status < 500,
    });
  } catch (error) {
    await killProcessTree(frontend.pid);
    console.error('[automation] frontend did not become ready in time.');
    console.error(String(error?.message || error));
    process.exit(1);
  }

  const electronEnv = {
    ...process.env,
    FLOWSWITCH_LAUNCH_TRACE: '0',
    FLOWSWITCH_LAUNCH_CONSOLE_COMPACT: '1',
    FLOWSWITCH_LAUNCH_LOG_FILE: launchLogFile,
    FLOWSWITCH_AUTOMATION_PROFILE_ID: profileId,
    FLOWSWITCH_AUTOMATION_CAPTURE_SCREENSHOT: '1',
    FLOWSWITCH_AUTOMATION_CLOSE_PROFILE_APPS: '1',
    FLOWSWITCH_AUTOMATION_SCREENSHOT_PATH: screenshotFile,
    FLOWSWITCH_AUTOMATION_SUMMARY_PATH: summaryFile,
    FLOWSWITCH_AUTOMATION_AUTO_QUIT: '1',
    FLOWSWITCH_AUTOMATION_SETTLE_MS: '1800',
    FLOWSWITCH_AUTOMATION_START_DELAY_MS: '1100',
  };

  const electronExitCode = await new Promise((resolve) => {
    const electron = spawn('npm', ['run', 'dev:electron'], {
      cwd: projectRoot,
      shell: true,
      stdio: 'inherit',
      env: electronEnv,
    });
    electron.on('exit', (code) => resolve(Number(code ?? 0)));
    electron.on('error', () => resolve(1));
  });

  await sleep(450);
  if (!frontendClosed) {
    await killProcessTree(frontend.pid);
  }

  const summaryExists = fs.existsSync(summaryFile);
  const screenshotExists = fs.existsSync(screenshotFile);
  const logExists = fs.existsSync(launchLogFile);

  console.log(`[automation] electron exit code: ${electronExitCode}`);
  console.log(`[automation] summary: ${summaryExists ? summaryFile : 'missing'}`);
  console.log(`[automation] screenshot: ${screenshotExists ? screenshotFile : 'missing'}`);
  console.log(`[automation] log: ${logExists ? launchLogFile : 'missing'}`);

  if (logExists) {
    const tail = readLastLines(launchLogFile, 35);
    if (tail.length > 0) {
      console.log('[automation] latest launch log lines:');
      for (const line of tail) console.log(line);
    }
  }

  if (electronExitCode !== 0 || !summaryExists || !screenshotExists || !logExists) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('[automation] fatal error:', String(error?.message || error));
  process.exit(1);
});
