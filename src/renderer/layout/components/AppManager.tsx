import { useEffect, useMemo, useState } from "react";
import { safeIconSrc } from "../../utils/safeIconSrc";
import {
  Search,
  Settings,
  Power,
  Save,
  Info,
  MoreVertical,
} from "lucide-react";
import { useInstalledApps } from "../../hooks/useInstalledApps";
import { useInstalledCatalogExclusions } from "../../hooks/useInstalledCatalogExclusions";
import { getInstalledAppCatalogKey } from "../../utils/installedAppCatalogKey";
import {
  placeInstalledSidebarAppOnMinimized,
  placeInstalledSidebarAppOnMonitor,
} from "../utils/sidebarExplicitPlacement";
import { SidebarOverlayMenu } from "./SidebarOverlayMenu";
import { InstalledAppsSidebarSkeleton } from "./InstalledAppsSidebarSkeleton";
import { FlowTooltip } from "./ui/tooltip";

type AppType = {
  name: string;
  iconPath: string | null;
  executablePath?: string | null;
  shortcutPath?: string | null;
  launchUrl?: string | null;
  color?: string;
  category?: string;
};

interface AppManagerProps {
  profiles: any[];
  onUpdateProfile: (profileId: string, updates: any) => void;
  /** Adds to the active profile; parent closes over `profileId`. */
  onAddApp?: (monitorId: string, newApp: any) => void;
  onAddAppToMinimized?: (newApp: any) => void;
  onDragStart?: () => void;
  onCustomDragStart: (data: any, sourceType: 'sidebar' | 'monitor' | 'minimized', sourceId: string, startPos: { x: number; y: number }, preview?: React.ReactNode) => void;
  currentProfile?: any;
  compact?: boolean;
  /** When both set with `compact`, hides the local search field and uses this query. */
  sidebarSearchQuery?: string;
  onSidebarSearchQueryChange?: (query: string) => void;
  /** Compact sidebar: open right-hand inspector for this installed app (not on layout). */
  onInspectInstalledApp?: (app: AppType) => void;
}

const getStableColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

const APPS_SIDEBAR_HELP =
  "Open ⋯ on a row to add to a monitor or minimized row, or change catalog visibility.";

const inferCategory = (name: string) => {
  const normalized = name.toLowerCase();
  if (/(chrome|firefox|edge|brave|vivaldi|opera|safari|browser)/.test(normalized)) return "Browser";
  if (/(code|studio|terminal|intellij|pycharm|webstorm|developer)/.test(normalized)) return "Development";
  if (/(discord|slack|teams|zoom|mail|outlook|telegram|whatsapp)/.test(normalized)) return "Communication";
  if (/(spotify|music|vlc|media|camera|photos|video)/.test(normalized)) return "Media";
  if (/(calendar|note|notion|office|word|excel|powerpoint|task)/.test(normalized)) return "Productivity";
  if (/(steam|epic|game|xbox|battle\\.net|gog)/.test(normalized)) return "Gaming";
  return "Other";
};

