const { getRunningWindowProcesses } = require('./windows-process-service');

const buildCompanionProcessHints = async ({
  baseProcessHintLc,
  diagnostics = null,
  diagnosticsContext = {},
}) => {
  const base = String(baseProcessHintLc || '').trim().toLowerCase().replace(/\.exe$/i, '');
  if (!base) return [];
  const hints = new Set([base]);
  let processRows = [];
  try {
    processRows = await getRunningWindowProcesses();
  } catch {
    processRows = [];
  }
  const minimumMatchLength = Math.max(4, Math.min(10, base.length));
  for (const row of processRows) {
    const name = String(row?.name || '').trim().toLowerCase().replace(/\.exe$/i, '');
    if (!name || name === base) continue;
    const related = (
      name.startsWith(base)
      || base.startsWith(name)
      || (base.length >= minimumMatchLength && name.includes(base))
    );
    if (related) hints.add(name);
  }
  const result = Array.from(hints);
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
};
