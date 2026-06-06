const { getRunningWindowProcesses } = require('./windows-process-service');
const { isChromiumFamilyProcessKey } = require('./window-candidate-classifier');

/**
 * Schema / algorithm generation for companion process-hint expansion.
 * Bump when `computeCompanionHintsFromProcessRows` matching rules or exports change
 * so `launch-latest.jsonl` can be correlated without relying on app semver.
 */
const PROCESS_HINTS_VERSION = '1.3.0';

/**
 * Static mapping for UWP/MSIX apps whose runtime process name differs from the
 * executable shim basename that `getPlacementProcessKey` derives.
 * Key = shim basename (lowercase, no ext), Value = known runtime process names.
 */
const UWP_PROCESS_NAME_ALIASES = new Map([
  /** Shim basename `mediaplayer` vs packaged `Microsoft.Media.Player.exe` runtime image name. */
  /** Packaged "Media Player" often runs as `Music.UI` under `Microsoft.ZuneMusic` (WindowsApps). */
  ['mediaplayer', ['microsoft.media.player', 'music.ui', 'applicationframehost']],
  ['zunevideo', ['video.ui']],
  ['zunemusic', ['music.ui', 'microsoft.media.player', 'applicationframehost']],
  ['immersivecontrolpanel', ['systemsettings', 'applicationframehost']],
  ['systemsettings', ['immersivecontrolpanel', 'applicationframehost']],
  ['msteams', ['ms-teams']],
  ['windowsterminal', ['windowsterminal']],
]);

/**
 * Process names to scan with `Get-Process` / window enumeration for a placement hint basename.
 * Includes static UWP/MSIX aliases so pre-launch snapshots see already-running packaged apps.
 *
 * @param {string} baseProcessHintLc
 * @returns {string[]}
 */
const getProcessScanNames = (baseProcessHintLc) => {
  const base = String(baseProcessHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  if (!base) return [];
  const out = [];
  const push = (n) => {
    const s = String(n || '').trim().toLowerCase().replace(/\.exe$/i, '');
    if (s && !out.includes(s)) out.push(s);
  };
  push(base);
  const aliases = UWP_PROCESS_NAME_ALIASES.get(base);
  if (aliases) for (const a of aliases) push(a);
  return out;
};

/**
 * Expands a base process hint using running top-level window processes.
 * Guards against substring false positives (e.g. "vival" matching Chromium "vivaldi")
 * that would pull unrelated browser HWNDs into placement fallbacks.
 *
 * @param {string} baseProcessHintLc
 * @param {Array<{ name?: string }>} processRows
 * @returns {string[]}
 */
const computeCompanionHintsFromProcessRows = (baseProcessHintLc, processRows) => {
  const base = String(baseProcessHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  if (!base) return [];
  const hints = new Set([base]);
  const uwpAliases = UWP_PROCESS_NAME_ALIASES.get(base);
  if (uwpAliases) {
    for (const alias of uwpAliases) hints.add(alias);
  }
  const minimumMatchLength = Math.max(4, Math.min(10, base.length));
  for (const row of processRows) {
    const name = String(row?.name || '').trim().toLowerCase().replace(/\.exe$/i, '');
    if (!name || name === base) continue;
    const baseChromium = isChromiumFamilyProcessKey(base);
    const nameChromium = isChromiumFamilyProcessKey(name);
    // If the running process is a listed Chromium browser, only pair it with the base hint
    // when the base is also Chromium-family. Otherwise `vivaldi`.startsWith(`vival`) and
    // similar prefix/substring hits pull the wrong HWND into placement.
    const chromiumSafe = (!nameChromium || baseChromium);
    const related = (
      (name.startsWith(base) || base.startsWith(name)) && chromiumSafe
    ) || (
      base.length >= minimumMatchLength
      && name.includes(base)
      && chromiumSafe
    );
    if (related) hints.add(name);
  }
  return Array.from(hints);
};

const buildCompanionProcessHints = async ({
  baseProcessHintLc,
  diagnostics = null,
  diagnosticsContext = {},
}) => {
  const base = String(baseProcessHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  if (!base) return [];
  let processRows = [];
  try {
    processRows = await getRunningWindowProcesses();
  } catch {
    processRows = [];
  }
  const result = computeCompanionHintsFromProcessRows(base, processRows);
  if (diagnostics && result.length > 1) {
    diagnostics.decision({
      ...diagnosticsContext,
      strategy: 'process-hint-expansion',
      reason: 'companion-hints-discovered',
      processHintsVersion: PROCESS_HINTS_VERSION,
      baseProcessHintLc: base,
      processHints: result,
    });
  }
  return result;
};

module.exports = {
  PROCESS_HINTS_VERSION,
  buildCompanionProcessHints,
  computeCompanionHintsFromProcessRows,
  getProcessScanNames,
};
