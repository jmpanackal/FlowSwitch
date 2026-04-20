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
   * When true, the first time this hook runs it clears the renderer + main installed-app caches
   * so the sidebar does not keep an empty or pre-fix catalog across hot reloads.
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

export function useInstalledApps(
  options: UseInstalledAppsOptions = {},
) {
  const {
    allowFallbackWithoutElectron = false,
    fallbackApps = [],
    installedListVersion = 0,
    refreshCatalogOnMount = false,
  } = options;
  const hasElectronBridge = !!window.electron && typeof window.electron.getInstalledApps === 'function';
  const [apps, setApps] = useState<InstalledApp[]>(
    hasElectronBridge ? [] : (allowFallbackWithoutElectron ? fallbackApps : []),
  );
  const prevInstalledListVersion = useRef<number | undefined>(undefined);
  const refreshOnMountDone = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (!hasElectronBridge) {
      setApps(allowFallbackWithoutElectron ? fallbackApps : []);
      return () => {
        cancelled = true;
      };
    }

    if (refreshCatalogOnMount && !refreshOnMountDone.current) {
      refreshOnMountDone.current = true;
      invalidateInstalledAppsCache();
    }

    const v = installedListVersion ?? 0;
    const versionChanged = prevInstalledListVersion.current !== v;
    prevInstalledListVersion.current = v;
    const forceRefresh = versionChanged && v > 0;

    fetchInstalledAppsShared(forceRefresh)
      .then((normalized) => {
        if (cancelled) return;
        setApps(normalized);
      })
      .catch(() => {
        if (!cancelled) setApps([]);
      });

    return () => {
      cancelled = true;
    };
  }, [allowFallbackWithoutElectron, fallbackApps, hasElectronBridge, installedListVersion, refreshCatalogOnMount]);

  return useMemo(() => apps, [apps]);
}
