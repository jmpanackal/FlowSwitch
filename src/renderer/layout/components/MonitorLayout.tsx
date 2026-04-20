import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import {
  Monitor,
  Grid3X3,
  Zap,
  ChevronDown,
  PenLine,
  Save,
  MoreHorizontal,
} from "lucide-react";
import { AppFileWindow } from "./AppFileWindow";
import { MinimizedApps } from "./MinimizedApps";
import { MonitorLayoutConfig } from "./MonitorLayoutConfig";
import { SelectedAppDetails } from "./SelectedAppDetails";
import { LucideIcon } from "lucide-react";
import { DragState } from "../types/dragTypes";
import { matchesMonitorAppSelection } from "../utils/appSelection";

/** Floor so monitor cards stay legible; slight overlap is preferable to a pixel-sized cluster. */
const MIN_MONITOR_PREVIEW_SCALE = 0.32;

/**
 * Prefer the live inner preview box over React state: after fullscreen / maximize on Electron,
 * `previewBounds` can lag one or more frames while `getBoundingClientRect()` already matches paint.
 * Using stale tiny bounds forces every monitor through `minX > maxX` clamp → (50%,50%) stack + wrong scale.
 */
function readLivePreviewMeasure(
  el: HTMLElement | null,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  if (!el) return fallback;
  const r = el.getBoundingClientRect();
  let w = Math.round(r.width);
  let h = Math.round(r.height);
  // After fullscreen / shell transitions, rect can briefly read ~0 while layout is still valid.
  if (w <= 10 || h <= 10) {
    const cw = Math.round(el.clientWidth);
    const ch = Math.round(el.clientHeight);
    if (cw > 10 && ch > 10) {
      w = cw;
      h = ch;
    } else {
      return fallback;
    }
  }
  return { width: w, height: h };
}

interface App {
  name: string;
  icon?: LucideIcon;
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
  instanceId?: string;
  associatedFiles?: {
    id: string;
    name: string;
    path: string;
    type: string;
    associatedApp: string;
    useDefaultApp: boolean;
  }[];
}

interface MinimizedApp {
  name: string;
  icon?: LucideIcon;
  iconPath?: string | null;
  executablePath?: string | null;
  shortcutPath?: string | null;
  launchUrl?: string | null;
  color: string;
  volume?: number;
  launchBehavior?: 'new' | 'focus' | 'minimize';
  targetMonitor?: string;
  sourcePosition?: { x: number; y: number };
  sourceSize?: { width: number; height: number };
  browserTabs?: { name: string; url: string; isActive: boolean }[];
}

interface BrowserTab {
  name: string;
  url: string;
  browser: string;
  newWindow: boolean;
  monitorId?: string;
  isActive?: boolean;
  appInstanceId?: string;
}

interface SnapZone {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface MonitorLayoutProps {
  monitors: {
    id: string;
    name: string;
    systemName?: string | null;
    primary: boolean;
    resolution: string;
    orientation?: 'landscape' | 'portrait';
    layoutPosition?: { x: number; y: number };
    predefinedLayout?: string | null;
    apps: App[];
    files?: any[]; // Legacy support but won't be used
  }[];
  minimizedApps?: MinimizedApp[];
  minimizedFiles?: any[]; // Legacy support but won't be used
  browserTabs?: BrowserTab[];
  isEditMode?: boolean;
  large?: boolean;
  dragState?: DragState;
  onUpdateApp?: (monitorId: string, appIndex: number, updates: any) => void;
  onUpdateFile?: (monitorId: string, fileIndex: number, updates: any) => void; // Legacy
  onUpdateAppsWithDisplacement?: (monitorId: string, draggedAppIndex: number, draggedAppUpdates: any, conflictingAppIndex: number, conflictingAppUpdates: any) => void;
  onAddApp?: (monitorId: string, newApp: any) => void;
  onAddFile?: (monitorId: string, newFile: any) => void; // Legacy
  onRemoveApp?: (monitorId: string, appIndex: number) => void;
  onRemoveFile?: (monitorId: string, fileIndex: number) => void; // Legacy
  onUpdateMonitorLayout?: (monitorId: string, layout: string | null) => void;
  onAddAppToMinimized?: (newApp: any) => void;
  onAddFileToMinimized?: (newFile: any) => void; // Legacy
  onUpdateBrowserTabs?: (tabs: BrowserTab[]) => void;
  onAddBrowserTab?: (tab: BrowserTab) => void;
  onMoveAppToMinimized?: (monitorId: string, appIndex: number) => void;
  onMoveFileToMinimized?: (monitorId: string, fileIndex: number) => void; // Legacy
  onRemoveMinimizedApp?: (appIndex: number) => void;
  onRemoveMinimizedFile?: (fileIndex: number) => void; // Legacy
  onMoveAppBetweenMonitors?: (sourceMonitorId: string, appIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }, newSize?: { width: number; height: number }) => void;
  onMoveFileBetweenMonitors?: (sourceMonitorId: string, fileIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }) => void; // Legacy
  onMoveMinimizedAppToMonitor?: (appIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }, newSize?: { width: number; height: number }) => void;
  onMoveMinimizedFileToMonitor?: (fileIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }) => void; // Legacy
  onAssociateFileWithApp?: (monitorId: string, appIndex: number, fileData: any) => void;
  onCustomDragStart: (data: any, sourceType: 'sidebar' | 'monitor' | 'minimized', sourceId: string, startPos: { x: number; y: number }, preview?: React.ReactNode) => void;
  onAppSelect?: (appData: any, source: 'monitor' | 'minimized', monitorId?: string, appIndex?: number) => void;
  onClearAppSelection?: () => void;
  onFileSelect?: (fileData: any, source: 'monitor' | 'minimized', monitorId?: string, fileIndex?: number) => void; // Legacy
  selectedApp?: any;
  onAutoSnapApps?: (monitorId: string, appUpdates: { appIndex: number; position: { x: number; y: number }; size: { width: number; height: number } }[]) => void;
  onUpdateMonitorPositions?: (positions: Array<{ id: string; layoutPosition: { x: number; y: number } }>) => void;
  /** When set, shows Edit layout / Done in the preview toolbar (layout editing, not profile prefs). */
  onToggleLayoutEdit?: () => void;
  /** Visually join the preview toolbar to the profile header above (shared column). */
  layoutToolbarConnected?: boolean;
}

