import type { FlowProfile } from "../../../types/flow-profile";
import {
  computeDropZonesForAppCount,
  getAppColor,
  getAppIcon,
  getBrowserColor,
  getBrowserIcon,
} from "./layoutDropPresentation";
import { resolveHostExecutableForCatalogLabel } from "./catalogHostResolve";

export type SidebarContentItemInput = {
  id: string;
  type: "link" | "file";
  name: string;
  url?: string;
  path?: string;
  fileType?: string;
  defaultApp: string;
};

export type InstalledSidebarAppInput = {
  name: string;
  color?: string;
  iconPath?: string | null;
  executablePath?: string | null;
};

type InstalledCatalogEntry = { name: string; iconPath: string | null; executablePath?: string | null };

/** Prefer `getInstalledAppsCatalog` (call-time snapshot) over a captured array. */
function catalogForPlacement(
  installedAppsCatalog: InstalledCatalogEntry[] | undefined,
  getInstalledAppsCatalog: (() => InstalledCatalogEntry[] | undefined) | undefined,
): InstalledCatalogEntry[] | undefined {
  if (typeof getInstalledAppsCatalog === "function") {
    return getInstalledAppsCatalog() ?? undefined;
  }
  return installedAppsCatalog;
}

function resolveInstalledCatalogIconPath(
  catalog: InstalledCatalogEntry[] | undefined,
  appName: string,
): string | null {
  if (!catalog?.length || !appName.trim()) return null;
  const t = appName.trim();
  const tl = t.toLowerCase();
  const byExact = catalog.find((a) => a.name.trim().toLowerCase() === tl);
  if (byExact?.iconPath) return byExact.iconPath;
  const byPartial = catalog.find((a) => {
    const al = a.name.trim().toLowerCase();
    return al.includes(tl) || tl.includes(al);
  });
  return byPartial?.iconPath ?? null;
}

function pickZoneNearCenter(isPortrait: boolean, prospectiveAppCount: number) {
  const rawPosition = { x: 50, y: 50 };
  const zones = computeDropZonesForAppCount(isPortrait, prospectiveAppCount);
  let activeZone = zones[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const zone of zones) {
    const distance = Math.sqrt(
      (rawPosition.x - zone.position.x) ** 2
      + (rawPosition.y - zone.position.y) ** 2,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      activeZone = zone;
    }
  }
  return {
    position: activeZone.position,
    size: { width: activeZone.size.width, height: activeZone.size.height },
  };
}

function newInstanceId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Places a library content item onto a monitor using the same shapes as
 * `useLayoutCustomDrag` empty-monitor drops (center-picked snap zone).
 */
