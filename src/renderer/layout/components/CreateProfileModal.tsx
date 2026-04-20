import { useEffect, useMemo, useState } from "react";
import { safeIconSrc } from "../../utils/safeIconSrc";
import { formatUnit } from "../../utils/pluralize";
import { X, Search, Plus, Scan, Folder, Monitor, Globe, Settings, LayoutGrid, MoreVertical } from "lucide-react";
import { useInstalledApps } from "../../hooks/useInstalledApps";
import { useInstalledCatalogExclusions } from "../../hooks/useInstalledCatalogExclusions";
import { getInstalledAppCatalogKey } from "../../utils/installedAppCatalogKey";
import { SidebarOverlayMenu } from "./SidebarOverlayMenu";

interface CreateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProfile: (profile: any) => void;
}

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

type MemoryCapture = {
  capturedAt: number;
  appCount: number;
  monitors: Array<{
    id: string;
    name: string;
    systemName?: string | null;
    primary: boolean;
    resolution: string;
    orientation: 'landscape' | 'portrait';
    layoutPosition?: { x: number; y: number };
    apps: Array<{
      name: string;
      iconPath: string | null;
      executablePath?: string | null;
      position: { x: number; y: number };
      size: { width: number; height: number };
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
  }>;
  error?: string;
};

type DetectedMonitor = {
  id: string;
  name: string;
  systemName?: string | null;
  primary: boolean;
  resolution: string;
  orientation: 'landscape' | 'portrait';
  layoutPosition?: { x: number; y: number };
};

const LAYOUT_ALIGN_THRESHOLD = 14;

const getMonitorFootprint = (orientation: 'landscape' | 'portrait') => (
  orientation === 'portrait'
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
  T extends { id: string; orientation: 'landscape' | 'portrait'; layoutPosition?: { x: number; y: number } }
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

  // Keep monitors from overlapping by nudging conflicting cards.
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

export function CreateProfileModal({ isOpen, onClose, onCreateProfile }: CreateProfileModalProps) {
  const [creationMode, setCreationMode] = useState<'manual' | 'memory'>('manual');
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileIcon, setProfileIcon] = useState('work');
  const [selectedApps, setSelectedApps] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [memoryCapture, setMemoryCapture] = useState<MemoryCapture | null>(null);
  const [isCapturingMemory, setIsCapturingMemory] = useState(false);
  const [memoryCaptureError, setMemoryCaptureError] = useState<string | null>(null);
  const [detectedMonitors, setDetectedMonitors] = useState<DetectedMonitor[]>([]);
  const [catalogOverflow, setCatalogOverflow] = useState<{
    catalogKey: string;
    anchor: HTMLElement;
  } | null>(null);
  const { apps: installedApps, isLoading: installedAppsLoading } = useInstalledApps();
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
        category: inferCategory(app.name),
        iconPath: app.iconPath,
        executablePath: app.executablePath ?? null,
        shortcutPath: app.shortcutPath ?? null,
        launchUrl: app.launchUrl ?? null,
      };
    })
  ), [installedApps]);

  const categories = Array.from(new Set(availableApps.map(app => app.category)));

  const searchMatchedApps = useMemo(
    () =>
      availableApps.filter((app) => {
        const matchesSearch = app.name
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
        const matchesCategory =
          !selectedCategory || app.category === selectedCategory;
        return matchesSearch && matchesCategory;
      }),
    [availableApps, searchTerm, selectedCategory],
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

  const filteredApps = useMemo(
    () =>
      searchMatchedApps.filter((app) => {
        const k = getInstalledAppCatalogKey(app);
        if (listTab === "available") return !excludedSet.has(k);
        return excludedSet.has(k);
      }),
    [excludedSet, listTab, searchMatchedApps],
  );

  useEffect(() => {
    if (listTab === "hidden" && hiddenTabCount === 0) {
      setListTab("available");
    }
  }, [hiddenTabCount, listTab, setListTab]);

  useEffect(() => {
    setSelectedApps((prev) => {
      const next = prev.filter((s) => {
        const k = getInstalledAppCatalogKey(s);
        if (listTab === "available") return !excludedSet.has(k);
        return excludedSet.has(k);
      });
      if (
        next.length === prev.length
        && next.every((item, i) => item === prev[i])
      ) {
        return prev;
      }
      return next;
    });
  }, [excludedSet, listTab]);

  const totalCapturedApps = useMemo(() => {
    if (!memoryCapture) return 0;
    const visibleCount = memoryCapture.monitors.reduce((sum, monitor) => sum + monitor.apps.length, 0);
    const minimizedCount = memoryCapture.minimizedApps?.length || 0;
    return visibleCount + minimizedCount;
  }, [memoryCapture]);

  useEffect(() => {
    if (!isOpen) return;
    if (!window.electron?.getSystemMonitors) return;

    let cancelled = false;
    const loadMonitors = async () => {
      try {
        const monitors = await window.electron.getSystemMonitors();
        if (cancelled) return;
        if (Array.isArray(monitors) && monitors.length > 0) {
          setDetectedMonitors(monitors.map((monitor) => ({
            id: monitor.id,
            name: monitor.name,
            systemName: monitor.systemName ?? null,
            primary: monitor.primary,
            resolution: monitor.resolution,
            orientation: monitor.orientation,
            layoutPosition: monitor.layoutPosition,
          })));
        }
      } catch {
        // Keep manual profile creation resilient with fallback monitor defaults.
      }
    };

    void loadMonitors();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setCatalogOverflow(null);
  }, [isOpen]);

  const captureMemoryLayout = async () => {
    if (!window.electron || typeof window.electron.captureRunningAppLayout !== 'function') {
      setMemoryCaptureError('Layout capture is not available in this build.');
      return;
    }
    setIsCapturingMemory(true);
    setMemoryCaptureError(null);
    try {
      const capture = await window.electron.captureRunningAppLayout();
      if (capture.error) {
        setMemoryCaptureError(capture.error);
      }
      setMemoryCapture(capture);
    } catch {
      setMemoryCaptureError('Failed to capture running app layout.');
      setMemoryCapture(null);
    } finally {
      setIsCapturingMemory(false);
    }
  };

  const toggleApp = (app: any) => {
    setSelectedApps(prev => 
      prev.find(a => a.name === app.name)
        ? prev.filter(a => a.name !== app.name)
        : [...prev, { ...app, volume: 50, launchBehavior: 'new' }]
    );
  };

  const createManualProfile = () => {
    if (!profileName.trim()) return;

    const fallbackMonitors: DetectedMonitor[] = [{
      id: 'monitor-1',
      name: 'Monitor 1',
      primary: true,
      resolution: '1920x1080',
      orientation: 'landscape',
      layoutPosition: { x: 0, y: 0 },
    }];
    const sourceMonitors = normalizeMonitorLayout((detectedMonitors.length > 0 ? detectedMonitors : fallbackMonitors)
      .slice()
      .sort((a, b) => {
        const ay = a.layoutPosition?.y ?? 0;
        const by = b.layoutPosition?.y ?? 0;
        const ax = a.layoutPosition?.x ?? 0;
        const bx = b.layoutPosition?.x ?? 0;
        return ay - by || ax - bx || Number(b.primary) - Number(a.primary);
      }));

    const appsPerMonitor: Array<typeof selectedApps> = sourceMonitors.map(() => []);
    selectedApps.forEach((app, index) => {
      const targetMonitorIndex = index % sourceMonitors.length;
      appsPerMonitor[targetMonitorIndex].push(app);
    });

    const newProfile = {
      id: `profile-${Date.now()}`,
      name: profileName,
      icon: profileIcon,
      description: profileDescription || `Custom profile with ${formatUnit(selectedApps.length, "app")}`,
      appCount: selectedApps.length,
      tabCount: 0,
      globalVolume: 70,
      backgroundBehavior: 'keep' as const,
      restrictedApps: [],
      estimatedStartupTime: Math.max(3, selectedApps.length * 0.8),
      autoLaunch: false,
      monitors: sourceMonitors.map((monitor, monitorIndex) => ({
          id: monitor.id,
          name: monitor.name,
          systemName: monitor.systemName ?? null,
          primary: monitor.primary,
          resolution: monitor.resolution,
          orientation: monitor.orientation,
          layoutPosition: monitor.layoutPosition ?? { x: monitorIndex * 100, y: 0 },
          apps: appsPerMonitor[monitorIndex].map((app, index) => ({
            name: app.name,
            icon: app.icon,
            iconPath: app.iconPath ?? null,
            executablePath: app.executablePath ?? null,
            shortcutPath: app.shortcutPath ?? null,
            launchUrl: app.launchUrl ?? null,
            color: app.color,
            position: { x: 30 + (index % 2) * 40, y: 30 + Math.floor(index / 2) * 40 },
            size: { width: 35, height: 30 },
            volume: app.volume,
            launchBehavior: app.launchBehavior
          }))
        })),
      minimizedApps: [],
      browserTabs: []
    };
    
    onCreateProfile(newProfile);
  };

  const createMemoryProfile = () => {
    if (!profileName.trim() || !memoryCapture) return;
    const orderedMonitors = normalizeMonitorLayout([...memoryCapture.monitors].sort((a, b) => {
      const ay = a.layoutPosition?.y ?? 0;
      const by = b.layoutPosition?.y ?? 0;
      const ax = a.layoutPosition?.x ?? 0;
      const bx = b.layoutPosition?.x ?? 0;
      return ay - by || ax - bx;
    }));

    const newProfile = {
      id: `memory-${Date.now()}`,
      name: profileName,
      icon: profileIcon,
      description: profileDescription || `Captured layout with ${formatUnit(totalCapturedApps, "app")}`,
      appCount: totalCapturedApps,
      tabCount: 0,
      globalVolume: 70,
      backgroundBehavior: 'keep' as const,
      restrictedApps: [],
      estimatedStartupTime: Math.max(3, totalCapturedApps * 0.5),
      autoLaunch: false,
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
          launchBehavior: 'new' as const,
        })),
      })),
      minimizedApps: (memoryCapture.minimizedApps || []).map((app) => {
        return {
          name: app.name,
          icon: Settings,
          iconPath: app.iconPath ?? null,
          executablePath: app.executablePath ?? null,
          color: getStableColor(app.name),
          volume: 50,
          launchBehavior: 'minimize' as const,
          targetMonitor: app.targetMonitor || (orderedMonitors.find((m) => m.primary)?.id || orderedMonitors[0]?.id || 'monitor-1'),
          sourcePosition: app.sourcePosition || app.position,
          sourceSize: app.sourceSize || app.size,
          instanceId: `${app.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
      }),
      browserTabs: []
    };
    
    onCreateProfile(newProfile);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto scrollbar-elegant">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-white text-xl">Create New Profile</h3>
            <p className="text-white/60 text-sm">Build a custom workspace or capture your current layout</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Creation Mode Toggle */}
        <div className="flex bg-white/10 border border-white/20 rounded-lg p-1 mb-6">
          <button 
            onClick={() => setCreationMode('manual')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-sm transition-colors ${
              creationMode === 'manual' 
                ? 'bg-purple-500/30 text-purple-200' 
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            Manual Selection
          </button>
          <button 
            onClick={() => setCreationMode('memory')}
            onMouseDown={() => {
              if (!memoryCapture && !isCapturingMemory) {
                void captureMemoryLayout();
              }
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-sm transition-colors ${
              creationMode === 'memory' 
                ? 'bg-purple-500/30 text-purple-200' 
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Scan className="w-4 h-4" />
            App Layout Memory
          </button>
        </div>

        {/* Profile Basic Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-white mb-2">Profile Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
              placeholder="Enter profile name..."
            />
          </div>
          <div>
            <label className="block text-white mb-2">Icon</label>
            <div className="flex gap-2">
              {[
                { id: 'work', icon: Folder, label: 'Work' },
                { id: 'gaming', icon: Monitor, label: 'Gaming' },
                { id: 'personal', icon: Globe, label: 'Personal' },
              ].map((iconOption) => (
                <button
                  key={iconOption.id}
                  onClick={() => setProfileIcon(iconOption.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    profileIcon === iconOption.id
                      ? 'border-purple-400/60 bg-purple-500/20'
                      : 'border-white/20 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <iconOption.icon className="w-4 h-4 text-white" />
                  <span className="text-white text-sm">{iconOption.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-white mb-2">Description (Optional)</label>
          <textarea
            value={profileDescription}
            onChange={(e) => setProfileDescription(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50 resize-none"
            rows={2}
            placeholder="Describe this profile..."
          />
        </div>

        {/* Manual Selection Mode */}
        {creationMode === 'manual' && (
          <div className="space-y-6">
            {/* Search and Filter */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-white/50" />
                  <input
                    type="text"
                    placeholder="Search applications..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pl-10 pr-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                  />
                </div>
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50 sm:min-w-[10rem]"
                >
                  <option value="">All Categories</option>
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div
                className="flex flex-wrap items-center gap-1"
                role="tablist"
                aria-label="Application catalog list"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={listTab === "available"}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    listTab === "available"
                      ? "border-purple-400/60 bg-purple-500/25 text-white"
                      : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
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
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-35 ${
                    listTab === "hidden"
                      ? "border-purple-400/60 bg-purple-500/25 text-white"
                      : "border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
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

            {/* App Selection Grid */}
            <div>
              <h4 className="text-white mb-3">Select Applications ({selectedApps.length} selected)</h4>
              <div className="grid grid-cols-6 gap-3 max-h-64 overflow-y-auto scrollbar-elegant">
                {installedAppsLoading && installedApps.length === 0 ? (
                  <div
                    className="col-span-6 flex flex-col items-center justify-center gap-3 py-12 text-sm text-white/55"
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                    aria-label="Loading applications"
                  >
                    <LayoutGrid
                      className="h-8 w-8 text-white/70 motion-safe:flow-installed-apps-loader-icon"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span>Loading applications…</span>
                  </div>
                ) : filteredApps.map((app) => {
                  const catalogKey = getInstalledAppCatalogKey(app);
                  const iconSrc = safeIconSrc(app.iconPath);
                  return (
                  <div
                    key={catalogKey}
                    className={`relative rounded-lg border transition-all ${
                      selectedApps.find(a => a.name === app.name)
                        ? 'border-purple-400/60 bg-purple-500/20'
                        : 'border-white/20 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      className="w-full p-3 text-left"
                      onClick={() => {
                        setCatalogOverflow(null);
                        toggleApp(app);
                      }}
                    >
                      <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2"
                        style={{ backgroundColor: `${app.color}20` }}
                      >
                        {iconSrc ? (
                          <img src={iconSrc} alt={app.name} className="w-5 h-5 object-contain rounded" />
                        ) : (
                          <app.icon className="w-5 h-5 text-white" />
                        )}
                      </div>
                      <div className="text-white text-xs text-center truncate">{app.name}</div>
                      <div className="text-white/50 text-xs text-center">{app.category}</div>
                    </button>
                    <div className="absolute right-0.5 top-0.5 z-10">
                      <button
                        type="button"
                        className="rounded p-0.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                        title={`More actions for ${app.name}`}
                        aria-label={`More actions for ${app.name}`}
                        aria-haspopup="menu"
                        aria-expanded={catalogOverflow?.catalogKey === catalogKey}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCatalogOverflow((prev) =>
                            prev?.catalogKey === catalogKey
                              ? null
                              : {
                                  catalogKey,
                                  anchor: e.currentTarget as HTMLElement,
                                },
                          );
                        }}
                      >
                        <MoreVertical className="h-3 w-3" strokeWidth={2} aria-hidden />
                      </button>
                      {catalogOverflow?.catalogKey === catalogKey ? (
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
                                  includeInCatalog(catalogKey);
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
                                  excludeFromCatalog(catalogKey);
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
            </div>
          </div>
        )}

        {/* App Layout Memory Mode */}
        {creationMode === 'memory' && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/20 rounded-lg p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h4 className="text-white flex items-center gap-2">
                  <Scan className="w-4 h-4" />
                  Current App Layout Detection
                </h4>
                <button
                  onClick={() => void captureMemoryLayout()}
                  disabled={isCapturingMemory}
                  className="px-3 py-1.5 text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isCapturingMemory ? 'Capturing...' : 'Refresh Capture'}
                </button>
              </div>
              <p className="text-white/70 text-sm mb-4">
                {memoryCapture
                  ? `FlowSwitch detected ${totalCapturedApps} running apps across ${memoryCapture.monitors.length} monitor(s).`
                  : 'Capture your currently running applications and estimated positions.'}
              </p>
              {memoryCaptureError && (
                <p className="text-red-300 text-xs mb-3">{memoryCaptureError}</p>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                {memoryCapture?.monitors.map((monitor) => (
                  <div key={monitor.id}>
                    <h5 className="text-white/80 text-sm mb-2">{monitor.name}</h5>
                    <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-elegant">
                      {monitor.apps.map((app, index) => {
                        const iconSrc = safeIconSrc(app.iconPath);
                        return (
                          <div key={`${app.name}-${index}`} className="flex items-center gap-2 text-white/70 text-sm">
                            <div
                              className="w-4 h-4 rounded flex items-center justify-center"
                              style={{ backgroundColor: `${getStableColor(app.name)}40` }}
                            >
                              {iconSrc ? (
                                <img src={iconSrc} alt={app.name} className="w-3 h-3 object-contain rounded" />
                              ) : (
                                <Settings className="w-2.5 h-2.5 text-white" />
                              )}
                            </div>
                            <span className="truncate">{app.name}</span>
                            <span className="text-white/50 text-xs">
                              {Math.round(app.size.width)}% x {Math.round(app.size.height)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={creationMode === 'manual' ? createManualProfile : createMemoryProfile}
            disabled={
              !profileName.trim()
              || (creationMode === 'manual' && selectedApps.length === 0)
              || (creationMode === 'memory' && totalCapturedApps === 0)
            }
            className="flex-1 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Profile
          </button>
        </div>
      </div>
    </div>
  );
}