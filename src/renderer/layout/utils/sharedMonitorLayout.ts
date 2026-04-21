import type { FlowProfile } from "../../../types/flow-profile";

type MonitorLike = {
  id: string;
  primary?: boolean;
  resolution?: string;
  orientation?: string;
  name?: string;
  systemName?: string | null;
  layoutPosition?: { x: number; y: number };
};

type ProfileMonitorsLike = {
  monitors?: MonitorLike[];
};

export type LayoutPositionMaps = {
  byId: Map<string, { x: number; y: number }>;
  byHardware: Map<string, { x: number; y: number }>;
};

const isFinitePair = (p: { x: number; y: number }) => (
  Number.isFinite(p.x) && Number.isFinite(p.y)
);

/**
 * Stable identity for a physical display across profiles that may use different
 * `monitor.id` strings (capture vs manual, schema drift, etc.).
 */
export function buildMonitorLayoutHardwareKey(m: {
  primary?: boolean;
  resolution?: string;
  orientation?: string;
  name?: string;
  systemName?: string | null;
}): string {
  return [
    m.primary ? "1" : "0",
    String(m.resolution ?? ""),
    String(m.orientation ?? ""),
    String(m.systemName ?? ""),
    String(m.name ?? ""),
  ].join("\u001f");
}

/** Canonical ordering so slot indices line up across profiles with the same desk. */
export function sortMonitorsForLayoutSync<T extends MonitorLike>(monitors: T[]): T[] {
  return [...monitors].sort((a, b) => {
    if (Boolean(a.primary) !== Boolean(b.primary)) return a.primary ? -1 : 1;
    const an = String(a.name || a.id);
    const bn = String(b.name || b.id);
    const c = an.localeCompare(bn);
    if (c !== 0) return c;
    const ar = String(a.resolution || "");
    const br = String(b.resolution || "");
    const c2 = ar.localeCompare(br);
    if (c2 !== 0) return c2;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function resolveSharedLayoutPositionForMonitor(
  monitor: MonitorLike,
  maps: LayoutPositionMaps,
): { x: number; y: number } | undefined {
  const byId = maps.byId.get(monitor.id);
  if (byId && isFinitePair(byId)) return byId;
  const hk = buildMonitorLayoutHardwareKey(monitor);
  const byH = maps.byHardware.get(hk);
  if (byH && isFinitePair(byH)) return byH;
  return undefined;
}

/**
 * Collect preview positions: first profile wins per `id`, then per hardware key.
 */
export function collectSharedLayoutPositionMaps(
  profiles: readonly ProfileMonitorsLike[],
): LayoutPositionMaps {
  const byId = new Map<string, { x: number; y: number }>();
  const byHardware = new Map<string, { x: number; y: number }>();

  for (const profile of profiles) {
    for (const m of profile.monitors || []) {
      if (!m?.id || !m.layoutPosition) continue;
      const pos = { x: m.layoutPosition.x, y: m.layoutPosition.y };
      if (!isFinitePair(pos)) continue;
      if (!byId.has(m.id)) byId.set(m.id, pos);
      const hk = buildMonitorLayoutHardwareKey(m);
      if (!byHardware.has(hk)) byHardware.set(hk, pos);
    }
  }
  return { byId, byHardware };
}

/** Apply saved positions to a monitor list (e.g. when creating a new profile). */
export function applySharedMonitorLayoutToMonitors<T extends MonitorLike>(
  monitors: T[],
  maps: LayoutPositionMaps,
): T[] {
  if (maps.byId.size === 0 && maps.byHardware.size === 0) return monitors;
  return monitors.map((monitor) => {
    const shared = resolveSharedLayoutPositionForMonitor(monitor, maps);
    if (!shared) return monitor;
    return { ...monitor, layoutPosition: shared };
  });
}

/**
 * Harmonize preview positions for every profile (id + hardware key).
 */
export function syncAllProfilesMonitorLayoutPositions(
  profiles: FlowProfile[],
): FlowProfile[] {
  if (profiles.length <= 1) return profiles;
  const maps = collectSharedLayoutPositionMaps(profiles);
  if (maps.byId.size === 0 && maps.byHardware.size === 0) return profiles;
  return profiles.map((profile) => ({
    ...profile,
    monitors: applySharedMonitorLayoutToMonitors(profile.monitors || [], maps),
  }));
}

/** True if any monitor preview `layoutPosition` differs between two profile lists. */
export function monitorLayoutPositionsDiffer(
  before: readonly FlowProfile[],
  after: readonly FlowProfile[],
): boolean {
  const sig = (ps: readonly FlowProfile[]) =>
    ps
      .map((p) =>
        (p.monitors || [])
          .map((m: MonitorLike) =>
            `${m.id}:${m.layoutPosition?.x ?? "n"}:${m.layoutPosition?.y ?? "n"}`,
          )
          .join("|"),
      )
      .join(";");
  return sig(before) !== sig(after);
}

export type MonitorPositionDragRow = {
  id: string;
  hardwareKey: string;
  slotIndex: number;
  layoutPosition: { x: number; y: number };
};

export type DragDerivedLayoutMaps = LayoutPositionMaps & {
  bySlot: Map<number, { x: number; y: number }>;
  slotCount: number;
};

export function layoutMapsFromDragRows(
  rows: readonly MonitorPositionDragRow[],
): DragDerivedLayoutMaps {
  const byId = new Map<string, { x: number; y: number }>();
  const byHardware = new Map<string, { x: number; y: number }>();
  const bySlot = new Map<number, { x: number; y: number }>();
  for (const row of rows) {
    byId.set(row.id, row.layoutPosition);
    byHardware.set(row.hardwareKey, row.layoutPosition);
    bySlot.set(row.slotIndex, row.layoutPosition);
  }
  return {
    byId,
    byHardware,
    bySlot,
    slotCount: rows.length,
  };
}

export function resolveLayoutPositionAfterDrag(
  monitor: MonitorLike,
  profileMonitors: readonly MonitorLike[],
  dragMaps: DragDerivedLayoutMaps,
): { x: number; y: number } | undefined {
  const fromId = dragMaps.byId.get(monitor.id);
  if (fromId && isFinitePair(fromId)) return fromId;
  const hk = buildMonitorLayoutHardwareKey(monitor);
  const fromHw = dragMaps.byHardware.get(hk);
  if (fromHw && isFinitePair(fromHw)) return fromHw;

  if (profileMonitors.length === dragMaps.slotCount && dragMaps.slotCount > 0) {
    const ordered = sortMonitorsForLayoutSync([...profileMonitors]);
    const idx = ordered.findIndex((m) => m.id === monitor.id);
    if (idx >= 0) {
      const fromSlot = dragMaps.bySlot.get(idx);
      if (fromSlot && isFinitePair(fromSlot)) return fromSlot;
    }
  }
  return undefined;
}
