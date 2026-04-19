import { useEffect, useMemo, useState } from "react";
import { safeIconSrc } from "../../utils/safeIconSrc";
import {
  Search,
  Settings,
  Trash2,
  Power,
  Save,
  Move,
  LayoutGrid,
  Plus,
} from "lucide-react";
import { useInstalledApps } from "../../hooks/useInstalledApps";
import {
  placeInstalledSidebarAppOnMinimized,
  placeInstalledSidebarAppOnMonitor,
} from "../utils/sidebarExplicitPlacement";
import { SidebarOverlayMenu } from "./SidebarOverlayMenu";

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
}



type AppType = {
  name: string;
  iconPath: string | null;
  executablePath?: string | null;
  color?: string;
  category?: string;
  firstLetter?: string;
};

const getStableColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

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
  onUpdateProfile, 
  onAddApp, 
  onAddAppToMinimized, 
  onDragStart,
  onCustomDragStart,
  currentProfile, 
  compact = false,
  sidebarSearchQuery,
  onSidebarSearchQueryChange,
}: AppManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const sidebarSearchControlled =
    Boolean(compact)
    && typeof sidebarSearchQuery === "string"
    && typeof onSidebarSearchQueryChange === "function";
  const effectiveSearchTerm = sidebarSearchControlled
    ? sidebarSearchQuery
    : searchTerm;
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState<{
    appName: string;
    anchor: HTMLElement;
  } | null>(null);
  const [sortOption, setSortOption] = useState<'name' | 'lastAccessed' | 'size'>('name');
  const installedApps = useInstalledApps();
  const allApps = useMemo<AppType[]>(() => (
    installedApps.map((app) => ({
      name: app.name,
      iconPath: app.iconPath,
      executablePath: app.executablePath ?? null,
      color: getStableColor(app.name),
      category: inferCategory(app.name),
      firstLetter: app.name.charAt(0).toUpperCase(),
    }))
  ), [installedApps]);


  // Last-accessed and executable size are not tracked yet in renderer.
  function getAppFileStats(app: AppType) {
    void app;
    return { lastAccessed: 0, size: 0 };
  }

  let filteredApps = allApps.filter((app) => {
    const matchesSearch = app.name
      .toLowerCase()
      .includes(effectiveSearchTerm.toLowerCase());
    const matchesCategory =
      compact
      || !selectedCategory
      || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Sorting logic
  filteredApps = filteredApps.slice().sort((a, b) => {
    if (sortOption === 'name') {
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    } else if (sortOption === 'lastAccessed') {
      const aStats = getAppFileStats(a);
      const bStats = getAppFileStats(b);
      return bStats.lastAccessed - aStats.lastAccessed;
    } else if (sortOption === 'size') {
      const aStats = getAppFileStats(a);
      const bStats = getAppFileStats(b);
      return bStats.size - aStats.size;
    }
    return 0;
  });

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
    setAddMenuOpen(null);
  }, [currentProfile?.id]);

  const getAppUsage = (appName: string) => {
    const usage = {
      profiles: [] as any[],
      totalInstances: 0,
      avgVolume: 0,
      commonBehavior: 'new' as string,
      runAsAdmin: false,
      forceCloseOnExit: false,
      smartSave: false
    };

    profiles.forEach(profile => {
      const instances: any[] = [];
      
      // Check monitors
      profile.monitors?.forEach((monitor: any) => {
        monitor.apps?.forEach((app: any) => {
          if (app.name === appName) {
            instances.push({ ...app, location: monitor.name, type: 'monitor' });
          }
        });
      });
      
      // Check minimized apps
      profile.minimizedApps?.forEach((app: any) => {
        if (app.name === appName) {
          instances.push({ ...app, location: 'Minimized', type: 'minimized' });
        }
      });

      if (instances.length > 0) {
        usage.profiles.push({ profile, instances });
        usage.totalInstances += instances.length;
      }
    });

    // Calculate averages and common settings
    if (usage.totalInstances > 0) {
      const allInstances = usage.profiles.flatMap(p => p.instances);
      
      const volumes = allInstances.map(i => i.volume || 0);
      usage.avgVolume = Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length);
      
      const behaviors = allInstances.map(i => i.launchBehavior);
      usage.commonBehavior = behaviors.sort((a, b) =>
        behaviors.filter(v => v === a).length - behaviors.filter(v => v === b).length
      ).pop() || 'new';

      // Check if any instance has special settings
      usage.runAsAdmin = allInstances.some(i => i.runAsAdmin);
      usage.forceCloseOnExit = allInstances.some(i => i.forceCloseOnExit);
      usage.smartSave = allInstances.some(i => i.smartSave);
    }

    return usage;
  };

  const removeAppFromProfile = (appName: string, profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    const updatedMonitors = profile.monitors.map((monitor: any) => ({
      ...monitor,
      apps: monitor.apps.filter((app: any) => app.name !== appName)
    }));

    const updatedMinimizedApps = profile.minimizedApps?.filter((app: any) => app.name !== appName) || [];

    onUpdateProfile(profileId, {
      monitors: updatedMonitors,
      minimizedApps: updatedMinimizedApps,
      appCount: Math.max(0, profile.appCount - 1)
    });
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
      firstLetter: app.firstLetter
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
    setAddMenuOpen(null);
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
    setAddMenuOpen(null);
  };

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-flow-border/50 px-3 py-3">
          <div className="flex items-center gap-2">
            <LayoutGrid
              className="h-3.5 w-3.5 shrink-0 text-flow-text-muted"
              strokeWidth={1.75}
              aria-hidden
            />
            <h2 className="flow-sidebar-section-title">Apps</h2>
          </div>
          <span className="flow-sidebar-meta">{filteredApps.length} available</span>
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

          <div className="mb-3 shrink-0 rounded-lg border border-flow-border/50 bg-flow-surface/60 p-3">
            <div className="flex items-center gap-2 text-[11px] text-flow-text-secondary">
              <Move className="h-3.5 w-3.5 shrink-0 text-flow-accent-blue" strokeWidth={1.75} />
              <span>
                Use <span className="font-medium text-flow-text-primary">+</span> to add to a
                monitor or minimized row. Drag the app icon to place precisely on the canvas.
              </span>
            </div>
          </div>

        <div className="scrollbar-elegant flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="flex min-h-0 flex-col gap-2 pr-2.5">
          {filteredApps.map((app, index) => {
            const usage = getAppUsage(app.name);
            const isExpanded = expandedApp === app.name || expandedApp === 'toggle-all';
            const iconSrc = safeIconSrc(app.iconPath);
            return (
              <div 
                key={index} 
                className="flow-card-quiet rounded-lg"
              >
                <div className="flex items-center gap-3 p-3">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing transition-transform duration-150 ease-out hover:scale-[1.03] select-none relative"
                    style={{ backgroundColor: `${app.color ?? '#888'}20` }}
                    onMouseDown={(e) => handleMouseDown(e, app)}
                    title="Drag to add to monitor or minimized apps"
                  >
                    {iconSrc ? (
                      <img
                        src={iconSrc}
                        alt={app.name}
                        className="w-6 h-6 object-contain rounded"
                        draggable={false}
                        onError={e => {
                          // Hide broken image and show explicit fallback element.
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.parentElement?.querySelector('[data-icon-fallback="true"]') as HTMLElement | null;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    {/* Fallback: Lucide icon or first letter */}
                    {'firstLetter' in app && app.firstLetter ? (
                      <span className="absolute bottom-0 right-0 bg-gray-800 text-white text-[10px] font-bold rounded px-1 pb-0.5 leading-none border border-white/10 pointer-events-none">
                        {app.firstLetter}
                      </span>
                    ) : null}
                    {/* Fallback for broken image: show Lucide icon or first letter if image fails */}
                    {iconSrc ? (
                      <div
                        data-icon-fallback="true"
                        style={{ display: 'none' }}
                        className="w-6 h-6 flex items-center justify-center app-icon-fallback bg-white/20 rounded"
                      >
                        {app.firstLetter ? app.firstLetter : <Settings className="w-3 h-3 text-white" />}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4
                        className="text-flow-text-primary cursor-pointer text-sm font-medium truncate hover:text-flow-accent-blue"
                        title={
                          usage.profiles.length
                            ? "Show where this app is used in profiles"
                            : undefined
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddMenuOpen(null);
                          setExpandedApp(
                            isExpanded ? null : app.name,
                          );
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setAddMenuOpen(null);
                            setExpandedApp(
                              isExpanded ? null : app.name,
                            );
                          }
                        }}
                        role={usage.profiles.length ? "button" : undefined}
                        tabIndex={usage.profiles.length ? 0 : undefined}
                      >
                        {app.name}
                      </h4>
                      <div className="flex items-center gap-1">
                        {usage.runAsAdmin && (
                          <span className="text-yellow-400 text-xs" title="Run as Admin">⚡</span>
                        )}
                        {usage.forceCloseOnExit && (
                          <Power className="w-3 h-3 text-flow-accent-red" />
                        )}
                        {usage.smartSave && (
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
                    className="flex shrink-0 items-center gap-0.5 self-center"
                    onMouseDown={stopRowPointerForDrag}
                  >
                    <div className="relative">
                      <button
                        type="button"
                        disabled={!currentProfile || !onAddApp}
                        title={
                          !currentProfile
                            ? "Select a profile first"
                            : "Add to a monitor or minimized row"
                        }
                        aria-label={`Add ${app.name} to layout`}
                        aria-expanded={addMenuOpen?.appName === app.name}
                        aria-haspopup="menu"
                        onClick={(e) => {
                          stopRowPointerForDrag(e);
                          setAddMenuOpen((prev) =>
                            prev?.appName === app.name
                              ? null
                              : {
                                  appName: app.name,
                                  anchor: e.currentTarget as HTMLElement,
                                },
                          );
                        }}
                        className="rounded-md p-1.5 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </button>
                      {addMenuOpen?.appName === app.name ? (
                        <SidebarOverlayMenu
                          open
                          anchorEl={addMenuOpen.anchor}
                          onClose={() => setAddMenuOpen(null)}
                        >
                          {monitorsSortedForMenu.length ? (
                            monitorsSortedForMenu.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                role="menuitem"
                                className="flow-menu-item min-w-0 text-left text-xs"
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
                            role="none"
                          />
                          <button
                            type="button"
                            role="menuitem"
                            disabled={!currentProfile || !onAddAppToMinimized}
                            title={
                              !currentProfile
                                ? "Select a profile first"
                                : undefined
                            }
                            className="flow-menu-item text-left text-xs disabled:cursor-not-allowed disabled:opacity-40"
                            onClick={(e) => {
                              stopRowPointerForDrag(e);
                              handleAddInstalledToMinimized(app);
                            }}
                          >
                            Minimized row
                          </button>
                          <div className="border-t border-flow-border/40 px-2 py-1.5 text-[10px] leading-snug text-flow-text-muted">
                            Drag the app icon to drop on a specific tile.
                          </div>
                        </SidebarOverlayMenu>
                      ) : null}
                    </div>
                  </div>
                </div>
                {/* Expanded Details - CLEAN: More compact */}
                {isExpanded && usage.profiles.length > 0 && (
                  <div className="px-3 pb-3 space-y-1">
                    {usage.profiles.slice(0, 3).map((profileUsage, pIndex) => (
                      <div key={pIndex} className="flex items-center justify-between text-xs p-2 bg-flow-bg-tertiary rounded">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-flow-text-primary font-medium truncate">{profileUsage.profile.name}</span>
                          <div className="flex gap-1">
                            {profileUsage.instances.slice(0, 2).map((instance: any, iIndex: number) => (
                              <span key={iIndex} className="px-1 py-0.5 bg-flow-surface text-flow-text-muted rounded text-xs">
                                {instance.location}
                              </span>
                            ))}
                            {profileUsage.instances.length > 2 && (
                              <span className="px-1 py-0.5 bg-flow-surface text-flow-text-muted rounded text-xs">
                                +{profileUsage.instances.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeAppFromProfile(app.name, profileUsage.profile.id)}
                          className="p-1 hover:bg-flow-accent-red/20 rounded text-flow-accent-red transition-colors flex-shrink-0"
                          title="Remove from profile"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {usage.profiles.length > 3 && (
                      <div className="text-xs text-flow-text-muted text-center py-1">
                        +{usage.profiles.length - 3} more profiles
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
        </div>

        {/* App Settings Modal */}
        {showAppSettings && selectedApp && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="scrollbar-elegant max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-flow-border bg-flow-surface-elevated p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${selectedApp.color}20` }}
                  >
                    <Settings className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-flow-text-primary font-medium">{selectedApp.name}</h3>
                    <p className="text-flow-text-muted text-xs">Global app settings</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAppSettings(false)}
                  className="p-1 hover:bg-flow-surface rounded transition-colors"
                >
                  <Save className="w-4 h-4 text-flow-text-muted rotate-45" />
                </button>
              </div>

              <div className="space-y-4">
                {selectedApp.usage.profiles.map((profileUsage: any, index: number) => (
                  <div key={index} className="bg-flow-surface border border-flow-border rounded-lg p-3">
                    <h4 className="text-flow-text-primary text-sm mb-2">{profileUsage.profile.name}</h4>
                    <div className="space-y-2">
                      {profileUsage.instances.map((instance: any, iIndex: number) => (
                        <div key={iIndex} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-flow-text-secondary">{instance.location}</span>
                            <div className="flex items-center gap-1">
                              {instance.runAsAdmin && <span className="text-yellow-400">⚡</span>}
                              {instance.forceCloseOnExit && <Power className="w-3 h-3 text-flow-accent-red" />}
                              {instance.smartSave && <Save className="w-3 h-3 text-flow-accent-green" />}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-flow-text-muted">{instance.volume || 50}%</span>
                            <span className="text-flow-text-muted">{instance.launchBehavior}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                <button 
                  onClick={() => setShowAppSettings(false)}
                  className="flex-1 px-3 py-2 bg-flow-surface text-flow-text-secondary border border-flow-border rounded-lg text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
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