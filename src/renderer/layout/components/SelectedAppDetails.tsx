import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlowTooltip } from "./ui/tooltip";
import { safeIconSrc } from "../../utils/safeIconSrc";
import {
  Trash2,
  Monitor,
  Clock,
  Zap,
  Shield,
  Globe,
  FileText,
  Plus,
  Save,
  Volume2,
  VolumeX,
  Maximize2,
  ExternalLink,
  FolderOpen,
  Replace,
  StickyNote,
  FileOutput,
  Sliders,
  Package,
  Clipboard,
  Link2,
  File,
  ChevronDown,
  Upload,
  Folder,
  GripVertical,
  LayoutDashboard,
  HelpCircle,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { InspectorPathDisplay } from "./InspectorPathDisplay";
import type { InstalledAppCatalogKeySource } from "../../utils/installedAppCatalogKey";
import {
  APP_LIBRARY_CATEGORIES,
  inferInstalledAppLibraryCategory,
  isAppLibraryCategory,
} from "../../utils/installedAppLibraryCategory";
import { buildTestLaunchSpawnArgsForFolderContentHost } from "../utils/profileAppTestLaunch";
import {
  countAssociatedFolderRoots,
  countAssociatedNonFolderEntries,
  getAssociatedContentLimitsForHost,
} from "../utils/associatedContentHostLimits";
import { useFlowSnackbar } from "./FlowSnackbar";
import {
  inspectorFieldLabelClass,
  inspectorHelperTextClass,
  inspectorPanelCompactButtonClass,
  inspectorPanelDangerButtonClass,
  inspectorPanelGridButtonDisabledClass,
  inspectorPanelListButtonClass,
  inspectorPanelNativeMonoInputClass,
  inspectorPanelNativeSelectClass,
  inspectorPanelNativeTextInputClass,
  inspectorPanelNativeTextInputFlexClass,
  inspectorPanelSwitchLabelClass,
  inspectorPanelSwitchRowClass,
  inspectorPanelSwitchTitleClass,
  inspectorPanelSwitchTrackClass,
  inspectorMenuItemClass,
  inspectorMenuPanelClass,
  inspectorMenuTriggerClass,
  inspectorSectionLabelClass,
  inspectorSectionLabelTextClass,
  inspectorTextLinkClass,
} from "./inspectorStyles";

const isRenderableIconComponent = (value: unknown): value is LucideIcon => {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return ("$$typeof" in (value as Record<string, unknown>))
    || ("render" in (value as Record<string, unknown>));
};

/** Use text/plain so Electron/Chromium reliably carries drag payload. */
const dragTabPayload = (index: number) => `flowswitch-tab:${index}`;
const parseTabDragPayload = (raw: string) => {
  const m = /^flowswitch-tab:(\d+)$/.exec(String(raw || "").trim());
  return m ? Number(m[1]) : NaN;
};

const associationBaseName = (p: string) => {
  const s = p.replace(/[/\\]+$/, "");
  const parts = s.split(/[/\\]/);
  return parts[parts.length - 1] || s;
};

const associationExtType = (fileName: string) =>
  fileName.split(".").pop()?.toLowerCase() || "unknown";

const defaultAppForAssociationFile = (fileName: string): string => {
  const ext = associationExtType(fileName);
  const appMap: Record<string, string> = {
    pdf: "Adobe Acrobat",
    doc: "Microsoft Word",
    docx: "Microsoft Word",
    xls: "Microsoft Excel",
    xlsx: "Microsoft Excel",
    ppt: "Microsoft PowerPoint",
    pptx: "Microsoft PowerPoint",
    txt: "Notepad",
    md: "Visual Studio Code",
    js: "Visual Studio Code",
    ts: "Visual Studio Code",
    tsx: "Visual Studio Code",
    jsx: "Visual Studio Code",
    py: "Visual Studio Code",
    html: "Visual Studio Code",
    css: "Visual Studio Code",
    json: "Visual Studio Code",
    jpg: "Photos",
    jpeg: "Photos",
    png: "Photos",
    gif: "Photos",
    svg: "Visual Studio Code",
    mp4: "VLC Media Player",
    avi: "VLC Media Player",
    mov: "VLC Media Player",
    mp3: "Windows Media Player",
    wav: "Windows Media Player",
    zip: "WinRAR",
    rar: "WinRAR",
    "7z": "7-Zip",
  };
  return appMap[ext] || "File Explorer";
};

interface SelectedApp {
  type: 'app' | 'browser' | 'file';
  source: 'monitor' | 'minimized' | 'sidebar';
  monitorId?: string;
  appIndex?: number;
  data: any; // The actual app/browser/file data
}

interface SelectedAppDetailsProps {
  selectedApp: SelectedApp | null;
  onClose: () => void;
  onUpdateApp?: (updates: any) => void;
  onUpdateAssociatedFiles?: (files: any[]) => void;
  onDeleteApp?: () => void;
  onMoveToMonitor?: (targetMonitorId: string) => void;
  onMoveToMinimized?: () => void;
  monitors?: any[];
  browserTabs?: any[]; // Browser tabs for the profile
  onUpdateBrowserTabs?: (tabs: any[]) => void;
  onAddBrowserTab?: (tab: any) => void;
  /** Installed app from Apps sidebar: place on layout (same behavior as sidebar + menu). */
  onAddSidebarAppToMonitor?: (monitorId: string) => void;
  onAddSidebarAppToMinimized?: () => void;
  /**
   * Persisted Apps-library type for this installed identity (mirrors to all catalog key
   * variants so the Apps list stays in sync with layout inspector edits).
   */
  onSetInstalledAppLibraryCategory?: (
    app: InstalledAppCatalogKeySource,
    category: string,
  ) => void;
  /** After saving or clearing a catalog `.exe` override, refetch catalog and refresh inspector. */
  onCatalogLaunchExeChanged?: () => void | Promise<void>;
}

type TabType = "overview" | "launch" | "content";

export function SelectedAppDetails({
  selectedApp,
  onClose,
  onUpdateApp,
  onUpdateAssociatedFiles,
  onDeleteApp,
  onMoveToMonitor,
  onMoveToMinimized,
  monitors = [],
  browserTabs = [],
  onUpdateBrowserTabs,
  onAddBrowserTab,
  onAddSidebarAppToMonitor,
  onAddSidebarAppToMinimized,
  onSetInstalledAppLibraryCategory,
  onCatalogLaunchExeChanged,
}: SelectedAppDetailsProps) {
  const { push: pushSnackbar } = useFlowSnackbar();
  const [addAssocMenuOpen, setAddAssocMenuOpen] = useState(false);
  const addAssocMenuRef = useRef<HTMLDivElement>(null);
  const [movePlacementMenuOpen, setMovePlacementMenuOpen] = useState(false);
  const [addToLayoutMenuOpen, setAddToLayoutMenuOpen] = useState(false);
  const movePlacementMenuRef = useRef<HTMLDivElement>(null);
  const addToLayoutMenuRef = useRef<HTMLDivElement>(null);
  const [appLibraryTypeMenuOpen, setAppLibraryTypeMenuOpen] = useState(false);
  const appLibraryTypeMenuRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [revealPathError, setRevealPathError] = useState<string | null>(null);
  
  const [pasteInput, setPasteInput] = useState('');
  const [identityPathCopyNotice, setIdentityPathCopyNotice] = useState<string | null>(null);
  const identityPathCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [catalogExeOverrideBusy, setCatalogExeOverrideBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (identityPathCopyTimer.current) {
        clearTimeout(identityPathCopyTimer.current);
        identityPathCopyTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setIdentityPathCopyNotice(null);
  }, [selectedApp?.data?.executablePath]);

  useEffect(() => {
    setRevealPathError(null);
  }, [
    selectedApp?.data?.executablePath,
    selectedApp?.data?.shortcutPath,
  ]);

  useEffect(() => {
    setAddAssocMenuOpen(false);
    setMovePlacementMenuOpen(false);
    setAddToLayoutMenuOpen(false);
    setAppLibraryTypeMenuOpen(false);
  }, [
    selectedApp?.data?.instanceId,
    selectedApp?.monitorId,
    selectedApp?.appIndex,
    selectedApp?.source,
  ]);

  useEffect(() => {
    if (!movePlacementMenuOpen && !addToLayoutMenuOpen && !appLibraryTypeMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const moveEl = movePlacementMenuRef.current;
      const addEl = addToLayoutMenuRef.current;
      const typeEl = appLibraryTypeMenuRef.current;
      if (movePlacementMenuOpen && moveEl && !moveEl.contains(t)) {
        setMovePlacementMenuOpen(false);
      }
      if (addToLayoutMenuOpen && addEl && !addEl.contains(t)) {
        setAddToLayoutMenuOpen(false);
      }
      if (appLibraryTypeMenuOpen && typeEl && !typeEl.contains(t)) {
        setAppLibraryTypeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [movePlacementMenuOpen, addToLayoutMenuOpen, appLibraryTypeMenuOpen]);

  useEffect(() => {
    if (!movePlacementMenuOpen && !addToLayoutMenuOpen && !appLibraryTypeMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMovePlacementMenuOpen(false);
      setAddToLayoutMenuOpen(false);
      setAppLibraryTypeMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [movePlacementMenuOpen, addToLayoutMenuOpen, appLibraryTypeMenuOpen]);

  const showAddToLayout =
    selectedApp?.source === "sidebar"
    && typeof onAddSidebarAppToMonitor === "function"
    && typeof onAddSidebarAppToMinimized === "function";

  const selectedAppTabResetKey = useMemo(() => {
    if (!selectedApp) return "";
    if (selectedApp.source === "sidebar") {
      return `sidebar:${selectedApp.type}:${String(selectedApp.data?.name ?? "")}`;
    }
    const iid = selectedApp.data?.instanceId;
    if (iid) return `slot:${String(iid)}`;
    return `slot:${selectedApp.source}:${String(selectedApp.monitorId ?? "")}:${String(selectedApp.appIndex ?? "")}`;
  }, [
    selectedApp?.source,
    selectedApp?.type,
    selectedApp?.data?.name,
    selectedApp?.data?.instanceId,
    selectedApp?.monitorId,
    selectedApp?.appIndex,
  ]);

  useEffect(() => {
    if (!selectedAppTabResetKey) return;
    setActiveTab("overview");
  }, [selectedAppTabResetKey]);

  const monitorsSortedForAdd = useMemo(() => {
    const list = [...(monitors || [])] as {
      id: string;
      name?: string;
      primary?: boolean;
    }[];
    list.sort((a, b) => {
      if (a.primary === b.primary) return 0;
      return a.primary ? -1 : 1;
    });
    return list;
  }, [monitors]);

  const tabs: { id: TabType; label: string; icon: LucideIcon }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "launch", label: "Launch", icon: Sliders },
    { id: "content", label: "Content", icon: Package },
  ];

  useEffect(() => {
    if (!addAssocMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = addAssocMenuRef.current;
      if (el && !el.contains(e.target as Node)) setAddAssocMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [addAssocMenuOpen]);

  const handleCatalogTestLaunchFromInspector = useCallback(async () => {
    if (!selectedApp) return;
    const fromSidebar = selectedApp.source === "sidebar";
    const fromProfileApp =
      (selectedApp.source === "monitor" || selectedApp.source === "minimized")
      && (selectedApp.type === "app" || selectedApp.type === "browser");
    if (!fromSidebar && !fromProfileApp) return;
    const d = selectedApp.data;
    if (!window.electron?.testLaunchCatalogApp) {
      pushSnackbar("Test launch is not available.", { variant: "error" });
      return;
    }
    const spawnArgs = buildTestLaunchSpawnArgsForFolderContentHost(d);
    const r = await window.electron.testLaunchCatalogApp({
      name: d.name,
      executablePath: d.executablePath ?? "",
      shortcutPath: d.shortcutPath ?? "",
      launchUrl: d.launchUrl ?? "",
      ...(spawnArgs?.length ? { spawnArgsForExecutable: spawnArgs } : {}),
    });
    if (r.ok) {
      pushSnackbar(`Started “${d.name}”.`);
    } else {
      pushSnackbar(r.error || "Test launch failed.", { variant: "error" });
    }
  }, [selectedApp, pushSnackbar]);

  const handlePickCatalogLaunchExeOverride = useCallback(async () => {
    if (!selectedApp || selectedApp.type !== "app") return;
    if (!window.electron?.pickCatalogLaunchExeOverride) {
      pushSnackbar("File picker is not available.", { variant: "error" });
      return;
    }
    const d = selectedApp.data;
    setCatalogExeOverrideBusy(true);
    try {
      const r = await window.electron.pickCatalogLaunchExeOverride({
        name: String(d.name ?? ""),
        shortcutPath: d.shortcutPath ?? null,
        launchUrl: d.launchUrl ?? null,
        executablePath: typeof d.executablePath === "string" ? d.executablePath : "",
      });
      if (!r.ok) {
        if (r.canceled) return;
        pushSnackbar(r.error || "Could not save override.", { variant: "error" });
        return;
      }
      pushSnackbar("Saved executable override for this catalog entry.");
      await onCatalogLaunchExeChanged?.();
    } finally {
      setCatalogExeOverrideBusy(false);
    }
  }, [selectedApp, onCatalogLaunchExeChanged, pushSnackbar]);

  const handleClearCatalogLaunchExeOverride = useCallback(async () => {
    if (!selectedApp || selectedApp.type !== "app") return;
    if (!window.electron?.clearCatalogLaunchExeOverride) {
      pushSnackbar("Clear override is not available.", { variant: "error" });
      return;
    }
    const d = selectedApp.data;
    setCatalogExeOverrideBusy(true);
    try {
      const r = await window.electron.clearCatalogLaunchExeOverride({
        name: String(d.name ?? ""),
        shortcutPath: d.shortcutPath ?? null,
        launchUrl: d.launchUrl ?? null,
      });
      if (!r.ok) {
        if (r.canceled) return;
        pushSnackbar(r.error || "Could not clear override.", { variant: "error" });
        return;
      }
      if (r.noOp) return;
      pushSnackbar("Cleared override. FlowSwitch will use discovery again.");
      await onCatalogLaunchExeChanged?.();
    } finally {
      setCatalogExeOverrideBusy(false);
    }
  }, [selectedApp, onCatalogLaunchExeChanged, pushSnackbar]);

  if (!selectedApp) {
    return (
      <div className="flex h-full min-w-0 items-center justify-center p-6 sm:p-8">
        <div className="max-w-full rounded-2xl border border-flow-border/50 bg-flow-surface/40 px-4 py-8 text-center sm:px-6">
          <div className="w-14 h-14 bg-flow-bg-tertiary/80 rounded-xl flex items-center justify-center mx-auto mb-4 ring-1 ring-flow-border/40">
            <Monitor className="w-7 h-7 text-flow-text-muted" />
          </div>
          <h3 className="text-sm font-semibold text-flow-text-primary tracking-tight mb-2">No app selected</h3>
          <p className="text-xs text-flow-text-muted leading-relaxed">
            Select an app from the layout, the minimized row, or the Apps sidebar to view details.
          </p>
        </div>
      </div>
    );
  }

  const { data, type, source, monitorId, appIndex } = selectedApp;
  const isProfileSlot = source === "monitor" || source === "minimized";

  const monitorDisplayName =
    monitors.find((m) => m.id === monitorId)?.name || monitorId || "Monitor";
  const activeStatusLine =
    source === "sidebar"
      ? "Inactive"
      : source === "minimized"
        ? "Active: Minimized"
        : `Active: ${monitorDisplayName}`;

  // Handle field updates with auto-save
  const handleFieldUpdate = (field: string, value: any) => {
    if (!isProfileSlot) return;
    if (onUpdateApp) {
      onUpdateApp({ [field]: value });
    }
  };

  // Get current data
  const currentData = data;

  const installedAppTypeFieldId = `installed-app-library-type-${source}-${String(
    monitorId ?? "",
  )}-${String(appIndex ?? "na")}-${String(
    currentData?.instanceId ?? currentData?.name ?? "app",
  )}`.replace(/[^a-zA-Z0-9_-]/g, "-");

  const copyIdentityExecutablePath = async () => {
    const t = typeof currentData.executablePath === "string"
      ? currentData.executablePath.trim()
      : "";
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      if (identityPathCopyTimer.current) clearTimeout(identityPathCopyTimer.current);
      setIdentityPathCopyNotice("Copied");
      identityPathCopyTimer.current = setTimeout(() => {
        setIdentityPathCopyNotice(null);
        identityPathCopyTimer.current = null;
      }, 1600);
    } catch {
      /* ignore */
    }
  };

  const pathForRevealInExplorer = (() => {
    const sc = typeof currentData.shortcutPath === "string" ? currentData.shortcutPath.trim() : "";
    if (sc) return sc;
    const ex = typeof currentData.executablePath === "string" ? currentData.executablePath.trim() : "";
    return ex;
  })();

  const canRevealInExplorer =
    Boolean(pathForRevealInExplorer)
    && typeof window !== "undefined"
    && !!window.electron
    && typeof window.electron.showItemInFolder === "function";

  const handleRevealInExplorer = async () => {
    setRevealPathError(null);
    if (!pathForRevealInExplorer) return;
    if (!window.electron?.showItemInFolder) {
      setRevealPathError("This build cannot open File Explorer from here.");
      return;
    }
    const result = await window.electron.showItemInFolder(pathForRevealInExplorer);
    if (!result.ok) {
      setRevealPathError(result.error || "Could not open file location.");
    }
  };

  // Render app icon with proper fallback (header = 32px / 6px radius per inspector sidebar spec)
  const renderAppIcon = (app: any, variant: "default" | "header" = "default") => {
    const size = variant === "header" ? "w-8 h-8" : "w-12 h-12";
    const radius = variant === "header" ? "rounded-md" : "rounded-xl";
    const iconSrc = safeIconSrc(app.iconPath);
    if (iconSrc) {
      return (
        <div
          className={`${size} ${radius} flex items-center justify-center border border-white/20 shadow-sm overflow-hidden`}
          style={{ backgroundColor: `${app.color || '#666666'}40` }}
        >
          <img
            src={iconSrc}
            alt={app.name || 'App'}
            className="w-3/4 h-3/4 object-contain"
            draggable={false}
          />
        </div>
      );
    }

    if (!app.icon) {
      return (
        <div className={`${size} ${radius} flex items-center justify-center border border-flow-border bg-flow-surface`}>
          <span className="text-flow-text-muted text-lg">📱</span>
        </div>
      );
    }

    if (isRenderableIconComponent(app.icon)) {
      const IconComponent = app.icon;
      return (
        <div
          className={`${size} ${radius} flex items-center justify-center border border-white/20 shadow-sm`}
          style={{ backgroundColor: `${app.color}80` }}
        >
          <IconComponent className="w-1/2 h-1/2 text-white" />
        </div>
      );
    }
    return (
      <div className={`${size} ${radius} flex items-center justify-center border border-flow-border bg-flow-surface`}>
        <span className="text-flow-text-muted text-lg">❓</span>
      </div>
    );
  };

  // Render Overview tab (quick actions, add-to-layout when browsing installed apps, path)
  const renderOverviewTab = () => {
    const rawExe =
      typeof currentData.executablePath === "string"
        ? currentData.executablePath.trim()
        : "";
    const showMoveToSection =
      isProfileSlot
      && typeof onMoveToMonitor === "function"
      && typeof onMoveToMinimized === "function";
    const moveToMonitorTargets = monitorsSortedForAdd.filter(
      (m) => source !== "monitor" || m.id !== monitorId,
    );
    const layoutHasPlacementActions = showMoveToSection || showAddToLayout;

    const catalogTestLaunchDisabled =
      typeof window === "undefined"
      || typeof window.electron?.testLaunchCatalogApp !== "function"
      || !(
        rawExe
        || (typeof currentData.shortcutPath === "string"
          && currentData.shortcutPath.trim())
        || (typeof currentData.launchUrl === "string" && currentData.launchUrl.trim())
      );

    const catalogExeOverrideActive = Boolean(
      (currentData as { catalogLaunchExeOverrideActive?: boolean }).catalogLaunchExeOverrideActive,
    );

    const showInspectorTestLaunch =
      source === "sidebar" || (isProfileSlot && (type === "app" || type === "browser"));

    const currentLibraryCategory = isAppLibraryCategory(currentData.category)
      ? currentData.category
      : inferInstalledAppLibraryCategory(String(currentData.name ?? ""));

    const layoutHelpLong =
      source === "sidebar"
        ? "Place on the active profile from here, or use + or drag in the Apps list."
        : `Move this tile on the active profile.${showAddToLayout ? " From the Apps list you can also use + or drag the icon." : ""}${showMoveToSection && !showAddToLayout ? (source === "monitor" ? " Choose another monitor or the minimized row from Move to…." : " Choose a monitor from Move to….") : ""}`;

    const movePlacementDestinations: { key: string; label: string; run: () => void }[] = [];
    for (const m of moveToMonitorTargets) {
      movePlacementDestinations.push({
        key: m.id,
        label: `${m.name || m.id}${m.primary ? " (primary)" : ""}`,
        run: () => {
          onMoveToMonitor?.(m.id);
          setMovePlacementMenuOpen(false);
        },
      });
    }
    if (source === "monitor") {
      movePlacementDestinations.push({
        key: "__minimized__",
        label: "Minimized row",
        run: () => {
          onMoveToMinimized?.();
          setMovePlacementMenuOpen(false);
        },
      });
    }
    const movePlacementMenuEnabled = showMoveToSection && movePlacementDestinations.length > 0;

    return (
    <div className="min-w-0 space-y-5">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={inspectorSectionLabelTextClass}>Layout</span>
          <FlowTooltip label={layoutHelpLong}>
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flow-text-muted transition-colors hover:bg-flow-surface-elevated hover:text-flow-text-secondary"
              aria-label="Placement tips"
            >
              <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </button>
          </FlowTooltip>
        </div>
        <p className={inspectorHelperTextClass}>
          {source === "sidebar"
            ? "Place on this profile from the menu, or use + in the Apps list."
            : "Move this tile with Move to… when it is on the layout."}
        </p>

        {!isProfileSlot ? (
          <p className="rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/30 px-3 py-2 text-[11px] leading-snug text-flow-text-muted">
            This app is not on the current profile layout. Use the + button on its row in the Apps sidebar to place it on a monitor or the minimized row.
          </p>
        ) : null}

        <div className="min-w-0 space-y-2">
          <FlowTooltip label="Coming soon: swap this slot for another app from search.">
            <span className="inline-flex w-full">
              <button
                type="button"
                disabled
                aria-disabled="true"
                className={`${inspectorPanelGridButtonDisabledClass} w-full`}
              >
                <Replace className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Replace
              </button>
            </span>
          </FlowTooltip>

          {isProfileSlot ? (
            <FlowTooltip
              label={
                !onDeleteApp
                  ? "Remove is unavailable"
                  : "Remove this app from the current profile layout"
              }
            >
              <span className="inline-flex w-full">
                <button
                  type="button"
                  onClick={() => onDeleteApp?.()}
                  disabled={!onDeleteApp}
                  aria-disabled={!onDeleteApp}
                  className={`${inspectorPanelDangerButtonClass} w-full`}
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Remove from profile
                </button>
              </span>
            </FlowTooltip>
          ) : null}

          {showAddToLayout ? (
            <div ref={addToLayoutMenuRef} className="relative min-w-0">
              <button
                type="button"
                className={inspectorMenuTriggerClass}
                aria-haspopup="menu"
                aria-expanded={addToLayoutMenuOpen}
                onClick={() => {
                  setAddToLayoutMenuOpen((o) => !o);
                  setMovePlacementMenuOpen(false);
                  setAppLibraryTypeMenuOpen(false);
                }}
              >
                <span>Add to layout…</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </button>
              {addToLayoutMenuOpen ? (
                <div className={inspectorMenuPanelClass} role="menu">
                  {monitorsSortedForAdd.length ? (
                    monitorsSortedForAdd.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="menuitem"
                        className={inspectorMenuItemClass}
                        onClick={() => {
                          onAddSidebarAppToMonitor?.(m.id);
                          setAddToLayoutMenuOpen(false);
                        }}
                      >
                        {(m.name || m.id) + (m.primary ? " (primary)" : "")}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-[13px] text-flow-text-muted">No monitors in profile.</div>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className={inspectorMenuItemClass}
                    onClick={() => {
                      onAddSidebarAppToMinimized?.();
                      setAddToLayoutMenuOpen(false);
                    }}
                  >
                    Minimized row
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {showMoveToSection ? (
            <div ref={movePlacementMenuRef} className="relative min-w-0">
              <button
                type="button"
                className={inspectorMenuTriggerClass}
                disabled={!movePlacementMenuEnabled}
                aria-haspopup="menu"
                aria-expanded={movePlacementMenuOpen}
                onClick={() => {
                  if (!movePlacementMenuEnabled) return;
                  setMovePlacementMenuOpen((o) => !o);
                  setAddToLayoutMenuOpen(false);
                  setAppLibraryTypeMenuOpen(false);
                }}
              >
                <span>Move to…</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </button>
              {movePlacementMenuOpen && movePlacementMenuEnabled ? (
                <div className={inspectorMenuPanelClass} role="menu">
                  {movePlacementDestinations.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      role="menuitem"
                      className={inspectorMenuItemClass}
                      onClick={d.run}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {showMoveToSection && !movePlacementMenuEnabled && source === "minimized" ? (
                <p className="text-[13px] text-flow-text-muted">No monitors in profile.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {!layoutHasPlacementActions ? (
          <p className={inspectorHelperTextClass}>
            Placement shortcuts appear when this app is on the layout or when browsing installed apps from the sidebar.
          </p>
        ) : null}
      </div>

      {type === "app" && typeof onSetInstalledAppLibraryCategory === "function" ? (
        <div className="min-w-0 space-y-2">
          <span className={inspectorSectionLabelTextClass}>Library</span>
          <div ref={appLibraryTypeMenuRef} className="relative min-w-0 space-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`${inspectorFieldLabelClass} mb-0 flex-1`}>App type</span>
              <FlowTooltip label="Used for the type chip in the Apps library. Your choice is saved on this device.">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-flow-text-muted transition-colors hover:bg-flow-surface-elevated hover:text-flow-text-secondary"
                  aria-label="About app type"
                >
                  <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </button>
              </FlowTooltip>
            </div>
            <button
              type="button"
              id={installedAppTypeFieldId}
              className={inspectorMenuTriggerClass}
              aria-haspopup="menu"
              aria-expanded={appLibraryTypeMenuOpen}
              aria-label={`App type, currently ${currentLibraryCategory}`}
              onClick={() => {
                setAppLibraryTypeMenuOpen((o) => !o);
                setMovePlacementMenuOpen(false);
                setAddToLayoutMenuOpen(false);
              }}
            >
              <span className="min-w-0 flex-1 truncate text-left">{currentLibraryCategory}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
            </button>
            {appLibraryTypeMenuOpen ? (
              <div className={inspectorMenuPanelClass} role="menu">
                {APP_LIBRARY_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitem"
                    className={`${inspectorMenuItemClass}${
                      c === currentLibraryCategory ? " bg-flow-bg-primary/20 text-flow-text-primary" : ""
                    }`}
                    onClick={() => {
                      onSetInstalledAppLibraryCategory(
                        {
                          name: String(currentData.name ?? ""),
                          executablePath: currentData.executablePath ?? null,
                          shortcutPath: currentData.shortcutPath ?? null,
                          launchUrl: currentData.launchUrl ?? null,
                        },
                        c,
                      );
                      setAppLibraryTypeMenuOpen(false);
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="min-w-0 space-y-2">
        <span className={inspectorSectionLabelTextClass}>Paths</span>
        <div className="min-w-0 space-y-3">
          <div className="min-w-0 space-y-2">
            <span className={`${inspectorFieldLabelClass} !mb-0 block min-w-0`}>Executable path</span>
            <div className="min-w-0">
              {rawExe ? (
                <InspectorPathDisplay
                  path={rawExe}
                  copyNotice={identityPathCopyNotice}
                  onCopy={() => void copyIdentityExecutablePath()}
                  canRevealInExplorer={canRevealInExplorer}
                  onRevealInExplorer={() => void handleRevealInExplorer()}
                />
              ) : isProfileSlot ? (
                <input
                  type="text"
                  value={typeof currentData.executablePath === "string" ? currentData.executablePath : ""}
                  onChange={(e) => handleFieldUpdate("executablePath", e.target.value)}
                  className={inspectorPanelNativeMonoInputClass}
                  placeholder="C:\\Program Files\\App\\app.exe"
                />
              ) : (
                <p className="rounded-lg border border-flow-border/40 bg-flow-bg-tertiary/20 px-3 py-2 text-xs text-flow-text-muted">
                  No executable path set for this app.
                </p>
              )}
            </div>

            {!rawExe && canRevealInExplorer ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-flow-border/40 bg-flow-bg-tertiary/20 px-3 py-2">
                <button
                  type="button"
                  onClick={() => void handleRevealInExplorer()}
                  className={inspectorTextLinkClass}
                  title="Show shortcut or path in File Explorer"
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  Open in Explorer
                </button>
              </div>
            ) : null}
          </div>

          {showInspectorTestLaunch || type === "app" ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-flow-border/45 bg-flow-bg-primary/[0.07] px-2.5 py-2">
              {showInspectorTestLaunch ? (
                <button
                  type="button"
                  onClick={() => void handleCatalogTestLaunchFromInspector()}
                  disabled={catalogTestLaunchDisabled}
                  aria-disabled={catalogTestLaunchDisabled}
                  title="Run once with current paths (Windows)"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-flow-border/50 bg-flow-surface px-2.5 py-1.5 text-[11px] font-medium text-flow-text-secondary transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
                >
                  <Zap className="h-3.5 w-3.5 shrink-0 text-flow-accent-blue" strokeWidth={2} aria-hidden />
                  Test launch
                </button>
              ) : null}
              {type === "app" ? (
                <>
                  <FlowTooltip label="Opens the Windows file picker to choose a different .exe. Confirm to save it for this catalog entry.">
                    <button
                      type="button"
                      disabled={
                        catalogExeOverrideBusy
                        || typeof window === "undefined"
                        || typeof window.electron?.pickCatalogLaunchExeOverride !== "function"
                      }
                      onClick={() => void handlePickCatalogLaunchExeOverride()}
                      className={`${inspectorPanelCompactButtonClass} gap-2`}
                      aria-busy={catalogExeOverrideBusy}
                      title="Pick a different executable (Windows file picker)"
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-flow-accent-blue" strokeWidth={1.75} aria-hidden />
                      Edit launch file
                    </button>
                  </FlowTooltip>
                  {catalogExeOverrideActive ? (
                    <button
                      type="button"
                      disabled={
                        catalogExeOverrideBusy
                        || typeof window === "undefined"
                        || typeof window.electron?.clearCatalogLaunchExeOverride !== "function"
                      }
                      onClick={() => void handleClearCatalogLaunchExeOverride()}
                      className={`${inspectorTextLinkClass}${
                        catalogExeOverrideBusy ? " pointer-events-none opacity-50" : ""
                      }`}
                    >
                      Clear override
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {revealPathError ? (
            <p className="mt-1.5 text-[11px] leading-snug text-flow-accent-red" role="status">
              {revealPathError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
    );
  };

  // Render Launch Tab Content
  const renderLaunchTab = () => {
    if (!isProfileSlot) {
      return (
        <div className="rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/30 px-3 py-3 text-xs leading-relaxed text-flow-text-muted">
          Launch settings apply after this app is placed on this profile (use + next to the app in the Apps sidebar).
        </div>
      );
    }
    return (
    <div className="min-w-0 space-y-6">
      {/* Monitor Assignment */}
      <div>
        <span className={inspectorSectionLabelClass}>Monitor assignment</span>
        <div>
          <label className={inspectorFieldLabelClass}>Target Monitor</label>
            <select 
            value={currentData.monitorId || monitorId || 'monitor-1'}
            onChange={(e) => handleFieldUpdate('monitorId', e.target.value)}
            className={inspectorPanelNativeSelectClass}
          >
            {monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {monitor.name} {monitor.primary ? '(Primary)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Window Settings */}
      <div>
        <span className={inspectorSectionLabelClass}>Window settings</span>
        
        <div className="space-y-4">
          <div>
            <label className={inspectorFieldLabelClass}>Window State</label>
            <select 
              value={currentData.windowState || 'maximized'}
              onChange={(e) => handleFieldUpdate('windowState', e.target.value)}
              className={inspectorPanelNativeSelectClass}
            >
              <option value="fullscreen">Fullscreen</option>
              <option value="maximized">Maximized</option>
              <option value="minimized">Minimized</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label className={inspectorFieldLabelClass}>Launch Delay (seconds)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={currentData.launchDelay || 0}
              onChange={(e) => handleFieldUpdate('launchDelay', parseFloat(e.target.value) || 0)}
              className={inspectorPanelNativeTextInputClass}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Launch Options */}
      <div>
        <span className={inspectorSectionLabelClass}>Launch options</span>
        <div className="space-y-2">
          <div className={inspectorPanelSwitchRowClass}>
            <div className="min-w-0 flex-1">
              <div className={inspectorPanelSwitchTitleClass}>Run as Administrator</div>
              <div className={`${inspectorHelperTextClass} mt-0.5`}>
                Launch with elevated privileges
              </div>
            </div>
            <label className={inspectorPanelSwitchLabelClass}>
              <input
                type="checkbox"
                checked={currentData.runAsAdmin || false}
                onChange={(e) => handleFieldUpdate('runAsAdmin', e.target.checked)}
                className="sr-only peer"
              />
              <div className={inspectorPanelSwitchTrackClass} />
            </label>
          </div>

          <div className={inspectorPanelSwitchRowClass}>
            <div className="min-w-0 flex-1">
              <div className={inspectorPanelSwitchTitleClass}>Force Close on Exit</div>
              <div className={`${inspectorHelperTextClass} mt-0.5`}>
                Kill app when switching profiles
              </div>
            </div>
            <label className={inspectorPanelSwitchLabelClass}>
              <input
                type="checkbox"
                checked={currentData.forceCloseOnExit || false}
                onChange={(e) => handleFieldUpdate('forceCloseOnExit', e.target.checked)}
                className="sr-only peer"
              />
              <div className={inspectorPanelSwitchTrackClass} />
            </label>
          </div>

          <div className={inspectorPanelSwitchRowClass}>
            <div className="min-w-0 flex-1">
              <div className={inspectorPanelSwitchTitleClass}>Smart Save (Ctrl+S)</div>
              <div className={`${inspectorHelperTextClass} mt-0.5`}>
                Send save command before closing
              </div>
            </div>
            <label className={inspectorPanelSwitchLabelClass}>
              <input
                type="checkbox"
                checked={currentData.smartSave || false}
                onChange={(e) => handleFieldUpdate('smartSave', e.target.checked)}
                className="sr-only peer"
              />
              <div className={inspectorPanelSwitchTrackClass} />
            </label>
          </div>
        </div>
      </div>

      {/* Custom Launch Arguments */}
      <div>
        <span className={inspectorSectionLabelClass}>Custom launch arguments</span>
        <input
          type="text"
          value={currentData.customArgs || ""}
          onChange={(e) => handleFieldUpdate("customArgs", e.target.value)}
          placeholder="--profile dev --disable-extensions"
          className={inspectorPanelNativeMonoInputClass}
        />
      </div>
    </div>
    );
  };

  // Get browser tabs for this specific app/browser
  const getAppBrowserTabs = () => {
    if (type !== 'browser' && !data.name?.toLowerCase().includes('chrome') && !data.name?.toLowerCase().includes('browser') && !data.name?.toLowerCase().includes('firefox') && !data.name?.toLowerCase().includes('safari') && !data.name?.toLowerCase().includes('edge')) {
      return [];
    }

    const isBrowser = type === 'browser' || data.name?.toLowerCase().includes('chrome') || data.name?.toLowerCase().includes('browser') || data.name?.toLowerCase().includes('firefox') || data.name?.toLowerCase().includes('safari') || data.name?.toLowerCase().includes('edge');
    
    if (!isBrowser) return [];

    // Get tabs for this specific browser app
    if (source === 'monitor' && monitorId) {
      // For monitor apps, filter from global browserTabs array using instance ID
      return browserTabs.filter(tab => 
        tab.monitorId === monitorId && 
        tab.browser === data.name &&
        tab.appInstanceId === data.instanceId
      );
    } else if (source === 'minimized') {
      // For minimized apps, return the tabs stored directly in the app data
      return data.browserTabs || [];
    }
    
    return [];
  };

  // Handle adding content via paste
  const handlePasteContent = () => {
    if (!pasteInput.trim()) return;
    if (!isProfileSlot) return;

    const trimmedInput = pasteInput.trim();
    let contentType: "link" | "file";
    if (trimmedInput.match(/^https?:\/\//i)) {
      contentType = "link";
    } else if (
      trimmedInput.match(/^[a-zA-Z]:\\/i)
      || trimmedInput.startsWith("/")
      || trimmedInput.includes("\\")
    ) {
      contentType = "file";
    } else {
      contentType = "link";
    }

    if (contentType === 'link') {
      // Add as browser tab if this is a browser app
      const isBrowser = type === 'browser' || data.name?.toLowerCase().includes('chrome') || data.name?.toLowerCase().includes('browser') || data.name?.toLowerCase().includes('firefox') || data.name?.toLowerCase().includes('safari') || data.name?.toLowerCase().includes('edge');
      
      if (isBrowser) {
        if (source === 'monitor' && onAddBrowserTab) {
          // For monitor apps, add to global browserTabs array
          const newTab = {
            name: extractTitleFromUrl(trimmedInput),
            url: trimmedInput,
            browser: data.name,
            newWindow: false,
            monitorId: monitorId,
            isActive: false,
            appInstanceId: data.instanceId,
            id: `pasted-tab-${Date.now()}`
          };
          onAddBrowserTab(newTab);
        } else if (source === 'minimized' && onUpdateApp) {
          // For minimized apps, add to app's own browserTabs array
          const currentTabs = data.browserTabs || [];
          const newTab = {
            name: extractTitleFromUrl(trimmedInput),
            url: trimmedInput,
            isActive: false
          };
          onUpdateApp({ browserTabs: [...currentTabs, newTab] });
        }
      } else if (type === 'app' && onUpdateAssociatedFiles) {
        // Add as associated content for regular apps
        const newFile = {
          id: `pasted-content-${Date.now()}`,
          name: extractTitleFromUrl(trimmedInput),
          path: trimmedInput,
          type: 'url',
          url: trimmedInput,
          associatedApp: 'Default Browser',
          useDefaultApp: true
        };
        const currentFiles = currentData.associatedFiles || [];
        onUpdateAssociatedFiles([...currentFiles, newFile]);
      }
    } else if (contentType === 'file') {
      // Add as associated file
      if (type === 'app' && onUpdateAssociatedFiles) {
        const fileName = trimmedInput.split(/[/\\]/).pop() || 'Unknown File';
        const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'unknown';
        
        const newFile = {
          id: `pasted-file-${Date.now()}`,
          name: fileName,
          path: trimmedInput,
          type: fileExtension,
          associatedApp: 'Default',
          useDefaultApp: true
        };
        const currentFiles = currentData.associatedFiles || [];
        onUpdateAssociatedFiles([...currentFiles, newFile]);
      }
    }

    // Clear input
    setPasteInput('');
  };

  // Extract title from URL
  const extractTitleFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '') || 'New Tab';
    } catch {
      return url.length > 30 ? url.substring(0, 30) + '...' : url;
    }
  };

  // Remove browser tab
  const removeBrowserTab = (tabIndex: number) => {
    const appTabs = getAppBrowserTabs();
    const tabToRemove = appTabs[tabIndex];
    if (!tabToRemove) return;

    if (source === 'monitor' && onUpdateBrowserTabs) {
      // For monitor apps, remove from global browserTabs array
      const updatedTabs = browserTabs.filter(tab => 
        !(tab.monitorId === tabToRemove.monitorId && 
          tab.browser === tabToRemove.browser && 
          tab.name === tabToRemove.name && 
          tab.url === tabToRemove.url &&
          tab.appInstanceId === data.instanceId)
      );
      onUpdateBrowserTabs(updatedTabs);
    } else if (source === 'minimized' && onUpdateApp) {
      // For minimized apps, remove from app's own browserTabs array
      const currentTabs = data.browserTabs || [];
      const updatedAppTabs = currentTabs.filter((_: any, index: number) => index !== tabIndex);
      onUpdateApp({ browserTabs: updatedAppTabs });
    }
  };

  // Remove associated file
  const removeAssociatedFile = (fileIndex: number) => {
    if (!onUpdateAssociatedFiles) return;
    if (!isProfileSlot) return;

    const currentFiles = currentData.associatedFiles || [];
    const updatedFiles = currentFiles.filter((_: any, index: number) => index !== fileIndex);
    onUpdateAssociatedFiles(updatedFiles);
  };

  const tabMatchesThisApp = (t: {
    monitorId?: string;
    browser?: string;
    appInstanceId?: string;
  }) => (
    source === "monitor"
    && Boolean(monitorId)
    && t.monitorId === monitorId
    && t.browser === data.name
    && t.appInstanceId === data.instanceId
  );

  const reorderBrowserTabs = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (source === "monitor" && onUpdateBrowserTabs) {
      const mineInOrder = browserTabs.filter(tabMatchesThisApp);
      if (
        fromIndex < 0
        || toIndex < 0
        || fromIndex >= mineInOrder.length
        || toIndex >= mineInOrder.length
      ) return;
      const reordered = [...mineInOrder];
      const [item] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, item);
      let i = 0;
      const newGlobal = browserTabs.map((t) => (tabMatchesThisApp(t) ? reordered[i++] : t));
      onUpdateBrowserTabs(newGlobal);
    } else if (source === "minimized" && onUpdateApp) {
      const tabs = [...(data.browserTabs || [])];
      if (
        fromIndex < 0
        || toIndex < 0
        || fromIndex >= tabs.length
        || toIndex >= tabs.length
      ) return;
      const [item] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, item);
      onUpdateApp({ browserTabs: tabs });
    }
  };

  const associatedRowDisplayName = (file: any) => {
    const rawPathOrUrl = String(file?.path || file?.url || "").trim();
    const isFolder = String(file?.type || "").toLowerCase() === "folder";
    const explicitName = String(file?.name || "").trim();
    if (!rawPathOrUrl && explicitName) return explicitName;
    if (!rawPathOrUrl) return "Untitled content";
    if (isFolder) {
      const normalized = rawPathOrUrl.replace(/[\\/]+$/, "");
      const parts = normalized.split(/[\\/]/).filter(Boolean);
      return parts[parts.length - 1] || explicitName || rawPathOrUrl;
    }
    return explicitName || rawPathOrUrl;
  };

  const hasDesktopPicker = Boolean(
    typeof window !== "undefined"
    && window.electron?.pickContentLibraryPaths,
  );

  const handlePickAssociatedPaths = async (mode: "files" | "directory") => {
    setAddAssocMenuOpen(false);
    if (!onUpdateAssociatedFiles || !isProfileSlot) return;
    const pick = window.electron?.pickContentLibraryPaths;
    if (!pick) {
      window.alert("Desktop file picker is not available in this environment.");
      return;
    }
    const limits = getAssociatedContentLimitsForHost(data.name);
    const currentFiles = currentData.associatedFiles || [];
    const existingFolders = countAssociatedFolderRoots(currentFiles);
    const existingNonFolders = countAssociatedNonFolderEntries(currentFiles);

    try {
      const res = await pick({ mode });
      if (res.canceled || !res.entries?.length) return;
      let dirs = res.entries.filter((e) => e.kind === "directory");
      let files = res.entries.filter((e) => e.kind === "file");
      if (dirs.length && files.length) {
        window.alert("Choose only files or only folders in the same pick — not both.");
        return;
      }

      if (
        limits.maxFolderRoots != null
        && dirs.length > 0
      ) {
        const remainingFolderSlots = Math.max(
          0,
          limits.maxFolderRoots - existingFolders,
        );
        if (remainingFolderSlots <= 0) {
          pushSnackbar(
            `${data.name} already has a folder workspace here. Remove it before adding another folder, or add files instead.`,
            { variant: "error" },
          );
          return;
        }
        if (dirs.length > remainingFolderSlots) {
          pushSnackbar(
            `${data.name} supports only ${limits.maxFolderRoots} folder workspace here. Added the first folder from your selection.`,
            { variant: "error" },
          );
          dirs = dirs.slice(0, remainingFolderSlots);
        }
      }

      if (
        limits.maxNonFolderEntries != null
        && files.length > 0
      ) {
        const remaining = Math.max(
          0,
          limits.maxNonFolderEntries - existingNonFolders,
        );
        if (remaining <= 0) {
          pushSnackbar(
            `${data.name} reached the maximum number of file attachments for this slot.`,
            { variant: "error" },
          );
          return;
        }
        if (files.length > remaining) {
          pushSnackbar(
            `Only ${remaining} more file(s) allowed for ${data.name}. Added the first selections.`,
            { variant: "error" },
          );
          files = files.slice(0, remaining);
        }
      }

      const stamp = Date.now();
      const additions: Array<{
        id: string;
        name: string;
        path: string;
        type: string;
        url?: string;
        associatedApp: string;
        useDefaultApp: boolean;
      }> = [];
      if (files.length) {
        for (let i = 0; i < files.length; i++) {
          const fp = files[i].path;
          const bn = associationBaseName(fp);
          additions.push({
            id: `picked-file-${stamp}-${i}`,
            name: bn,
            path: fp,
            type: associationExtType(bn),
            associatedApp: defaultAppForAssociationFile(bn),
            useDefaultApp: true,
          });
        }
      }
      if (dirs.length) {
        for (let i = 0; i < dirs.length; i++) {
          const dp = dirs[i].path;
          const bn = associationBaseName(dp);
          additions.push({
            id: `picked-folder-${stamp}-${i}`,
            name: bn,
            path: dp,
            type: "folder",
            associatedApp: "File Explorer",
            useDefaultApp: true,
          });
        }
      }
      if (!additions.length) return;
      onUpdateAssociatedFiles([...currentFiles, ...additions]);
    } catch {
      window.alert("Could not open the file picker.");
    }
  };

  // Render Content Tab Content
  const renderContentTab = () => {
    if (!isProfileSlot) {
      return (
        <div className="rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/30 px-3 py-3 text-xs leading-relaxed text-flow-text-muted">
          Files and URLs apply after this app is placed on this profile. Custom launch arguments are on the Launch tab.
        </div>
      );
    }
    const isBrowser = type === 'browser' || data.name?.toLowerCase().includes('chrome') || data.name?.toLowerCase().includes('browser') || data.name?.toLowerCase().includes('firefox') || data.name?.toLowerCase().includes('safari') || data.name?.toLowerCase().includes('edge');
    const appBrowserTabs = getAppBrowserTabs();

    const assocLimits = getAssociatedContentLimitsForHost(data.name);
    const assocRows = currentData.associatedFiles || [];
    const assocFolderCount = countAssociatedFolderRoots(assocRows);
    const folderSlotsLeft =
      assocLimits.maxFolderRoots == null
        ? null
        : Math.max(0, assocLimits.maxFolderRoots - assocFolderCount);
    const folderAddBlocked =
      assocLimits.maxFolderRoots != null
      && folderSlotsLeft !== null
      && folderSlotsLeft <= 0;
    const folderAddHint = folderAddBlocked
      ? `${data.name} supports only one folder workspace on this tile. Remove the folder above or add files instead.`
      : assocLimits.maxFolderRoots === 1
        ? "One folder workspace; you can still add multiple files."
        : undefined;

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
        {/* Quick Add Section */}
        <div className="min-w-0 shrink-0">
          <span className={inspectorSectionLabelClass}>Quick add content</span>
          <div className="min-w-0 space-y-2 rounded-lg border border-flow-border bg-flow-surface p-3 sm:p-4">
            <div className="min-w-0">
              <label className={inspectorFieldLabelClass}>
                Paste file path or URL (auto-detected)
              </label>
              <div className="flex min-w-0 gap-2">
                <input
                  type="text"
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  placeholder="C:\\path\\to\\file.txt or https://example.com"
                  className={inspectorPanelNativeTextInputFlexClass}
                  onKeyDown={(e) => e.key === "Enter" && handlePasteContent()}
                />
                <button
                  type="button"
                  onClick={handlePasteContent}
                  disabled={!pasteInput.trim()}
                  className="shrink-0 rounded-lg bg-flow-accent-blue px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-flow-accent-blue-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Browser Tabs (for browser apps) */}
        {isBrowser && (
          <div className="max-h-48 shrink-0 overflow-hidden">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <span className={`${inspectorSectionLabelTextClass} min-w-0`}>
                Browser tabs
              </span>
              <span className="shrink-0 text-xs text-flow-text-muted">
                {appBrowserTabs.length} tab{appBrowserTabs.length !== 1 ? "s" : ""}
              </span>
            </div>

            {appBrowserTabs.length > 0 ? (
              <div className="scrollbar-elegant max-h-40 space-y-2 overflow-y-auto">
                {appBrowserTabs.map((tab: any, index: number) => (
                  <div
                    key={tab.id || `tab-${index}-${tab.url}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = parseTabDragPayload(e.dataTransfer.getData("text/plain"));
                      if (Number.isNaN(from)) return;
                      reorderBrowserTabs(from, index);
                    }}
                    className="group flex min-w-0 items-center gap-2 rounded-lg border border-flow-border bg-flow-surface p-3"
                  >
                    <FlowTooltip label="Drag to reorder">
                      <span
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.setData("text/plain", dragTabPayload(index));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="shrink-0 cursor-grab touch-none text-flow-text-muted active:cursor-grabbing"
                        aria-hidden
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    </FlowTooltip>
                    <Globe className="h-4 w-4 shrink-0 text-flow-text-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-flow-text-primary truncate">{tab.name}</div>
                      <div className="text-xs text-flow-text-muted truncate">{tab.url}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {tab.isActive && <div className="h-2 w-2 shrink-0 rounded-full bg-flow-accent-blue" />}
                      <button
                        type="button"
                        onClick={() => window.open(tab.url, "_blank", "noopener,noreferrer")}
                        className="shrink-0 rounded-lg p-1.5 text-flow-text-muted transition-colors hover:text-flow-accent-blue opacity-0 group-hover:opacity-100"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBrowserTab(index)}
                        className="shrink-0 rounded-lg p-1.5 text-flow-text-muted transition-colors hover:text-flow-accent-red opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center bg-flow-surface rounded-lg border border-flow-border">
                <Globe className="w-8 h-8 text-flow-text-muted mx-auto mb-2" />
                <p className="text-sm text-flow-text-muted">No tabs configured</p>
                <p className="text-xs text-flow-text-muted mt-1">Paste URLs above to add browser tabs</p>
              </div>
            )}
          </div>
        )}

        {/* Associated Content (fills remaining tab height) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="grid min-w-0 shrink-0 grid-cols-1 gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <span className={`${inspectorSectionLabelTextClass} min-w-0`}>
              Associated content
            </span>
            {onUpdateAssociatedFiles && hasDesktopPicker ? (
              <div
                className="relative z-[60] flex w-full min-w-0 shrink-0 justify-end overflow-visible sm:w-auto sm:justify-self-end"
                ref={addAssocMenuRef}
              >
                <button
                  type="button"
                  onClick={() => setAddAssocMenuOpen((o) => !o)}
                  className={`${inspectorPanelCompactButtonClass} gap-1 px-2.5 py-1.5 text-xs`}
                >
                  <Plus className="h-3 w-3 shrink-0" aria-hidden />
                  Add
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                </button>
                {addAssocMenuOpen ? (
                  <div
                    className="flow-menu-panel flow-menu-panel--compact flow-menu-panel-enter absolute right-0 top-full z-[70] mt-1 max-sm:!max-w-full max-sm:!min-w-0 max-sm:!w-[min(11rem,100%)] py-0.5"
                    role="menu"
                  >
                    <button
                      type="button"
                      className="flow-menu-item text-xs"
                      onClick={() => void handlePickAssociatedPaths("files")}
                    >
                      <Upload className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                      Add files…
                    </button>
                    {folderAddBlocked ? (
                      <FlowTooltip label={folderAddHint ?? ""}>
                        <span className="block w-full">
                          <button
                            type="button"
                            disabled
                            className="flow-menu-item cursor-not-allowed text-xs opacity-45"
                          >
                            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/90" aria-hidden />
                            Add folder…
                          </button>
                        </span>
                      </FlowTooltip>
                    ) : (
                      <FlowTooltip label={folderAddHint ?? "Pick one folder to open with this app"}>
                        <button
                          type="button"
                          className="flow-menu-item w-full text-xs"
                          onClick={() => void handlePickAssociatedPaths("directory")}
                        >
                          <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/90" aria-hidden />
                          Add folder…
                        </button>
                      </FlowTooltip>
                    )}
                  </div>
                ) : null}
              </div>
            ) : onUpdateAssociatedFiles ? (
              <span className="text-[11px] text-flow-text-muted">Picker unavailable</span>
            ) : null}
          </div>

          {(currentData.associatedFiles || []).length > 0 ? (
            <div className="scrollbar-elegant flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {(currentData.associatedFiles || []).map((file: any, index: number) => (
                <div
                  key={file.id || `assoc-${index}-${file.path || file.url || ""}`}
                  className="group flex min-w-0 shrink-0 items-center gap-2 rounded-lg border border-flow-border bg-flow-surface p-3"
                >
                  {file.type === "url" || file.url ? (
                    <Link2 className="h-4 w-4 shrink-0 text-flow-accent-blue" />
                  ) : (
                    <FileIcon type={file.type} className="h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <FlowTooltip label={String(file.path || file.url || "").trim() || "No path"}>
                      <div className="truncate text-sm font-medium text-flow-text-primary">
                        {associatedRowDisplayName(file)}
                      </div>
                    </FlowTooltip>
                    {String(file?.type || "").toLowerCase() !== "folder" ? (
                      <FlowTooltip label={String(file.path || file.url || "").trim() || "No path"}>
                        <div className="truncate text-xs text-flow-text-muted">
                          {file.path || file.url}
                        </div>
                      </FlowTooltip>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => removeAssociatedFile(index)}
                      className="shrink-0 rounded-lg p-1.5 text-flow-text-muted transition-colors hover:text-flow-accent-red"
                      title="Remove associated content"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-flow-border bg-flow-surface p-6 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-flow-text-muted" />
              <p className="text-sm text-flow-text-muted">No associated content for this app</p>
              <p className="mt-1 text-xs text-flow-text-muted">
                Use Add → files or folder (same as Content sidebar), or paste a path or URL above.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const appInspectorTabSlideIndex =
    activeTab === "overview" ? 0 : activeTab === "launch" ? 1 : 2;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-transparent">
      {/* App Header - Always visible */}
      <div className="border-b border-white/[0.06] bg-flow-bg-primary/[0.04] px-3 py-3 backdrop-blur-sm sm:px-4">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {renderAppIcon(currentData, "header")}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold leading-snug tracking-tight text-flow-text-primary">
              {currentData.name}
            </h2>
            <p
              className={`mt-0.5 text-[12px] font-normal leading-snug ${
                source === "sidebar"
                  ? "text-flow-text-muted"
                  : "text-flow-text-secondary"
              }`}
            >
              {activeStatusLine}
            </p>
          </div>
        </div>
      </div>

      {/* Tab navigation — same rail + slide indicator as library sidebar (Profiles / Apps / Content) */}
      <div className="shrink-0 border-b border-white/[0.06] px-2 py-2 sm:px-3 sm:py-2.5 md:px-4">
        <div
          className="flow-library-tablist flow-library-tablist--inspector-narrow"
          role="tablist"
          aria-label="App inspector"
        >
          <div className="flow-library-tablist-rail gap-1">
            <div
              className="pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 w-1/3 rounded-full bg-flow-accent-blue flow-tab-slide-track"
              style={{
                transform: `translate3d(calc(${appInspectorTabSlideIndex} * 100%), 0, 0)`,
              }}
              aria-hidden
            />
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <FlowTooltip key={tab.id} label={tab.label} side="bottom">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-label={tab.label}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flow-library-tab flow-library-tab--icon-only min-w-0 ${
                      activeTab === tab.id ? "flow-library-tab-active" : "flow-library-tab-idle"
                    }`}
                  >
                    <IconComponent className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="sr-only">{tab.label}</span>
                  </button>
                </FlowTooltip>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab panels: horizontal slide (transform); inactive columns are inert to pointer. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-3 pr-0 py-4 sm:pl-4">
        <div
          className="flow-tab-slide-track flex h-full min-h-0 w-[300%] min-w-0 flex-shrink-0"
          style={{
            transform: `translate3d(calc(-100% / 3 * ${appInspectorTabSlideIndex}), 0, 0)`,
          }}
        >
          <div
            className={`flex h-full min-h-0 w-1/3 min-w-0 flex-shrink-0 flex-col ${
              activeTab === "overview"
                ? ""
                : "pointer-events-none select-none overflow-hidden"
            }`}
            aria-hidden={activeTab !== "overview"}
          >
            <div
              className={
                activeTab === "overview"
                  ? "scrollbar-elegant min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-3 sm:pr-4"
                  : "min-h-0 flex-1 overflow-hidden pr-3 sm:pr-4"
              }
            >
              {renderOverviewTab()}
            </div>
          </div>
          <div
            className={`flex h-full min-h-0 w-1/3 min-w-0 flex-shrink-0 flex-col ${
              activeTab === "launch"
                ? ""
                : "pointer-events-none select-none overflow-hidden"
            }`}
            aria-hidden={activeTab !== "launch"}
          >
            <div
              className={
                activeTab === "launch"
                  ? "scrollbar-elegant min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-3 sm:pr-4"
                  : "min-h-0 flex-1 overflow-hidden pr-3 sm:pr-4"
              }
            >
              {renderLaunchTab()}
            </div>
          </div>
          <div
            className={`flex h-full min-h-0 w-1/3 min-w-0 flex-shrink-0 flex-col ${
              activeTab === "content"
                ? ""
                : "pointer-events-none select-none overflow-hidden"
            }`}
            aria-hidden={activeTab !== "content"}
          >
            <div
              className={
                activeTab === "content"
                  ? isProfileSlot
                    ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pr-3 sm:pr-4"
                    : "scrollbar-elegant min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-3 sm:pr-4"
                  : "min-h-0 flex-1 overflow-hidden pr-3 sm:pr-4"
              }
            >
              {renderContentTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}