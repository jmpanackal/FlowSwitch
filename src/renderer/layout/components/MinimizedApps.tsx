import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { safeIconSrc } from "../../utils/safeIconSrc";
import { Minimize2, Globe, Square, X, Package, MoreHorizontal } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { FileIcon, getFileTypeColor } from "./FileIcon";
import { matchesMinimizedAppSelection } from "../utils/appSelection";
import {
  restoreDocumentTextSelection,
  suspendDocumentTextSelection,
} from "../utils/documentTextSelection";
import { FlowTooltip } from "./ui/tooltip";

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
  instanceId?: string;
  browserTabs?: { name: string; url: string; isActive: boolean }[];
  associatedFiles?: {
    id: string;
    name: string;
    path: string;
    type: string;
    associatedApp: string;
    useDefaultApp: boolean;
  }[];
}


interface MonitorInfo {
  id: string;
  name: string;
  primary: boolean;
  resolution: string;
  orientation?: 'landscape' | 'portrait';
}

interface MinimizedAppsProps {
  apps: MinimizedApp[];
  files?: any[];
  monitors?: MonitorInfo[];
  browserTabs?: any[];
  selectedApp?: any;
  dragState?: { isDragging: boolean; dragData: any } | null;
  onAppSettings?: (app: MinimizedApp) => void;
  onAppSelect?: (appData: any, source: 'monitor' | 'minimized', monitorId?: string, appIndex?: number) => void;
  onFileSelect?: (fileData: any, source: 'monitor' | 'minimized', monitorId?: string, fileIndex?: number) => void;
  onMoveToMonitor?: (appIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }, newSize?: { width: number; height: number }) => void;
  onMoveFileToMonitor?: (fileIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }) => void;
  onRemoveApp?: (appIndex: number) => void;
  onRemoveFile?: (fileIndex: number) => void;
  onCustomDragStart: (data: any, sourceType: 'sidebar' | 'monitor' | 'minimized', sourceId: string, startPos: { x: number; y: number }, preview?: React.ReactNode) => void;
  /** Clicking the minimized strip background (not a tile) clears selection. */
  onClearAppSelection?: () => void;
  isEditMode?: boolean;
  compact?: boolean;
}