// Layout definitions - Horizontal Monitor Layouts
const LANDSCAPE_LAYOUTS = {
  'fullscreen': {
    name: 'Fullscreen',
    maxApps: 1,
    slots: [
      { id: 'full', position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }
    ]
  },
  'side-by-side': {
    name: 'Side by Side',
    maxApps: 2,
    slots: [
      { id: 'left', position: { x: 25, y: 50 }, size: { width: 50, height: 100 } },
      { id: 'right', position: { x: 75, y: 50 }, size: { width: 50, height: 100 } }
    ]
  },
  'golden-left': {
    name: 'Golden Left',
    maxApps: 2,
    slots: [
      { id: 'left', position: { x: 30.9, y: 50 }, size: { width: 61.8, height: 100 } },
      { id: 'right', position: { x: 80.9, y: 50 }, size: { width: 38.2, height: 100 } }
    ]
  },
  'golden-right': {
    name: 'Golden Right',
    maxApps: 2,
    slots: [
      { id: 'left', position: { x: 19.1, y: 50 }, size: { width: 38.2, height: 100 } },
      { id: 'right', position: { x: 69.1, y: 50 }, size: { width: 61.8, height: 100 } }
    ]
  },
  'top-bottom': {
    name: 'Top/Bottom',
    maxApps: 2,
    slots: [
      { id: 'top', position: { x: 50, y: 25 }, size: { width: 100, height: 50 } },
      { id: 'bottom', position: { x: 50, y: 75 }, size: { width: 100, height: 50 } }
    ]
  },
  '3-columns': {
    name: '3 Columns',
    maxApps: 3,
    slots: [
      { id: 'left', position: { x: 16.67, y: 50 }, size: { width: 33.33, height: 100 } },
      { id: 'center', position: { x: 50, y: 50 }, size: { width: 33.33, height: 100 } },
      { id: 'right', position: { x: 83.33, y: 50 }, size: { width: 33.33, height: 100 } }
    ]
  },
  'left-stack': {
    name: 'Left + Stack',
    maxApps: 3,
    slots: [
      { id: 'left', position: { x: 33.33, y: 50 }, size: { width: 66.66, height: 100 } },
      { id: 'right-top', position: { x: 83.33, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'right-bottom', position: { x: 83.33, y: 75 }, size: { width: 33.33, height: 50 } }
    ]
  },
  'right-stack': {
    name: 'Right + Stack',
    maxApps: 3,
    slots: [
      { id: 'right', position: { x: 66.67, y: 50 }, size: { width: 66.66, height: 100 } },
      { id: 'left-top', position: { x: 16.67, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'left-bottom', position: { x: 16.67, y: 75 }, size: { width: 33.33, height: 50 } }
    ]
  },
  'wide-center': {
    name: 'Wide Center',
    maxApps: 3,
    slots: [
      { id: 'left', position: { x: 10, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'center', position: { x: 50, y: 50 }, size: { width: 60, height: 100 } },
      { id: 'right', position: { x: 90, y: 50 }, size: { width: 20, height: 100 } }
    ]
  },
  '4-quadrants': {
    name: '4 Quadrants',
    maxApps: 4,
    slots: [
      { id: 'top-left', position: { x: 25, y: 25 }, size: { width: 50, height: 50 } },
      { id: 'top-right', position: { x: 75, y: 25 }, size: { width: 50, height: 50 } },
      { id: 'bottom-left', position: { x: 25, y: 75 }, size: { width: 50, height: 50 } },
      { id: 'bottom-right', position: { x: 75, y: 75 }, size: { width: 50, height: 50 } }
    ]
  },
  '4-panels': {
    name: '4 Panels',
    maxApps: 4,
    slots: [
      { id: 'panel-1', position: { x: 12.5, y: 50 }, size: { width: 25, height: 100 } },
      { id: 'panel-2', position: { x: 37.5, y: 50 }, size: { width: 25, height: 100 } },
      { id: 'panel-3', position: { x: 62.5, y: 50 }, size: { width: 25, height: 100 } },
      { id: 'panel-4', position: { x: 87.5, y: 50 }, size: { width: 25, height: 100 } }
    ]
  },
  '5-panels': {
    name: '5 Panels',
    maxApps: 5,
    slots: [
      { id: 'panel-1', position: { x: 10, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'panel-2', position: { x: 30, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'panel-3', position: { x: 50, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'panel-4', position: { x: 70, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'panel-5', position: { x: 90, y: 50 }, size: { width: 20, height: 100 } }
    ]
  },
  '3x2-grid': {
    name: '3x2 Grid',
    maxApps: 6,
    slots: [
      { id: 'top-left', position: { x: 16.67, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'top-center', position: { x: 50, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'top-right', position: { x: 83.33, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'bottom-left', position: { x: 16.67, y: 75 }, size: { width: 33.33, height: 50 } },
      { id: 'bottom-center', position: { x: 50, y: 75 }, size: { width: 33.33, height: 50 } },
      { id: 'bottom-right', position: { x: 83.33, y: 75 }, size: { width: 33.33, height: 50 } }
    ]
  }
};

// Vertical Monitor Layouts
const PORTRAIT_LAYOUTS = {
  'fullscreen': {
    name: 'Fullscreen',
    maxApps: 1,
    slots: [
      { id: 'full', position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }
    ]
  },
  'top-bottom': {
    name: 'Top/Bottom',
    maxApps: 2,
    slots: [
      { id: 'top', position: { x: 50, y: 25 }, size: { width: 100, height: 50 } },
      { id: 'bottom', position: { x: 50, y: 75 }, size: { width: 100, height: 50 } }
    ]
  },
  'golden-top': {
    name: 'Golden Top',
    maxApps: 2,
    slots: [
      { id: 'top', position: { x: 50, y: 30.9 }, size: { width: 100, height: 61.8 } },
      { id: 'bottom', position: { x: 50, y: 80.9 }, size: { width: 100, height: 38.2 } }
    ]
  },
  'golden-bottom': {
    name: 'Golden Bot',
    maxApps: 2,
    slots: [
      { id: 'top', position: { x: 50, y: 19.1 }, size: { width: 100, height: 38.2 } },
      { id: 'bottom', position: { x: 50, y: 69.1 }, size: { width: 100, height: 61.8 } }
    ]
  },
  '3-rows': {
    name: '3 Rows',
    maxApps: 3,
    slots: [
      { id: 'top', position: { x: 50, y: 16.67 }, size: { width: 100, height: 33.33 } },
      { id: 'middle', position: { x: 50, y: 50 }, size: { width: 100, height: 33.33 } },
      { id: 'bottom', position: { x: 50, y: 83.33 }, size: { width: 100, height: 33.33 } }
    ]
  },
  'tall-center': {
    name: 'Tall Center',
    maxApps: 3,
    slots: [
      { id: 'top', position: { x: 50, y: 7.5 }, size: { width: 100, height: 15 } },
      { id: 'center', position: { x: 50, y: 50 }, size: { width: 100, height: 70 } },
      { id: 'bottom', position: { x: 50, y: 92.5 }, size: { width: 100, height: 15 } }
    ]
  },
  'top-split': {
    name: 'Top + Split',
    maxApps: 3,
    slots: [
      { id: 'top', position: { x: 50, y: 33.33 }, size: { width: 100, height: 66.66 } },
      { id: 'bottom-left', position: { x: 25, y: 83.33 }, size: { width: 50, height: 33.33 } },
      { id: 'bottom-right', position: { x: 75, y: 83.33 }, size: { width: 50, height: 33.33 } }
    ]
  },
  'bot-split': {
    name: 'Bot + Split',
    maxApps: 3,
    slots: [
      { id: 'bottom', position: { x: 50, y: 66.67 }, size: { width: 100, height: 66.66 } },
      { id: 'top-left', position: { x: 25, y: 16.67 }, size: { width: 50, height: 33.33 } },
      { id: 'top-right', position: { x: 75, y: 16.67 }, size: { width: 50, height: 33.33 } }
    ]
  },
  '4-panels': {
    name: '4 Panels',
    maxApps: 4,
    slots: [
      { id: 'panel-1', position: { x: 50, y: 12.5 }, size: { width: 100, height: 25 } },
      { id: 'panel-2', position: { x: 50, y: 37.5 }, size: { width: 100, height: 25 } },
      { id: 'panel-3', position: { x: 50, y: 62.5 }, size: { width: 100, height: 25 } },
      { id: 'panel-4', position: { x: 50, y: 87.5 }, size: { width: 100, height: 25 } }
    ]
  },
  '2x2-grid': {
    name: '2x2 Grid',
    maxApps: 4,
    slots: [
      { id: 'top-left', position: { x: 25, y: 25 }, size: { width: 50, height: 50 } },
      { id: 'top-right', position: { x: 75, y: 25 }, size: { width: 50, height: 50 } },
      { id: 'bottom-left', position: { x: 25, y: 75 }, size: { width: 50, height: 50 } },
      { id: 'bottom-right', position: { x: 75, y: 75 }, size: { width: 50, height: 50 } }
    ]
  }
};

export function MonitorLayout({ 
  monitors, 
  minimizedApps = [], 
  minimizedFiles = [], // Legacy, won't be used
  browserTabs = [],
  isEditMode = false,
  large = false,
  dragState,
  onUpdateApp,
  onUpdateFile, // Legacy
  onUpdateAppsWithDisplacement,
  onAddApp,
  onAddFile, // Legacy
  onRemoveApp,
  onRemoveFile, // Legacy
  onUpdateMonitorLayout,
  onAddAppToMinimized,
  onAddFileToMinimized, // Legacy
  onUpdateBrowserTabs,
  onAddBrowserTab,
  onMoveAppToMinimized,
  onMoveFileToMinimized, // Legacy
  onRemoveMinimizedApp,
  onRemoveMinimizedFile, // Legacy
  onMoveAppBetweenMonitors,
  onMoveFileBetweenMonitors, // Legacy
  onMoveMinimizedAppToMonitor,
  onMoveMinimizedFileToMonitor, // Legacy
  onAssociateFileWithApp,
  onCustomDragStart,
  onAppSelect,
  onClearAppSelection,
  onFileSelect, // Legacy
  selectedApp,
  onAutoSnapApps,
  onUpdateMonitorPositions,
  onToggleLayoutEdit,
  layoutToolbarConnected = false,
}: MonitorLayoutProps) {
  // Enhanced drag state with persistence
  const [localDragState, setLocalDragState] = useState<{
    isDragging: boolean;
    draggedItem: { monitorId: string; itemIndex: number; itemType: 'app' } | null;
    currentMonitorId: string | null;
    snapZone: SnapZone | null;
    conflictItem: { itemIndex: number; item: App; itemType: 'app' } | null;
    displacementZone: SnapZone | null;
    lastValidSnapState: {
      snapZone: SnapZone | null;
      conflictItem: { itemIndex: number; item: App; itemType: 'app' } | null;
      displacementZone: SnapZone | null;
    } | null;
  }>({
    isDragging: false,
    draggedItem: null,
    currentMonitorId: null,
    snapZone: null,
    conflictItem: null,
    displacementZone: null,
    lastValidSnapState: null
  });

  const [externalSnapState, setExternalSnapState] = useState<{
    monitorId: string | null;
    position: { x: number; y: number } | null;
    snapZone: SnapZone | null;
  }>({
    monitorId: null,
    position: null,
    snapZone: null,
  });

  const lastValidSnapStateRef = useRef<{
    snapZone: SnapZone | null;
    conflictItem: { itemIndex: number; item: App; itemType: 'app' } | null;
    displacementZone: SnapZone | null;
  } | null>(null);

  const monitorPreviewRef = useRef<HTMLDivElement | null>(null);
  const monitorPreviewInnerRef = useRef<HTMLDivElement | null>(null);
  const [previewBounds, setPreviewBounds] = useState({ width: 1, height: 1 });
  const previewBoundsRef = useRef(previewBounds);
  previewBoundsRef.current = previewBounds;
  const [monitorPreviewPositions, setMonitorPreviewPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingMonitor, setDraggingMonitor] = useState<{
    monitorId: string;
    startX: number;
    startY: number;
    startPos: { x: number; y: number };
    /** Freeze auto-scale while dragging so cards do not resize mid-drag. */
    frozenScale: number;
  } | null>(null);
  const layoutRootRef = useRef<HTMLDivElement | null>(null);
  const previewScaleRef = useRef(1);
  const recalculateLayoutPreviewScaleRef = useRef<() => void>(() => {});
  const previewPositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const lastSyncedMonitorLayoutSignatureRef = useRef<string>("");
  const prevMonitorsIdentityKeyRef = useRef<string | null>(null);
  /** Tracks preview size so we can detect first transition off the {1,1} placeholder / tiny rect. */
  const prevMeaningfulPreviewBoundsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const [layoutColumnHeight, setLayoutColumnHeight] = useState(0);
  const [monitorEditActionsOpenId, setMonitorEditActionsOpenId] = useState<string | null>(null);

  const setPreviewPositions = (
    updater:
      | Record<string, { x: number; y: number }>
      | ((prev: Record<string, { x: number; y: number }>) => Record<string, { x: number; y: number }>),
  ) => {
    setMonitorPreviewPositions((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      previewPositionsRef.current = next;
      return next;
    });
  };

  const remeasurePreviewInnerBounds = useCallback(() => {
    const inner = monitorPreviewInnerRef.current;
    const outer = monitorPreviewRef.current;
    if (!inner) return false;

    const ir = inner.getBoundingClientRect();
    let w = Math.round(ir.width);
    let h = Math.round(ir.height);
    if (w <= 10 || h <= 10) {
      const cw = Math.round(inner.clientWidth);
      const ch = Math.round(inner.clientHeight);
      if (cw > 10 && ch > 10) {
        w = cw;
        h = ch;
      }
    }

    if (outer) {
      const or = outer.getBoundingClientRect();
      const outerH = Math.round(or.height);
      if (outerH > 120 && h < 12) {
        return false;
      }
    }

    if (w <= 10 || h <= 10) return false;
    setPreviewBounds((prev) => {
      if (Math.abs(prev.width - w) < 2 && Math.abs(prev.height - h) < 2) {
        return prev;
      }
      return { width: w, height: h };
    });
    queueMicrotask(() => {
      recalculateLayoutPreviewScaleRef.current();
    });
    return true;
  }, []);

  const scheduleRemeasurePreviewInnerWithRetries = useCallback(() => {
    if (remeasurePreviewInnerBounds()) return;
    let left = 28;
    const step = () => {
      if (left-- <= 0) return;
      requestAnimationFrame(() => {
        if (remeasurePreviewInnerBounds()) return;
        step();
      });
    };
    step();
  }, [remeasurePreviewInnerBounds]);

  const monitorsIdentityKey = useMemo(
    () =>
      [...monitors]
        .map((m) => m.id)
        .sort()
        .join("|"),
    [monitors],
  );

  const monitorLayoutSignature = useMemo(
    () =>
      monitors
        .map(
          (m) =>
            `${m.id}:${Math.round(m.layoutPosition?.x ?? -1)}:${Math.round(m.layoutPosition?.y ?? -1)}`,
        )
        .sort()
        .join("|"),
    [monitors],
  );

  const getMonitorFootprint = (monitor: { orientation?: 'landscape' | 'portrait' }) => {
    const isPortrait = monitor.orientation === 'portrait';
    const widthPx = isPortrait ? (large ? 208 : 160) : (large ? 448 : 320);
    const cardHeightPx = isPortrait ? (large ? 384 : 288) : (large ? 288 : 208);
    // Edit mode + compact shell (!large): extra chrome — underestimate => overlap when inspector is open.
    const inspectorChromePad = !large ? 24 : 0;
    const multiPad =
      monitors.length >= 3 ? (isEditMode ? 28 : 10) : monitors.length === 2 ? (isEditMode ? 14 : 0) : 0;
    const headerHeightPx = isEditMode
      ? (isPortrait ? 118 : 104) + inspectorChromePad + multiPad
      : 64;
    // Small safety pad for meta rows / font metrics vs model
    const safetyPadPx = 10;
    return { widthPx, heightPx: cardHeightPx + headerHeightPx + safetyPadPx };
  };

  const clampPreviewPosition = (
    monitor: { orientation?: 'landscape' | 'portrait' },
    position: { x: number; y: number },
    previewScale: number,
    edgeMarginPct: number = 2.1,
  ) => {
    const bounds = readLivePreviewMeasure(monitorPreviewInnerRef.current, previewBoundsRef.current);
    if (bounds.width <= 10 || bounds.height <= 10) {
      return {
        x: Math.max(0, Math.min(100, position.x)),
        y: Math.max(0, Math.min(100, position.y)),
      };
    }

    const scale = Number.isFinite(previewScale) && previewScale > 0 ? previewScale : 1;
    const footprint = getMonitorFootprint(monitor);
    const effW = footprint.widthPx * scale;
    const effH = footprint.heightPx * scale;
    const halfWidthPct = ((effW / bounds.width) * 100) / 2;
    const halfHeightPct = ((effH / bounds.height) * 100) / 2;
    const marginPct = edgeMarginPct;

    const minX = halfWidthPct + marginPct;
    const maxX = 100 - halfWidthPct - marginPct;
    const minY = halfHeightPct + marginPct;
    const maxY = 100 - halfHeightPct - marginPct;

    if (minX > maxX || minY > maxY) {
      return { x: 50, y: 50 };
    }

    return {
      x: Math.max(minX, Math.min(maxX, position.x)),
      y: Math.max(minY, Math.min(maxY, position.y)),
    };
  };

  const [layoutPreviewScale, setLayoutPreviewScale] = useState(1);

  const computeMultiMonitorPreviewScale = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      const clampPreviewScaleValue = (raw: number) => {
        const v = Number.isFinite(raw) && raw > 0 ? raw : MIN_MONITOR_PREVIEW_SCALE;
        return Math.min(1, Math.max(MIN_MONITOR_PREVIEW_SCALE, v));
      };

      const pb = readLivePreviewMeasure(monitorPreviewInnerRef.current, previewBoundsRef.current);
      if (pb.width <= 10 || pb.height <= 10) {
        return 1;
      }
      if (monitors.length <= 1) {
        return 1;
      }

      let scale = 1;
      for (let iter = 0; iter < 8; iter += 1) {
        let minLeft = Number.POSITIVE_INFINITY;
        let minTop = Number.POSITIVE_INFINITY;
        let maxRight = Number.NEGATIVE_INFINITY;
        let maxBottom = Number.NEGATIVE_INFINITY;

        for (const monitor of monitors) {
          const preview = positions[monitor.id] || { x: 50, y: 50 };
          const clamped = clampPreviewPosition(monitor, preview, scale);
          const footprint = getMonitorFootprint(monitor);
          const w = footprint.widthPx * scale;
          const h = footprint.heightPx * scale;

          const centerX = (clamped.x / 100) * pb.width;
          const centerY = (clamped.y / 100) * pb.height;

          minLeft = Math.min(minLeft, centerX - w / 2);
          minTop = Math.min(minTop, centerY - h / 2);
          maxRight = Math.max(maxRight, centerX + w / 2);
          maxBottom = Math.max(maxBottom, centerY + h / 2);
        }

        if (!Number.isFinite(minLeft) || !Number.isFinite(minTop) || !Number.isFinite(maxRight) || !Number.isFinite(maxBottom)) {
          return 1;
        }

        const requiredWidth = Math.max(1, maxRight - minLeft);
        const requiredHeight = Math.max(1, maxBottom - minTop);
        const marginFrac = 2.1 / 100;
        const availableWidth = Math.max(1, pb.width * (1 - 2 * marginFrac));
        const availableHeight = Math.max(1, pb.height * (1 - 2 * marginFrac));

        const fitScale = Math.min(1, availableWidth / requiredWidth, availableHeight / requiredHeight);
        const nextScale = Math.max(MIN_MONITOR_PREVIEW_SCALE, fitScale);
        if (Math.abs(nextScale - scale) < 0.001) {
          scale = nextScale;
          break;
        }
        scale = nextScale;
      }

      const gutterPx = Math.max(
        9,
        Math.min(18, Math.round(0.012 * pb.width + 0.01 * pb.height)),
      );
      const overlapsAtScale = (s: number) => {
        const rects = monitors.map((monitor) => {
          const preview = positions[monitor.id] || { x: 50, y: 50 };
          const clamped = clampPreviewPosition(monitor, preview, s);
          const footprint = getMonitorFootprint(monitor);
          const w = footprint.widthPx * s;
          const h = footprint.heightPx * s;
          const cx = (clamped.x / 100) * pb.width;
          const cy = (clamped.y / 100) * pb.height;
          return {
            l: cx - w / 2,
            r: cx + w / 2,
            t: cy - h / 2,
            b: cy + h / 2,
          };
        });
        for (let i = 0; i < rects.length; i += 1) {
          for (let j = i + 1; j < rects.length; j += 1) {
            const a = rects[i];
            const b = rects[j];
            const separated =
              a.r + gutterPx <= b.l ||
              b.r + gutterPx <= a.l ||
              a.b + gutterPx <= b.t ||
              b.b + gutterPx <= a.t;
            if (!separated) return true;
          }
        }
        return false;
      };

      const fitBBoxCap = scale;
      let out = fitBBoxCap;
      let guard = 0;
      while (overlapsAtScale(out) && out > MIN_MONITOR_PREVIEW_SCALE + 0.002 && guard < 60) {
        out = Math.max(MIN_MONITOR_PREVIEW_SCALE, out * 0.93);
        guard += 1;
      }
      if (overlapsAtScale(out)) {
        let loB = MIN_MONITOR_PREVIEW_SCALE;
        let hiB = out;
        for (let b = 0; b < 28; b += 1) {
          const mid = (loB + hiB) / 2;
          if (overlapsAtScale(mid)) hiB = mid;
          else loB = mid;
        }
        out = loB;
      } else if (out < fitBBoxCap - 0.004) {
        let loE = out;
        let hiE = fitBBoxCap;
        for (let b = 0; b < 22; b += 1) {
          const mid = (loE + hiE) / 2;
          if (!overlapsAtScale(mid)) loE = mid;
          else hiE = mid;
        }
        out = loE;
      }
      return clampPreviewScaleValue(out);
    },
    [monitors, large, isEditMode],
  );

  const recalculateLayoutPreviewScale = useCallback(() => {
    const clampPreviewScaleValue = (raw: number) => {
      const v = Number.isFinite(raw) && raw > 0 ? raw : MIN_MONITOR_PREVIEW_SCALE;
      return Math.min(1, Math.max(MIN_MONITOR_PREVIEW_SCALE, v));
    };

    const pb = readLivePreviewMeasure(monitorPreviewInnerRef.current, previewBoundsRef.current);
    const positions = previewPositionsRef.current;
    if (pb.width <= 10 || pb.height <= 10) {
      setLayoutPreviewScale(1);
      return;
    }
    if (monitors.length === 0) {
      setLayoutPreviewScale(1);
      return;
    }
    if (monitors.length === 1) {
      const m = monitors[0];
      const fp = getMonitorFootprint(m);
      const marginFrac = 2.1 / 100;
      const maxW = pb.width * (1 - 2 * marginFrac);
      const maxH = pb.height * (1 - 2 * marginFrac);
      setLayoutPreviewScale(
        clampPreviewScaleValue(
          Math.min(1, maxW / Math.max(1, fp.widthPx), maxH / Math.max(1, fp.heightPx)),
        ),
      );
      return;
    }

    setLayoutPreviewScale(computeMultiMonitorPreviewScale(positions));
  }, [monitors, large, isEditMode, computeMultiMonitorPreviewScale]);

  recalculateLayoutPreviewScaleRef.current = recalculateLayoutPreviewScale;

  previewPositionsRef.current = monitorPreviewPositions;
  previewScaleRef.current = layoutPreviewScale;
  const displayPreviewScale =
    draggingMonitor?.frozenScale ?? layoutPreviewScale;

  /** UI chrome only (toolbar copy, meta text) — cards use fixed Tailwind + transform scale only. */
  const livePreviewChromeBounds = readLivePreviewMeasure(
    monitorPreviewInnerRef.current,
    previewBounds,
  );
  const compactPreviewMode = layoutPreviewScale < 0.84 || livePreviewChromeBounds.height < 600;
  const densePreviewMode = layoutPreviewScale < 0.62 || livePreviewChromeBounds.height < 500;
  const useCompactMonitorEditChrome = !large || layoutPreviewScale < 0.9;

  useEffect(() => {
    const inner = monitorPreviewInnerRef.current;
    const outer = monitorPreviewRef.current;
    if (!inner) return;

    let raf = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        scheduleRemeasurePreviewInnerWithRetries();
      });
    };

    scheduleRemeasurePreviewInnerWithRetries();
    const innerObserver = new ResizeObserver(schedule);
    innerObserver.observe(inner);
    const outerObserver = outer ? new ResizeObserver(schedule) : null;
    if (outer && outerObserver) {
      outerObserver.observe(outer);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      innerObserver.disconnect();
      outerObserver?.disconnect();
    };
  }, [scheduleRemeasurePreviewInnerWithRetries]);

  /** Re-measure after inspector / edit chrome changes layout (margin transition on shell). */
  useEffect(() => {
    const bump = () => {
      scheduleRemeasurePreviewInnerWithRetries();
      window.setTimeout(() => remeasurePreviewInnerBounds(), 60);
      window.setTimeout(() => remeasurePreviewInnerBounds(), 220);
    };
    bump();
    const t0 = window.setTimeout(bump, 0);
    const t1 = window.setTimeout(bump, 120);
    const t2 = window.setTimeout(bump, 280);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [large, isEditMode, remeasurePreviewInnerBounds, scheduleRemeasurePreviewInnerWithRetries]);

  /** Electron often under-notifies inner layout after fullscreen; window resize fires reliably. */
  useEffect(() => {
    const onShellLayout = () => {
      if (document.visibilityState === "hidden") return;
      requestAnimationFrame(() => {
        scheduleRemeasurePreviewInnerWithRetries();
        window.setTimeout(() => remeasurePreviewInnerBounds(), 40);
        window.setTimeout(() => remeasurePreviewInnerBounds(), 200);
        window.setTimeout(() => scheduleRemeasurePreviewInnerWithRetries(), 420);
      });
    };
    window.addEventListener("resize", onShellLayout);
    window.addEventListener("focus", onShellLayout);
    document.addEventListener("fullscreenchange", onShellLayout);
    document.addEventListener("visibilitychange", onShellLayout);
    return () => {
      window.removeEventListener("resize", onShellLayout);
      window.removeEventListener("focus", onShellLayout);
      document.removeEventListener("fullscreenchange", onShellLayout);
      document.removeEventListener("visibilitychange", onShellLayout);
    };
  }, [remeasurePreviewInnerBounds, scheduleRemeasurePreviewInnerWithRetries]);

  useEffect(() => {
    const root = layoutRootRef.current;
    if (!root) return;

    const updateHeight = () => {
      const h = Math.round(root.getBoundingClientRect().height);
      if (h <= 0) return;
      setLayoutColumnHeight((prev) => {
        if (Math.abs(prev - h) < 2) return prev;
        return h;
      });
    };

    updateHeight();
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateHeight);
    });
    observer.observe(root);

    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    if (draggingMonitor) return;
    if (monitors.length === 0) {
      lastSyncedMonitorLayoutSignatureRef.current = "";
      prevMonitorsIdentityKeyRef.current = "";
      prevMeaningfulPreviewBoundsRef.current = { width: 0, height: 0 };
      setPreviewPositions({});
      return;
    }

    if (monitors.length === 1) {
      lastSyncedMonitorLayoutSignatureRef.current = monitorLayoutSignature;
      const solo: Record<string, { x: number; y: number }> = {
        [monitors[0].id]: { x: 50, y: 50 },
      };
      setPreviewPositions(solo);
      previewPositionsRef.current = solo;
      const identityChanged = prevMonitorsIdentityKeyRef.current !== monitorsIdentityKey;
      prevMonitorsIdentityKeyRef.current = monitorsIdentityKey;
      if (identityChanged) {
        queueMicrotask(() => {
          recalculateLayoutPreviewScale();
        });
      }
      return;
    }

    const livePreviewBox = readLivePreviewMeasure(
      monitorPreviewInnerRef.current,
      previewBoundsRef.current,
    );
    const previewNowSized = livePreviewBox.width > 10 && livePreviewBox.height > 10;
    const previewWasTiny =
      prevMeaningfulPreviewBoundsRef.current.width <= 10
      || prevMeaningfulPreviewBoundsRef.current.height <= 10;
    if (previewNowSized && previewWasTiny) {
      // First pass used 1×1 (or stale) bounds → clampPreviewPosition collapsed monitors to (50,50).
      // Invalidate so we take the full normalization path once real layout metrics exist.
      lastSyncedMonitorLayoutSignatureRef.current = "";
    }
    prevMeaningfulPreviewBoundsRef.current = {
      width: Math.max(previewBounds.width, livePreviewBox.width),
      height: Math.max(previewBounds.height, livePreviewBox.height),
    };

    const signatureFromProps = monitorLayoutSignature;
    const signatureChanged =
      lastSyncedMonitorLayoutSignatureRef.current !== signatureFromProps;

    if (!signatureChanged) {
      const prevSnap = previewPositionsRef.current;
      const next: Record<string, { x: number; y: number }> = {};
      for (const monitor of monitors) {
        const p = prevSnap[monitor.id] || { x: 50, y: 50 };
        next[monitor.id] = clampPreviewPosition(monitor, p, layoutPreviewScale);
      }
      previewPositionsRef.current = next;
      let scale = computeMultiMonitorPreviewScale(next);
      for (const monitor of monitors) {
        next[monitor.id] = clampPreviewPosition(monitor, next[monitor.id], scale);
      }
      previewPositionsRef.current = next;
      scale = computeMultiMonitorPreviewScale(next);
      for (const monitor of monitors) {
        next[monitor.id] = clampPreviewPosition(monitor, next[monitor.id], scale);
      }
      previewPositionsRef.current = next;
      setPreviewPositions(next);
      setLayoutPreviewScale(scale);
      return;
    }

    const rawPositions = monitors.map((monitor, index) => ({
      id: monitor.id,
      x: monitor.layoutPosition?.x ?? ((index % 3) * 300),
      y: monitor.layoutPosition?.y ?? (Math.floor(index / 3) * 220),
    }));

    const minX = Math.min(...rawPositions.map((p) => p.x));
    const maxX = Math.max(...rawPositions.map((p) => p.x));
    const minY = Math.min(...rawPositions.map((p) => p.y));
    const maxY = Math.max(...rawPositions.map((p) => p.y));
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    const allPercentCoordinates = rawPositions.every(
      (pos) => pos.x >= 0 && pos.x <= 100 && pos.y >= 0 && pos.y <= 100,
    );

    const normalized: Record<string, { x: number; y: number }> = {};
    rawPositions.forEach((pos) => {
      if (allPercentCoordinates) {
        // Keep user-defined monitor placement stable across viewport resize.
        normalized[pos.id] = { x: pos.x, y: pos.y };
        return;
      }

      const normalizedX = ((pos.x - minX) / spanX) * 100;
      const normalizedY = ((pos.y - minY) / spanY) * 100;
      normalized[pos.id] = {
        // Preserve relative monitor arrangement while still fitting preview bounds.
        x: 50 + ((normalizedX - 50) * 0.82),
        y: 50 + ((normalizedY - 50) * 0.78),
      };
    });

    // Profiles saved with every monitor at ~the same % (e.g. 50,50) give almost no drag room — spread gently.
    if (allPercentCoordinates && rawPositions.length > 1) {
      const cx =
        rawPositions.reduce((sum, p) => sum + p.x, 0) / rawPositions.length;
      const cy =
        rawPositions.reduce((sum, p) => sum + p.y, 0) / rawPositions.length;
      const maxDist = Math.max(
        ...rawPositions.map((p) => Math.hypot(p.x - cx, p.y - cy)),
      );
      if (maxDist < 16) {
        const n = rawPositions.length;
        const step = n <= 1 ? 0 : Math.min(38, 76 / Math.max(1, n - 1));
        rawPositions.forEach((pos, index) => {
          const x = 50 + (index - (n - 1) / 2) * step;
          normalized[pos.id] = {
            x: Math.round(x * 10) / 10,
            y: Math.min(86, Math.max(14, cy)),
          };
        });
      }
    }

    previewPositionsRef.current = normalized;
    let scale = computeMultiMonitorPreviewScale(normalized);
    const clampedPositions: Record<string, { x: number; y: number }> = {};
    for (const monitor of monitors) {
      const nextPosition = normalized[monitor.id] || { x: 50, y: 50 };
      clampedPositions[monitor.id] = clampPreviewPosition(monitor, nextPosition, scale);
    }
    previewPositionsRef.current = clampedPositions;
    scale = computeMultiMonitorPreviewScale(clampedPositions);
    for (const monitor of monitors) {
      const pos = clampedPositions[monitor.id] || { x: 50, y: 50 };
      clampedPositions[monitor.id] = clampPreviewPosition(monitor, pos, scale);
    }
    setPreviewPositions(clampedPositions);
    previewPositionsRef.current = clampedPositions;
    setLayoutPreviewScale(scale);
    lastSyncedMonitorLayoutSignatureRef.current = signatureFromProps;
    prevMonitorsIdentityKeyRef.current = monitorsIdentityKey;
  }, [
    monitorLayoutSignature,
    previewBounds.width,
    previewBounds.height,
    layoutPreviewScale,
    large,
    draggingMonitor,
    monitors,
    isEditMode,
    monitorsIdentityKey,
    recalculateLayoutPreviewScale,
    computeMultiMonitorPreviewScale,
  ]);

  useLayoutEffect(() => {
    recalculateLayoutPreviewScale();
  }, [
    previewBounds.width,
    previewBounds.height,
    large,
    isEditMode,
    recalculateLayoutPreviewScale,
  ]);

  useEffect(() => {
    if (!isEditMode) {
      setMonitorEditActionsOpenId(null);
    }
  }, [isEditMode]);

  useEffect(() => {
    if (!draggingMonitor) return;

    const handleMouseMove = (event: MouseEvent) => {
      const container = monitorPreviewInnerRef.current;
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw <= 0 || ch <= 0) return;

      const deltaXPct = ((event.clientX - draggingMonitor.startX) / cw) * 100;
      const deltaYPct = ((event.clientY - draggingMonitor.startY) / ch) * 100;

      const monitor = monitors.find((item) => item.id === draggingMonitor.monitorId);
      if (!monitor) return;

      const nextPosition = {
        x: draggingMonitor.startPos.x + deltaXPct,
        y: draggingMonitor.startPos.y + deltaYPct,
      };
      const clamped = clampPreviewPosition(
        monitor,
        nextPosition,
        draggingMonitor.frozenScale,
        0.35,
      );

      setPreviewPositions((prev) => ({
        ...prev,
        [draggingMonitor.monitorId]: clamped,
      }));
    };

    const handleMouseUp = () => {
      if (!onUpdateMonitorPositions) {
        requestAnimationFrame(() => setDraggingMonitor(null));
        return;
      }
      const sc = previewScaleRef.current;
      const positions = monitors.map((monitor) => {
        const preview = previewPositionsRef.current[monitor.id] || { x: 50, y: 50 };
        const clamped = clampPreviewPosition(monitor, preview, sc);
        return {
          id: monitor.id,
          layoutPosition: {
            x: Math.round(clamped.x),
            y: Math.round(clamped.y),
          },
        };
      });
      onUpdateMonitorPositions(positions);
      requestAnimationFrame(() => setDraggingMonitor(null));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingMonitor, monitors, onUpdateMonitorPositions, previewBounds.width, previewBounds.height]);

  // Handle updating associated files for an app
  const handleUpdateAssociatedFiles = (monitorId: string, appIndex: number, files: any[]) => {
    console.log('📁 UPDATING ASSOCIATED FILES:', { monitorId, appIndex, fileCount: files.length });
    if (onUpdateApp) {
      onUpdateApp(monitorId, appIndex, { associatedFiles: files });
    }
  };

  // Get all items (just apps now) for a monitor for unified snapping logic
  const getAllItems = (monitor: any) => {
    const items = [];
    
    // Add apps
    monitor.apps.forEach((app: App, index: number) => {
      items.push({
        ...app,
        itemType: 'app' as const,
        originalIndex: index,
        globalIndex: index
      });
    });
    
    return items;
  };

  // Get available snap zones based on app count
  const getSnapZones = (monitor: any, appCountOverride?: number): SnapZone[] => {
    if (monitor.predefinedLayout) {
      const layouts = monitor.orientation === 'portrait' ? PORTRAIT_LAYOUTS : LANDSCAPE_LAYOUTS;
      const layout = layouts[monitor.predefinedLayout as keyof typeof layouts];
      return layout?.slots || [];
    }
    
    // Use total app count for dynamic layouts
    const totalItems = typeof appCountOverride === 'number' ? appCountOverride : monitor.apps.length;
    const isPortrait = monitor.orientation === 'portrait';
    
    if (isPortrait) {
      if (totalItems <= 1) {
        // Match 'fullscreen' layout exactly
        return [
          { id: 'full', position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }
        ];
      } else if (totalItems === 2) {
        // Match 'top-bottom' layout exactly
        return [
          { id: 'top', position: { x: 50, y: 25 }, size: { width: 100, height: 50 } },
          { id: 'bottom', position: { x: 50, y: 75 }, size: { width: 100, height: 50 } }
        ];
      } else if (totalItems === 3) {
        // Match '3-rows' layout exactly
        return [
          { id: 'top', position: { x: 50, y: 16.67 }, size: { width: 100, height: 33.33 } },
          { id: 'middle', position: { x: 50, y: 50 }, size: { width: 100, height: 33.33 } },
          { id: 'bottom', position: { x: 50, y: 83.33 }, size: { width: 100, height: 33.33 } }
        ];
      } else {
        // Match '4-panels' layout exactly
        return [
          { id: 'panel-1', position: { x: 50, y: 12.5 }, size: { width: 100, height: 25 } },
          { id: 'panel-2', position: { x: 50, y: 37.5 }, size: { width: 100, height: 25 } },
          { id: 'panel-3', position: { x: 50, y: 62.5 }, size: { width: 100, height: 25 } },
          { id: 'panel-4', position: { x: 50, y: 87.5 }, size: { width: 100, height: 25 } }
        ];
      }
    } else {
      if (totalItems <= 1) {
        // Match 'fullscreen' layout exactly
        return [
          { id: 'full', position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }
        ];
      } else if (totalItems === 2) {
        // Match 'side-by-side' layout exactly
        return [
          { id: 'left', position: { x: 25, y: 50 }, size: { width: 50, height: 100 } },
          { id: 'right', position: { x: 75, y: 50 }, size: { width: 50, height: 100 } }
        ];
      } else if (totalItems === 3) {
        // Match '3-columns' layout exactly
        return [
          { id: 'left', position: { x: 16.67, y: 50 }, size: { width: 33.33, height: 100 } },
          { id: 'center', position: { x: 50, y: 50 }, size: { width: 33.33, height: 100 } },
          { id: 'right', position: { x: 83.33, y: 50 }, size: { width: 33.33, height: 100 } }
        ];
      } else {
        // Match '4-quadrants' layout exactly
        return [
          { id: 'top-left', position: { x: 25, y: 25 }, size: { width: 50, height: 50 } },
          { id: 'top-right', position: { x: 75, y: 25 }, size: { width: 50, height: 50 } },
          { id: 'bottom-left', position: { x: 25, y: 75 }, size: { width: 50, height: 50 } },
          { id: 'bottom-right', position: { x: 75, y: 75 }, size: { width: 50, height: 50 } }
        ];
      }
    }
  };

  // Check if zone is near position
  const findZoneNearPosition = (zones: SnapZone[], position: { x: number; y: number }): SnapZone | null => {
    const threshold = 25;
    
    for (const zone of zones) {
      const distance = Math.sqrt(
        Math.pow(position.x - zone.position.x, 2) + 
        Math.pow(position.y - zone.position.y, 2)
      );
      
      if (distance <= threshold) {
        return zone;
      }
    }
    
    return null;
  };

  const findClosestZone = (zones: SnapZone[], position: { x: number; y: number }): SnapZone | null => {
    if (zones.length === 0) return null;
    let best: SnapZone | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const zone of zones) {
      const distance = Math.sqrt(
        Math.pow(position.x - zone.position.x, 2) +
        Math.pow(position.y - zone.position.y, 2)
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = zone;
      }
    }

    return best;
  };

  // Sidebar/minimized drags must not leave in-monitor drag state (was snapping wrong monitor).
  useEffect(() => {
    if (!dragState?.isDragging || !dragState.dragData || dragState.dragData.type !== 'app') {
      return;
    }
    const src = dragState.dragData.source;
    if (src !== 'sidebar' && src !== 'minimized') return;

    lastValidSnapStateRef.current = null;
    setLocalDragState({
      isDragging: false,
      draggedItem: null,
      currentMonitorId: null,
      snapZone: null,
      conflictItem: null,
      displacementZone: null,
      lastValidSnapState: null,
    });
  }, [dragState?.isDragging, dragState?.dragData?.source, dragState?.dragData?.type]);

  useEffect(() => {
    // Pointer-driven drop preview for any app drag (including cross-monitor while localDrag is active).
    if (!isEditMode) {
      setExternalSnapState({ monitorId: null, position: null, snapZone: null });
      return;
    }

    if (!dragState?.isDragging || !dragState.dragData || dragState.dragData.type !== 'app') {
      setExternalSnapState({ monitorId: null, position: null, snapZone: null });
      return;
    }

    const { x: clientX, y: clientY } = dragState.currentPosition;
    const stack = document.elementsFromPoint(clientX, clientY);
    let monitorContainer: HTMLElement | null = null;
    let monitorId: string | null = null;

    for (const node of stack) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.closest('[data-app-drag-overlay="true"]')) continue;
      const mc = node.closest('.monitor-container');
      if (mc instanceof HTMLElement) {
        const id = mc.getAttribute('data-monitor-id');
        if (id) {
          monitorContainer = mc;
          monitorId = id;
          break;
        }
      }
    }

    if (!monitorContainer || !monitorId) {
      setExternalSnapState({ monitorId: null, position: null, snapZone: null });
      return;
    }

    const rect = monitorContainer.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const xPct = ((clientX - rect.left) / width) * 100;
    const yPct = ((clientY - rect.top) / height) * 100;
    const position = {
      x: Math.max(0, Math.min(100, xPct)),
      y: Math.max(0, Math.min(100, yPct)),
    };

    const monitor = monitors.find((m) => m.id === monitorId);
    if (!monitor) {
      setExternalSnapState({ monitorId: null, position: null, snapZone: null });
      return;
    }

    const source = dragState.dragData?.source;
    const sourceMonitorId = dragState.dragData?.sourceMonitorId || dragState.dragData?.monitorId || null;
    const isIncomingApp =
      source === 'sidebar' ||
      source === 'minimized' ||
      (source === 'monitor' && sourceMonitorId && sourceMonitorId !== monitor.id);
    const prospectiveAppCount = monitor.apps.length + (isIncomingApp ? 1 : 0);

    const zones = getSnapZones(monitor, prospectiveAppCount);
    const snapZone = findClosestZone(zones, position);
    setExternalSnapState({ monitorId, position, snapZone });
  }, [
    dragState?.isDragging,
    dragState?.dragData,
    dragState?.currentPosition?.x,
    dragState?.currentPosition?.y,
    isEditMode,
    monitors,
  ]);

  // Check if item is positioned in a specific zone
  const isItemInZone = (item: App, zone: SnapZone): boolean => {
    const positionTolerance = 15;
    const sizeTolerance = 15;
    
    const positionMatch = 
      Math.abs(item.position.x - zone.position.x) < positionTolerance && 
      Math.abs(item.position.y - zone.position.y) < positionTolerance;
    
    const sizeMatch = 
      Math.abs(item.size.width - zone.size.width) < sizeTolerance && 
      Math.abs(item.size.height - zone.size.height) < sizeTolerance;
    
    return positionMatch && sizeMatch;
  };

  // Find conflicting item in a specific zone on the same monitor
  const findConflictingItem = (monitor: any, targetZone: SnapZone, excludeIndex: number, excludeType: 'app'): { itemIndex: number; item: App; itemType: 'app' } | null => {
    // Check apps only
    for (let i = 0; i < monitor.apps.length; i++) {
      if (excludeType === 'app' && i === excludeIndex) continue;
      
      const app = monitor.apps[i];
      if (isItemInZone(app, targetZone)) {
        return { itemIndex: i, item: app, itemType: 'app' };
      }
    }
    
    return null;
  };

  // Find available zone for displacement
  const findAvailableZoneOnSameMonitor = (
    monitor: any, 
    zones: SnapZone[], 
    excludeZone: SnapZone, 
    conflictingItemIndex: number,
    conflictingItemType: 'app',
    draggedItemIndex: number,
    draggedItemType: 'app'
  ): SnapZone | null => {
    console.log('🔍 DISPLACEMENT SEARCH:', {
      excludeZone: excludeZone.id,
      conflictingItem: `${conflictingItemType}[${conflictingItemIndex}]`,
      draggedItem: `${draggedItemType}[${draggedItemIndex}]`
    });
    
    for (const zone of zones) {
      if (zone.id === excludeZone.id) continue;
      
      const conflict = findConflictingItem(monitor, zone, -1, 'app');
      
      if (!conflict) {
        console.log('  - Found empty zone:', zone.id);
        return zone;
      } else {
        // Check if the conflicting item is the one being dragged
        if (conflict.itemType === draggedItemType && conflict.itemIndex === draggedItemIndex) {
          console.log('  - Found dragged item\'s original zone:', zone.id);
          return zone;
        }
      }
    }
    
    return null;
  };

  // Unified drag handlers for apps only
  const handleItemDragStart = (monitorId: string, itemIndex: number, itemType: 'app') => {
    console.log('🚀 UNIFIED DRAG START:', `${monitorId} ${itemType}[${itemIndex}]`);
    
    lastValidSnapStateRef.current = null;
    
    setLocalDragState({
      isDragging: true,
      draggedItem: { monitorId, itemIndex, itemType },
      currentMonitorId: monitorId,
      snapZone: null,
      conflictItem: null,
      displacementZone: null,
      lastValidSnapState: null
    });
  };

  const handleItemDrag = (monitorId: string, itemIndex: number, itemType: 'app', newPosition: { x: number; y: number }) => {
    const updateCallback = onUpdateApp;
    if (!updateCallback) return;
    
    const monitor = monitors.find(m => m.id === monitorId);
    if (!monitor) return;
    
    const zones = getSnapZones(monitor);
    const snapZone = findZoneNearPosition(zones, newPosition);
    
    if (snapZone) {
      if (!localDragState.snapZone || localDragState.snapZone.id !== snapZone.id) {
        console.log('🎯 SNAP:', snapZone.id);
      }
      
      const conflictItem = findConflictingItem(monitor, snapZone, itemIndex, itemType);
      let displacementZone = null;
      
      if (conflictItem) {
        if (!localDragState.conflictItem || localDragState.conflictItem.item.name !== conflictItem.item.name) {
          console.log('⚠️ CONFLICT:', conflictItem.item.name);
        }
        displacementZone = findAvailableZoneOnSameMonitor(
          monitor, zones, snapZone, 
          conflictItem.itemIndex, conflictItem.itemType,
          itemIndex, itemType
        );
        
        if (displacementZone && (!localDragState.displacementZone || localDragState.displacementZone.id !== displacementZone.id)) {
          console.log('🔄 DISPLACEMENT AVAILABLE:', displacementZone.id);
        }
      }
      
      // Update preview to show snap
      updateCallback(monitorId, itemIndex, {
        position: { x: snapZone.position.x, y: snapZone.position.y },
        size: { width: snapZone.size.width, height: snapZone.size.height }
      });
      
      const validSnapState = {
        snapZone,
        conflictItem,
        displacementZone
      };
      
      lastValidSnapStateRef.current = validSnapState;
      
      setLocalDragState(prev => ({
        ...prev,
        snapZone,
        conflictItem,
        displacementZone,
        lastValidSnapState: validSnapState
      }));
    } else {
      updateCallback(monitorId, itemIndex, { position: newPosition });
      
      setLocalDragState(prev => ({
        ...prev,
        snapZone: null,
        conflictItem: null,
        displacementZone: null
      }));
    }
  };

  const handleItemDragEnd = (monitorId: string, itemIndex: number, itemType: 'app') => {
    console.log('🏁 UNIFIED DRAG END:', `${monitorId} ${itemType}[${itemIndex}]`);
    
    const updateCallback = onUpdateApp;
    
    // Get snap state from multiple sources
    const currentSnapZone = localDragState.snapZone || localDragState.lastValidSnapState?.snapZone || lastValidSnapStateRef.current?.snapZone;
    const currentConflictItem = localDragState.conflictItem || localDragState.lastValidSnapState?.conflictItem || lastValidSnapStateRef.current?.conflictItem;
    const currentDisplacementZone = localDragState.displacementZone || localDragState.lastValidSnapState?.displacementZone || lastValidSnapStateRef.current?.displacementZone;
    
    if (currentSnapZone && updateCallback) {
      if (currentConflictItem && currentDisplacementZone && onUpdateAppsWithDisplacement && itemType === 'app') {
        console.log('🚨 EXECUTING DISPLACEMENT');
        
        try {
          onUpdateAppsWithDisplacement(
            monitorId,
            itemIndex,
            {
              position: { x: currentSnapZone.position.x, y: currentSnapZone.position.y },
              size: { width: currentSnapZone.size.width, height: currentSnapZone.size.height }
            },
            currentConflictItem.itemIndex,
            {
              position: { x: currentDisplacementZone.position.x, y: currentDisplacementZone.position.y },
              size: { width: currentDisplacementZone.size.width, height: currentDisplacementZone.size.height }
            }
          );
          
          console.log('✅ DISPLACEMENT EXECUTED');
        } catch (error) {
          console.error('❌ DISPLACEMENT FAILED:', error);
          
          updateCallback(monitorId, itemIndex, {
            position: { x: currentSnapZone.position.x, y: currentSnapZone.position.y },
            size: { width: currentSnapZone.size.width, height: currentSnapZone.size.height }
          });
        }
      } else {
        console.log('✅ SIMPLE SNAP');
        
        updateCallback(monitorId, itemIndex, {
          position: { x: currentSnapZone.position.x, y: currentSnapZone.position.y },
          size: { width: currentSnapZone.size.width, height: currentSnapZone.size.height }
        });
      }
    }
    
    // Clear state
    lastValidSnapStateRef.current = null;
    setLocalDragState({
      isDragging: false,
      draggedItem: null,
      currentMonitorId: null,
      snapZone: null,
      conflictItem: null,
      displacementZone: null,
      lastValidSnapState: null
    });
    
    console.log('🏁 UNIFIED DRAG END COMPLETE');
  };

  // Auto-snap functionality
  const handleAutoSnap = (monitorId: string) => {
    if (!isEditMode || !onAutoSnapApps) return;
    
    const monitor = monitors.find(m => m.id === monitorId);
    if (!monitor || monitor.apps.length === 0) return;
    
    console.log('🎯 AUTO-SNAP STARTED:', { monitorId, appCount: monitor.apps.length });
    
    const zones = getSnapZones(monitor);
    if (zones.length === 0) return;
    
    // Calculate distance from each app to each zone
    const appDistances = monitor.apps.map((app, appIndex) => {
      const distances = zones.map(zone => {
        const dx = app.position.x - zone.position.x;
        const dy = app.position.y - zone.position.y;
        return {
          appIndex,
          zoneId: zone.id,
          zone,
          distance: Math.sqrt(dx * dx + dy * dy)
        };
      });
      
      // Sort by distance for this app
      distances.sort((a, b) => a.distance - b.distance);
      return { appIndex, distances };
    });
    
    console.log('📊 APP DISTANCES:', appDistances.map(ad => ({
      app: monitor.apps[ad.appIndex].name,
      closestZone: ad.distances[0].zoneId,
      distance: Math.round(ad.distances[0].distance)
    })));
    
    // Assign apps to zones using a greedy approach
    const assignedZones = new Set<string>();
    const appUpdates: { appIndex: number; position: { x: number; y: number }; size: { width: number; height: number } }[] = [];
    
    // Sort apps by their distance to their closest available zone
    const sortedApps = [...appDistances].sort((a, b) => 
      a.distances[0].distance - b.distances[0].distance
    );
    
    // First pass: assign each app to its closest available zone
    for (const { appIndex, distances } of sortedApps) {
      let assigned = false;
      
      for (const { zoneId, zone } of distances) {
        if (!assignedZones.has(zoneId)) {
          assignedZones.add(zoneId);
          appUpdates.push({
            appIndex,
            position: { x: zone.position.x, y: zone.position.y },
            size: { width: zone.size.width, height: zone.size.height }
          });
          assigned = true;
          console.log(`✅ ASSIGNED: ${monitor.apps[appIndex].name} -> ${zoneId}`);
          break;
        }
      }
      
      // If no zone available, stack in the first zone (fallback)
      if (!assigned && zones.length > 0) {
        const firstZone = zones[0];
        appUpdates.push({
          appIndex,
          position: { x: firstZone.position.x, y: firstZone.position.y },
          size: { width: firstZone.size.width, height: firstZone.size.height }
        });
        console.log(`⚠️ STACKED: ${monitor.apps[appIndex].name} -> ${firstZone.id} (no available zones)`);
      }
    }
    
    console.log('🎯 AUTO-SNAP COMPLETE:', { updatesCount: appUpdates.length });
    
    // Apply all updates
    onAutoSnapApps(monitorId, appUpdates);
  };

  /** When dragging an app onto the layout from sidebar/minimized/another monitor, zone grids use appCount+1. */
  const getProspectiveAppCountForDropZones = (monitor: any): number | undefined => {
    const globalAppDragActive = !!(dragState?.isDragging && dragState.dragData && dragState.dragData.type === 'app');
    if (!globalAppDragActive) return undefined;

    const source = dragState.dragData?.source;
    const sourceMonitorId = dragState.dragData?.sourceMonitorId || dragState.dragData?.monitorId || null;
    const base = monitor.apps.length;
    if (source === 'sidebar' || source === 'minimized') {
      return base + 1;
    }
    if (source === 'monitor' && sourceMonitorId && sourceMonitorId !== monitor.id) {
      return base + 1;
    }
    return undefined;
  };

  const appDragZonesActive =
    isEditMode && (localDragState.isDragging || !!(dragState?.isDragging && dragState.dragData?.type === 'app'));

  // Render snap zones — show on every monitor while dragging an app (subtle); stronger on hovered target zone
  const renderSnapZones = (monitor: any) => {
    const globalAppDragActive = !!(dragState?.isDragging && dragState.dragData && dragState.dragData.type === 'app');

    if (!isEditMode) {
      return null;
    }

    if (!localDragState.isDragging && !globalAppDragActive) {
      return null;
    }

    const prospective = getProspectiveAppCountForDropZones(monitor);
    const zones = prospective !== undefined ? getSnapZones(monitor, prospective) : getSnapZones(monitor);

    return zones.map((zone) => {
      const localCurrentSnapZone = localDragState.snapZone || localDragState.lastValidSnapState?.snapZone || lastValidSnapStateRef.current?.snapZone;
      const localCurrentConflictItem = localDragState.conflictItem || localDragState.lastValidSnapState?.conflictItem || lastValidSnapStateRef.current?.conflictItem;
      const localCurrentDisplacementZone = localDragState.displacementZone || localDragState.lastValidSnapState?.displacementZone || lastValidSnapStateRef.current?.displacementZone;

      const globalAppDrag = !!(dragState?.isDragging && dragState.dragData?.type === 'app');
      const hasPointerDrop =
        globalAppDrag &&
        externalSnapState.monitorId != null &&
        externalSnapState.snapZone != null;

      const pointerActive =
        hasPointerDrop &&
        externalSnapState.monitorId === monitor.id &&
        externalSnapState.snapZone?.id === zone.id;

      const localActive =
        localDragState.isDragging &&
        localDragState.draggedItem?.monitorId === monitor.id &&
        localCurrentSnapZone?.id === zone.id;

      const isActiveZone = hasPointerDrop
        ? pointerActive
        : localActive;

      const hasConflict =
        localDragState.isDragging &&
        localCurrentConflictItem &&
        isActiveZone &&
        localDragState.draggedItem?.monitorId === monitor.id;
      const hasDisplacement =
        localDragState.isDragging &&
        localCurrentDisplacementZone &&
        isActiveZone &&
        localDragState.draggedItem?.monitorId === monitor.id;

      const activeClasses = hasConflict && !hasDisplacement
        ? 'ring-1 ring-flow-accent-blue border-flow-accent-blue/90 bg-flow-accent-blue/18 shadow-[0_0_0_1px_rgba(56,189,248,0.5)]'
        : 'ring-1 ring-flow-accent-blue border-flow-accent-blue bg-flow-accent-blue/14 shadow-[0_0_0_1px_rgba(56,189,248,0.4)]';

      const zoneFlush =
        zone.size.width >= 99 && zone.size.height >= 99;
      const zoneRadius = zoneFlush ? 'rounded-none' : 'rounded-lg';

      return (
        <div
          key={zone.id}
          className={`absolute ${zoneRadius} transition-all duration-200 z-40 border pointer-events-none ${
            isActiveZone
              ? activeClasses
              : 'border-flow-accent-blue/45 bg-flow-accent-blue/[0.08] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]'
          }`}
          style={{
            left: `${zone.position.x - zone.size.width/2}%`,
            top: `${zone.position.y - zone.size.height/2}%`,
            width: `${zone.size.width}%`,
            height: `${zone.size.height}%`,
          }}
        />
      );
    });
  };

  return (
    <div ref={layoutRootRef} className="relative flex h-full min-h-0 min-w-0 flex-col">
      {/* Preview toolbar — layout editing lives here (not profile preferences) */}
      <div
        className={`flex-shrink-0 ${
          layoutToolbarConnected
            ? `bg-flow-bg-secondary/90 px-0 pb-3 pt-2.5 ${
                densePreviewMode ? "mb-2" : compactPreviewMode ? "mb-3" : "mb-4"
              }`
            : `rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 ${
                densePreviewMode ? "mb-2" : compactPreviewMode ? "mb-3" : "mb-4"
              }`
        }`}
      >
        <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-hidden sm:gap-3">
            <Monitor
              className={`shrink-0 text-flow-accent-blue/90 ${densePreviewMode ? "h-4 w-4" : "h-5 w-5"}`}
              strokeWidth={1.75}
            />
            <div className="min-w-0 flex-1 shrink">
              <h3
                className={`truncate font-semibold tracking-tight text-flow-text-primary ${densePreviewMode ? "text-sm" : "text-base md:text-lg"}`}
              >
                Monitor layout
              </h3>
              <p
                className="truncate text-[11px] text-flow-text-muted"
                title={
                  densePreviewMode
                    ? "Drag apps on monitors · use Edit layout to change positions"
                    : undefined
                }
              >
                {densePreviewMode
                  ? "Drag apps · Edit layout for positions"
                  : "Drag apps on monitors · use Edit layout to change positions"}
              </p>
            </div>
            {isEditMode ? (
              <div className="flex min-w-0 shrink items-center gap-1.5 sm:gap-2">
                <div className="flex max-w-[11rem] min-w-0 items-center gap-1.5 rounded-lg bg-flow-accent-blue/15 px-2 py-1 sm:max-w-none sm:px-2.5">
                  <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-flow-accent-blue" />
                  <span className="truncate text-xs font-medium text-flow-accent-blue">Editing layout</span>
                  {dragState?.isDragging ? (
                    <span className="hidden truncate text-xs font-medium text-flow-accent-blue/90 sm:inline">
                      · {dragState.dragData?.name || "Item"}
                    </span>
                  ) : null}
                </div>
                <span className="hidden truncate text-[11px] text-flow-text-muted md:inline">
                  Apps only — files become content
                </span>
              </div>
            ) : (
              <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-flow-text-muted">
                View mode
              </span>
            )}
          </div>
          {onToggleLayoutEdit ? (
            <button
              type="button"
              onClick={onToggleLayoutEdit}
              title={
                isEditMode
                  ? "Save layout and exit edit mode"
                  : "Edit monitor layout (drag apps between monitors)"
              }
              aria-label={
                isEditMode
                  ? "Save layout and exit edit mode"
                  : "Edit monitor layout"
              }
              className={`inline-flex shrink-0 items-center justify-center rounded-lg p-2.5 transition-colors md:p-3 ${
                isEditMode
                  ? "bg-flow-accent-blue text-flow-text-primary shadow-sm hover:bg-flow-accent-blue-hover"
                  : "text-flow-text-secondary hover:bg-white/[0.06] hover:text-flow-text-primary"
              }`}
            >
              {isEditMode ? (
                <Save className="h-4 w-4 shrink-0 md:h-[1.125rem] md:w-[1.125rem]" strokeWidth={1.75} />
              ) : (
                <PenLine className="h-4 w-4 shrink-0 md:h-[1.125rem] md:w-[1.125rem]" strokeWidth={1.75} />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* Monitor Layout Section - Flex-1 with overflow for scrolling if needed */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className={`h-full min-h-0 min-w-0 ${densePreviewMode ? 'pb-1' : 'pb-2'}`}>
          <div
            ref={monitorPreviewRef}
            className={`relative box-border h-full min-w-0 p-[clamp(5px,0.9vmin,12px)] min-h-[clamp(14rem,36vh,22rem)] ${large ? 'md:min-h-[clamp(18rem,42vh,30rem)]' : ''}`}
          >
            <div
              ref={monitorPreviewInnerRef}
              className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"
            >
            {monitors.map((monitor) => {
              const isPortrait = monitor.orientation === 'portrait';
              // Fixed card sizes must match getMonitorFootprint — scaling is continuous via transform only.
              const baseWidth = isPortrait
                ? (large ? 'w-52 min-w-52 flex-shrink-0' : 'w-40 min-w-40 flex-shrink-0')
                : (large ? 'w-[28rem] min-w-[28rem] flex-shrink-0' : 'w-80 min-w-72 flex-shrink-0');
              const baseHeight = isPortrait
                ? (large ? 'h-96' : 'h-72')
                : (large ? 'h-72' : 'h-52');
              const stackGapPx = Math.max(5, Math.round(4 + 12 * displayPreviewScale));
              const totalItems = monitor.apps.length; // Only count apps now
              const preview = monitorPreviewPositions[monitor.id] || { x: 50, y: 50 };
              const clampedPreview = clampPreviewPosition(monitor, preview, displayPreviewScale);
              
              return (
                <div
                  key={monitor.id}
                  className="monitor-layout-preview-scaled absolute flex flex-col"
                  style={{
                    left: `${clampedPreview.x}%`,
                    top: `${clampedPreview.y}%`,
                    transform: `translate3d(-50%, -50%, 0) scale(${displayPreviewScale})`,
                    transformOrigin: "center center",
                    gap: `${stackGapPx}px`,
                  }}
                >
                  {/* Monitor header - Improved */}
                  <div
                    className={`text-center ${draggingMonitor?.monitorId === monitor.id ? 'opacity-90' : ''}`}
                    onMouseDown={(event) => {
                      if (!isEditMode) return;
                      event.preventDefault();
                      setDraggingMonitor({
                        monitorId: monitor.id,
                        startX: event.clientX,
                        startY: event.clientY,
                        startPos: clampedPreview,
                        frozenScale: previewScaleRef.current,
                      });
                    }}
                  >
                    {isEditMode ? (
                      useCompactMonitorEditChrome ? (
                        <div className={`mb-1 mx-auto flex max-w-full flex-col items-stretch gap-1.5 ${baseWidth}`}>
                          <div className="flex min-w-0 items-center justify-center gap-1.5">
                            <div
                              className="inline-flex min-w-0 max-w-[min(100%,14rem)] cursor-grab items-center gap-2 rounded-lg border border-white/12 bg-gradient-to-b from-white/[0.09] to-white/[0.04] px-2 py-1 text-sm font-medium text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm transition-[border-color,box-shadow,background-color] hover:border-white/22 hover:from-white/[0.12] hover:to-white/[0.07] active:cursor-grabbing"
                              title={monitor.name}
                            >
                              <span className="flex shrink-0 flex-col gap-[3px] py-px" aria-hidden>
                                <span className="block h-[2px] w-2.5 rounded-full bg-white/45" />
                                <span className="block h-[2px] w-2.5 rounded-full bg-white/45" />
                                <span className="block h-[2px] w-2.5 rounded-full bg-white/45" />
                              </span>
                              <span className="truncate">{monitor.name}</span>
                            </div>
                            {(onUpdateMonitorLayout || (totalItems > 0 && onAutoSnapApps)) ? (
                              <div className="relative shrink-0">
                                <button
                                  type="button"
                                  aria-label={`Monitor actions for ${monitor.name}`}
                                  aria-expanded={monitorEditActionsOpenId === monitor.id}
                                  title="Layout preset and tools"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/15"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={() =>
                                    setMonitorEditActionsOpenId((id) =>
                                      id === monitor.id ? null : monitor.id,
                                    )
                                  }
                                >
                                  <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                                </button>
                                {monitorEditActionsOpenId === monitor.id ? (
                                  <>
                                    <div
                                      className="fixed inset-0 z-[45]"
                                      aria-hidden
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={() => setMonitorEditActionsOpenId(null)}
                                    />
                                    <div
                                      className="absolute right-0 top-full z-[50] mt-1 flex min-w-[12rem] flex-col gap-2 rounded-lg border border-flow-border bg-flow-bg-secondary p-2 shadow-lg"
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      {onUpdateMonitorLayout ? (
                                        <MonitorLayoutConfig
                                          monitor={{
                                            id: monitor.id,
                                            name: monitor.name,
                                            orientation: monitor.orientation || 'landscape',
                                            predefinedLayout: monitor.predefinedLayout,
                                            apps: monitor.apps,
                                          }}
                                          onLayoutChange={(mid, layout) => {
                                            onUpdateMonitorLayout(mid, layout);
                                            setMonitorEditActionsOpenId(null);
                                          }}
                                          isDropdown={true}
                                        />
                                      ) : null}
                                      {totalItems > 0 && onAutoSnapApps ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleAutoSnap(monitor.id);
                                            setMonitorEditActionsOpenId(null);
                                          }}
                                          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-flow-accent-purple/50 bg-flow-accent-purple px-2 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-flow-accent-purple/80"
                                          title="Auto-snap all windows to closest zones"
                                        >
                                          <Zap className="h-3 w-3 shrink-0" />
                                          Auto-Snap
                                        </button>
                                      ) : null}
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className={`mx-auto mb-1 flex flex-wrap items-center justify-center gap-2 ${baseWidth}`}>
                          <div className="inline-flex max-w-full min-w-0 cursor-grab items-center gap-2 whitespace-nowrap rounded-lg border border-white/12 bg-gradient-to-b from-white/[0.09] to-white/[0.04] px-2.5 py-1 text-sm font-medium text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm transition-[border-color,box-shadow,background-color] hover:border-white/22 hover:from-white/[0.12] hover:to-white/[0.07] active:cursor-grabbing">
                            <span className="flex shrink-0 flex-col gap-[3px] py-px" aria-hidden>
                              <span className="block h-[2px] w-3 rounded-full bg-white/45" />
                              <span className="block h-[2px] w-3 rounded-full bg-white/45" />
                              <span className="block h-[2px] w-3 rounded-full bg-white/45" />
                            </span>
                            <span className="whitespace-nowrap">{monitor.name}</span>
                          </div>
                          {monitor.systemName ? (
                            <span className="whitespace-nowrap text-[11px] text-white/55">
                              ({monitor.systemName})
                            </span>
                          ) : null}
                          {onUpdateMonitorLayout ? (
                            <div
                              className="relative shrink-0"
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <MonitorLayoutConfig
                                monitor={{
                                  id: monitor.id,
                                  name: monitor.name,
                                  orientation: monitor.orientation || 'landscape',
                                  predefinedLayout: monitor.predefinedLayout,
                                  apps: monitor.apps,
                                }}
                                onLayoutChange={onUpdateMonitorLayout}
                                isDropdown={true}
                              />
                            </div>
                          ) : null}
                          {totalItems > 0 && onAutoSnapApps ? (
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={() => handleAutoSnap(monitor.id)}
                              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-flow-accent-purple/50 bg-flow-accent-purple px-2 py-1 text-xs text-white shadow-sm transition-colors hover:bg-flow-accent-purple/80"
                              title="Auto-snap all windows to closest zones"
                            >
                              <Zap className="h-3 w-3" />
                              Auto-Snap
                            </button>
                          ) : null}
                        </div>
                      )
                    ) : (
                      <div className={`mb-1 mx-auto ${baseWidth}`}>
                        <div className="flex flex-col items-center justify-center gap-1 text-center">
                          <div className={`inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/15 bg-white/10 backdrop-blur-md ${densePreviewMode ? 'px-2 py-1' : 'px-3 py-1.5'} shadow-[0_6px_20px_rgba(0,0,0,0.35)]`}>
                            <span className={`text-white ${densePreviewMode ? 'text-xs' : 'text-sm'} font-semibold leading-none tracking-[0.01em] whitespace-nowrap`}>
                              {monitor.name}
                            </span>
                          </div>
                          {monitor.systemName && !compactPreviewMode && (
                            <div className="text-[11px] leading-tight text-white/60 whitespace-nowrap truncate max-w-full">
                              {monitor.systemName}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {!compactPreviewMode ? (
                      <div className={`flex items-center justify-center gap-2 ${densePreviewMode ? 'text-[10px]' : 'text-xs'} text-white/50`}>
                        <span>{monitor.resolution}</span>
                        <span>•</span>
                        <span>{monitor.apps.length} app{monitor.apps.length !== 1 ? 's' : ''}</span>
                        {monitor.primary && (
                          <>
                            <span>•</span>
                            <span className="text-blue-300">Primary</span>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className={`flex items-center justify-center gap-2 ${densePreviewMode ? 'text-[10px]' : 'text-[11px]'} text-white/50`}>
                        <span>{monitor.apps.length} app{monitor.apps.length !== 1 ? 's' : ''}</span>
                        {monitor.primary && <span className="text-blue-300">Primary</span>}
                      </div>
                    )}
                  </div>
                  
                  {/* Monitor display - Enhanced sizing */}
                  <div 
                    className={`monitor-container relative bg-black/40 backdrop-blur-sm border-2 rounded-xl p-0 ${baseWidth} ${baseHeight} overflow-hidden transition-all duration-200 ${
                      appDragZonesActive
                        ? 'border-flow-accent-blue/40 ring-1 ring-flow-accent-blue/20 shadow-[inset_0_0_20px_rgba(56,189,248,0.06)]'
                        : 'border-white/20'
                    }`}
                    data-drop-target="monitor"
                    data-target-id={monitor.id}
                    data-monitor-id={monitor.id}
                  >
                    <div className="relative h-full w-full min-h-0 bg-black/60 overflow-hidden rounded-xl ring-1 ring-inset ring-white/10">
                      
                      {/* Monitor-Specific Snap Zones */}
                      {renderSnapZones(monitor)}
                      
                      {totalItems === 0 && !isEditMode && (
                        <div className="absolute inset-4 flex items-center justify-center">
                          <div className="text-center">
                            <Monitor className="w-8 h-8 text-white/30 mx-auto mb-2" />
                            <span className="text-white/30 text-sm">No apps configured</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Apps positioned on monitor */}
                      <div className="relative w-full h-full">
                        {/* Render Apps Only */}
                        {monitor.apps.map((app: App, appIndex: number) => (
                          <AppFileWindow
                            key={
                              app.instanceId
                                ? `app-${monitor.id}-${app.instanceId}`
                                : `app-${monitor.id}-i${appIndex}-${app.name}`
                            }
                            item={{
                              type: 'app',
                              name: app.name,
                              icon: app.icon,
                              iconPath: app.iconPath ?? null,
                              executablePath: app.executablePath ?? null,
                              shortcutPath: app.shortcutPath ?? null,
                              launchUrl: app.launchUrl ?? null,
                              color: app.color,
                              position: app.position,
                              size: app.size,
                              volume: app.volume,
                              launchBehavior: app.launchBehavior,
                              runAsAdmin: app.runAsAdmin,
                              forceCloseOnExit: app.forceCloseOnExit,
                              smartSave: app.smartSave,
                              monitorId: app.monitorId,
                              instanceId: app.instanceId,
                              associatedFiles: app.associatedFiles
                            }}
                            itemIndex={appIndex}
                            monitorId={monitor.id}
                            browserTabs={browserTabs}
                            onDragStart={() => handleItemDragStart(monitor.id, appIndex, 'app')}
                            onDrag={(newPosition) => handleItemDrag(monitor.id, appIndex, 'app', newPosition)}
                            onDragEnd={() => handleItemDragEnd(monitor.id, appIndex, 'app')}
                            onCustomDragStart={(startPos) => {
                              const dragData = {
                                source: 'monitor',
                                type: 'app',
                                name: app.name,
                                icon: app.icon,
                                iconPath: app.iconPath ?? null,
                                executablePath: app.executablePath ?? null,
                                shortcutPath: app.shortcutPath ?? null,
                                launchUrl: app.launchUrl ?? null,
                                color: app.color,
                                sourceMonitorId: monitor.id,
                                appIndex,
                                app: {
                                  name: app.name,
                                  icon: app.icon,
                                  iconPath: app.iconPath ?? null,
                                  executablePath: app.executablePath ?? null,
                                  shortcutPath: app.shortcutPath ?? null,
                                  launchUrl: app.launchUrl ?? null,
                                  color: app.color,
                                  volume: app.volume,
                                  position: app.position,
                                  size: app.size,
                                  launchBehavior: 'new' as const,
                                  runAsAdmin: app.runAsAdmin || false,
                                  forceCloseOnExit: false,
                                  smartSave: false
                                }
                              };
                              
                              onCustomDragStart(dragData, 'monitor', monitor.id, startPos);
                              handleItemDragStart(monitor.id, appIndex, 'app');
                            }}
                            onDelete={() => onRemoveApp?.(monitor.id, appIndex)}
                            onResize={(newSize) => onUpdateApp?.(monitor.id, appIndex, { size: newSize })}
                            onMove={(newPosition) => onUpdateApp?.(monitor.id, appIndex, { position: newPosition })}
                            onMoveToMinimized={() => onMoveAppToMinimized?.(monitor.id, appIndex)}
                            onAssociateFileWithApp={(fileData) => onAssociateFileWithApp?.(monitor.id, appIndex, fileData)}
                            onUpdateAssociatedFiles={(files) => handleUpdateAssociatedFiles(monitor.id, appIndex, files)}
                            onAppSelect={() => onAppSelect && onAppSelect(app, 'monitor', monitor.id, appIndex)}
                            isDragging={
                              localDragState.isDragging && 
                              localDragState.draggedItem?.monitorId === monitor.id && 
                              localDragState.draggedItem?.itemIndex === appIndex &&
                              localDragState.draggedItem?.itemType === 'app'
                            }
                            isEditable={isEditMode}
                            isSnappedToZone={
                              localDragState.snapZone !== null &&
                              localDragState.draggedItem?.monitorId === monitor.id &&
                              localDragState.draggedItem?.itemIndex === appIndex &&
                              localDragState.draggedItem?.itemType === 'app' &&
                              !(
                                dragState?.isDragging &&
                                dragState.dragData?.type === 'app' &&
                                externalSnapState.monitorId != null &&
                                localDragState.draggedItem?.monitorId &&
                                externalSnapState.monitorId !== localDragState.draggedItem.monitorId
                              )
                            }
                            isConflicting={
                              localDragState.conflictItem?.itemIndex === appIndex &&
                              localDragState.conflictItem?.itemType === 'app'
                            }
                            willBeDisplaced={
                              localDragState.conflictItem?.itemIndex === appIndex && 
                              localDragState.conflictItem?.itemType === 'app' &&
                              localDragState.displacementZone !== null
                            }
                            isSelected={matchesMonitorAppSelection(
                              selectedApp,
                              monitor.id,
                              appIndex,
                              app,
                            )}
                            monitorPreviewSurface
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
      
      {/* Minimized Apps: overflow visible so hover popovers are not clipped; min-height fits one full tile row */}
      <div className="flex-shrink-0 border-t border-flow-border/30 min-h-[clamp(7.5rem,12vh,11rem)] overflow-x-hidden overflow-y-visible">
        <div
          className={`scrollbar-elegant min-h-0 max-h-[min(40vh,18rem)] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] ${
            densePreviewMode || layoutColumnHeight < 720 ? 'px-2 py-1' : 'px-3 py-1.5'
          }`}
        >
          <MinimizedApps 
            apps={minimizedApps}
            files={[]} // No more standalone files
            browserTabs={browserTabs}
            isEditMode={isEditMode}
            selectedApp={selectedApp}
            dragState={dragState || null}
            onCustomDragStart={onCustomDragStart}
            onAppSelect={onAppSelect}
            onFileSelect={() => {}} // No more file selection
            onMoveToMonitor={onMoveMinimizedAppToMonitor}
            onMoveFileToMonitor={() => {}} // No more file moves
            onRemoveApp={onRemoveMinimizedApp}
            onRemoveFile={() => {}} // No more file removal
            monitors={monitors}
            compact={layoutColumnHeight > 0 && layoutColumnHeight < 760}
            onClearAppSelection={onClearAppSelection}
          />
        </div>
      </div>
    </div>
  );
}