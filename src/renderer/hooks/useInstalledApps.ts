import { useEffect, useMemo, useRef, useState } from 'react';

export type InstalledApp = {
  name: string;
  iconPath: string | null;
  executablePath?: string | null;
  shortcutPath?: string | null;
  launchUrl?: string | null;
};

type UseInstalledAppsOptions = {
  /**
   * When false, do not trigger a catalog fetch (keeps warm in-memory cache if present).
   * Use for modals that only need the list in a subset of UI states.
   */
  enabled?: boolean;
  /**
   * Show fallback apps only when Electron bridge is unavailable
   * (e.g. running renderer standalone in browser).
   */
  allowFallbackWithoutElectron?: boolean;
  fallbackApps?: InstalledApp[];
  /**
   * Increment when the catalog must be refetched from main (e.g. add-app modal opened).
   * Values > 0 force a bypass of the TTL cache for that fetch.
   */
  installedListVersion?: number;
  /**
   * @deprecated No longer clears caches on mount (that broke tab-switch performance and could
   * wipe a prefetched catalog). Use `installedListVersion` or `invalidateInstalledAppsCache()`
   * when you need a forced refresh.
   */
  refreshCatalogOnMount?: boolean;
};

/**
 * In-memory catalog TTL. Installed-app discovery + Shell icons are heavy; keep the list warm
 * for a while so switching sidebar tabs does not re-hit main. Use `installedListVersion` from
 * Add App (or call `invalidateInstalledAppsCache`) when you need a fresh scan after changes.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedInstalledApps: InstalledApp[] | null = null;
let cachedAt = 0;
let inFlightRequest: Promise<InstalledApp[]> | null = null;
/** Next main-process fetch should bypass the 10-minute installed-apps catalog cache. */
let forceMainCatalogOnce = false;

function readWarmInstalledAppsCache(ttlMs: number): InstalledApp[] | null {
  const now = Date.now();
  if (cachedInstalledApps && (now - cachedAt) < ttlMs) {
    return cachedInstalledApps;
  }
  return null;
}

function normalizeApps(installedApps: {
  name: string;
  iconPath: string | null;
  executablePath?: string | null;
  shortcutPath?: string | null;
  launchUrl?: string | null;
}[]): InstalledApp[] {
  return installedApps
    .map((app) => ({
      name: app?.name,
      iconPath: app?.iconPath ?? null,
      executablePath: app?.executablePath ?? null,
      shortcutPath: app?.shortcutPath ?? null,
      launchUrl: app?.launchUrl ?? null,
    }))
    .filter((app) => typeof app.name === 'string' && app.name.trim().length > 0)
    .map((app) => ({
      ...app,
      name: String(app.name).trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function fetchInstalledAppsShared(force = false): Promise<InstalledApp[]> {
  const now = Date.now();
  if (!force && cachedInstalledApps && (now - cachedAt) < CACHE_TTL_MS) {
    return Promise.resolve(cachedInstalledApps);
  }
  if (inFlightRequest && !force) return inFlightRequest;
  if (!window.electron || typeof window.electron.getInstalledApps !== 'function') {
    return Promise.resolve([]);
  }

  const mainForce = Boolean(force || forceMainCatalogOnce);
  if (forceMainCatalogOnce) {
    forceMainCatalogOnce = false;
  }

  inFlightRequest = window.electron.getInstalledApps(mainForce ? { force: true } : {})
    .then((installedApps) => {
      const normalized = Array.isArray(installedApps) ? normalizeApps(installedApps) : [];
      cachedInstalledApps = normalized;
      cachedAt = Date.now();
      return normalized;
    })
    .finally(() => {
      inFlightRequest = null;
    });

  return inFlightRequest;
}

/** Clears the in-memory list so the next fetch hits main again (e.g. after icon pipeline changes). */
export function invalidateInstalledAppsCache() {
  cachedInstalledApps = null;
  cachedAt = 0;
  inFlightRequest = null;
  forceMainCatalogOnce = true;
}

/**
 * Warm the installed-apps catalog in the background (renderer module cache + main IPC).
 * Safe to call multiple times; concurrent calls share one in-flight request.
 */
export function prefetchInstalledAppsCatalog() {
  if (typeof window === 'undefined') return;
  if (!window.electron || typeof window.electron.getInstalledApps !== 'function') return;
  void fetchInstalledAppsShared(false);
}

export type UseInstalledAppsResult = {
  apps: InstalledApp[];
  /** True until the first catalog payload is ready (or a forced refresh completes). */
  isLoading: boolean;
};

export function useInstalledApps(
  options: UseInstalledAppsOptions = {},
): UseInstalledAppsResult {
  const {
    enabled = true,
    allowFallbackWithoutElectron = false,
    fallbackApps = [],
    installedListVersion = 0,
  } = options;
  const hasElectronBridge = !!window.electron && typeof window.electron.getInstalledApps === 'function';
  const [apps, setApps] = useState<InstalledApp[]>(() => {
    if (typeof window === 'undefined') {
      return allowFallbackWithoutElectron ? fallbackApps : [];
    }
    const has = !!window.electron && typeof window.electron.getInstalledApps === 'function';
    if (!has) return allowFallbackWithoutElectron ? fallbackApps : [];
    const warm = readWarmInstalledAppsCache(CACHE_TTL_MS);
    return warm ?? [];
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === 'undefined') return false;
    const has = !!window.electron && typeof window.electron.getInstalledApps === 'function';
    if (!has) return false;
    return readWarmInstalledAppsCache(CACHE_TTL_MS) === null;
  });
  const prevInstalledListVersion = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    if (!hasElectronBridge) {
      setApps(allowFallbackWithoutElectron ? fallbackApps : []);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (!enabled) {
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const v = installedListVersion ?? 0;
    const versionChanged = prevInstalledListVersion.current !== v;
    prevInstalledListVersion.current = v;
    const forceRefresh = versionChanged && v > 0;

    if (forceRefresh) {
      setIsLoading(true);
    }

    fetchInstalledAppsShared(forceRefresh)
      .then((normalized) => {
        if (cancelled) return;
        setApps(normalized);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setApps([]);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowFallbackWithoutElectron, enabled, fallbackApps, hasElectronBridge, installedListVersion]);

  return useMemo(() => ({ apps, isLoading }), [apps, isLoading]);
}
