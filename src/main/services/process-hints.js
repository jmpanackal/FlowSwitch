const { getRunningWindowProcesses } = require('./windows-process-service');
const { isChromiumFamilyProcessKey } = require('./window-candidate-classifier');

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
      baseProcessHintLc: base,
      processHints: result,
    });
  }
  return result;
};

module.exports = {
  buildCompanionProcessHints,
  computeCompanionHintsFromProcessRows,
};