export function MinimizedApps({ 
  apps, 
  files = [],
  monitors = [], 
  browserTabs = [],
  selectedApp,
  dragState,
  onAppSettings, 
  onAppSelect,
  onFileSelect,
  onMoveToMonitor,
  onMoveFileToMonitor,
  onRemoveApp,
  onRemoveFile,
  onCustomDragStart,
  onClearAppSelection,
  isEditMode = false,
  compact = false,
}: MinimizedAppsProps) {
  const [hoveredApp, setHoveredApp] = useState<number | string | null>(null);
  /** Fixed-position popovers use viewport coords so they are not clipped by overflow ancestors. */
  const [tooltipAnchor, setTooltipAnchor] = useState<{ x: number; y: number } | null>(null);
  
  // Timer and state for click vs drag detection
  const dragTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mouseStateRef = useRef({
    isMouseDown: false,
    startX: 0,
    startY: 0,
    hasMoved: false,
    dragInitiated: false,
    itemType: null as 'app' | 'file' | null,
    itemIndex: -1,
    itemData: null as any
  });

  const getMonitorName = (monitorId: string) => {
    const monitor = monitors.find(m => m.id === monitorId);
    return monitor?.name || 'Monitor 1';
  };

  const getMonitorInfo = (monitorId: string) => {
    const monitor = monitors.find(m => m.id === monitorId);
    return monitor || { id: monitorId, name: 'Monitor 1', primary: false, resolution: '1920x1080' };
  };

  // Safely handle the icon component
  const renderIcon = (app: MinimizedApp) => {
    const iconSrc = safeIconSrc(app.iconPath);
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={app.name}
          className="w-5 h-5 object-contain rounded"
          draggable={false}
        />
      );
    }

    if (!app.icon) {
      return (
        <div className="w-5 h-5 bg-flow-text-muted/20 rounded flex items-center justify-center">
          <Package className="w-3 h-3 text-flow-text-muted" />
        </div>
      );
    }
    
    // Check if it's a valid React component
    if (typeof app.icon === 'function') {
      try {
        const IconComponent = app.icon;
        return <IconComponent className="w-5 h-5 text-flow-text-primary" />;
      } catch (error) {
        console.warn('Failed to render icon for app:', app.name, error);
        return (
          <div className="w-5 h-5 bg-flow-text-muted/20 rounded flex items-center justify-center">
            <Package className="w-3 h-3 text-flow-text-muted" />
          </div>
        );
      }
    }
    
    // If it's not a function, show fallback
    return (
      <div className="w-5 h-5 bg-flow-text-muted/20 rounded flex items-center justify-center">
        <Package className="w-3 h-3 text-flow-text-muted" />
      </div>
    );
  };

  // ENHANCED MOUSE SYSTEM - Click vs drag detection for minimized apps
  const handleMouseDown = (e: React.MouseEvent, app: MinimizedApp, index: number) => {
    e.preventDefault();

    // Initialize mouse state
    mouseStateRef.current = {
      isMouseDown: true,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
      dragInitiated: false,
      itemType: 'app',
      itemIndex: index,
      itemData: app
    };
    
    if (isEditMode) {
      // In edit mode, set up timer for drag initiation (500ms)
      dragTimerRef.current = setTimeout(() => {
        if (mouseStateRef.current.isMouseDown && !mouseStateRef.current.dragInitiated) {
          initiateDrag(e.clientX, e.clientY);
        }
      }, 500);
    }
    
    // Add global mouse event listeners for tracking
    document.addEventListener('mousemove', handleMouseMoveForClickDetection);
    document.addEventListener('mouseup', handleMouseUpForClickDetection);
    suspendDocumentTextSelection();
  };

  const handleDelete = (e: React.MouseEvent, appIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    onRemoveApp?.(appIndex);
  };

  // Handle maximize - restore app to its remembered monitor
  const handleMaximize = (e: React.MouseEvent, appIndex: number) => {
    e.stopPropagation();
    if (!onMoveToMonitor) return;
    const app = apps[appIndex];
    const defaultMonitorId =
      monitors.find((m) => m.primary)?.id ?? monitors[0]?.id ?? "monitor-1";
    onMoveToMonitor(appIndex, app.targetMonitor || defaultMonitorId);
  };

  // ENHANCED MOUSE SYSTEM - Click vs drag detection for minimized files
  const handleFileMouseDown = (e: React.MouseEvent, file: any, index: number) => {
    e.preventDefault();

    // Initialize mouse state
    mouseStateRef.current = {
      isMouseDown: true,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
      dragInitiated: false,
      itemType: 'file',
      itemIndex: index,
      itemData: file
    };
    
    if (isEditMode) {
      // In edit mode, set up timer for drag initiation (500ms)
      dragTimerRef.current = setTimeout(() => {
        if (mouseStateRef.current.isMouseDown && !mouseStateRef.current.dragInitiated) {
          initiateDrag(e.clientX, e.clientY);
        }
      }, 500);
    }
    
    // Add global mouse event listeners for tracking
    document.addEventListener('mousemove', handleMouseMoveForClickDetection);
    document.addEventListener('mouseup', handleMouseUpForClickDetection);
    suspendDocumentTextSelection();
  };

  const handleMouseMoveForClickDetection = (e: MouseEvent) => {
    if (!mouseStateRef.current.isMouseDown || mouseStateRef.current.dragInitiated) return;
    
    const deltaX = Math.abs(e.clientX - mouseStateRef.current.startX);
    const deltaY = Math.abs(e.clientY - mouseStateRef.current.startY);
    const moveThreshold = 5; // pixels
    
    if (deltaX > moveThreshold || deltaY > moveThreshold) {
      mouseStateRef.current.hasMoved = true;
      
      if (isEditMode) {
        console.log('🖱️ MOUSE MOVED BEYOND THRESHOLD (MINIMIZED) - Initiating drag');
        initiateDrag(e.clientX, e.clientY);
      }
    }
  };

  const handleMouseUpForClickDetection = (e: MouseEvent) => {
    if (!mouseStateRef.current.isMouseDown) return;
    
    console.log('🖱️ MOUSE UP (MINIMIZED) - Processing click/drag result', {
      dragInitiated: mouseStateRef.current.dragInitiated,
      hasMoved: mouseStateRef.current.hasMoved,
      isEditMode,
      itemType: mouseStateRef.current.itemType
    });
    
    // Clear the drag timer
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    
    // If drag wasn't initiated and mouse didn't move much, it's a click
    if (!mouseStateRef.current.dragInitiated && !mouseStateRef.current.hasMoved) {
      console.log('🎯 CLICK DETECTED (MINIMIZED) - Triggering selection');
      
      if (mouseStateRef.current.itemType === 'app' && onAppSelect) {
        console.log('🎯 SELECTING MINIMIZED APP:', mouseStateRef.current.itemData.name);
        onAppSelect(mouseStateRef.current.itemData, 'minimized', undefined, mouseStateRef.current.itemIndex);
      } else if (mouseStateRef.current.itemType === 'file' && onFileSelect) {
        console.log('🎯 SELECTING MINIMIZED FILE:', mouseStateRef.current.itemData.name);
        onFileSelect(mouseStateRef.current.itemData, 'minimized', undefined, mouseStateRef.current.itemIndex);
      }
    }
    
    // Clean up mouse state
    mouseStateRef.current.isMouseDown = false;
    mouseStateRef.current.dragInitiated = false;
    
    // Remove global listeners
    document.removeEventListener('mousemove', handleMouseMoveForClickDetection);
    document.removeEventListener('mouseup', handleMouseUpForClickDetection);
    restoreDocumentTextSelection();
  };

  const initiateDrag = (clientX: number, clientY: number) => {
    if (mouseStateRef.current.dragInitiated || !mouseStateRef.current.itemData) return;
    
    console.log('🚀 INITIATING DRAG MODE (MINIMIZED)');
    mouseStateRef.current.dragInitiated = true;
    
    if (mouseStateRef.current.itemType === 'app') {
      const app = mouseStateRef.current.itemData;
      const dragData = {
        source: 'minimized',
        type: 'app',
        appIndex: mouseStateRef.current.itemIndex,
        name: app.name,
        icon: app.icon,
        iconPath: app.iconPath ?? null,
        executablePath: app.executablePath ?? null,
        shortcutPath: app.shortcutPath ?? null,
        launchUrl: app.launchUrl ?? null,
        color: app.color,
        app: {
          name: app.name,
          icon: app.icon,
          iconPath: app.iconPath ?? null,
          executablePath: app.executablePath ?? null,
          shortcutPath: app.shortcutPath ?? null,
          launchUrl: app.launchUrl ?? null,
          color: app.color,
          volume: app.volume,
          targetMonitor: app.targetMonitor
        }
      };
      
      const previewIconSrc = safeIconSrc(app.iconPath);
      const preview = (
        <div className="flex items-center gap-2">
          {previewIconSrc ? (
            <img src={previewIconSrc} alt={app.name} className="w-4 h-4 object-contain rounded" />
          ) : app.icon ? (
            <app.icon className="w-4 h-4" style={{ color: app.color }} />
          ) : (
            <Package className="w-4 h-4 text-flow-text-muted" />
          )}
          <span>{app.name}</span>
        </div>
      );
      
      onCustomDragStart(
        dragData,
        'minimized',
        'minimized',
        { x: clientX, y: clientY },
        preview
      );
    } else if (mouseStateRef.current.itemType === 'file') {
      const file = mouseStateRef.current.itemData;
      const dragData = {
        source: 'minimized',
        type: 'file',
        fileIndex: mouseStateRef.current.itemIndex,
        name: file.name,
        path: file.path,
        fileType: file.type,
        fileIcon: FileIcon,
        fileColor: getFileTypeColor(file.type),
        associatedApp: file.associatedApp,
        useDefaultApp: file.useDefaultApp,
        targetMonitor: file.targetMonitor
      };
      
      const preview = (
        <div className="flex items-center gap-2">
          <FileIcon type={file.type} className="w-4 h-4" />
          <span>{file.name}</span>
        </div>
      );
      
      onCustomDragStart(
        dragData,
        'minimized',
        'minimized',
        { x: clientX, y: clientY },
        preview
      );
    }
    
    // Remove click detection listeners
    document.removeEventListener('mousemove', handleMouseMoveForClickDetection);
    document.removeEventListener('mouseup', handleMouseUpForClickDetection);
  };

  const handleFileDelete = (e: React.MouseEvent, fileIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    onRemoveFile?.(fileIndex);
  };

  // Handle file maximize - restore file to its remembered monitor
  const handleFileMaximize = (e: React.MouseEvent, fileIndex: number) => {
    e.stopPropagation();
    if (!onMoveFileToMonitor) return;
    const file = files[fileIndex];
    const defaultMonitorId =
      monitors.find((m) => m.primary)?.id ?? monitors[0]?.id ?? "monitor-1";
    onMoveFileToMonitor(fileIndex, file.targetMonitor || defaultMonitorId);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
      }
      document.removeEventListener('mousemove', handleMouseMoveForClickDetection);
      document.removeEventListener('mouseup', handleMouseUpForClickDetection);
    };
  }, []);

  const totalItems = apps.length + files.length;
  const maxVisibleApps = compact ? 6 : 8;
  const visibleApps = apps.slice(0, maxVisibleApps);
  const hiddenAppsCount = Math.max(0, apps.length - visibleApps.length);

  const clearHover = () => {
    setHoveredApp(null);
    setTooltipAnchor(null);
  };

  const hoveredAppData =
    typeof hoveredApp === "number" ? visibleApps[hoveredApp] : null;
  const hoveredFileData =
    typeof hoveredApp === "string" && hoveredApp.startsWith("file-")
      ? files[parseInt(hoveredApp.replace("file-", ""), 10)]
      : null;

  const renderHoverPortal = () => {
    if (!tooltipAnchor || hoveredApp === null) return null;

    if (hoveredAppData) {
      const app = hoveredAppData;
      const monitorInfo = getMonitorInfo(app.targetMonitor || "monitor-1");
      const isBrowser =
        app.name.toLowerCase().includes("chrome") ||
        app.name.toLowerCase().includes("browser");

      return (
        <div className="flow-tooltip-inner-pop inline-block w-max max-w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-flow-border bg-flow-surface-elevated px-2.5 py-2 shadow-flow-shadow-lg">
          <div className="text-sm font-medium text-flow-text-primary mb-1 max-w-[14rem] truncate">
            {app.name}
          </div>
          <div className="text-xs text-flow-text-muted mb-2 whitespace-normal">
            Target: {monitorInfo.name}
            {monitorInfo.primary && (
              <span className="ml-1 text-flow-accent-blue">(Primary)</span>
            )}
          </div>
          {isBrowser && app.browserTabs && app.browserTabs.length > 0 && (
            <div className="border-t border-flow-border pt-2">
              <div className="text-xs text-flow-text-muted mb-1 font-medium">
                Browser Tabs ({app.browserTabs.length})
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-elegant">
                {app.browserTabs.slice(0, 3).map((tab, tabIndex) => (
                  <div
                    key={tabIndex}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                      tab.isActive
                        ? "bg-flow-accent-blue/20 text-flow-accent-blue"
                        : "text-flow-text-muted"
                    }`}
                  >
                    <Globe className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate flex-1">{tab.name}</span>
                    {tab.isActive && (
                      <div className="w-1.5 h-1.5 bg-flow-accent-blue rounded-full flex-shrink-0" />
                    )}
                  </div>
                ))}
                {app.browserTabs.length > 3 && (
                  <div className="text-xs text-flow-text-muted text-center py-1">
                    +{app.browserTabs.length - 3} more tabs
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (hoveredFileData) {
      const file = hoveredFileData;
      const monitorInfo = getMonitorInfo(file.targetMonitor || "monitor-1");
      return (
        <div className="flow-tooltip-inner-pop inline-block w-max max-w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-flow-border bg-flow-surface-elevated px-2.5 py-2 shadow-flow-shadow-lg">
          <div className="text-sm font-medium text-flow-text-primary mb-1 max-w-[14rem] truncate">
            {file.name}
          </div>
          <div className="text-xs text-flow-text-muted mb-1">
            Type: {file.type.toUpperCase()}
          </div>
          <div className="text-xs text-flow-text-muted mb-1">
            Opens with: {file.associatedApp}
          </div>
          <div className="text-xs text-flow-text-muted">
            Target: {monitorInfo.name}
            {monitorInfo.primary && (
              <span className="ml-1 text-flow-accent-blue">(Primary)</span>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const hoverTipEl = tooltipAnchor ? renderHoverPortal() : null;

  return (
    <>
    <div className={`w-full ${compact ? 'space-y-1' : 'space-y-1.5'}`}>
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Minimize2 className="w-4 h-4 text-flow-text-muted" />
            <h3 className="text-sm font-medium text-flow-text-primary">Minimized Apps</h3>
          </div>
          {totalItems > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-flow-text-muted">({totalItems})</span>
              {isEditMode && (
                <span className="text-xs text-flow-accent-blue bg-flow-accent-blue/10 px-2 py-0.5 rounded-full border border-flow-accent-blue/20">
                  Drag to move
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div 
        className={`relative rounded-lg border transition-all duration-200 ${
          totalItems > 0 
            ? `border-flow-border bg-flow-surface/30 ${compact ? 'p-2' : 'p-3'}` 
            : `border-dashed border-flow-border/50 bg-flow-surface/10 ${compact ? 'p-2.5' : 'p-4'}`
        } ${
          dragState?.isDragging && dragState.dragData?.type === 'app'
            ? 'ring-2 ring-flow-accent-blue/40 border-flow-accent-blue/60 bg-flow-accent-blue/5'
            : ''
        }`}
        data-drop-target="minimized"
        onClick={(e) => {
          if (!onClearAppSelection) return;
          if ((e.target as HTMLElement).closest("[data-minimized-tile]")) return;
          onClearAppSelection();
        }}
      >
        {totalItems > 0 ? (
          <div
            className={`flex flex-wrap content-start items-start ${compact ? 'gap-1.5' : 'gap-2'}`}
          >
            {/* Render Apps — fixed-width tiles so a single app never stretches to full row width */}
            {visibleApps.map((app, index) => {
              const monitorInfo = getMonitorInfo(app.targetMonitor || 'monitor-1');
              const isSelected = matchesMinimizedAppSelection(
                selectedApp,
                index,
                app,
              );
              
              return (
                <div
                  key={app.instanceId ? `min-${app.instanceId}` : `min-${index}-${app.name}`}
                  data-minimized-tile=""
                  className={`relative group shrink-0 ${compact ? 'w-[4.25rem]' : 'w-[5rem]'}`}
                  onMouseEnter={(e) => {
                    setHoveredApp(index);
                    const r = e.currentTarget.getBoundingClientRect();
                    setTooltipAnchor({
                      x: r.left + r.width / 2,
                      y: r.top,
                    });
                  }}
                  onMouseLeave={clearHover}
                >
                  {/* App Card */}
                  <div
                    className={`relative flex flex-col overflow-hidden rounded-lg border transition-all duration-200 ${
                      isSelected
                        ? "border-flow-accent-blue bg-flow-accent-blue/10 ring-1 ring-flow-accent-blue/30"
                        : "border-flow-border/50 bg-flow-surface/50 hover:bg-flow-surface hover:border-flow-border-accent"
                    }`}
                    style={{
                      cursor: isEditMode ? "grab" : "pointer",
                    }}
                    onMouseDown={(e) => handleMouseDown(e, app, index)}
                  >
                    {isEditMode ? (
                      <div className="pointer-events-auto flex min-h-[24px] w-full shrink-0 items-stretch border-b border-white/[0.06] bg-black/20 text-white/75 backdrop-blur-md">
                        <div className="flex min-h-[24px] w-full items-stretch">
                          {onMoveToMonitor ? (
                            <FlowTooltip label={`Place on ${monitorInfo.name}`}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleMaximize(e, index)}
                                className={`flex min-h-0 min-w-0 flex-1 items-center justify-center text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/90 ${
                                  onRemoveApp ? "border-r border-white/[0.06]" : ""
                                }`}
                                aria-label={`Place ${app.name} on ${monitorInfo.name}`}
                              >
                                <Square className="h-2.5 w-2.5" strokeWidth={2.5} />
                              </button>
                            </FlowTooltip>
                          ) : null}
                          {onRemoveApp ? (
                            <FlowTooltip label="Remove from minimized row">
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleDelete(e, index)}
                                className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-transparent text-red-500 transition-colors hover:bg-red-600 hover:text-white"
                                aria-label="Remove from minimized row"
                              >
                                <X className="h-3 w-3" strokeWidth={2.25} />
                              </button>
                            </FlowTooltip>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div
                      className={`flex flex-col items-center ${compact ? "gap-1 px-1.5 pb-1.5 pt-1" : "gap-1.5 p-2"}`}
                    >
                      {/* App Icon Container */}
                      <div
                        className={`relative ${compact ? "h-8 w-8" : "h-10 w-10"} flex items-center justify-center rounded-lg transition-all duration-200 group-hover:scale-105`}
                        style={{
                          backgroundColor: `${app.color}20`,
                          border: `1px solid ${app.color}40`,
                        }}
                      >
                        {renderIcon(app)}

                        {/* Content Indicator - matching monitor layout style */}
                        {(() => {
                          const assoc = app.associatedFiles || [];
                          const tabs = app.browserTabs || [];
                          const totalContent = assoc.length + tabs.length;

                          if (totalContent === 0) return null;

                          const hasFolder = assoc.some((f) => f.type === "folder");
                          const hasLink =
                            assoc.some((f) => f.type === "link" || f.type === "url") || tabs.length > 0;
                          const hasRegularFiles = assoc.some(
                            (f) => f.type !== "folder" && f.type !== "link" && f.type !== "url",
                          );

                          const contentTypes = [hasFolder, hasLink, hasRegularFiles].filter(Boolean).length;

                          let contentType: string;

                          if (contentTypes > 1) {
                            contentType = "content-mixed";
                          } else if (hasFolder) {
                            contentType = "content-folder";
                          } else if (hasLink) {
                            contentType = "content-link";
                          } else {
                            contentType = "content-file";
                          }

                          return (
                            <div className={`content-indicator ${contentType}`}>
                              <span className="count">{totalContent}</span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* App Name */}
                      <div className="w-full text-center">
                        <span
                          className={`${compact ? "text-[11px]" : "text-xs"} block truncate font-medium text-flow-text-primary`}
                        >
                          {app.name}
                        </span>
                        <span className="block truncate text-[10px] text-flow-text-muted">
                          {monitorInfo.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {hiddenAppsCount > 0 && (
              <div
                data-minimized-tile=""
                className={`relative flex shrink-0 flex-col items-center justify-center gap-1 p-1.5 rounded-lg border border-flow-border/60 bg-flow-surface/30 ${
                  compact ? 'w-[4.25rem]' : 'w-[5rem]'
                }`}
              >
                <div className="w-8 h-8 rounded-lg border border-flow-border/60 bg-flow-surface/50 flex items-center justify-center">
                  <MoreHorizontal className="w-4 h-4 text-flow-text-muted" />
                </div>
                <span className="text-[10px] text-flow-text-muted font-medium">+{hiddenAppsCount} more</span>
              </div>
            )}

            {/* Render Files */}
            {files.map((file, index) => {
              const monitorInfo = getMonitorInfo(file.targetMonitor || 'monitor-1');
              const fileColor = getFileTypeColor(file.type);
              const isSelected = selectedApp && 
                selectedApp.source === 'minimized' &&
                selectedApp.fileIndex === index &&
                selectedApp.type === 'file';
              
              return (
                <div
                  key={`file-${index}`}
                  data-minimized-tile=""
                  className={`relative group shrink-0 ${compact ? 'w-[4.25rem]' : 'w-[5rem]'}`}
                  onMouseEnter={(e) => {
                    setHoveredApp(`file-${index}`);
                    const r = e.currentTarget.getBoundingClientRect();
                    setTooltipAnchor({
                      x: r.left + r.width / 2,
                      y: r.top,
                    });
                  }}
                  onMouseLeave={clearHover}
                >
                  {/* File Card */}
                  <div
                    className={`relative flex flex-col overflow-hidden rounded-lg border transition-all duration-200 ${
                      isSelected
                        ? "border-flow-accent-blue bg-flow-accent-blue/10 ring-1 ring-flow-accent-blue/30"
                        : "border-flow-border/50 bg-flow-surface/50 hover:bg-flow-surface hover:border-flow-border-accent"
                    }`}
                    style={{
                      cursor: isEditMode ? "grab" : "pointer",
                    }}
                    onMouseDown={(e) => handleFileMouseDown(e, file, index)}
                  >
                    {isEditMode ? (
                      <div className="pointer-events-auto flex min-h-[24px] w-full shrink-0 items-stretch border-b border-white/[0.06] bg-black/20 text-white/75 backdrop-blur-md">
                        <div className="flex min-h-[24px] w-full items-stretch">
                          {onMoveFileToMonitor ? (
                            <FlowTooltip label={`Place on ${monitorInfo.name}`}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleFileMaximize(e, index)}
                                className={`flex min-h-0 min-w-0 flex-1 items-center justify-center text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/90 ${
                                  onRemoveFile ? "border-r border-white/[0.06]" : ""
                                }`}
                                aria-label={`Place ${file.name} on ${monitorInfo.name}`}
                              >
                                <Square className="h-2.5 w-2.5" strokeWidth={2.5} />
                              </button>
                            </FlowTooltip>
                          ) : null}
                          {onRemoveFile ? (
                            <FlowTooltip label="Remove from minimized row">
                              <button
                                type="button"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => handleFileDelete(e, index)}
                                className="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-transparent text-red-500 transition-colors hover:bg-red-600 hover:text-white"
                                aria-label="Remove from minimized row"
                              >
                                <X className="h-3 w-3" strokeWidth={2.25} />
                              </button>
                            </FlowTooltip>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div
                      className={`flex flex-col items-center ${compact ? "gap-1 px-1.5 pb-1.5 pt-1" : "gap-1.5 p-2"}`}
                    >
                      <div
                        className={`relative flex items-center justify-center rounded-lg transition-all duration-200 group-hover:scale-105 ${compact ? "h-8 w-8" : "h-10 w-10"}`}
                        style={{
                          backgroundColor: `${fileColor}20`,
                          border: `1px solid ${fileColor}40`,
                        }}
                      >
                        <FileIcon type={file.type} className={compact ? "h-4 w-4" : "h-5 w-5"} />
                      </div>

                      <div className="w-full text-center">
                        <span
                          className={`${compact ? "text-[11px]" : "text-xs"} block truncate font-medium text-flow-text-primary`}
                        >
                          {file.name}
                        </span>
                        <span className="block truncate text-[10px] text-flow-text-muted">
                          {monitorInfo.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-2.5' : 'py-5'}`}>
            <div className={`${compact ? 'w-9 h-9 mb-2' : 'w-12 h-12 mb-3'} rounded-lg bg-flow-surface/50 border border-flow-border/50 flex items-center justify-center`}>
              <Package className={`${compact ? 'w-4 h-4' : 'w-6 h-6'} text-flow-text-muted`} />
            </div>
            <div className={`${compact ? 'text-xs mb-1' : 'text-sm mb-2'} text-flow-text-muted`}>No minimized items</div>
            <div className={`text-xs text-flow-text-muted/70 ${compact ? 'max-w-40' : 'max-w-48'}`}>
              {isEditMode 
                ? "Drag apps or files here to minimize them"
                : "Apps moved to background will appear here"
              }
            </div>
          </div>
        )}
      </div>
    </div>
    {tooltipAnchor && hoverTipEl && createPortal(
      <div
        className="pointer-events-none fixed z-[9999] w-max"
        style={{
          left: tooltipAnchor.x,
          top: tooltipAnchor.y,
          transform: 'translate(-50%, calc(-100% - 8px))',
        }}
      >
        <div className="pointer-events-auto">{hoverTipEl}</div>
      </div>,
      document.body,
    )}
  </>
  );
}