import { useEffect, useMemo, useState } from "react";
import { safeIconSrc } from "../../utils/safeIconSrc";
import { X, Search, Plus, Monitor, Settings, LayoutGrid, MoreVertical } from "lucide-react";
import { useInstalledApps } from "../../hooks/useInstalledApps";
import { useInstalledCatalogExclusions } from "../../hooks/useInstalledCatalogExclusions";
import { getInstalledAppCatalogKey } from "../../utils/installedAppCatalogKey";
import { SidebarOverlayMenu } from "./SidebarOverlayMenu";
import { FlowTooltip } from "./ui/tooltip";

interface App {
  name: string;
  icon: any;
  iconPath?: string | null;
  executablePath?: string | null;
  shortcutPath?: string | null;
  launchUrl?: string | null;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  volume?: number;
  launchBehavior?: 'new' | 'focus' | 'minimize';
  runAsAdmin?: boolean;
  forceCloseOnExit?: boolean;
  smartSave?: boolean;
  monitorId?: string;
}

interface AddAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddApp: (app: any) => void;
  monitorId?: string;
  monitorName?: string;
  existingApps?: App[];
  monitorOrientation?: string;
  monitors?: Array<{
    id: string;
    name: string;
    primary: boolean;
    orientation?: string;
  }>;
  allowMonitorSelection?: boolean;
}

const getStableColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

