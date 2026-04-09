/**
 * Selection for monitor tiles must follow the app instance, not just list index,
 * so highlights stay correct after moves/reorders.
 */
export function matchesMonitorAppSelection(
  selectedApp: unknown,
  monitorId: string,
  appIndex: number,
  app: { instanceId?: string | null },
): boolean {
  if (!selectedApp || typeof selectedApp !== "object") return false;
  const s = selectedApp as {
    source?: string;
    monitorId?: string;
    type?: string;
    appIndex?: number;
    data?: { instanceId?: string | null };
  };
  if (s.source !== "monitor" || s.monitorId !== monitorId) return false;
  if (s.type !== "app" && s.type !== "browser") return false;

  const selId = s.data?.instanceId;
  const appId = app.instanceId;
  if (
    selId != null &&
    selId !== "" &&
    appId != null &&
    appId !== ""
  ) {
    return selId === appId;
  }
  return Number(s.appIndex) === Number(appIndex);
}

export function matchesMinimizedAppSelection(
  selectedApp: unknown,
  appIndex: number,
  app: { instanceId?: string | null },
): boolean {
  if (!selectedApp || typeof selectedApp !== "object") return false;
  const s = selectedApp as {
    source?: string;
    type?: string;
    appIndex?: number;
    data?: { instanceId?: string | null };
  };
  if (s.source !== "minimized") return false;
  if (s.type !== "app" && s.type !== "browser") return false;

  const selId = s.data?.instanceId;
  const appId = app.instanceId;
  if (
    selId != null &&
    selId !== "" &&
    appId != null &&
    appId !== ""
  ) {
    return selId === appId;
  }
  return Number(s.appIndex) === Number(appIndex);
}
