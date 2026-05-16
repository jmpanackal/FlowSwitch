import type { LaunchAction } from "../hooks/useLaunchFeedback";

function normalizeUrlKey(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return s.toLowerCase();
  }
}

function urlMatchKeys(raw: string): string[] {
  const full = normalizeUrlKey(raw);
  if (!full) return [];
  const keys = new Set([full]);
  try {
    const host = new URL(raw).hostname.trim().toLowerCase();
    if (host) keys.add(`host:${host}`);
  } catch {
    // ignore non-URL strings
  }
  return Array.from(keys);
}

function appInstanceIdFromAppAction(app: LaunchAction): string | null {
  const id = String(app.id || "").trim();
  if (!id.startsWith("app:")) return null;
  const key = id.slice(4).trim();
  return key || null;
}

/**
 * Reorders timeline actions for display: browser tab rows that belong to an app (linked URLs in
 * that app's `contentItems`) appear immediately after that app. Unmatched tabs stay at the end
 * (legacy profile tabs, etc.). Execution order in main is unchanged; this is UI-only.
 *
 * When tab actions include `hostAppInstanceId` from main, grouping uses that (correct per-browser
 * ownership). Otherwise falls back to URL / hostname overlap with that app's link `contentItems`.
 */
export function orderLaunchActionsForProgressDisplay(
  actions: LaunchAction[] | null | undefined,
): LaunchAction[] {
  if (!Array.isArray(actions) || actions.length === 0) return [];
  const tabs: LaunchAction[] = [];
  const rest: LaunchAction[] = [];
  for (const a of actions) {
    if (a.kind === "tab") tabs.push(a);
    else rest.push(a);
  }
  if (tabs.length === 0) return [...actions];

  const unmatchedTabs = [...tabs];
  const out: LaunchAction[] = [];
  for (const a of rest) {
    out.push(a);
    if (a.kind !== "app") continue;
    const appKey = appInstanceIdFromAppAction(a);
    const linkKeys = new Set<string>();
    for (const c of a.contentItems ?? []) {
      if (String(c?.type || "").toLowerCase() !== "link") continue;
      for (const k of urlMatchKeys(String(c.path || ""))) linkKeys.add(k);
    }
    const matched: LaunchAction[] = [];
    const still: LaunchAction[] = [];
    for (const t of unmatchedTabs) {
      const hostIid = String(t.hostAppInstanceId || "").trim();
      let isMatch = false;
      if (hostIid && appKey) {
        isMatch = hostIid === appKey;
      } else if (linkKeys.size > 0) {
        const tabKeys = urlMatchKeys(String(t.browserTabUrl || ""));
        isMatch = tabKeys.some((k) => linkKeys.has(k));
      }
      if (isMatch) matched.push(t);
      else still.push(t);
    }
    unmatchedTabs.length = 0;
    unmatchedTabs.push(...still);
    out.push(...matched);
  }
  out.push(...unmatchedTabs);
  return out;
}

/**
 * Tabs that `orderLaunchActionsForProgressDisplay` placed immediately after this app (linked
 * content targets for that browser).
 */
export function collectLinkedTabsAfterApp(
  app: LaunchAction,
  ordered: LaunchAction[],
): LaunchAction[] {
  const idx = ordered.findIndex((a) => a.id === app.id);
  if (idx < 0) return [];
  const out: LaunchAction[] = [];
  for (let j = idx + 1; j < ordered.length; j += 1) {
    if (ordered[j].kind !== "tab") break;
    out.push(ordered[j]);
  }
  return out;
}

export function findOwningAppForTabAction(
  tab: LaunchAction,
  ordered: LaunchAction[],
): LaunchAction | null {
  if (tab.kind !== "tab") return null;
  const hostIid = String(tab.hostAppInstanceId || "").trim();
  if (hostIid) {
    const direct = ordered.find(
      (a) => a.kind === "app" && appInstanceIdFromAppAction(a) === hostIid,
    );
    if (direct) return direct;
  }
  const idx = ordered.findIndex((a) => a.id === tab.id);
  if (idx <= 0) return null;
  const tabKeys = urlMatchKeys(String(tab.browserTabUrl || ""));
  if (!tabKeys.length) return null;
  for (let i = idx - 1; i >= 0; i -= 1) {
    const a = ordered[i];
    if (a.kind !== "app") continue;
    const linkKeys = new Set<string>();
    for (const c of a.contentItems ?? []) {
      if (String(c?.type || "").toLowerCase() !== "link") continue;
      for (const k of urlMatchKeys(String(c.path || ""))) linkKeys.add(k);
    }
    if (tabKeys.some((k) => linkKeys.has(k))) return a;
  }
  return null;
}

export function shouldSkipBucketActionForNestedTabDisplay(
  action: LaunchAction,
  ordered: LaunchAction[],
): boolean {
  if (action.kind !== "tab") return false;
  return findOwningAppForTabAction(action, ordered) != null;
}

export function resolveActionLeadForProgressCard(
  action: LaunchAction,
  ordered: LaunchAction[],
): {
  primary: LaunchAction;
  linkedTabs: LaunchAction[];
  emphasisTabId: string | null;
} {
  if (action.kind === "tab") {
    const owner = findOwningAppForTabAction(action, ordered);
    if (owner) {
      return {
        primary: owner,
        linkedTabs: collectLinkedTabsAfterApp(owner, ordered),
        emphasisTabId: action.id,
      };
    }
    return { primary: action, linkedTabs: [], emphasisTabId: action.id };
  }
  const linkedTabs = collectLinkedTabsAfterApp(action, ordered);
  const runningTab = linkedTabs.find((t) => t.state === "running");
  return {
    primary: action,
    linkedTabs,
    emphasisTabId: runningTab?.id ?? null,
  };
}
