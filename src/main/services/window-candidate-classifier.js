const CHROMIUM_TOPLEVEL_CLASSES = ['chrome_widgetwin_1'];
const CHROMIUM_NONPRIMARY_CLASSES = ['chrome_widgetwin_0'];

const CHROMIUM_FAMILY_PLACEMENT_KEYS = new Set(['chrome', 'msedge', 'brave', 'vivaldi', 'opera', 'arc']);

const isChromiumFamilyProcessKey = (key) => (
  CHROMIUM_FAMILY_PLACEMENT_KEYS.has(String(key || '').trim().toLowerCase().replace(/\.exe$/i, ''))
);

const isChromiumTopLevelWindowRow = (row) => {
  const cn = String(row?.className || '').toLowerCase();
  return CHROMIUM_TOPLEVEL_CLASSES.some((c) => cn.includes(c));
};

const isChromiumNonPrimaryWindowRow = (row) => {
  const cn = String(row?.className || '').toLowerCase();
  return CHROMIUM_NONPRIMARY_CLASSES.some((c) => cn.includes(c));
};

const isLikelyAuxiliaryWindowClass = (className) => {
  const safeClassName = String(className || '').trim().toLowerCase();
  if (!safeClassName) return false;
  return (
    safeClassName.includes('trayiconmessagewindow')
    || safeClassName.includes('screenchangeobserverwindow')
    || safeClassName.includes('notifyicon')
    || safeClassName.includes('tooltip')
    || safeClassName.includes('toast')
  );
};

const scoreWindowCandidate = (row, options = {}) => {
  const chromiumHint = String(options.chromiumProcessHint || '').toLowerCase();
  const isChromiumFamily = isChromiumFamilyProcessKey(chromiumHint);
  const className = String(row?.className || '').toLowerCase();
  const titleLength = Number(row?.titleLength || 0);
  const area = Number(row?.area || 0);
  const w = Number(row?.width || 0);
  const h = Number(row?.height || 0);
  let score = 0;

  if (row?.enabled) score += 1_000_000_000;
  if (!row?.isMinimized) score += 350_000_000;
  if (!row?.hung) score += 250_000_000;
  if (!row?.tool) score += 100_000_000;
  if (!row?.cloaked) score += 50_000_000;
  if (titleLength > 0) score += 5_000_000;

  if (className.includes('renderwidgethosthwnd')) score -= 150_000_000;
  if (className.includes('intermediate d3d window')) score -= 120_000_000;

  if (isChromiumFamily) {
    if (CHROMIUM_TOPLEVEL_CLASSES.some((c) => className.includes(c))) {
      score += 220_000_000;
    }
    if (CHROMIUM_NONPRIMARY_CLASSES.some((c) => className.includes(c))) {
      score -= 320_000_000;
    }
    if (w > 0 && h > 0 && w < 420 && h > 360) {
      score -= 450_000_000;
    }
  }

  return score + area;
};

module.exports = {
  CHROMIUM_FAMILY_PLACEMENT_KEYS,
  isChromiumFamilyProcessKey,
  isChromiumTopLevelWindowRow,
  isChromiumNonPrimaryWindowRow,
  isLikelyAuxiliaryWindowClass,
  scoreWindowCandidate,
};
