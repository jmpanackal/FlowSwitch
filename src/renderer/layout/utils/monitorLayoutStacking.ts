import { getSnapZonesForMonitor } from "./monitorSnapZones";

/**
 * Geometry-derived "stacks": multiple monitor apps sharing the same snap zone.
 * Front = higher app index (later in array, typical DOM paint order).
 */

export type SnapZoneLike = {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export type AppLayoutLike = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

const DEFAULT_POS_TOL = 15;
const DEFAULT_SIZE_TOL = 15;

export function itemMatchesSnapZone(
  app: AppLayoutLike,
  zone: SnapZoneLike,
  positionTolerance = DEFAULT_POS_TOL,
  sizeTolerance = DEFAULT_SIZE_TOL,
): boolean {
  const positionMatch =
    Math.abs(app.position.x - zone.position.x) < positionTolerance &&
    Math.abs(app.position.y - zone.position.y) < positionTolerance;

  const sizeMatch =
    Math.abs(app.size.width - zone.size.width) < sizeTolerance &&
    Math.abs(app.size.height - zone.size.height) < sizeTolerance;

  return positionMatch && sizeMatch;
}

/** First matching zone in array order (same as legacy single-conflict scan). */
export function snapZoneForApp(
  app: AppLayoutLike,
  zones: SnapZoneLike[],
): SnapZoneLike | null {
  for (const zone of zones) {
    if (itemMatchesSnapZone(app, zone)) return zone;
  }
  return null;
}

/** Nearest zone center to a point (same idea as MonitorLayout.findClosestZone). */
export function findClosestSnapZone(
  zones: SnapZoneLike[],
  position: { x: number; y: number },
): SnapZoneLike | null {
  if (zones.length === 0) return null;
  let best: SnapZoneLike | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    const distance = Math.hypot(
      position.x - zone.position.x,
      position.y - zone.position.y,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      best = zone;
    }
  }
  return best;
}

/**
 * Count apps whose layout center is closest to `snapZone` among the given `zones` grid.
 * Use when strict rect match fails (e.g. incoming drag with prospective zone count).
 */
export function countAppsNearestSnapZone(
  apps: AppLayoutLike[],
  zones: SnapZoneLike[],
  snapZone: SnapZoneLike,
  excludeAppIndex?: number,
): number {
  let n = 0;
  for (let i = 0; i < apps.length; i++) {
    if (excludeAppIndex !== undefined && i === excludeAppIndex) continue;
    const nearest = findClosestSnapZone(zones, apps[i]!.position);
    if (nearest?.id === snapZone.id) n += 1;
  }
  return n;
}

export type ZoneStackCluster = {
  zone: SnapZoneLike;
  /** Sorted ascending (back → front); front is last element. */
  indices: number[];
};

/**
 * Build stack clusters (only groups with 2+ apps in the same zone).
 * Apps not in any zone are ignored for stacking (solo rendering elsewhere).
 *
 * Used by drop-target occupancy queries (hover preview, drag-end merge
 * detection). For **rendering** stacks use `buildRectCoincidentStackClusters`
 * instead — it is independent of the current snap-zone grid, which matters
 * for dynamic layouts where the grid can recompute while stacked apps still
 * sit at their old rect.
 */
export function buildStackClusters(
  apps: AppLayoutLike[],
  zones: SnapZoneLike[],
): ZoneStackCluster[] {
  const zoneIdToIndices = new Map<string, number[]>();

  for (let i = 0; i < apps.length; i++) {
    const zone = snapZoneForApp(apps[i]!, zones);
    if (!zone) continue;
    const list = zoneIdToIndices.get(zone.id) ?? [];
    list.push(i);
    zoneIdToIndices.set(zone.id, list);
  }

  const clusters: ZoneStackCluster[] = [];
  for (const zone of zones) {
    const indices = zoneIdToIndices.get(zone.id);
    if (!indices || indices.length < 2) continue;
    indices.sort((a, b) => a - b);
    clusters.push({ zone, indices });
  }
  return clusters;
}

/**
 * Build stack clusters from **rect coincidence alone** — apps with identical
 * position+size form a stack regardless of the current snap-zone grid. This
 * keeps stacking stable across dynamic layout recomputes (adding an app,
 * resizing the monitor, re-snapping). The synthesized zone for each cluster
 * is the shared app rect, so `MonitorAppStackCluster` renders at the exact
 * location the stacked apps occupy today.
 */
