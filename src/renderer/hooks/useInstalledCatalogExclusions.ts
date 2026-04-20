import { useMemo, useSyncExternalStore } from "react";
import {
  catalogExcludeKey,
  catalogIncludeKey,
  catalogSetListTab,
  getCatalogExclusionsSnapshot,
  getServerCatalogExclusionsSnapshot,
  subscribeCatalogExclusions,
} from "./installedCatalogExclusionsStore";

export type { CatalogListTab } from "./installedCatalogExclusionsStore";

export function useInstalledCatalogExclusions() {
  const snap = useSyncExternalStore(
    subscribeCatalogExclusions,
    getCatalogExclusionsSnapshot,
    getServerCatalogExclusionsSnapshot,
  );

  return useMemo(() => {
    const excludedSet = new Set(snap.excludedKeys);
    return {
      excludedKeys: snap.excludedKeys,
      excludedSet,
      excludedCount: snap.excludedKeys.length,
      listTab: snap.listTab,
      setListTab: catalogSetListTab,
      exclude: catalogExcludeKey,
      include: catalogIncludeKey,
      isExcluded: (key: string) => excludedSet.has(key),
    };
  }, [snap]);
}
