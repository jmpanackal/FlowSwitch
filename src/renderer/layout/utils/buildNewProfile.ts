import { Settings } from "lucide-react";
import { formatUnit } from "../../utils/pluralize";
import type { FlowProfile } from "../../../types/flow-profile";
import {
  applySharedMonitorLayoutToMonitors,
  collectSharedLayoutPositionMaps,
} from "./sharedMonitorLayout";

export type MemoryCapture = {
  capturedAt: number;
  appCount: number;
  monitors: Array<{
    id: string;
    name: string;
    systemName?: string | null;
    primary: boolean;
    resolution: string;
    orientation: "landscape" | "portrait";
    layoutPosition?: { x: number; y: number };
    apps: Array<{
      name: string;
      iconPath: string | null;
      executablePath?: string | null;
      position: { x: number; y: number };
      size: { width: number; height: number };
      associatedFiles?: Array<{ type?: string; path?: string }>;
    }>;
  }>;
  minimizedApps?: Array<{
    name: string;
    iconPath: string | null;
    executablePath?: string | null;
    position: { x: number; y: number };
    size: { width: number; height: number };
    targetMonitor?: string;
    sourcePosition?: { x: number; y: number };
    sourceSize?: { width: number; height: number };
    associatedFiles?: Array<{ type?: string; path?: string }>;
  }>;
  error?: string;
};

export type DetectedMonitor = {
  id: string;
  name: string;
  systemName?: string | null;
  primary: boolean;
  resolution: string;
  orientation: "landscape" | "portrait";
  layoutPosition?: { x: number; y: number };
};

const DEFAULT_PROFILE_ICON = "work";

const LAYOUT_ALIGN_THRESHOLD = 14;

const getMonitorFootprint = (orientation: "landscape" | "portrait") => (
  orientation === "portrait"
    ? { width: 22, height: 34 }
    : { width: 40, height: 24 }
);

const groupAlignedAxis = (values: number[]) => {
  if (values.length <= 1) return values;
  const indexed = values.map((value, index) => ({ index, value })).sort((a, b) => a.value - b.value);
  const grouped: Array<{ members: Array<{ index: number; value: number }> }> = [];

  indexed.forEach((entry) => {
    const lastGroup = grouped[grouped.length - 1];
    if (!lastGroup) {
      grouped.push({ members: [entry] });
      return;
    }

    const lastValue = lastGroup.members[lastGroup.members.length - 1].value;
    if (Math.abs(entry.value - lastValue) <= LAYOUT_ALIGN_THRESHOLD) {
      lastGroup.members.push(entry);
      return;
    }

    grouped.push({ members: [entry] });
  });

  const aligned = [...values];
  grouped.forEach((group) => {
    const avg = group.members.reduce((sum, item) => sum + item.value, 0) / group.members.length;
    group.members.forEach((item) => {
      aligned[item.index] = Math.round(avg * 10) / 10;
    });
  });
  return aligned;
};

const normalizeMonitorLayout = <
  T extends { id: string; orientation: "landscape" | "portrait"; layoutPosition?: { x: number; y: number } },
