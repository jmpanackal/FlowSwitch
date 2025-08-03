import { useState, useEffect, useRef } from "react";
import { Monitor, Grid3X3, Zap, ChevronDown } from "lucide-react";
import { AppFileWindow } from "./AppFileWindow";
import { MinimizedApps } from "./MinimizedApps";
import { AppSettings } from "./AppSettings";
import { MonitorLayoutConfig } from "./MonitorLayoutConfig";
import { SelectedAppDetails } from "./SelectedAppDetails";
import { LucideIcon } from "lucide-react";
import { DragState } from "../types/dragTypes";

interface App {
  name: string;
  icon: LucideIcon;
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
  icon: LucideIcon;
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
    primary: boolean;
    resolution: string;
    orientation?: 'landscape' | 'portrait';
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
  onFileSelect?: (fileData: any, source: 'monitor' | 'minimized', monitorId?: string, fileIndex?: number) => void; // Legacy
  selectedApp?: any;
  onAutoSnapApps?: (monitorId: string, appUpdates: { appIndex: number; position: { x: number; y: number }; size: { width: number; height: number } }[]) => void;
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
  onFileSelect, // Legacy
  selectedApp,
  onAutoSnapApps
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

  const lastValidSnapStateRef = useRef<{
    snapZone: SnapZone | null;
    conflictItem: { itemIndex: number; item: App; itemType: 'app' } | null;
    displacementZone: SnapZone | null;
  } | null>(null);

  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1);
  const [selectedMonitorId, setSelectedMonitorId] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
  const getSnapZones = (monitor: any): SnapZone[] => {
    if (monitor.predefinedLayout) {
      const layouts = monitor.orientation === 'portrait' ? PORTRAIT_LAYOUTS : LANDSCAPE_LAYOUTS;
      const layout = layouts[monitor.predefinedLayout as keyof typeof layouts];
      return layout?.slots || [];
    }
    
    // Use total app count for dynamic layouts
    const totalItems = monitor.apps.length;
    const isPortrait = monitor.orientation === 'portrait';
    
    if (isPortrait) {
      if (totalItems === 1) {
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
      if (totalItems === 1) {
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
    let currentSnapZone = localDragState.snapZone || localDragState.lastValidSnapState?.snapZone || lastValidSnapStateRef.current?.snapZone;
    let currentConflictItem = localDragState.conflictItem || localDragState.lastValidSnapState?.conflictItem || lastValidSnapStateRef.current?.conflictItem;
    let currentDisplacementZone = localDragState.displacementZone || localDragState.lastValidSnapState?.displacementZone || lastValidSnapStateRef.current?.displacementZone;
    
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

  // Render snap zones
  const renderSnapZones = (monitor: any) => {
    if (!isEditMode || !localDragState.isDragging || !localDragState.draggedItem || 
        localDragState.draggedItem.monitorId !== monitor.id || localDragState.currentMonitorId !== monitor.id) {
      return null;
    }
    
    const zones = getSnapZones(monitor);
    
    return zones.map((zone) => {
      const currentSnapZone = localDragState.snapZone || localDragState.lastValidSnapState?.snapZone || lastValidSnapStateRef.current?.snapZone;
      const currentConflictItem = localDragState.conflictItem || localDragState.lastValidSnapState?.conflictItem || lastValidSnapStateRef.current?.conflictItem;
      const currentDisplacementZone = localDragState.displacementZone || localDragState.lastValidSnapState?.displacementZone || lastValidSnapStateRef.current?.displacementZone;
      
      const isActiveZone = currentSnapZone?.id === zone.id;
      const hasConflict = currentConflictItem && isActiveZone;
      const hasDisplacement = currentDisplacementZone && isActiveZone;
      
      return (
        <div
          key={zone.id}
          className={`absolute border-2 rounded-lg transition-all duration-200 z-40 ${
            isActiveZone
              ? hasConflict
                ? hasDisplacement
                  ? 'border-yellow-400 bg-yellow-400/25 shadow-lg shadow-yellow-400/60 scale-[1.02]'
                  : 'border-red-400 bg-red-400/25 shadow-lg shadow-red-400/60 scale-[1.02]'
                : 'border-green-400 bg-green-400/30 shadow-lg shadow-green-400/60 scale-[1.02]'
              : 'border-blue-400/60 bg-blue-400/10 border-dashed'
          }`}
          style={{
            left: `${zone.position.x - zone.size.width/2}%`,
            top: `${zone.position.y - zone.size.height/2}%`,
            width: `${zone.size.width}%`,
            height: `${zone.size.height}%`,
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={`text-xs font-bold px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all ${
              isActiveZone
                ? hasConflict
                  ? hasDisplacement
                    ? 'text-yellow-200 bg-yellow-900/80 border border-yellow-300/50 shadow-md'
                    : 'text-red-200 bg-red-900/80 border border-red-300/50 shadow-md'
                  : 'text-green-200 bg-green-900/80 border border-green-300/50 shadow-md'
                : 'text-white bg-black/60 border border-white/20'
            }`}>
              {zone.id.replace('-', ' ')}
              {isActiveZone && (
                <div className="text-xs mt-1 font-bold animate-pulse">
                  {hasConflict 
                    ? hasDisplacement 
                      ? '🔄 DISPLACE!'
                      : '❌ NO SPACE!'
                    : '🪟 SNAP!'
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-white/70" />
          <h3 className="text-white text-lg">Monitor Layout Preview</h3>
          {isEditMode ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-flow-accent-blue/20 border border-flow-accent-blue/30 rounded-lg backdrop-blur-sm">
                <div className="w-2 h-2 bg-flow-accent-blue rounded-full animate-pulse" />
                <span className="text-flow-accent-blue text-xs font-medium">Edit Mode</span>
                {dragState?.isDragging && (
                  <span className="text-flow-accent-blue text-xs font-medium">
                    | Dragging: {dragState.dragData?.name || 'Item'}
                  </span>
                )}
              </div>
              <span className="text-xs text-white/50">Apps only - Files become content</span>
            </div>
          ) : (
            <span className="text-xs text-white/50 bg-white/10 px-2 py-1 rounded-full">
              View Mode
            </span>
          )}
        </div>
      </div>
      
      {/* Monitor Layout Section - Flex-1 with overflow for scrolling if needed */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="pb-6">
          <div className={`flex gap-8 justify-center flex-wrap ${large ? 'gap-12' : ''} min-w-0`}>
            {monitors.map((monitor) => {
              const isPortrait = monitor.orientation === 'portrait';
              // Enhanced sizing with proper flex handling to prevent wrapping
              const baseWidth = isPortrait ? (large ? 'w-52 min-w-52 flex-shrink-0' : 'w-40 min-w-40 flex-shrink-0') : (large ? 'w-[28rem] min-w-[28rem] flex-shrink' : 'w-80 min-w-72 flex-shrink');
              const baseHeight = isPortrait ? (large ? 'h-96' : 'h-72') : (large ? 'h-72' : 'h-52');
              const totalItems = monitor.apps.length; // Only count apps now
              
              return (
                <div key={monitor.id} className="space-y-4">
                  {/* Monitor header - Improved */}
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <span className="text-white text-sm font-medium">{monitor.name}</span>
                      {isEditMode && onUpdateMonitorLayout && (
                        <div className="relative">
                          <MonitorLayoutConfig
                            monitor={{
                              id: monitor.id,
                              name: monitor.name,
                              orientation: monitor.orientation || 'landscape',
                              predefinedLayout: monitor.predefinedLayout,
                              apps: monitor.apps
                            }}
                            onLayoutChange={onUpdateMonitorLayout}
                            isDropdown={true}
                          />
                        </div>
                      )}
                      {isEditMode && totalItems > 0 && onAutoSnapApps && (
                        <button
                          onClick={() => handleAutoSnap(monitor.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-flow-accent-purple text-white hover:bg-flow-accent-purple/80 rounded border border-flow-accent-purple/50 transition-colors shadow-sm"
                          title="Auto-snap all windows to closest zones"
                        >
                          <Zap className="w-3 h-3" />
                          Auto-Snap
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2 text-xs text-white/50">
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
                  </div>
                  
                  {/* Monitor display - Enhanced sizing */}
                  <div 
                    className={`monitor-container relative bg-black/40 backdrop-blur-sm border-2 rounded-xl p-3 ${baseWidth} ${baseHeight} overflow-hidden transition-all duration-200 border-white/20`}
                    data-drop-target="monitor"
                    data-target-id={monitor.id}
                    data-monitor-id={monitor.id}
                  >
                    <div className="relative w-full h-full bg-black/60 rounded-lg border border-white/10 overflow-hidden">
                      
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
                            key={`app-${monitor.id}-${appIndex}`}
                            item={{
                              type: 'app',
                              name: app.name,
                              icon: app.icon,
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
                                sourceMonitorId: monitor.id,
                                appIndex,
                                app: {
                                  name: app.name,
                                  icon: app.icon,
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
                            onSettings={() => {
                              setSelectedItem(app);
                              setSelectedItemIndex(appIndex);
                              setSelectedMonitorId(monitor.id);
                              setIsSettingsOpen(true);
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
                              localDragState.draggedItem?.itemType === 'app'
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
                            isSelected={
                              selectedApp && 
                              selectedApp.source === 'monitor' &&
                              selectedApp.monitorId === monitor.id &&
                              selectedApp.appIndex === appIndex &&
                              (selectedApp.type === 'app' || selectedApp.type === 'browser')
                            }
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
      
      {/* Fixed Bottom Section: Minimized Apps - Always visible at bottom */}
      <div className="flex-shrink-0">
        <div className="px-4 py-4">
          <MinimizedApps 
            apps={minimizedApps}
            files={[]} // No more standalone files
            browserTabs={browserTabs}
            isEditMode={isEditMode}
            selectedApp={selectedApp}
            onCustomDragStart={onCustomDragStart}
            onAppSelect={onAppSelect}
            onFileSelect={() => {}} // No more file selection
            onMoveToMonitor={onMoveMinimizedAppToMonitor}
            onMoveFileToMonitor={() => {}} // No more file moves
            onRemoveApp={onRemoveMinimizedApp}
            onRemoveFile={() => {}} // No more file removal
            monitors={monitors}
          />
        </div>
      </div>
      
      {/* App Settings Modal */}
      {isSettingsOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <AppSettings 
            app={selectedItem}
            isOpen={isSettingsOpen}
            onClose={() => {
              setIsSettingsOpen(false);
              setSelectedItem(null);
              setSelectedItemIndex(-1);
              setSelectedMonitorId('');
            }}
            onSave={(settings) => {
              if (selectedMonitorId && selectedItemIndex >= 0) {
                // Only handle apps now
                if (onUpdateApp) {
                  onUpdateApp(selectedMonitorId, selectedItemIndex, settings);
                }
              }
            }}
            onDelete={() => {
              if (selectedMonitorId && selectedItemIndex >= 0) {
                onRemoveApp?.(selectedMonitorId, selectedItemIndex);
                setIsSettingsOpen(false);
                setSelectedItem(null);
                setSelectedItemIndex(-1);
                setSelectedMonitorId('');
              }
            }}
            onMinimize={() => {
              if (selectedMonitorId && selectedItemIndex >= 0) {
                onMoveAppToMinimized?.(selectedMonitorId, selectedItemIndex);
                setIsSettingsOpen(false);
                setSelectedItem(null);
                setSelectedItemIndex(-1);
                setSelectedMonitorId('');
              }
            }}
            isFile={false} // Always apps now
            filePath={undefined}
            fileType={undefined}
          />
        </div>
      )}
    </div>
  );
}