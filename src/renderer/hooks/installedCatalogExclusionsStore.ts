const EXCLUDED_KEY = "flowswitch.installedCatalogExcludedKeys";
const TAB_KEY = "flowswitch.installedCatalogListTab";
/** Legacy: showExcluded true meant “see hidden rows”; map once to `hidden` tab. */
const LEGACY_SHOW_KEY = "flowswitch.installedCatalogShowExcluded";

export type CatalogListTab = "available" | "hidden";

export type CatalogExclusionsSnapshot = {
  readonly excludedKeys: readonly string[];
  readonly listTab: CatalogListTab;
};

const EMPTY_SNAP: CatalogExclusionsSnapshot = Object.freeze({
  excludedKeys: Object.freeze([]) as readonly string[],
  listTab: "available",
});

function loadExcludedFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EXCLUDED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

function loadListTabFromStorage(): CatalogListTab {
  if (typeof window === "undefined") return "available";
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "hidden" || v === "available") return v;
    if (localStorage.getItem(LEGACY_SHOW_KEY) === "1") return "hidden";
    return "available";
  } catch {
    return "available";
  }
}

function sortUniqueKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort((a, b) => a.localeCompare(b));
}

function snapEqual(a: CatalogExclusionsSnapshot, b: CatalogExclusionsSnapshot): boolean {
  if (a.listTab !== b.listTab) return false;
  if (a.excludedKeys.length !== b.excludedKeys.length) return false;
  for (let i = 0; i < a.excludedKeys.length; i += 1) {
    if (a.excludedKeys[i] !== b.excludedKeys[i]) return false;
  }
  return true;
}

function freezeSnapshot(keys: string[], tab: CatalogListTab): CatalogExclusionsSnapshot {
  const sorted = sortUniqueKeys(keys);
  return Object.freeze({
    excludedKeys: Object.freeze(sorted) as readonly string[],
    listTab: tab,
  });
}

let mutableExcluded = sortUniqueKeys(loadExcludedFromStorage());
let mutableListTab: CatalogListTab = loadListTabFromStorage();
if (mutableExcluded.length === 0 && mutableListTab === "hidden") {
  mutableListTab = "available";
}
let cachedSnap: CatalogExclusionsSnapshot = freezeSnapshot(
  mutableExcluded,
  mutableListTab,
);

const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EXCLUDED_KEY, JSON.stringify([...cachedSnap.excludedKeys]));
    localStorage.setItem(TAB_KEY, cachedSnap.listTab);
    localStorage.removeItem(LEGACY_SHOW_KEY);
  } catch {
    // private mode / quota
  }
}

function publishFromMutable() {
  const next = freezeSnapshot(mutableExcluded, mutableListTab);
  if (snapEqual(cachedSnap, next)) return;
  cachedSnap = next;
  persist();
  listeners.forEach((l) => l());
}

export function subscribeCatalogExclusions(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function getCatalogExclusionsSnapshot(): CatalogExclusionsSnapshot {
  return cachedSnap;
}

export function getServerCatalogExclusionsSnapshot(): CatalogExclusionsSnapshot {
  return EMPTY_SNAP;
}

export function catalogExcludeKey(key: string) {
  if (!key) return;
  mutableExcluded = sortUniqueKeys([...mutableExcluded, key]);
  publishFromMutable();
}

export function catalogIncludeKey(key: string) {
  mutableExcluded = mutableExcluded.filter((k) => k !== key);
  publishFromMutable();
}

export function catalogSetListTab(tab: CatalogListTab) {
  mutableListTab = tab;
  publishFromMutable();
}
