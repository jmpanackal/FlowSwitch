import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlowTooltip } from "./ui/tooltip";
import { safeIconSrc } from "../../utils/safeIconSrc";
import {
  Settings,
  Trash2,
  Monitor,
  Clock,
  Zap,
  Shield,
  Globe,
  FileText,
  Plus,
  Edit,
  Save,
  X,
  Volume2,
  VolumeX,
  Maximize2,
  Copy,
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
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { ClickCopyPathBlock } from "./ClickCopyPathBlock";
import type { InstalledAppCatalogKeySource } from "../../utils/installedAppCatalogKey";
import {
  APP_LIBRARY_CATEGORIES,
  inferInstalledAppLibraryCategory,
  isAppLibraryCategory,
} from "../../utils/installedAppLibraryCategory";
import {
  inspectorFieldLabelClass,
  inspectorHelperTextClass,
  inspectorPanelCompactButtonClass,
  inspectorPanelCompactButtonDisabledClass,
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
  inspectorSectionPrimaryTitleClass,
} from "./inspectorStyles";

const isRenderableIconComponent = (value: unknown): value is LucideIcon => {
  if (typeof value === "function") return true;
  if (!value || typeof value !== "object") return false;
  return ("$$typeof" in (value as Record<string, unknown>))
    || ("render" in (value as Record<string, unknown>));
};

/** Use text/plain so Electron/Chromium reliably carries drag payload. */
const dragTabPayload = (index: number) => `flowswitch-tab:${index}`;
const dragAssocPayload = (index: number) => `flowswitch-assoc:${index}`;
const parseTabDragPayload = (raw: string) => {
  const m = /^flowswitch-tab:(\d+)$/.exec(String(raw || "").trim());
  return m ? Number(m[1]) : NaN;
};
const parseAssocDragPayload = (raw: string) => {
  const m = /^flowswitch-assoc:(\d+)$/.exec(String(raw || "").trim());
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
}: SelectedAppDetailsProps) {
  const [addAssocMenuOpen, setAddAssocMenuOpen] = useState(false);
  const addAssocMenuRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [revealPathError, setRevealPathError] = useState<string | null>(null);
  
  const [pasteInput, setPasteInput] = useState('');
  const [identityPathCopyNotice, setIdentityPathCopyNotice] = useState<string | null>(null);
  const identityPathCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [
    selectedApp?.data?.instanceId,
    selectedApp?.monitorId,
    selectedApp?.appIndex,
    selectedApp?.source,
  ]);

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

  // Render app icon with proper fallback
  const renderAppIcon = (app: any, size: string = "w-12 h-12") => {
    const iconSrc = safeIconSrc(app.iconPath);
    if (iconSrc) {
      return (
        <div
          className={`${size} rounded-xl flex items-center justify-center border border-white/20 shadow-sm overflow-hidden`}
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
        <div className={`${size} bg-flow-surface rounded-xl flex items-center justify-center border border-flow-border`}>
          <span className="text-flow-text-muted text-lg">📱</span>
        </div>
      );
    }
    
    if (isRenderableIconComponent(app.icon)) {
      const IconComponent = app.icon;
      return (
        <div
          className={`${size} rounded-xl flex items-center justify-center border border-white/20 shadow-sm`}
          style={{ backgroundColor: `${app.color}80` }}
        >
          <IconComponent className="w-1/2 h-1/2 text-white" />
        </div>
      );
    }
    return (
      <div className={`${size} bg-flow-surface rounded-xl flex items-center justify-center border border-flow-border`}>
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

    return (
    <div className="min-w-0 space-y-6">
      <div className="min-w-0 space-y-3">
        <div className="min-w-0">
          <label className={`${inspectorSectionPrimaryTitleClass} mb-3`}>
            Layout
          </label>
          <p className={inspectorHelperTextClass}>
            Move, add, or remove this app on the active profile.
            {showAddToLayout ? (
              <>
                {" "}
                From the Apps list you can also use{" "}
                <span className="font-medium text-flow-text-primary">+</span> or drag the icon.
              </>
            ) : null}
            {showMoveToSection && !showAddToLayout ? (
              <>
                {" "}
                {source === "monitor"
                  ? "Use the buttons below to move to another monitor or the minimized row."
                  : "Use the buttons below to move onto a monitor."}
              </>
            ) : null}
          </p>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-col gap-2">
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
            <FlowTooltip
              label={
                !isProfileSlot
                  ? "Only apps on the layout can be removed here"
                  : !onDeleteApp
                    ? "Remove is unavailable"
                    : undefined
              }
            >
              <span className="inline-flex w-full">
                <button
                  type="button"
                  onClick={() => onDeleteApp?.()}
                  disabled={!onDeleteApp || !isProfileSlot}
                  aria-disabled={!onDeleteApp || !isProfileSlot}
                  className={`${inspectorPanelDangerButtonClass} w-full`}
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Remove
                </button>
              </span>
            </FlowTooltip>
          </div>

          {showAddToLayout ? (
            <div className="flex flex-col gap-1">
              {monitorsSortedForAdd.length ? (
                monitorsSortedForAdd.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onAddSidebarAppToMonitor?.(m.id)}
                    className={inspectorPanelListButtonClass}
                  >
                    Add to {(m.name || m.id) + (m.primary ? " (primary)" : "")}
                  </button>
                ))
              ) : (
                <p className="text-xs text-flow-text-muted">No monitors in profile.</p>
              )}
              <button
                type="button"
                onClick={() => onAddSidebarAppToMinimized?.()}
                className={inspectorPanelListButtonClass}
              >
                Add to minimized row
              </button>
            </div>
          ) : null}

          {showMoveToSection ? (
            <div className="flex flex-col gap-1">
              {moveToMonitorTargets.length ? (
                moveToMonitorTargets.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onMoveToMonitor?.(m.id)}
                    className={inspectorPanelListButtonClass}
                  >
                    Move to {(m.name || m.id) + (m.primary ? " (primary)" : "")}
                  </button>
                ))
              ) : source === "minimized" ? (
                <p className="text-xs text-flow-text-muted">No monitors in profile.</p>
              ) : null}
              {source === "monitor" ? (
                <button
                  type="button"
                  onClick={() => onMoveToMinimized?.()}
                  className={inspectorPanelListButtonClass}
                >
                  Move to minimized row
                </button>
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

      <div className="rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/30 px-3 py-3 text-xs leading-relaxed text-flow-text-muted">
        Single-app placement preview is not available yet — use{" "}
        <span className="font-medium text-flow-text-secondary">Launch profile</span>{" "}
        in the header to run the full workflow.
      </div>

      {/* Basic Info */}
      <div className="min-w-0 space-y-4">
        <label className={`${inspectorSectionPrimaryTitleClass} mb-3`}>
          Basic Information
        </label>

        {!isProfileSlot ? (
          <p className="rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/30 px-3 py-2 text-[11px] leading-snug text-flow-text-muted">
            This app is not on the current profile layout. Use the + button on its row in the Apps sidebar to place it on a monitor or the minimized row.
          </p>
        ) : null}

        {type === "app" &&
        typeof onSetInstalledAppLibraryCategory === "function" ? (
          <div className="min-w-0">
            <label
              className={inspectorFieldLabelClass}
              htmlFor={installedAppTypeFieldId}
            >
              App type
            </label>
            <select
              id={installedAppTypeFieldId}
              className={inspectorPanelNativeSelectClass}
              value={
                isAppLibraryCategory(currentData.category)
                  ? currentData.category
                  : inferInstalledAppLibraryCategory(
                      String(currentData.name ?? ""),
                    )
              }
              onChange={(e) => {
                const v = e.target.value;
                if (isAppLibraryCategory(v)) {
                  onSetInstalledAppLibraryCategory(
                    {
                      name: String(currentData.name ?? ""),
                      executablePath: currentData.executablePath ?? null,
                      shortcutPath: currentData.shortcutPath ?? null,
                      launchUrl: currentData.launchUrl ?? null,
                    },
                    v,
                  );
                }
              }}
            >
              {APP_LIBRARY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <p className={`${inspectorHelperTextClass} mt-1.5`}>
              Used for the type chip in the Apps library. Your choice is saved on this device.
            </p>
          </div>
        ) : null}

        <div>
          <label className={inspectorFieldLabelClass}>Executable Path</label>
          {rawExe ? (
            <ClickCopyPathBlock
              value={rawExe}
              notice={identityPathCopyNotice}
              onCopy={() => void copyIdentityExecutablePath()}
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <FlowTooltip
              label={
                canRevealInExplorer
                  ? "Show executable or saved shortcut in File Explorer"
                  : "Set an executable path above to open its location on disk."
              }
            >
              <span className="inline-flex">
                <button
                  type="button"
                  onClick={() => void handleRevealInExplorer()}
                  disabled={!canRevealInExplorer}
                  aria-disabled={!canRevealInExplorer}
                  className={
                    canRevealInExplorer
                      ? inspectorPanelCompactButtonClass
                      : inspectorPanelCompactButtonDisabledClass
                  }
                >
                  <FolderOpen className="h-3 w-3 shrink-0" aria-hidden />
                  Open in Explorer
                </button>
              </span>
            </FlowTooltip>
          </div>
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
        <label className={`${inspectorSectionPrimaryTitleClass} mb-3`}>Monitor Assignment</label>
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
        <label className={`${inspectorSectionPrimaryTitleClass} mb-3`}>Window Settings</label>
        
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
        <label className={`${inspectorSectionPrimaryTitleClass} mb-3`}>Launch Options</label>
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
        <label className={`${inspectorSectionPrimaryTitleClass} mb-3`}>
          Custom Launch Arguments
        </label>
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

  const reorderAssociatedFiles = (fromIndex: number, toIndex: number) => {
    if (!onUpdateAssociatedFiles || !isProfileSlot || fromIndex === toIndex) return;
    const list = [...(currentData.associatedFiles || [])];
    if (
      fromIndex < 0
      || toIndex < 0
      || fromIndex >= list.length
      || toIndex >= list.length
    ) return;
    const [row] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, row);
    onUpdateAssociatedFiles(list);
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
    try {
      const res = await pick({ mode });
      if (res.canceled || !res.entries?.length) return;
      const dirs = res.entries.filter((e) => e.kind === "directory");
      const files = res.entries.filter((e) => e.kind === "file");
      if (dirs.length && files.length) {
        window.alert("Choose only files or only folders in the same pick — not both.");
        return;
      }
      const currentFiles = currentData.associatedFiles || [];
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

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-6">
        {/* Quick Add Section */}
        <div className="min-w-0 shrink-0">
          <label className={`${inspectorSectionPrimaryTitleClass} mb-3`}>
            Quick Add Content
          </label>
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
              <label className={`${inspectorSectionPrimaryTitleClass} mb-0`}>
                Browser Tabs
              </label>
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
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-2">
            <label className={`${inspectorSectionPrimaryTitleClass} mb-0 min-w-0`}>
              Associated Content
            </label>
            {onUpdateAssociatedFiles && hasDesktopPicker ? (
              <div className="relative shrink-0" ref={addAssocMenuRef}>
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
                  <div className="flow-menu-panel flow-menu-panel-enter absolute right-0 top-full z-[30000] mt-1 w-44 min-w-0 py-0.5">
                    <button
                      type="button"
                      className="flow-menu-item text-xs"
                      onClick={() => void handlePickAssociatedPaths("files")}
                    >
                      <Upload className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                      Add files…
                    </button>
                    <button
                      type="button"
                      className="flow-menu-item text-xs"
                      onClick={() => void handlePickAssociatedPaths("directory")}
                    >
                      <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/90" aria-hidden />
                      Add folder…
                    </button>
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
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = parseAssocDragPayload(e.dataTransfer.getData("text/plain"));
                    if (Number.isNaN(from)) return;
                    reorderAssociatedFiles(from, index);
                  }}
                  className="group flex min-w-0 shrink-0 items-center gap-2 rounded-lg border border-flow-border bg-flow-surface p-3"
                >
                  <FlowTooltip label="Drag to reorder">
                    <span
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("text/plain", dragAssocPayload(index));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="shrink-0 cursor-grab touch-none text-flow-text-muted active:cursor-grabbing"
                      aria-hidden
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                  </FlowTooltip>
                  {file.type === "url" || file.url ? (
                    <Link2 className="h-4 w-4 shrink-0 text-flow-accent-blue" />
                  ) : (
                    <FileIcon type={file.type} className="h-4 w-4 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-flow-text-primary">{file.name}</div>
                    <div className="truncate text-xs text-flow-text-muted">{file.path || file.url}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {(file.url || file.type === "url") && (
                      <button
                        type="button"
                        onClick={() => window.open(file.url || file.path, "_blank", "noopener,noreferrer")}
                        className="shrink-0 rounded-lg p-1.5 text-flow-text-muted opacity-0 transition-colors hover:text-flow-accent-blue group-hover:opacity-100"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAssociatedFile(index)}
                      className="shrink-0 rounded-lg p-1.5 text-flow-text-muted opacity-0 transition-colors hover:text-flow-accent-red group-hover:opacity-100"
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
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-flow-bg-secondary/95 pt-12">
      {/* App Header - Always visible */}
      <div className="border-b border-flow-border/50 bg-flow-surface/30 px-3 py-3 backdrop-blur-sm sm:px-4">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {renderAppIcon(currentData)}
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-flow-text-primary break-words">
              {currentData.name}
            </h2>
            <p
              className={`mt-1 text-xs font-medium ${
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

      {/* Tab Navigation */}
      <div className="border-b border-flow-border/50 bg-flow-bg-secondary/80">
        <div className="relative flex min-w-0">
          <div
            className="pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 w-1/3 bg-flow-accent-blue flow-tab-slide-track"
            style={{
              transform: `translate3d(calc(${appInspectorTabSlideIndex} * 100%), 0, 0)`,
            }}
            aria-hidden
          />
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative z-0 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 border-transparent px-1 py-2 text-[10px] font-medium leading-tight transition-colors duration-150 ease-out ${
                  activeTab === tab.id
                    ? "bg-flow-bg-primary/40 text-flow-accent-blue"
                    : "text-flow-text-muted hover:bg-flow-surface/50 hover:text-flow-text-primary"
                }`}
              >
                <IconComponent className="h-3 w-3 shrink-0" />
                <span className="max-w-full truncate text-center">{tab.label}</span>
              </button>
            );
          })}
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