export function placeSidebarContentOnMonitor(args: {
  profile: FlowProfile;
  monitorId: string;
  item: SidebarContentItemInput;
  installedAppsCatalog?: InstalledCatalogEntry[];
  /** When set, used instead of `installedAppsCatalog` so icons match drag-drop (ref snapshot). */
  getInstalledAppsCatalog?: () => InstalledCatalogEntry[] | undefined;
  addApp: (profileId: string, monitorId: string, newApp: unknown) => void;
  preferredPlacement?: {
    position: { x: number; y: number };
    size: { width: number; height: number };
  };
  addBrowserTab: (profileId: string, tab: unknown) => void;
}): void {
  const {
    profile,
    monitorId,
    item,
    installedAppsCatalog,
    getInstalledAppsCatalog,
    addApp,
    addBrowserTab,
    preferredPlacement,
  } = args;
  const catalog = catalogForPlacement(
    installedAppsCatalog,
    getInstalledAppsCatalog,
  );
  const targetMonitor = profile.monitors?.find((m) => m.id === monitorId);
  if (!targetMonitor) return;

  const isPortrait = targetMonitor.orientation === "portrait";
  const prospectiveAppCount = (targetMonitor.apps?.length || 0) + 1;
  const snapped = pickZoneNearCenter(isPortrait, prospectiveAppCount);
  const placement = preferredPlacement ?? snapped;

  const isLink = item.type === "link" && Boolean(item.url);

  if (isLink) {
    const appLabel = item.defaultApp || "File Viewer";
    const instanceId = newInstanceId(appLabel);
    const iconPath = resolveInstalledCatalogIconPath(catalog, appLabel);
    const hostExe = resolveHostExecutableForCatalogLabel(catalog, appLabel);
    const newApp: Record<string, unknown> = {
      instanceId,
      name: appLabel,
      icon: getBrowserIcon(appLabel),
      iconPath,
      ...(hostExe ? { executablePath: hostExe } : {}),
      color: getBrowserColor(appLabel),
      position: placement.position,
      size: placement.size,
      volume: 50,
      launchBehavior: "new",
      runAsAdmin: false,
      forceCloseOnExit: false,
      smartSave: false,
      monitorId,
      associatedFiles: [],
    };
    addApp(profile.id, monitorId, newApp);

    addBrowserTab(profile.id, {
      name: item.name,
      url: item.url,
      browser: appLabel,
      newWindow: false,
      monitorId,
      isActive: true,
      appInstanceId: instanceId,
      id: `content-tab-${Date.now()}`,
    });
    return;
  }

  const appLabel = item.defaultApp || "File Viewer";
  const instanceId = newInstanceId(appLabel);
  const iconPath = resolveInstalledCatalogIconPath(catalog, appLabel);
  const hostExe = resolveHostExecutableForCatalogLabel(catalog, appLabel);
  const newApp: Record<string, unknown> = {
    instanceId,
    name: appLabel,
    icon: getAppIcon(appLabel),
    iconPath,
    ...(hostExe ? { executablePath: hostExe } : {}),
    color: getAppColor(appLabel),
    position: placement.position,
    size: placement.size,
    volume: 50,
    launchBehavior: "new",
    runAsAdmin: false,
    forceCloseOnExit: false,
    smartSave: false,
    monitorId,
    associatedFiles: [
      {
        id: `content-file-${Date.now()}`,
        name: item.name,
        path: item.path,
        type: item.fileType || item.type,
        associatedApp: item.defaultApp,
        useDefaultApp: true,
      },
    ],
  };
  addApp(profile.id, monitorId, newApp);
}

export function placeSidebarContentOnMinimized(args: {
  profile: FlowProfile;
  item: SidebarContentItemInput;
  installedAppsCatalog?: InstalledCatalogEntry[];
  getInstalledAppsCatalog?: () => InstalledCatalogEntry[] | undefined;
  addAppToMinimized: (profileId: string, newApp: unknown) => void;
  addBrowserTab: (profileId: string, tab: unknown) => void;
}): void {
  const {
    profile,
    item,
    installedAppsCatalog,
    getInstalledAppsCatalog,
    addAppToMinimized,
    addBrowserTab,
  } = args;
  const catalog = catalogForPlacement(
    installedAppsCatalog,
    getInstalledAppsCatalog,
  );
  const primary =
    profile.monitors.find((m) => m.primary) || profile.monitors[0];
  const targetMonitorId = primary?.id || "monitor-1";

  const isLink = item.type === "link" && Boolean(item.url);

  if (isLink) {
    const appLabel = item.defaultApp || "File Viewer";
    const instanceId = newInstanceId(appLabel);
    const iconPath = resolveInstalledCatalogIconPath(catalog, appLabel);
    const hostExe = resolveHostExecutableForCatalogLabel(catalog, appLabel);
    const newApp: Record<string, unknown> = {
      instanceId,
      name: appLabel,
      icon: getAppIcon(appLabel),
      iconPath,
      ...(hostExe ? { executablePath: hostExe } : {}),
      color: getAppColor(appLabel),
      volume: 50,
      launchBehavior: "minimize",
      targetMonitor: targetMonitorId,
      associatedFiles: [],
    };
    // Matches `useLayoutCustomDrag` minimized drop for sidebar links.
    addAppToMinimized(profile.id, newApp);

    addBrowserTab(profile.id, {
      name: item.name,
      url: item.url,
      browser: item.defaultApp,
      newWindow: false,
      monitorId: targetMonitorId,
      isActive: true,
      appInstanceId: instanceId,
      id: `content-tab-${Date.now()}`,
    });
    return;
  }

  const appLabel = item.defaultApp || "File Viewer";
  const instanceId = newInstanceId(appLabel);
  const iconPath = resolveInstalledCatalogIconPath(catalog, appLabel);
  const hostExe = resolveHostExecutableForCatalogLabel(catalog, appLabel);
  const newApp: Record<string, unknown> = {
    instanceId,
    name: appLabel,
    icon: getAppIcon(appLabel),
    iconPath,
    ...(hostExe ? { executablePath: hostExe } : {}),
    color: getAppColor(appLabel),
    volume: 50,
    launchBehavior: "minimize",
    targetMonitor: targetMonitorId,
    associatedFiles: [
      {
        id: `content-file-${Date.now()}`,
        name: item.name,
        path: item.path,
        type: item.fileType || item.type,
        associatedApp: item.defaultApp,
        useDefaultApp: true,
      },
    ],
  };
  addAppToMinimized(profile.id, newApp);
}