export function AddAppModal({ 
  isOpen, 
  onClose, 
  onAddApp, 
  monitorId, 
  monitorName, 
  existingApps = [],
  monitorOrientation = 'landscape',
  monitors = [],
  allowMonitorSelection = false
}: AddAppModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonitor, setSelectedMonitor] = useState(monitorId || (monitors.length > 0 ? monitors[0].id : ''));
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [catalogOverflow, setCatalogOverflow] = useState<{
    rowKey: string;
    anchor: HTMLElement;
  } | null>(null);
  const [installedListVersion, setInstalledListVersion] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    setInstalledListVersion((n) => n + 1);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setCatalogOverflow(null);
  }, [isOpen]);
  const { apps: installedApps, isLoading: installedAppsLoading } = useInstalledApps({
    installedListVersion,
  });
  const {
    excludedSet,
    listTab,
    setListTab,
    exclude: excludeFromCatalog,
    include: includeInCatalog,
  } = useInstalledCatalogExclusions();
  const availableApps = useMemo(() => (
    installedApps.map((app) => {
      return {
        name: app.name,
        icon: Settings,
        color: getStableColor(app.name),
        iconPath: app.iconPath,
        executablePath: app.executablePath ?? null,
        shortcutPath: app.shortcutPath ?? null,
        launchUrl: app.launchUrl ?? null,
      };
    })
  ), [installedApps]);

  const searchPostExisting = useMemo(
    () =>
      availableApps.filter((app) => {
        if (!app.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          return false;
        }
        const rowKey = getInstalledAppCatalogKey(app);
        return !existingApps.some(
          (existing) =>
            getInstalledAppCatalogKey({
              name: existing.name,
              executablePath: existing.executablePath ?? null,
              shortcutPath: existing.shortcutPath ?? null,
              launchUrl: existing.launchUrl ?? null,
            }) === rowKey,
        );
      }),
    [availableApps, existingApps, searchTerm],
  );

  const availableTabCount = useMemo(
    () =>
      searchPostExisting.filter(
        (app) => !excludedSet.has(getInstalledAppCatalogKey(app)),
      ).length,
    [excludedSet, searchPostExisting],
  );

  const hiddenTabCount = useMemo(
    () =>
      searchPostExisting.filter((app) =>
        excludedSet.has(getInstalledAppCatalogKey(app)),
      ).length,
    [excludedSet, searchPostExisting],
  );

  const filteredApps = useMemo(
    () =>
      searchPostExisting.filter((app) => {
        const k = getInstalledAppCatalogKey(app);
        if (listTab === "available") return !excludedSet.has(k);
        return excludedSet.has(k);
      }),
    [excludedSet, listTab, searchPostExisting],
  );

  useEffect(() => {
    if (listTab === "hidden" && hiddenTabCount === 0) {
      setListTab("available");
    }
  }, [hiddenTabCount, listTab, setListTab]);

  useEffect(() => {
    if (!selectedApp) return;
    const k = getInstalledAppCatalogKey(selectedApp);
    if (listTab === "available" && excludedSet.has(k)) {
      setSelectedApp(null);
    }
    if (listTab === "hidden" && !excludedSet.has(k)) {
      setSelectedApp(null);
    }
  }, [excludedSet, listTab, selectedApp]);

  const handleAddApp = () => {
    if (!selectedApp) return;

    const targetMonitorId = allowMonitorSelection ? selectedMonitor : monitorId;
    const targetMonitor = monitors.find(m => m.id === targetMonitorId);
    const isPortrait = targetMonitor?.orientation === 'portrait';

    const newApp = {
      name: selectedApp.name,
      icon: selectedApp.icon,
      iconPath: selectedApp.iconPath ?? null,
      executablePath: selectedApp.executablePath ?? null,
      shortcutPath: selectedApp.shortcutPath ?? null,
      launchUrl: selectedApp.launchUrl ?? null,
      color: selectedApp.color,
      position: { x: 50, y: 50 },
      size: { 
        width: isPortrait ? 80 : 60, 
        height: isPortrait ? 40 : 60 
      },
      volume: 50,
      launchBehavior: 'new' as const,
      runAsAdmin: false,
      forceCloseOnExit: false,
      smartSave: false,
      monitorId: targetMonitorId
    };

    onAddApp(newApp);
    setSelectedApp(null);
    setSearchTerm('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm flow-modal-backdrop-enter">
      <div className="app-no-drag flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-flow-border bg-flow-surface-elevated shadow-lg flow-modal-panel-enter">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-flow-border">
          <div>
            <h2 className="text-lg text-flow-text-primary font-semibold">Add Application</h2>
            <p className="text-sm text-flow-text-secondary mt-1">
              {allowMonitorSelection 
                ? 'Choose an app and select which monitor to place it on'
                : `Add to ${monitorName || 'Monitor'}`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-flow-surface rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-flow-text-secondary" />
          </button>
        </div>

        {/* Monitor Selection */}
        {allowMonitorSelection && monitors.length > 0 && (
          <div className="p-6 border-b border-flow-border">
            <label className="text-sm text-flow-text-secondary mb-3 block">Target Monitor</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {monitors.map((monitor) => (
                <button
                  key={monitor.id}
                  onClick={() => setSelectedMonitor(monitor.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    selectedMonitor === monitor.id
                      ? 'border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue'
                      : 'border-flow-border bg-flow-surface hover:bg-flow-surface-elevated text-flow-text-secondary'
                  }`}
                >
                  <Monitor className="w-4 h-4 flex-shrink-0" />
                  <div className="text-left min-w-0">
                    <div className="text-sm font-medium truncate">{monitor.name}</div>
                    <div className="text-xs opacity-70 flex items-center gap-1">
                      {monitor.primary && <span>Primary</span>}
                      {monitor.orientation === 'portrait' && <span>Portrait</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex flex-col gap-3 border-b border-flow-border p-6 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-flow-text-muted" />
            <input
              type="text"
              placeholder="Search applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-flow-border bg-flow-surface py-3 pl-10 pr-4 text-flow-text-primary placeholder-flow-text-muted focus:border-flow-accent-blue focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50"
            />
          </div>
          <div
            className="flex shrink-0 flex-wrap items-center gap-1"
            role="tablist"
            aria-label="Application catalog list"
          >
            <button
              type="button"
              role="tab"
              aria-selected={listTab === "available"}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                listTab === "available"
                  ? "border-flow-accent-blue/50 bg-flow-accent-blue/10 text-flow-accent-blue"
                  : "border-flow-border bg-flow-surface text-flow-text-muted hover:bg-flow-surface-elevated hover:text-flow-text-secondary"
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
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 ${
                listTab === "hidden"
                  ? "border-flow-accent-blue/50 bg-flow-accent-blue/10 text-flow-accent-blue"
                  : "border-flow-border bg-flow-surface text-flow-text-muted hover:bg-flow-surface-elevated hover:text-flow-text-secondary"
              }`}
              onClick={() => setListTab("hidden")}
            >
              <span>Hidden</span>
              <span className="tabular-nums opacity-90">
                {hiddenTabCount}
              </span>
            </button>
          </div>
        </div>

        {/* App List */}
        <div className="scrollbar-elegant flex-1 overflow-y-auto p-6">
          {installedAppsLoading && installedApps.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-5 py-10"
              role="status"
              aria-live="polite"
              aria-busy="true"
              aria-label="Loading applications"
            >
              <div className="relative flex h-12 w-12 items-center justify-center">
                <span className="absolute inset-0 rounded-xl bg-flow-accent-blue/14 motion-reduce:opacity-60" />
                <LayoutGrid
                  className="relative h-6 w-6 text-flow-accent-blue motion-safe:flow-installed-apps-loader-icon"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </div>
              <p className="text-sm font-medium text-flow-text-secondary">Loading applications…</p>
              <div className="grid w-full max-w-lg grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-lg border border-flow-border/45 bg-flow-surface/60 motion-safe:flow-installed-apps-skeleton-row"
                    style={{ animationDelay: `${i * 55}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : filteredApps.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredApps.map((app) => {
                const IconComponent = app.icon;
                const iconSrc = safeIconSrc(app.iconPath);
                const rowKey = getInstalledAppCatalogKey(app);
                const isSelected = selectedApp && getInstalledAppCatalogKey(selectedApp) === rowKey;
                return (
                  <div
                    key={rowKey}
                    className={`relative rounded-lg border transition-all hover:scale-[1.02] ${
                      isSelected
                        ? "border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue"
                        : "border-flow-border bg-flow-surface text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full flex-col items-center gap-3 p-4 text-left"
                      onClick={() => {
                        setCatalogOverflow(null);
                        setSelectedApp(app);
                      }}
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${app.color}20` }}
                      >
                        {iconSrc ? (
                          <img src={iconSrc} alt={app.name} className="h-5 w-5 rounded object-contain" />
                        ) : (
                          <IconComponent className="h-5 w-5" style={{ color: app.color }} />
                        )}
                      </div>
                      <span className="text-center text-sm font-medium">{app.name}</span>
                    </button>
                    <div className="absolute right-0.5 top-0.5 z-10">
                      <FlowTooltip label={`More actions for ${app.name}`}>
                        <button
                          type="button"
                          className="rounded-md p-0.5 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary"
                          aria-label={`More actions for ${app.name}`}
                          aria-haspopup="menu"
                          aria-expanded={catalogOverflow?.rowKey === rowKey}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCatalogOverflow((prev) =>
                              prev?.rowKey === rowKey
                                ? null
                                : {
                                    rowKey,
                                    anchor: e.currentTarget as HTMLElement,
                                  },
                            );
                          }}
                        >
                          <MoreVertical className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        </button>
                      </FlowTooltip>
                      {catalogOverflow?.rowKey === rowKey ? (
                        <SidebarOverlayMenu
                          open
                          anchorEl={catalogOverflow.anchor}
                          onClose={() => setCatalogOverflow(null)}
                        >
                          <div className="bg-flow-bg-tertiary/25 px-1 py-0.5">
                            {listTab === "hidden" ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="flow-menu-item w-full text-left text-xs text-flow-text-secondary hover:text-flow-accent-green"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  includeInCatalog(rowKey);
                                  setCatalogOverflow(null);
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
                                  e.stopPropagation();
                                  excludeFromCatalog(rowKey);
                                  setCatalogOverflow(null);
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
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-flow-surface rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-flow-text-muted" />
              </div>
              <p className="text-flow-text-secondary">
                {searchTerm ? 'No apps found matching your search' : 'No more apps available'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-flow-border">
          <div className="text-sm text-flow-text-muted">
            {selectedApp && (
              <span>Selected: <strong className="text-flow-text-secondary">{selectedApp.name}</strong></span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-flow-text-secondary hover:bg-flow-surface rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddApp}
              disabled={!selectedApp}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-flow-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Add App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}