export function AppManager({
  profiles,
  onUpdateProfile: _onUpdateProfile,
  onAddApp, 
  onAddAppToMinimized, 
  onDragStart,
  onCustomDragStart,
  currentProfile, 
  compact = false,
  sidebarSearchQuery,
  onSidebarSearchQueryChange,
  onInspectInstalledApp,
}: AppManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const sidebarSearchControlled =
    Boolean(compact)
    && typeof sidebarSearchQuery === "string"
    && typeof onSidebarSearchQueryChange === "function";
  const effectiveSearchTerm = sidebarSearchControlled
    ? sidebarSearchQuery
    : searchTerm;
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState<{
    catalogKey: string;
    anchor: HTMLElement;
  } | null>(null);
  const [sortOption, setSortOption] = useState<'name' | 'lastAccessed' | 'size'>('name');
  const { apps: installedApps, isLoading: installedAppsLoading } = useInstalledApps();
  const {
    excludedSet,
    listTab,
    setListTab,
    exclude: excludeFromCatalog,
    include: includeInCatalog,
  } = useInstalledCatalogExclusions();
  const installedAppsListLoading = installedAppsLoading && installedApps.length === 0;
  const allApps = useMemo<AppType[]>(() => (
    installedApps.map((app) => ({
      name: app.name,
      iconPath: app.iconPath,
      executablePath: app.executablePath ?? null,
      shortcutPath: app.shortcutPath ?? null,
      launchUrl: app.launchUrl ?? null,
      color: getStableColor(app.name),
      category: inferCategory(app.name),
    }))
  ), [installedApps]);


  // Last-accessed and executable size are not tracked yet in renderer.
  function getAppFileStats(app: AppType) {
    void app;
    return { lastAccessed: 0, size: 0 };
  }

  const searchMatchedApps = useMemo(
    () =>
      allApps.filter((app) => {
        const matchesSearch = app.name
          .toLowerCase()
          .includes(effectiveSearchTerm.toLowerCase());
        const matchesCategory =
          compact
          || !selectedCategory
          || app.category === selectedCategory;
        return matchesSearch && matchesCategory;
      }),
    [allApps, compact, effectiveSearchTerm, selectedCategory],
  );

  const availableTabCount = useMemo(
    () =>
      searchMatchedApps.filter(
        (app) => !excludedSet.has(getInstalledAppCatalogKey(app)),
      ).length,
    [excludedSet, searchMatchedApps],
  );

  const hiddenTabCount = useMemo(
    () =>
      searchMatchedApps.filter((app) =>
        excludedSet.has(getInstalledAppCatalogKey(app)),
      ).length,
    [excludedSet, searchMatchedApps],
  );

  const filteredApps = useMemo(() => {
    const tabFiltered = searchMatchedApps.filter((app) => {
      const k = getInstalledAppCatalogKey(app);
      if (listTab === "available") return !excludedSet.has(k);
      return excludedSet.has(k);
    });
    return tabFiltered.slice().sort((a, b) => {
      if (sortOption === "name") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      if (sortOption === "lastAccessed") {
        const aStats = getAppFileStats(a);
        const bStats = getAppFileStats(b);
        return bStats.lastAccessed - aStats.lastAccessed;
      }
      if (sortOption === "size") {
        const aStats = getAppFileStats(a);
        const bStats = getAppFileStats(b);
        return bStats.size - aStats.size;
      }
      return 0;
    });
  }, [excludedSet, listTab, searchMatchedApps, sortOption]);

  useEffect(() => {
    if (listTab === "hidden" && hiddenTabCount === 0) {
      setListTab("available");
    }
  }, [hiddenTabCount, listTab, setListTab]);

  const monitorsSortedForMenu = useMemo(() => {
    const list = [...(currentProfile?.monitors ?? [])] as {
      id: string;
      name?: string;
      primary?: boolean;
    }[];
    list.sort((a, b) => {
      if (a.primary === b.primary) return 0;
      return a.primary ? -1 : 1;
    });
    return list;
  }, [currentProfile?.monitors]);

  useEffect(() => {
    setOverflowMenuOpen(null);
  }, [currentProfile?.id]);

  /** Icons for any profile layout slot using this app name (not tied to expansion UI). */
  const getAppLayoutAggregateFlags = (appName: string) => {
    let runAsAdmin = false;
    let forceCloseOnExit = false;
    let smartSave = false;
    for (const profile of profiles) {
      for (const monitor of profile.monitors || []) {
        for (const app of monitor.apps || []) {
          if (app.name === appName) {
            if (app.runAsAdmin) runAsAdmin = true;
            if (app.forceCloseOnExit) forceCloseOnExit = true;
            if (app.smartSave) smartSave = true;
          }
        }
      }
      for (const app of profile.minimizedApps || []) {
        if (app.name === appName) {
          if (app.runAsAdmin) runAsAdmin = true;
          if (app.forceCloseOnExit) forceCloseOnExit = true;
          if (app.smartSave) smartSave = true;
        }
      }
    }
    return { runAsAdmin, forceCloseOnExit, smartSave };
  };

  // CUSTOM DRAG SYSTEM - Mouse-based dragging
  const handleMouseDown = (e: React.MouseEvent, app: any) => {
    e.preventDefault();

    const dragData = {
      source: 'sidebar',
      type: 'app',
      name: app.name,
      iconPath: app.iconPath ?? null,
      executablePath: app.executablePath ?? null,
      color: app.color,
      category: app.category,
    };
    const previewIconSrc = safeIconSrc(app.iconPath);

    const preview = (
      <div className="flex items-center gap-2">
        {previewIconSrc ? (
          <img src={previewIconSrc} alt={app.name} className="w-4 h-4 rounded" />
        ) : (
          <Settings className="w-4 h-4 text-white" />
        )}
        <span>{app.name}</span>
      </div>
    );
    
    onCustomDragStart(
      dragData,
      'sidebar',
      'apps',
      { x: e.clientX, y: e.clientY },
      preview
    );
    
    // Call parent's onDragStart to enable edit mode
    if (onDragStart) {
      onDragStart();
    }
  };

  const stopRowPointerForDrag = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAddInstalledToMonitor = (app: AppType, monitorId: string) => {
    if (!currentProfile || !onAddApp) return;
    placeInstalledSidebarAppOnMonitor({
      profile: currentProfile,
      monitorId,
      app: {
        name: app.name,
        color: app.color,
        iconPath: app.iconPath,
        executablePath: app.executablePath ?? undefined,
      },
      addApp: (_profileId, mid, newApp) => {
        onAddApp(mid, newApp);
      },
    });
    setOverflowMenuOpen(null);
  };

  const handleAddInstalledToMinimized = (app: AppType) => {
    if (!currentProfile || !onAddAppToMinimized) return;
    placeInstalledSidebarAppOnMinimized({
      profile: currentProfile,
      app: {
        name: app.name,
        color: app.color,
        iconPath: app.iconPath,
        executablePath: app.executablePath ?? undefined,
      },
      addAppToMinimized: (_profileId, newApp) => {
        onAddAppToMinimized(newApp);
      },
    });
    setOverflowMenuOpen(null);
  };

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-flow-border/50 px-3 py-2.5">
          <FlowTooltip label={APPS_SIDEBAR_HELP}>
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-secondary"
              aria-label={APPS_SIDEBAR_HELP}
            >
              <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </button>
          </FlowTooltip>
          <div className="min-w-0 flex-1">
            {installedAppsListLoading ? (
              <div className="text-right">
                <span className="flow-sidebar-meta">Loading…</span>
              </div>
            ) : (
              <div
                className="flex min-w-0 flex-wrap items-center justify-end gap-1"
                role="tablist"
                aria-label="Installed apps list"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={listTab === "available"}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    listTab === "available"
                      ? "bg-flow-surface text-flow-text-primary ring-1 ring-flow-border/60"
                      : "text-flow-text-muted hover:bg-flow-surface/60 hover:text-flow-text-secondary"
                  }`}
                  onClick={() => setListTab("available")}
                >
                  <span>Available</span>
                  <span className="tabular-nums opacity-90">
                    {availableTabCount}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={listTab === "hidden"}
                  disabled={hiddenTabCount === 0}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 ${
                    listTab === "hidden"
                      ? "bg-flow-surface text-flow-text-primary ring-1 ring-flow-border/60"
                      : "text-flow-text-muted hover:bg-flow-surface/60 hover:text-flow-text-secondary"
                  }`}
                  onClick={() => setListTab("hidden")}
                >
                  <span>Hidden</span>
                  <span className="tabular-nums opacity-90">
                    {hiddenTabCount}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-3 pr-0 pb-3 pt-3">
          {!sidebarSearchControlled ? (
            <div className="relative mb-3 shrink-0">
              <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 transform text-flow-text-muted" />
              <input
                type="text"
                placeholder="Search apps..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flow-sidebar-search w-full py-2 pl-9 pr-3"
              />
            </div>
          ) : null}

        <div className="scrollbar-elegant flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
          {installedAppsListLoading ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 py-6 pr-2.5">
              <InstalledAppsSidebarSkeleton />
            </div>
          ) : (
          <div className="flex min-h-0 flex-col gap-2 pr-2.5">
          {filteredApps.map((app) => {
            const catalogKey = getInstalledAppCatalogKey(app);
            const layoutFlags = getAppLayoutAggregateFlags(app.name);
            const iconSrc = safeIconSrc(app.iconPath);
            return (
              <div
                key={catalogKey}
                className="flow-card-quiet rounded-lg"
              >
                <div className="flex items-center gap-3 p-3">
                  <FlowTooltip label="Drag to add to monitor or minimized apps">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing transition-transform duration-150 ease-out hover:scale-[1.03] select-none relative"
                    style={{ backgroundColor: `${app.color ?? '#888'}20` }}
                    onMouseDown={(e) => handleMouseDown(e, app)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {iconSrc ? (
                      <>
                        <img
                          src={iconSrc}
                          alt={app.name}
                          className="w-6 h-6 object-contain rounded"
                          draggable={false}
                          onError={e => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.parentElement?.querySelector('[data-icon-fallback="true"]') as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                        <div
                          data-icon-fallback="true"
                          style={{ display: 'none' }}
                          className="w-6 h-6 flex items-center justify-center app-icon-fallback bg-white/20 rounded"
                        >
                          <Settings className="w-3 h-3 text-white" aria-hidden />
                        </div>
                      </>
                    ) : (
                      <Settings className="w-4 h-4 text-white opacity-90" aria-hidden />
                    )}
                  </div>
                  </FlowTooltip>
                  <div
                    className={`flex-1 min-w-0${compact && onInspectInstalledApp ? " cursor-pointer rounded-md" : ""}`}
                    onClick={
                      compact && onInspectInstalledApp
                        ? () => onInspectInstalledApp(app)
                        : undefined
                    }
                    onKeyDown={
                      compact && onInspectInstalledApp
                        ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onInspectInstalledApp(app);
                          }
                        }
                        : undefined
                    }
                    role={compact && onInspectInstalledApp ? "button" : undefined}
                    tabIndex={compact && onInspectInstalledApp ? 0 : undefined}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="text-flow-text-primary text-sm font-medium truncate">
                        {app.name}
                      </h4>
                      <div className="flex items-center gap-1">
                        {layoutFlags.runAsAdmin && (
                          <FlowTooltip label="Run as Admin">
                            <span className="text-yellow-400 text-xs">⚡</span>
                          </FlowTooltip>
                        )}
                        {layoutFlags.forceCloseOnExit && (
                          <Power className="w-3 h-3 text-flow-accent-red" />
                        )}
                        {layoutFlags.smartSave && (
                          <Save className="w-3 h-3 text-flow-accent-green" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-flow-text-muted">
                      <span className="rounded bg-flow-bg-tertiary px-1.5 py-0.5 text-xs">
                        {app.category}
                      </span>
                    </div>
                  </div>
                  <div
                    className="flex shrink-0 items-center gap-0 self-center"
                    onMouseDown={stopRowPointerForDrag}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="relative">
                      <FlowTooltip label={`More actions for ${app.name}`}>
                        <button
                          type="button"
                          className="rounded-md p-1 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary"
                          aria-label={`More actions for ${app.name}`}
                          aria-haspopup="menu"
                          aria-expanded={
                            overflowMenuOpen?.catalogKey === catalogKey
                          }
                          onClick={(e) => {
                            stopRowPointerForDrag(e);
                            setOverflowMenuOpen((prev) =>
                              prev?.catalogKey === catalogKey
                                ? null
                                : {
                                    catalogKey,
                                    anchor: e.currentTarget as HTMLElement,
                                  },
                            );
                          }}
                        >
                          <MoreVertical
                            className="h-3.5 w-3.5"
                            strokeWidth={2}
                            aria-hidden
                          />
                        </button>
                      </FlowTooltip>
                      {overflowMenuOpen?.catalogKey === catalogKey ? (
                        <SidebarOverlayMenu
                          open
                          anchorEl={overflowMenuOpen.anchor}
                          onClose={() => setOverflowMenuOpen(null)}
                        >
                          <div className="px-1 py-0.5">
                            {monitorsSortedForMenu.length ? (
                              monitorsSortedForMenu.map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  role="menuitem"
                                  disabled={!currentProfile || !onAddApp}
                                  className="flow-menu-item min-w-0 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40"
                                  onClick={(e) => {
                                    stopRowPointerForDrag(e);
                                    handleAddInstalledToMonitor(app, m.id);
                                  }}
                                >
                                  <span className="truncate">
                                    {(m.name || m.id) +
                                      (m.primary ? " (primary)" : "")}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="px-3 py-2 text-[11px] text-flow-text-muted">
                                No monitors in this profile.
                              </div>
                            )}
                            <div
                              className="my-0.5 h-px bg-flow-border/50"
                              role="separator"
                              aria-hidden
                            />
                            <FlowTooltip
                              label={
                                !currentProfile ? "Select a profile first" : undefined
                              }
                            >
                              <span className="flex w-full">
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={!currentProfile || !onAddAppToMinimized}
                                  className="flow-menu-item w-full text-left text-xs disabled:cursor-not-allowed disabled:opacity-40"
                                  onClick={(e) => {
                                    stopRowPointerForDrag(e);
                                    handleAddInstalledToMinimized(app);
                                  }}
                                >
                                  Minimized row
                                </button>
                              </span>
                            </FlowTooltip>
                          </div>
                          <div
                            className="my-1 h-px bg-flow-border/60"
                            role="separator"
                            aria-hidden
                          />
                          <div className="bg-flow-bg-tertiary/25 px-1 py-0.5">
                            {listTab === "hidden" ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="flow-menu-item w-full text-left text-xs text-flow-text-secondary hover:text-flow-accent-green"
                                onClick={(e) => {
                                  stopRowPointerForDrag(e);
                                  includeInCatalog(catalogKey);
                                  setOverflowMenuOpen(null);
                                }}
                              >
                                Restore to catalog
                              </button>
                            ) : (
                              <button
                                type="button"
                                role="menuitem"
                                className="flow-menu-item w-full text-left text-xs text-flow-text-muted hover:text-flow-accent-red"
                                onClick={(e) => {
                                  stopRowPointerForDrag(e);
                                  excludeFromCatalog(catalogKey);
                                  setOverflowMenuOpen(null);
                                }}
                              >
                                Hide from catalog
                              </button>
                            )}
                          </div>
                        </SidebarOverlayMenu>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          )}
        </div>
        </div>
      </div>
    );
  }

  // Full size version (existing code would go here for non-compact mode)
  return (
    <div className="space-y-6">
      {/* Full implementation would be here */}
      <div className="text-flow-text-muted text-center py-8">
        Full App Manager (non-compact mode)
      </div>
    </div>
  );
}