export function placeInstalledSidebarAppOnMonitor(args: {
  profile: FlowProfile;
  monitorId: string;
  app: InstalledSidebarAppInput;
  addApp: (profileId: string, monitorId: string, newApp: unknown) => void;
}): void {
  const { profile, monitorId, app, addApp } = args;
  const targetMonitor = profile.monitors?.find((m) => m.id === monitorId);
  if (!targetMonitor) return;

  const isPortrait = targetMonitor.orientation === "portrait";
  const prospectiveAppCount = (targetMonitor.apps?.length || 0) + 1;
  const { position, size } = pickZoneNearCenter(isPortrait, prospectiveAppCount);

  const instanceId = newInstanceId(app.name);
  addApp(profile.id, monitorId, {
    instanceId,
    name: app.name,
    icon: getAppIcon(app.name),
    iconPath: app.iconPath ?? null,
    executablePath: app.executablePath ?? null,
    color: app.color,
    position,
    size,
    volume: 50,
    launchBehavior: "new",
    runAsAdmin: false,
    forceCloseOnExit: false,
    smartSave: false,
    associatedFiles: [],
  });
}

export function placeInstalledSidebarAppOnMinimized(args: {
  profile: FlowProfile;
  app: InstalledSidebarAppInput;
  addAppToMinimized: (profileId: string, newApp: unknown) => void;
}): void {
  const { profile, app, addAppToMinimized } = args;
  const primary =
    profile.monitors.find((m) => m.primary) || profile.monitors[0];
  const instanceId = newInstanceId(app.name);
  addAppToMinimized(profile.id, {
    instanceId,
    name: app.name,
    icon: getAppIcon(app.name),
    iconPath: app.iconPath ?? null,
    executablePath: app.executablePath ?? null,
    color: app.color,
    volume: 50,
    launchBehavior: "minimize",
    targetMonitor: primary?.id || "monitor-1",
  });
}

export type SidebarLibraryFolderInput = {
  id: string;
  name: string;
  defaultApp: string;
  children: string[];
  /** When set and `children` is empty, placement uses this folder path as a single target. */
  diskPath?: string;
};

type LibraryContentRow = {
  id: string;
  type: string;
  name: string;
  path?: string;
  fileType?: string;
  defaultApp?: string;
};

function collectAssociatedFilesFromLibraryFolder(
  folder: SidebarLibraryFolderInput,
  folders: SidebarLibraryFolderInput[],
  items: LibraryContentRow[],
  visited: Set<string> = new Set<string>(),
): {
  id: string;
  name: string;
  path: string;
  type: string;
  associatedApp: string;
  useDefaultApp: boolean;
}[] {
  if (visited.has(folder.id)) return [];
  visited.add(folder.id);
  const diskPath = String((folder as { diskPath?: string }).diskPath || "").trim();
  if (diskPath && !(folder.children || []).length) {
    return [
      {
        id: `content-folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: folder.name,
        path: diskPath,
        type: "folder",
        associatedApp: folder.defaultApp || "File Explorer",
        useDefaultApp: true,
      },
    ];
  }
  const out: {
    id: string;
    name: string;
    path: string;
    type: string;
    associatedApp: string;
    useDefaultApp: boolean;
  }[] = [];
  for (const childId of folder.children || []) {
    const item = items.find((i) => i.id === childId);
    if (item?.type === "file" && item.path) {
      out.push({
        id: `content-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: item.name,
        path: item.path,
        type: item.fileType || "file",
        associatedApp: item.defaultApp || folder.defaultApp,
        useDefaultApp: true,
      });
    }
    const sub = folders.find((f) => f.id === childId);
    if (sub) {
      out.push(
        ...collectAssociatedFilesFromLibraryFolder(sub, folders, items, visited),
      );
    }
  }
  return out;
}

