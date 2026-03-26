import { useEffect, useMemo, useState } from 'react';

export type InstalledApp = {
  name: string;
  iconPath: string | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedInstalledApps: InstalledApp[] | null = null;
let cachedAt = 0;
let inFlightRequest: Promise<InstalledApp[]> | null = null;

function normalizeApps(installedApps: { name: string; iconPath: string | null }[]): InstalledApp[] {
  return installedApps
    .map((app) => ({
      name: app?.name,
      iconPath: app?.iconPath ?? null,
    }))
    .filter((app): app is InstalledApp => typeof app.name === 'string' && app.name.trim().length > 0)
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

export function useInstalledApps(fallbackApps: InstalledApp[]) {
  const [apps, setApps] = useState<InstalledApp[]>(fallbackApps);

  useEffect(() => {
    let cancelled = false;

    fetchInstalledAppsShared()
      .then((normalized) => {
        if (cancelled) return;
        setApps(normalized.length > 0 ? normalized : fallbackApps);
      })
      .catch(() => {
        if (!cancelled) setApps(fallbackApps);
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackApps]);

  return useMemo(() => apps, [apps]);
}