export function buildRectCoincidentStackClusters<T extends AppLayoutLike>(
  apps: T[],
): ZoneStackCluster[] {
  const groups = buildGeometryCoincidentAppClusters(apps);
  const clusters: ZoneStackCluster[] = [];
  for (const indices of groups) {
    const first = apps[indices[0]!];
    if (!first) continue;
    clusters.push({
      zone: {
        id: `rect-${first.position.x.toFixed(2)}-${first.position.y.toFixed(2)}-${first.size.width.toFixed(2)}-${first.size.height.toFixed(2)}`,
        position: { x: first.position.x, y: first.position.y },
        size: { width: first.size.width, height: first.size.height },
      },
      indices: [...indices].sort((a, b) => a - b),
    });
  }
  return clusters;
}

/** Front-most index in a co-located set (higher app index). */
export function frontIndexInStack(indices: number[]): number {
  return Math.max(...indices);
}

export type DropBand = "swap" | "merge";

const RING_OUTER_RATIO = 0.2;

/**
 * Classify swap (outer ring) vs merge (center) from pointer position in **monitor** percent coords.
 * When the zone is too small in pixels, always merge (fat-finger safe).
 */
export function classifyPointerDropBand(
  pointerMonitorPct: { x: number; y: number },
  zone: SnapZoneLike,
  zoneWidthPx: number,
  zoneHeightPx: number,
  smallW = 80,
  smallH = 60,
): DropBand {
  if (zoneWidthPx < smallW || zoneHeightPx < smallH) {
    return "merge";
  }

  const left = zone.position.x - zone.size.width / 2;
  const right = zone.position.x + zone.size.width / 2;
  const top = zone.position.y - zone.size.height / 2;
  const bottom = zone.position.y + zone.size.height / 2;

  const zw = Math.max(1e-6, right - left);
  const zh = Math.max(1e-6, bottom - top);

  const nx = (pointerMonitorPct.x - left) / zw;
  const ny = (pointerMonitorPct.y - top) / zh;

  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) {
    return "merge";
  }

  const inRing =
    nx < RING_OUTER_RATIO ||
    nx > 1 - RING_OUTER_RATIO ||
    ny < RING_OUTER_RATIO ||
    ny > 1 - RING_OUTER_RATIO;

  return inRing ? "swap" : "merge";
}

export function indicesOccupyingZone(
  apps: AppLayoutLike[],
  zones: SnapZoneLike[],
  zone: SnapZoneLike,
  excludeAppIndex?: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < apps.length; i++) {
    if (excludeAppIndex !== undefined && i === excludeAppIndex) continue;
    const z = snapZoneForApp(apps[i]!, zones);
    if (z?.id === zone.id) out.push(i);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Elliptical hit test in monitor percent space around the app tile center.
 * Tuned so stacking requires aiming near the icon area, not the whole tile.
 */
export function pointerHitsAppIconMergeTarget(
  pointerMonitorPct: { x: number; y: number },
  app: AppLayoutLike,
  rxRatio = 0.2,
  ryRatio = 0.26,
): boolean {
  const rx = Math.max((app.size.width * rxRatio) / 2, 5);
  const ry = Math.max((app.size.height * ryRatio) / 2, 5);
  const dx = pointerMonitorPct.x - app.position.x;
  const dy = pointerMonitorPct.y - app.position.y;
  return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
}

/**
 * Front-most hit wins (higher index first). Excludes optional dragged index (same-monitor drag).
 */
export function findAppIndexForIconStackMergeHover(
  apps: AppLayoutLike[],
  pointerMonitorPct: { x: number; y: number },
  opts?: { excludeAppIndex?: number },
): number | null {
  let best: { i: number; d: number } | null = null;
  for (let i = apps.length - 1; i >= 0; i--) {
    if (opts?.excludeAppIndex !== undefined && opts.excludeAppIndex === i) continue;
    const app = apps[i];
    if (!app) continue;
    if (!pointerHitsAppIconMergeTarget(pointerMonitorPct, app)) continue;
    const d = Math.hypot(
      pointerMonitorPct.x - app.position.x,
      pointerMonitorPct.y - app.position.y,
    );
    if (!best || d < best.d) best = { i, d };
  }
  return best?.i ?? null;
}

const RECT_EPS = 0.01;

/** Apps with identical layout rect (same stack tile), regardless of current snap zone grid. */
export function buildGeometryCoincidentAppClusters<T extends AppLayoutLike>(
  apps: T[],
): number[][] {
  const n = apps.length;
  if (n < 2) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };
  const sameRect = (a: T, b: T) =>
    Math.abs(a.position.x - b.position.x) < RECT_EPS &&
    Math.abs(a.position.y - b.position.y) < RECT_EPS &&
    Math.abs(a.size.width - b.size.width) < RECT_EPS &&
    Math.abs(a.size.height - b.size.height) < RECT_EPS;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sameRect(apps[i]!, apps[j]!)) union(i, j);
    }
  }
  const rootTo = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = rootTo.get(r) ?? [];
    list.push(i);
    rootTo.set(r, list);
  }
  return [...rootTo.values()]
    .filter((g) => g.length >= 2)
    .map((g) => g.sort((a, b) => a - b));
}