>(inputMonitors: T[]) => {
  if (inputMonitors.length === 0) return inputMonitors;
  if (inputMonitors.length === 1) {
    return inputMonitors.map((monitor) => ({ ...monitor, layoutPosition: { x: 50, y: 50 } }));
  }

  const raw = inputMonitors.map((monitor, index) => ({
    id: monitor.id,
    orientation: monitor.orientation,
    x: monitor.layoutPosition?.x ?? ((index % 3) * 300),
    y: monitor.layoutPosition?.y ?? (Math.floor(index / 3) * 220),
  }));
  const allPercent = raw.every((item) => item.x >= 0 && item.x <= 100 && item.y >= 0 && item.y <= 100);

  let positions = raw.map((item) => ({ ...item }));
  if (!allPercent) {
    const minX = Math.min(...raw.map((item) => item.x));
    const maxX = Math.max(...raw.map((item) => item.x));
    const minY = Math.min(...raw.map((item) => item.y));
    const maxY = Math.max(...raw.map((item) => item.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    positions = raw.map((item) => ({
      ...item,
      x: 50 + ((((item.x - minX) / spanX) * 100 - 50) * 0.65),
      y: 50 + ((((item.y - minY) / spanY) * 100 - 50) * 0.65),
    }));
  }

  const alignedX = groupAlignedAxis(positions.map((item) => item.x));
  const alignedY = groupAlignedAxis(positions.map((item) => item.y));
  positions = positions.map((item, index) => ({
    ...item,
    x: alignedX[index],
    y: alignedY[index],
  }));

  const placed: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
  positions
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach((pos) => {
      const footprint = getMonitorFootprint(pos.orientation);
      let x = pos.x;
      let y = pos.y;

      for (let attempt = 0; attempt < 40; attempt += 1) {
        const conflicting = placed.find((existing) => (
          Math.abs(existing.x - x) < ((existing.width + footprint.width) / 2) + 2
          && Math.abs(existing.y - y) < ((existing.height + footprint.height) / 2) + 2
        ));
        if (!conflicting) break;

        x += 8;
        if (x > 90) {
          x = 18 + (attempt % 3) * 10;
          y += 10;
        }
      }

      const clampedX = Math.max(10, Math.min(90, x));
      const clampedY = Math.max(10, Math.min(90, y));
      placed.push({
        id: pos.id,
        x: clampedX,
        y: clampedY,
        width: footprint.width,
        height: footprint.height,
      });
    });

  const positionsById = new Map(placed.map((item) => [item.id, { x: item.x, y: item.y }]));
  return inputMonitors.map((monitor) => ({
    ...monitor,
    layoutPosition: positionsById.get(monitor.id) || monitor.layoutPosition || { x: 50, y: 50 },
  }));
};

const folderLabelFromPath = (folderPath: string) => {
  const trimmed = folderPath.replace(/[/\\]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return i >= 0 ? trimmed.slice(i + 1) || trimmed : trimmed;
};

const normalizedFolderDedupeKey = (raw: string) => (
  String(raw || "")
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+/g, "\\")
    .toLowerCase()
);

/** One content-library row per captured Explorer folder tab (deduped paths). */
export function collectCapturedExplorerContentItems(
  capture: MemoryCapture,
  idPrefix: string,
): Array<{
  id: string;
  type: "file";
  name: string;
  path: string;
  isFolder: boolean;
  defaultApp: string;
  fileType: string;
  dateAdded: string;
}> {
  const paths: string[] = [];
  const seen = new Set<string>();
  const consider = (app: {
    name?: string;
    associatedFiles?: Array<{ type?: string; path?: string }>;
  }) => {
    const nm = String(app.name || "").trim().toLowerCase();
    if (nm !== "file explorer" && nm !== "explorer") return;
    for (const f of app.associatedFiles || []) {
      if (String(f?.type || "").toLowerCase() !== "folder") continue;
      const p = String(f?.path || "").trim();
      if (!p) continue;
      const k = normalizedFolderDedupeKey(p);
      if (seen.has(k)) continue;
      seen.add(k);
      paths.push(
        p.replace(/\//g, "\\").replace(/\\+/g, "\\"),
      );
    }
  };
  for (const m of capture.monitors) {
    for (const a of m.apps) consider(a);
  }
  for (const a of capture.minimizedApps || []) consider(a);

  const stamp = Date.now();
  return paths.map((folderPath, index) => ({
    id: `${idPrefix}-explorer-${stamp}-${index}`,
    type: "file" as const,
    name: folderLabelFromPath(folderPath) || folderPath,
    path: folderPath,
    isFolder: true,
    defaultApp: "File Explorer",
    fileType: "Folder",
    dateAdded: new Date().toISOString(),
  }));
}

const getStableColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

export function uniqueProfileDisplayName(
  base: string,
  existing: readonly { name: string }[],
): string {
  const used = new Set(existing.map((p) => p.name.trim()));
  const b = base.trim() || "New profile";
  if (!used.has(b)) return b;
  let n = 2;
  while (used.has(`${b} ${n}`)) n += 1;
  return `${b} ${n}`;
}

export async function fetchSystemMonitorsForProfile(): Promise<DetectedMonitor[]> {
  const fallback: DetectedMonitor[] = [{
    id: "monitor-1",
    name: "Monitor 1",
    primary: true,
    resolution: "1920x1080",
    orientation: "landscape",
    layoutPosition: { x: 0, y: 0 },
  }];

  if (!window.electron?.getSystemMonitors) return fallback;

  try {
    const monitors = await window.electron.getSystemMonitors();
    if (Array.isArray(monitors) && monitors.length > 0) {
      return monitors.map((monitor) => ({
        id: monitor.id,
        name: monitor.name,
        systemName: monitor.systemName ?? null,
        primary: monitor.primary,
        resolution: monitor.resolution,
        orientation: monitor.orientation,
        layoutPosition: monitor.layoutPosition,
      }));
    }
  } catch {
    // keep fallback
  }
  return fallback;
}

export function buildEmptyFlowProfile(args: {
  id: string;
  name: string;
  detectedMonitors: DetectedMonitor[];
  /** When set, reuse preview positions for monitors that already exist in other profiles. */
  existingProfiles?: readonly { monitors?: DetectedMonitor[] }[];
}): FlowProfile {
  const fallbackMonitors: DetectedMonitor[] = [{
    id: "monitor-1",
    name: "Monitor 1",
    primary: true,
    resolution: "1920x1080",
    orientation: "landscape",
    layoutPosition: { x: 0, y: 0 },
  }];

  let sourceMonitors = normalizeMonitorLayout(
    (args.detectedMonitors.length > 0 ? args.detectedMonitors : fallbackMonitors)
      .slice()
      .sort((a, b) => {
        const ay = a.layoutPosition?.y ?? 0;
        const by = b.layoutPosition?.y ?? 0;
        const ax = a.layoutPosition?.x ?? 0;
        const bx = b.layoutPosition?.x ?? 0;
        return ay - by || ax - bx || Number(b.primary) - Number(a.primary);
      }),
  );

  if (args.existingProfiles?.length) {
    const maps = collectSharedLayoutPositionMaps(args.existingProfiles);
    sourceMonitors = applySharedMonitorLayoutToMonitors(sourceMonitors, maps);
  }

  return {
    id: args.id,
    name: args.name,
    icon: DEFAULT_PROFILE_ICON,
    profileKind: "general",
    description: "Empty layout — add apps from the sidebar",
    appCount: 0,
    tabCount: 0,
    fileCount: 0,
    globalVolume: 70,
    applyProfileVolumesOnLaunch: false,
    backgroundBehavior: "keep",
    preLaunchInProfileBehavior: "reuse",
    preLaunchInProfileTargetMode: "all",
    preLaunchInProfileTargetKeys: [],
    preLaunchOutsideProfileBehavior: "keep",
    preLaunchOutsideTargetMode: "all",
    preLaunchOutsideTargetNames: [],
    restrictedApps: [],
    estimatedStartupTime: 3,
    onStartup: false,
    autoLaunchOnBoot: false,
    autoSwitchTime: null,
    hotkey: "",
    scheduleEnabled: false,
    launchMinimized: false,
    launchMaximized: false,
    launchOrder: "sequential",
    appLaunchOrder: [],
    appLaunchDelays: {},
    monitors: sourceMonitors.map((monitor, monitorIndex) => ({
      id: monitor.id,
      name: monitor.name,
      systemName: monitor.systemName ?? null,
      primary: monitor.primary,
      resolution: monitor.resolution,
      orientation: monitor.orientation,
      layoutPosition: monitor.layoutPosition ?? { x: monitorIndex * 100, y: 0 },
      apps: [] as unknown[],
    })),
    minimizedApps: [],
    minimizedFiles: [],
    files: [],
    browserTabs: [],
    contentItems: [],
    contentFolders: [],
  } as FlowProfile;
}

export function buildMemoryFlowProfileFromCapture(
  capture: MemoryCapture,
  name: string,
  profileId: string,
  existingProfiles?: readonly { monitors?: DetectedMonitor[] }[],
): FlowProfile {
  const totalCapturedApps = capture.monitors.reduce(
    (sum, monitor) => sum + monitor.apps.length,
    0,
  ) + (capture.minimizedApps?.length || 0);
  const explorerContentItems = collectCapturedExplorerContentItems(
    capture,
    profileId,
  );

  let orderedMonitors = normalizeMonitorLayout([...capture.monitors].sort((a, b) => {
    const ay = a.layoutPosition?.y ?? 0;
    const by = b.layoutPosition?.y ?? 0;
    const ax = a.layoutPosition?.x ?? 0;
    const bx = b.layoutPosition?.x ?? 0;
    return ay - by || ax - bx;
  }));

  if (existingProfiles?.length) {
    const maps = collectSharedLayoutPositionMaps(existingProfiles);
    orderedMonitors = applySharedMonitorLayoutToMonitors(orderedMonitors, maps);
  }

  return {
    id: profileId,
    name,
    icon: DEFAULT_PROFILE_ICON,
    profileKind: "general",
    description: `Captured layout with ${formatUnit(totalCapturedApps, "app")}`,
    appCount: totalCapturedApps,
    tabCount: 0,
    fileCount: explorerContentItems.length,
    globalVolume: 70,
    applyProfileVolumesOnLaunch: false,
    backgroundBehavior: "keep",
    preLaunchInProfileBehavior: "reuse",
    preLaunchInProfileTargetMode: "all",
    preLaunchInProfileTargetKeys: [],
    preLaunchOutsideProfileBehavior: "keep",
    preLaunchOutsideTargetMode: "all",
    preLaunchOutsideTargetNames: [],
    restrictedApps: [],
    estimatedStartupTime: Math.max(3, totalCapturedApps * 0.5),
    onStartup: false,
    autoLaunchOnBoot: false,
    autoSwitchTime: null,
    hotkey: "",
    scheduleEnabled: false,
    launchMinimized: false,
    launchMaximized: false,
    launchOrder: "sequential",
    appLaunchOrder: [],
    appLaunchDelays: {},
    monitors: orderedMonitors.map((monitor) => ({
      id: monitor.id,
      name: monitor.name,
      systemName: monitor.systemName ?? null,
      primary: monitor.primary,
      resolution: monitor.resolution,
      orientation: monitor.orientation,
      layoutPosition: monitor.layoutPosition,
      apps: monitor.apps.map((app) => ({
        name: app.name,
        icon: Settings,
        iconPath: app.iconPath ?? null,
        executablePath: app.executablePath ?? null,
        color: getStableColor(app.name),
        position: app.position,
        size: app.size,
        volume: 50,
        launchBehavior: "new" as const,
        ...(Array.isArray(app.associatedFiles) && app.associatedFiles.length > 0
          ? { associatedFiles: app.associatedFiles }
          : {}),
      })),
    })),
    minimizedApps: (capture.minimizedApps || []).map((app) => ({
      name: app.name,
      icon: Settings,
      iconPath: app.iconPath ?? null,
      executablePath: app.executablePath ?? null,
      color: getStableColor(app.name),
      volume: 50,
      launchBehavior: "minimize" as const,
      targetMonitor: app.targetMonitor || (orderedMonitors.find((m) => m.primary)?.id || orderedMonitors[0]?.id || "monitor-1"),
      sourcePosition: app.sourcePosition || app.position,
      sourceSize: app.sourceSize || app.size,
      instanceId: `${app.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...(Array.isArray(app.associatedFiles) && app.associatedFiles.length > 0
        ? { associatedFiles: app.associatedFiles }
        : {}),
    })),
    minimizedFiles: [],
    files: [],
    browserTabs: [],
    contentItems: explorerContentItems,
    contentFolders: [],
  } as FlowProfile;
}

export function validateMemoryCapture(capture: MemoryCapture): string | null {
  if (capture.error) return capture.error;
  if (!Array.isArray(capture.monitors) || capture.monitors.length === 0) {
    return "No monitors were returned from layout capture.";
  }
  return null;
}