/**
 * Adds a single layout app hosting all file paths from a content library folder
 * (including nested folders), instead of placing each file as its own tile.
 */
export function placeSidebarLibraryFolderOnMonitor(args: {
  profile: FlowProfile;
  monitorId: string;
  folder: SidebarLibraryFolderInput;
  folders: SidebarLibraryFolderInput[];
  /** When the library lives outside the profile document, pass its file rows here. */
  libraryItems?: LibraryContentRow[];
  installedAppsCatalog?: InstalledCatalogEntry[];
  getInstalledAppsCatalog?: () => InstalledCatalogEntry[] | undefined;
  addApp: (profileId: string, monitorId: string, newApp: unknown) => void;
  preferredPlacement?: {
    position: { x: number; y: number };
    size: { width: number; height: number };
  };
}): void {
  const {
    profile,
    monitorId,
    folder,
    folders,
    libraryItems,
    installedAppsCatalog,
    getInstalledAppsCatalog,
    addApp,
    preferredPlacement,
  } = args;
  const catalog = catalogForPlacement(
    installedAppsCatalog,
    getInstalledAppsCatalog,
  );
  const items = (libraryItems ?? profile.contentItems ?? []) as LibraryContentRow[];
  const associatedFiles = collectAssociatedFilesFromLibraryFolder(
    folder,
    folders,
    items,
  );
  if (associatedFiles.length === 0) return;

  const targetMonitor = profile.monitors?.find((m) => m.id === monitorId);
  if (!targetMonitor) return;
  const isPortrait = targetMonitor.orientation === "portrait";
  const prospectiveAppCount = (targetMonitor.apps?.length || 0) + 1;
  const snapped = pickZoneNearCenter(isPortrait, prospectiveAppCount);
  const placement = preferredPlacement ?? snapped;

  const appLabel = folder.defaultApp || "File Viewer";
  const instanceId = newInstanceId(appLabel);
  const iconPath = resolveInstalledCatalogIconPath(catalog, appLabel);
  const hostExe = resolveHostExecutableForCatalogLabel(catalog, appLabel);
  addApp(profile.id, monitorId, {
    instanceId,
    name: appLabel,
    icon: getAppIcon(appLabel),
    iconPath,
    ...(hostExe ? { executablePath: hostExe } : {}),
    color: getAppColor(appLabel),
    position: placement.position,
    size: placement.size,
    volume: 50,
    launchBehavior: "new",
    runAsAdmin: false,
    forceCloseOnExit: false,
    smartSave: false,
    monitorId,
    associatedFiles,
  });
}

export function placeSidebarLibraryFolderOnMinimized(args: {
  profile: FlowProfile;
  folder: SidebarLibraryFolderInput;
  folders: SidebarLibraryFolderInput[];
  libraryItems?: LibraryContentRow[];
  installedAppsCatalog?: InstalledCatalogEntry[];
  getInstalledAppsCatalog?: () => InstalledCatalogEntry[] | undefined;
  addAppToMinimized: (profileId: string, newApp: unknown) => void;
}): void {
  const {
    profile,
    folder,
    folders,
    libraryItems,
    installedAppsCatalog,
    getInstalledAppsCatalog,
    addAppToMinimized,
  } = args;
  const catalog = catalogForPlacement(
    installedAppsCatalog,
    getInstalledAppsCatalog,
  );
  const items = (libraryItems ?? profile.contentItems ?? []) as LibraryContentRow[];
  const associatedFiles = collectAssociatedFilesFromLibraryFolder(
    folder,
    folders,
    items,
  );
  if (associatedFiles.length === 0) return;

  const primary =
    profile.monitors.find((m) => m.primary) || profile.monitors[0];
  const targetMonitorId = primary?.id || "monitor-1";
  const appLabel = folder.defaultApp || "File Viewer";
  const instanceId = newInstanceId(appLabel);
  const iconPath = resolveInstalledCatalogIconPath(catalog, appLabel);
  const hostExe = resolveHostExecutableForCatalogLabel(catalog, appLabel);
  addAppToMinimized(profile.id, {
    instanceId,
    name: appLabel,
    icon: getAppIcon(appLabel),
    iconPath,
    ...(hostExe ? { executablePath: hostExe } : {}),
    color: getAppColor(appLabel),
    volume: 50,
    launchBehavior: "minimize",
    targetMonitor: targetMonitorId,
    associatedFiles,
  });
}
