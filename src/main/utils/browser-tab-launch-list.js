'use strict';

/**
 * @param {unknown} profile
 * @returns {'by_url_and_app' | 'each_saved_row'}
 */
const normalizeBrowserTabLaunchDedupe = (profile) => {
  const v = String(profile?.browserTabLaunchDedupe || '').trim();
  if (v === 'each_saved_row') return 'each_saved_row';
  return 'by_url_and_app';
};

/**
 * Ordered browser tab entries for launch + weight (must match `profile-launch-runner.js`).
 * @param {object} profile
 * @param {{ browserUrls?: string[] }} legacyLaunchData
 * @param {(raw: unknown) => string} normalizeSafeUrl
 * @returns {{ key: string, url: string, label: string, browser: string, appInstanceId: string }[]}
 */
const buildBrowserTabLaunchList = (profile, legacyLaunchData, normalizeSafeUrl) => {
  const dedupeMode = normalizeBrowserTabLaunchDedupe(profile);
  const tabUrlList = [];
  const tabUrlSeen = new Set();
  const pushTabEntry = (raw, meta = {}) => {
    const u = normalizeSafeUrl(raw);
    if (!u) return;
    const browser = String(meta.browser || '').trim();
    const appInstanceId = String(meta.appInstanceId || '').trim();
    const rowSeg = dedupeMode === 'each_saved_row'
      ? `\0row:${String(meta.rowIndex ?? '')}\0id:${String(meta.tabId || '').trim()}`
      : '';
    const key = `${u}\0${browser.toLowerCase()}\0${appInstanceId}${rowSeg}`;
    if (tabUrlSeen.has(key)) return;
    tabUrlSeen.add(key);
    let label = u;
    try {
      label = new URL(u).hostname || u;
    } catch {
      label = u;
    }
    tabUrlList.push({ key, url: u, label, browser, appInstanceId });
  };
  const tabs = Array.isArray(profile?.browserTabs) ? profile.browserTabs : [];
  for (let i = 0; i < tabs.length; i += 1) {
    const tab = tabs[i];
    pushTabEntry(tab?.url, {
      browser: tab?.browser,
      appInstanceId: tab?.appInstanceId,
      rowIndex: i,
      tabId: tab?.id,
    });
  }
  const legacyUrls = legacyLaunchData?.browserUrls || [];
  for (let li = 0; li < legacyUrls.length; li += 1) {
    pushTabEntry(legacyUrls[li], { rowIndex: `legacy-${li}` });
  }
  return tabUrlList;
};

module.exports = {
  normalizeBrowserTabLaunchDedupe,
  buildBrowserTabLaunchList,
};
