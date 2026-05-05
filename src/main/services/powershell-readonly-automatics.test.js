/**
 * Regression: PowerShell scripts embedded in main-process services must not
 * assign to read-only / Constant automatic variables. The original bug was
 * `[uint32]$pid = 0; [void]GetWindowThreadProcessId($h, [ref]$pid)`.
 * `$pid` is `Constant + AllScope` in PowerShell, so the [ref] call throws
 * "Cannot overwrite variable PID because it is read-only or constant.".
 * The exception is silently swallowed by surrounding catch blocks, dropping
 * every Explorer window the EnumWindows / Shell COM passes would have found.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Variables that PowerShell exposes as `Constant + AllScope` (or otherwise
// rejects writes to). Assigning to or taking [ref] of them throws at runtime.
// `$_` is automatic but block-scoped; tracked separately.
const POWERSHELL_READONLY_AUTOMATIC_VARIABLE_NAMES = ['pid', 'home', 'host', 'shellid'];

const SOURCE_FILES_TO_SCAN = [
  path.resolve(__dirname, 'windows-process-service.js'),
  path.resolve(__dirname, 'explorer-window-tab-paths.js'),
  path.resolve(__dirname, 'window-placement-runtime.js'),
];

const stripJsLineComments = (src) => src
  .split('\n')
  .map((line) => {
    const idx = line.indexOf('//');
    return idx >= 0 ? line.slice(0, idx) : line;
  })
  .join('\n');

const stripPowerShellComments = (src) => src
  .split('\n')
  .map((line) => {
    const idx = line.indexOf('#');
    return idx >= 0 ? line.slice(0, idx) : line;
  })
  .join('\n');

const buildOffenderRegexForVariable = (varName) => {
  // Matches:
  //   [uint32]$pid = ...
  //   $pid = ...
  //   [ref]$pid
  // Comparisons like `$pid -eq …` or `[int]$pid` (cast read) are NOT matched.
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:\\[[A-Za-z0-9_.]+\\]\\s*\\$${escaped}\\s*=)`
    + `|(?:^|[^A-Za-z0-9_.])\\$${escaped}\\s*=[^=]`
    + `|\\[ref\\]\\s*\\$${escaped}\\b`,
    'mi',
  );
};

for (const sourcePath of SOURCE_FILES_TO_SCAN) {
  test(`${path.basename(sourcePath)} does not assign to PowerShell read-only automatics`, () => {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    const cleaned = stripPowerShellComments(stripJsLineComments(raw));
    for (const varName of POWERSHELL_READONLY_AUTOMATIC_VARIABLE_NAMES) {
      const offender = buildOffenderRegexForVariable(varName);
      const match = cleaned.match(offender);
      assert.equal(
        match,
        null,
        `Found assignment to PowerShell read-only automatic $${varName} in ${path.basename(sourcePath)}: `
        + `"${match ? match[0] : ''}". Rename to e.g. $processId. `
        + 'PowerShell silently swallows this via try/catch and the script behaves '
        + 'as if no Explorer/window rows were found.',
      );
    }
  });
}