export type SnapAppAssignment = {
  appIndex: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

/**
 * Greedy zone assignment that moves **coincident-rect stacks** as one unit (layout / auto-snap).
 */
export function computeStackPreservingSnapAssignments<T extends AppLayoutLike>(
  monitor: {
    apps: T[];
    predefinedLayout?: string | null;
    orientation?: "landscape" | "portrait";
  },
): SnapAppAssignment[] {
  const zones = getSnapZonesForMonitor(monitor);
  if (zones.length === 0 || monitor.apps.length === 0) return [];

  const geomClusters = buildGeometryCoincidentAppClusters(monitor.apps);
  const inCluster = new Set<number>();
  for (const g of geomClusters) {
    g.forEach((i) => inCluster.add(i));
  }

  type Unit =
    | { kind: "cluster"; indices: number[] }
    | { kind: "solo"; appIndex: number };

  const units: Unit[] = [];
  for (const g of geomClusters) {
    units.push({ kind: "cluster", indices: [...g] });
  }
  for (let i = 0; i < monitor.apps.length; i++) {
    if (!inCluster.has(i)) units.push({ kind: "solo", appIndex: i });
  }

  const distUnitToZone = (unit: Unit, zone: SnapZoneLike) => {
    const zx = zone.position.x;
    const zy = zone.position.y;
    if (unit.kind === "solo") {
      const app = monitor.apps[unit.appIndex]!;
      return Math.hypot(app.position.x - zx, app.position.y - zy);
    }
    return Math.min(
      ...unit.indices.map((idx) => {
        const app = monitor.apps[idx]!;
        return Math.hypot(app.position.x - zx, app.position.y - zy);
      }),
    );
  };

  const unitDistances = units.map((unit) => {
    const distances = zones.map((zone) => ({
      zoneId: zone.id,
      zone,
      distance: distUnitToZone(unit, zone),
    }));
    distances.sort((a, b) => a.distance - b.distance);
    return { unit, distances };
  });

  const assignedZones = new Set<string>();
  const appUpdates: SnapAppAssignment[] = [];

  const sortedUnits = [...unitDistances].sort(
    (a, b) => a.distances[0].distance - b.distances[0].distance,
  );

  const pushUnit = (unit: Unit, zone: SnapZoneLike) => {
    const pos = { x: zone.position.x, y: zone.position.y };
    const size = { width: zone.size.width, height: zone.size.height };
    if (unit.kind === "solo") {
      appUpdates.push({ appIndex: unit.appIndex, position: pos, size });
    } else {
      for (const appIndex of unit.indices) {
        appUpdates.push({ appIndex, position: pos, size });
      }
    }
  };

  for (const { unit, distances } of sortedUnits) {
    let assigned = false;
    for (const { zoneId, zone } of distances) {
      if (!assignedZones.has(zoneId)) {
        assignedZones.add(zoneId);
        pushUnit(unit, zone);
        assigned = true;
        break;
      }
    }
    if (!assigned && zones[0]) {
      pushUnit(unit, zones[0]!);
    }
  }

  return appUpdates;
}
