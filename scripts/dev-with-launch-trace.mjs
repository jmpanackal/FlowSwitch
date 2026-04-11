/**
 * Runs `npm run dev` with FLOWSWITCH_LAUNCH_TRACE=1 (POSIX `VAR=1 cmd` does not work in PowerShell).
 */
import { spawn } from 'node:child_process';

process.env.FLOWSWITCH_LAUNCH_TRACE = '1';
const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
