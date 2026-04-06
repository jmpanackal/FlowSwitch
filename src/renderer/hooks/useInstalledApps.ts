import { useEffect, useMemo, useState } from 'react';

export type InstalledApp = {
  name: string;
  iconPath: string | null;
  executablePath?: string | null;
};

type UseInstalledAppsOptions = {
  /**
   * Show fallback apps only when Electron bridge is unavailable
   * (e.g. running renderer standalone in browser).
   */
  allowFallbackWithoutElectron?: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedInstalledApps: InstalledApp[] | null = null;
let cachedAt = 0;
let inFlightRequest: Promise<InstalledApp[]> | null = null;

function normalizeApps(installedApps: { name: string; iconPath: string | null; executablePath?: string | null }[]): InstalledApp[] {
  return installedApps
    .map((app) => ({
      name: app?.name,
      iconPath: app?.iconPath ?? null,
      executablePath: app?.executablePath ?? null,
    }))
    .filter((app) => typeof app.name === 'string' && app.name.trim().length > 0)
    .map((app) => ({
      ...app,
      name: String(app.name).trim(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function fetchInstalledAppsShared(): Promise<InstalledApp[]> {
  const now = Date.now();
  if (cachedInstalledApps && (now - cachedAt) < CACHE_TTL_MS) {
    return Promise.resolve(cachedInstalledApps);
  }
  if (inFlightRequest) return inFlightRequest;
  if (!window.electron || typeof window.electron.getInstalledApps !== 'function') {
    return Promise.resolve([]);
  }

  inFlightRequest = window.electron.getInstalledApps()
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

export function useInstalledApps(
  fallbackApps: InstalledApp[],
  options: UseInstalledAppsOptions = {},
) {
  const { allowFallbackWithoutElectron = false } = options;
  const hasElectronBridge = !!window.electron && typeof window.electron.getInstalledApps === 'function';
  const [apps, setApps] = useState<InstalledApp[]>(
    hasElectronBridge ? [] : (allowFallbackWithoutElectron ? fallbackApps : []),
  );

  useEffect(() => {
    let cancelled = false;

    if (!hasElectronBridge) {
      setApps(allowFallbackWithoutElectron ? fallbackApps : []);
      return () => {
        cancelled = true;
      };
    }

    fetchInstalledAppsShared()
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
  }, [allowFallbackWithoutElectron, fallbackApps, hasElectronBridge]);

  return useMemo(() => apps, [apps]);
}
