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

/**
 * Reorders timeline actions for display: browser tab rows that belong to an app (linked URLs in
 * that app's `contentItems`) appear immediately after that app. Unmatched tabs stay at the end
 * (legacy profile tabs, etc.). Execution order in main is unchanged; this is UI-only.
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
    const linkKeys = new Set<string>();
    for (const c of a.contentItems ?? []) {
      if (String(c?.type || "").toLowerCase() !== "link") continue;
      for (const k of urlMatchKeys(String(c.path || ""))) linkKeys.add(k);
    }
    if (linkKeys.size === 0) continue;
    const matched: LaunchAction[] = [];
    const still: LaunchAction[] = [];
    for (const t of unmatchedTabs) {
      const tabKeys = urlMatchKeys(String(t.browserTabUrl || ""));
      const isMatch = tabKeys.some((k) => linkKeys.has(k));
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
