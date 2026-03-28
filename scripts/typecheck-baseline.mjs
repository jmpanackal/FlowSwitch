#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const mode = process.argv[2] || 'check';
const repoRoot = process.cwd();
const baselineDir = path.join(repoRoot, 'qa');
const baselineFile = path.join(baselineDir, 'typecheck-baseline.txt');

function runTypecheck() {
  const result = spawnSync(
    'npm run --silent typecheck:full',
    {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: true,
    },
  );
  const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
  return {
    exitCode: result.status ?? 1,
    output: combined,
  };
}

function extractErrorSignatures(output) {
  const signatures = new Set();
  for (const line of output.split(/\r?\n/)) {
    // Example:
    // src/file.tsx(123,45): error TS2322: Type 'X' is not assignable to 'Y'.
    const match = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.+)$/);
    if (!match) continue;
    const [, filePath, tsCode, message] = match;
    const relPath = filePath.replace(/\\/g, '/').trim();
    signatures.add(`${relPath}|${tsCode}|${message.trim()}`);
  }
  return [...signatures].sort();
}

function readBaseline() {
  if (!fs.existsSync(baselineFile)) return [];
  const raw = fs.readFileSync(baselineFile, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function writeBaseline(signatures) {
  if (!fs.existsSync(baselineDir)) fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(baselineFile, `${signatures.join('\n')}\n`, 'utf8');
}

const { output } = runTypecheck();
const current = extractErrorSignatures(output);

if (mode === 'update') {
  writeBaseline(current);
  console.log(`Updated baseline: ${path.relative(repoRoot, baselineFile)} (${current.length} signatures)`);
  process.exit(0);
}

const baseline = readBaseline();
if (baseline.length === 0) {
  console.error(`No baseline found at ${path.relative(repoRoot, baselineFile)}.`);
  console.error('Run: npm run typecheck:baseline:update');
  process.exit(1);
}

const baselineSet = new Set(baseline);
const newIssues = current.filter((sig) => !baselineSet.has(sig));

if (newIssues.length > 0) {
  console.error('Typecheck baseline regression detected (new TypeScript errors):');
  for (const issue of newIssues.slice(0, 30)) {
    console.error(`  + ${issue}`);
  }
  if (newIssues.length > 30) {
    console.error(`  ... and ${newIssues.length - 30} more`);
  }
  process.exit(1);
}

const resolvedCount = baseline.filter((sig) => !new Set(current).has(sig)).length;
console.log(
  `Typecheck baseline check passed. Current: ${current.length}, Baseline: ${baseline.length}, Resolved: ${resolvedCount}.`,
);
process.exit(0);
