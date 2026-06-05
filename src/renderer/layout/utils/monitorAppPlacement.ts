import {
  findClosestSnapZone,
  frontIndexInStack,
  indicesOccupyingZone,
} from "./monitorLayoutStacking";
import { countStackUnits, getSnapZonesForMonitor } from "./monitorSnapZones";

export type MonitorAppRect = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export type MonitorAppPlacementResult = MonitorAppRect & {
  mergeIntoAppIndex?: number;
};

const DEFAULT_TILE_SIZE = { width: 60, height: 60 };

export function normalizeMonitorAppSize(
  size?: Partial<{ width: number; height: number }> | null,
): { width: number; height: number } {
  const width = Number(size?.width);
  const height = Number(size?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ...DEFAULT_TILE_SIZE };
  }
  return {
    width: Math.max(1, Math.min(100, width)),
    height: Math.max(1, Math.min(100, height)),
  };
}

type MonitorLike = {
  orientation?: "landscape" | "portrait";
  apps?: MonitorAppRect[];
  predefinedLayout?: string | null;
};

function getZoneOccupants(
  zone: { id: string; position: { x: number; y: number }; size: { width: number; height: number } },
  existingApps: MonitorAppRect[],
  occupancyZones: ReturnType<typeof getSnapZonesForMonitor>,
  options: {
    occupancyZones: ReturnType<typeof getSnapZonesForMonitor>;
    placementZoneCount: number;
  },
): number[] {
  const direct = indicesOccupyingZone(existingApps, [zone], zone);
  if (direct.length > 0) return direct;

  const hasFullscreenApp = existingApps.some(
    (app) => app.size.width >= 90 && app.size.height >= 90,
  );
  if (
    hasFullscreenApp
    && options.occupancyZones.length < options.placementZoneCount
  ) {
    return [];
  }

  const mappedZone = findClosestSnapZone(options.occupancyZones, zone.position);
  if (!mappedZone) return [];
  return indicesOccupyingZone(existingApps, options.occupancyZones, mappedZone);
}

/**
 * Place into the best snap zone for the monitor. Prefer the nearest open zone;
 * when every zone is occupied, stack on the front-most app in the nearest zone.
 */
export function resolveSnapZoneMonitorAppPlacement(args: {
  monitor: MonitorLike;
  hintPosition?: { x: number; y: number } | null;
}): MonitorAppPlacementResult {
  const existingApps = args.monitor.apps ?? [];
  const unitCount = countStackUnits(existingApps);
  const placementZones = getSnapZonesForMonitor(args.monitor, unitCount + 1);
  const occupancyZones = getSnapZonesForMonitor(
    args.monitor,
    Math.max(unitCount, 1),
  );
  const target = args.hintPosition ?? { x: 50, y: 50 };
  const zonesByPreference = [...placementZones].sort(
    (a, b) =>
      Math.hypot(a.position.x - target.x, a.position.y - target.y)
      - Math.hypot(b.position.x - target.x, b.position.y - target.y),
  );

  const occupancyOptions = {
    occupancyZones,
    placementZoneCount: placementZones.length,
  };

  for (const zone of zonesByPreference) {
    const occupants = getZoneOccupants(zone, existingApps, occupancyZones, occupancyOptions);
    if (occupants.length === 0) {
      return {
        position: { ...zone.position },
        size: { ...zone.size },
      };
    }
  }

  const nearestZone = zonesByPreference[0] ?? placementZones[0] ?? {
    id: "full",
    position: { x: 50, y: 50 },
    size: { width: 100, height: 100 },
  };
  const occupants = getZoneOccupants(nearestZone, existingApps, occupancyZones, occupancyOptions);
  if (occupants.length === 0) {
    return {
      position: { ...nearestZone.position },
      size: { ...nearestZone.size },
    };
  }

  const mergeIntoAppIndex = frontIndexInStack(occupants);
  const anchor = existingApps[mergeIntoAppIndex];
  if (!anchor) {
    return {
      position: { ...nearestZone.position },
      size: { ...nearestZone.size },
    };
  }

  return {
    position: { ...anchor.position },
    size: { ...anchor.size },
    mergeIntoAppIndex,
  };
}

export function resolveMonitorAppPlacement(args: {
  monitor: MonitorLike;
  requestedPosition?: { x: number; y: number } | null;
  requestedSize?: { width: number; height: number } | null;
  /** Drag/drop passes explicit zone geometry from the drop target. */
  preferRequestedPosition?: boolean;
}): MonitorAppPlacementResult {
  const requested = args.requestedPosition;
  const hasRequested =
    requested
    && Number.isFinite(requested.x)
    && Number.isFinite(requested.y);

  if (args.preferRequestedPosition && hasRequested) {
    const size = normalizeMonitorAppSize(args.requestedSize);
    return {
      position: { x: requested.x, y: requested.y },
      size,
    };
  }

  return resolveSnapZoneMonitorAppPlacement({
    monitor: args.monitor,
    hintPosition: hasRequested ? requested : null,
  });
}
