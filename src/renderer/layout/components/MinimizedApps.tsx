import { useState, useRef, useEffect } from "react";
import { Minimize2, Settings, Trash2, Monitor, ArrowRight, Globe, ExternalLink, Maximize2, File, Package, FolderClosed, MoreHorizontal } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { FileIcon, getFileTypeColor } from "./FileIcon";

interface MinimizedApp {
  name: string;
  icon: LucideIcon;
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
  onAppSettings?: (app: MinimizedApp) => void;
  onAppSelect?: (appData: any, source: 'monitor' | 'minimized', monitorId?: string, appIndex?: number) => void;
  onFileSelect?: (fileData: any, source: 'monitor' | 'minimized', monitorId?: string, fileIndex?: number) => void;
  onMoveToMonitor?: (appIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }, newSize?: { width: number; height: number }) => void;
  onMoveFileToMonitor?: (fileIndex: number, targetMonitorId: string, newPosition?: { x: number; y: number }) => void;
  onRemoveApp?: (appIndex: number) => void;
  onRemoveFile?: (fileIndex: number) => void;
  onCustomDragStart: (data: any, sourceType: 'sidebar' | 'monitor' | 'minimized', sourceId: string, startPos: { x: number; y: number }, preview?: React.ReactNode) => void;
  isEditMode?: boolean;
}

export function MinimizedApps({ 
  apps, 
  files = [],
  monitors = [], 
  browserTabs = [],
  selectedApp,
  onAppSettings, 
  onAppSelect,
  onFileSelect,
  onMoveToMonitor,
  onMoveFileToMonitor,
  onRemoveApp,
  onRemoveFile,
  onCustomDragStart,
  isEditMode = false
}: MinimizedAppsProps) {
  const [hoveredApp, setHoveredApp] = useState<number | string | null>(null);
  
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
    
    console.log('🖱️ MOUSE DOWN (MINIMIZED APP):', app.name, 'isEditMode:', isEditMode);
    
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
          console.log('⏰ DRAG TIMER EXPIRED (MINIMIZED APP) - Initiating drag');
          initiateDrag(e.clientX, e.clientY);
        }
      }, 500);
    }
    
    // Add global mouse event listeners for tracking
    document.addEventListener('mousemove', handleMouseMoveForClickDetection);
    document.addEventListener('mouseup', handleMouseUpForClickDetection);
    document.body.style.userSelect = 'none';
  };

  // Handle delete with confirmation
  const handleDelete = (e: React.MouseEvent, appIndex: number, appName: string) => {
    e.stopPropagation();
    
    if (window.confirm(`Are you sure you want to remove "${appName}" from minimized apps?`)) {
      if (onRemoveApp) {
        onRemoveApp(appIndex);
      }
    }
  };

  // Handle maximize - restore app to its remembered monitor
  const handleMaximize = (e: React.MouseEvent, appIndex: number) => {
    e.stopPropagation();
    console.log('📱 MAXIMIZING APP:', { appIndex, app: apps[appIndex] });
    
    if (onMoveToMonitor) {
      onMoveToMonitor(appIndex, apps[appIndex].targetMonitor || 'monitor-1');
    }
  };

  // ENHANCED MOUSE SYSTEM - Click vs drag detection for minimized files
  const handleFileMouseDown = (e: React.MouseEvent, file: any, index: number) => {
    e.preventDefault();
    
    console.log('🖱️ MOUSE DOWN (MINIMIZED FILE):', file.name, 'isEditMode:', isEditMode);
    
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
          console.log('⏰ DRAG TIMER EXPIRED (MINIMIZED FILE) - Initiating drag');
          initiateDrag(e.clientX, e.clientY);
        }
      }, 500);
    }
    
    // Add global mouse event listeners for tracking
    document.addEventListener('mousemove', handleMouseMoveForClickDetection);
    document.addEventListener('mouseup', handleMouseUpForClickDetection);
    document.body.style.userSelect = 'none';
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
    document.body.style.userSelect = '';
  };

  const initiateDrag = (clientX: number, clientY: number) => {
    if (mouseStateRef.current.dragInitiated || !mouseStateRef.current.itemData) return;
    
    console.log('🚀 INITIATING DRAG MODE (MINIMIZED)');
    mouseStateRef.current.dragInitiated = true;
    
    if (mouseStateRef.current.itemType === 'app') {
      const app = mouseStateRef.current.itemData;
      const dragData = {
        source: 'minimized',
        appIndex: mouseStateRef.current.itemIndex,
        app: {
          name: app.name,
          icon: app.icon,
          color: app.color,
          volume: app.volume,
          targetMonitor: app.targetMonitor
        }
      };
      
      const preview = (
        <div className="flex items-center gap-2">
          <app.icon className="w-4 h-4" style={{ color: app.color }} />
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

  // Handle file delete with confirmation
  const handleFileDelete = (e: React.MouseEvent, fileIndex: number, fileName: string) => {
    e.stopPropagation();
    
    if (window.confirm(`Are you sure you want to remove "${fileName}" from minimized files?`)) {
      if (onRemoveFile) {
        onRemoveFile(fileIndex);
      }
    }
  };

  // Handle file maximize - restore file to its remembered monitor
  const handleFileMaximize = (e: React.MouseEvent, fileIndex: number) => {
    e.stopPropagation();
    console.log('📁 MAXIMIZING FILE:', { fileIndex, file: files[fileIndex] });
    
    if (onMoveFileToMonitor) {
      onMoveFileToMonitor(fileIndex, files[fileIndex].targetMonitor || 'monitor-1');
    }
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

  return (
    <div className="w-full space-y-3">
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
            ? 'border-flow-border bg-flow-surface/30 p-4' 
            : 'border-dashed border-flow-border/50 bg-flow-surface/10 p-6'
        }`}
        data-drop-target="minimized"
      >
        {totalItems > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-4">
            {/* Render Apps */}
            {apps.map((app, index) => {
              const monitorInfo = getMonitorInfo(app.targetMonitor || 'monitor-1');
              const isBrowser = app.name.toLowerCase().includes('chrome') || app.name.toLowerCase().includes('browser');
              const isSelected = selectedApp && 
                selectedApp.source === 'minimized' &&
                selectedApp.appIndex === index &&
                (selectedApp.type === 'app' || selectedApp.type === 'browser');
              
              return (
                <div
                  key={`app-${index}`}
                  className="relative group"
                  onMouseEnter={() => setHoveredApp(index)}
                  onMouseLeave={() => setHoveredApp(null)}
                >
                  {/* App Card */}
                  <div 
                    className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-200 ${
                      isSelected
                        ? 'border-flow-accent-blue bg-flow-accent-blue/10 ring-1 ring-flow-accent-blue/30'
                        : 'border-flow-border/50 bg-flow-surface/50 hover:bg-flow-surface hover:border-flow-border-accent'
                    }`}
                    style={{ 
                      cursor: isEditMode ? 'grab' : 'pointer',
                    }}
                    onMouseDown={(e) => handleMouseDown(e, app, index)}
                    title={isEditMode ? "Drag to move to monitor" : "Click to view details"}
                  >
                    {/* App Icon Container */}
                    <div 
                      className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
                        isSelected ? 'scale-105' : 'group-hover:scale-105'
                      }`}
                      style={{ 
                        backgroundColor: `${app.color}20`,
                        border: `1px solid ${app.color}40`
                      }}
                    >
                      {renderIcon(app)}
                      
                      {/* Content Indicator - matching monitor layout style */}
                      {(() => {
                        // Get associated files and browser tabs
                        const files = app.associatedFiles || [];
                        const tabs = app.browserTabs || [];
                        const totalContent = files.length + tabs.length;
                        
                        if (totalContent === 0) return null;
                        
                        // Analyze content types to determine the appropriate color
                        const hasFolder = files.some(f => f.type === 'folder');
                        const hasLink = files.some(f => f.type === 'link' || f.type === 'url') || tabs.length > 0;
                        const hasRegularFiles = files.some(f => f.type !== 'folder' && f.type !== 'link' && f.type !== 'url');
                        
                        // Count different content types
                        const contentTypes = [hasFolder, hasLink, hasRegularFiles].filter(Boolean).length;
                        
                        let contentType: string;
                        
                        if (contentTypes > 1) {
                          // Multiple content types = red
                          contentType = 'content-mixed';
                        } else if (hasFolder) {
                          // Only folders = yellow
                          contentType = 'content-folder';
                        } else if (hasLink) {
                          // Only links/browser tabs = blue
                          contentType = 'content-link';
                        } else {
                          // Only regular files = green
                          contentType = 'content-file';
                        }
                        
                        return (
                          <div className={`content-indicator ${contentType}`}>
                            <span className="count">{totalContent}</span>
                          </div>
                        );
                      })()}
                      
                      {/* Selection Ring */}
                      {isSelected && (
                        <div className="absolute -inset-1 border-2 border-flow-accent-blue rounded-lg animate-pulse" />
                      )}
                    </div>

                    {/* App Name */}
                    <div className="text-center w-full">
                      <span className="text-xs text-flow-text-primary font-medium truncate block" title={app.name}>
                        {app.name}
                      </span>
                      <span className="text-xs text-flow-text-muted truncate block" title={monitorInfo.name}>
                        {monitorInfo.name}
                      </span>
                    </div>

                    {/* Action Buttons */}
                    {hoveredApp === index && isEditMode && (
                      <div className="absolute -top-2 -right-2 flex gap-1">
                        {onMoveToMonitor && (
                          <button
                            onClick={(e) => handleMaximize(e, index)}
                            className="w-6 h-6 bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-flow-text-primary rounded-full flex items-center justify-center transition-all duration-200 shadow-md"
                            title={`Restore to ${monitorInfo.name}`}
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        )}
                        {onRemoveApp && (
                          <button
                            onClick={(e) => handleDelete(e, index, app.name)}
                            className="w-6 h-6 bg-flow-accent-red hover:bg-red-600 text-flow-text-primary rounded-full flex items-center justify-center transition-all duration-200 shadow-md"
                            title="Remove from minimized"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Enhanced Tooltip */}
                  {hoveredApp === index && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
                      <div className="bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg p-3 min-w-48">
                        <div className="text-sm font-medium text-flow-text-primary mb-1">{app.name}</div>
                        <div className="text-xs text-flow-text-muted mb-2">
                          Target: {monitorInfo.name}
                          {monitorInfo.primary && (
                            <span className="ml-1 text-flow-accent-blue">(Primary)</span>
                          )}
                        </div>
                        
                        {/* Browser Tabs */}
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
                                      ? 'bg-flow-accent-blue/20 text-flow-accent-blue' 
                                      : 'text-flow-text-muted'
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
                    </div>
                  )}
                </div>
              );
            })}

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
                  className="relative group"
                  onMouseEnter={() => setHoveredApp(`file-${index}`)}
                  onMouseLeave={() => setHoveredApp(null)}
                >
                  {/* File Card */}
                  <div 
                    className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border transition-all duration-200 ${
                      isSelected
                        ? 'border-flow-accent-blue bg-flow-accent-blue/10 ring-1 ring-flow-accent-blue/30'
                        : 'border-flow-border/50 bg-flow-surface/50 hover:bg-flow-surface hover:border-flow-border-accent'
                    }`}
                    style={{ 
                      cursor: isEditMode ? 'grab' : 'pointer',
                    }}
                    onMouseDown={(e) => handleFileMouseDown(e, file, index)}
                    title={isEditMode ? "Drag to move to monitor" : "Click to view details"}
                  >
                    {/* File Icon Container */}
                    <div 
                      className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${
                        isSelected ? 'scale-105' : 'group-hover:scale-105'
                      }`}
                      style={{ 
                        backgroundColor: `${fileColor}20`,
                        border: `1px solid ${fileColor}40`
                      }}
                    >
                      <FileIcon type={file.type} className="w-5 h-5" />
                      
                      {/* Selection Ring */}
                      {isSelected && (
                        <div className="absolute -inset-1 border-2 border-flow-accent-blue rounded-lg animate-pulse" />
                      )}
                    </div>

                    {/* File Name */}
                    <div className="text-center w-full">
                      <span className="text-xs text-flow-text-primary font-medium truncate block" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-xs text-flow-text-muted truncate block" title={monitorInfo.name}>
                        {monitorInfo.name}
                      </span>
                    </div>

                    {/* Action Buttons */}
                    {hoveredApp === `file-${index}` && isEditMode && (
                      <div className="absolute -top-2 -right-2 flex gap-1">
                        {onMoveFileToMonitor && (
                          <button
                            onClick={(e) => handleFileMaximize(e, index)}
                            className="w-6 h-6 bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-flow-text-primary rounded-full flex items-center justify-center transition-all duration-200 shadow-md"
                            title={`Open on ${monitorInfo.name}`}
                          >
                            <Maximize2 className="w-3 h-3" />
                          </button>
                        )}
                        {onRemoveFile && (
                          <button
                            onClick={(e) => handleFileDelete(e, index, file.name)}
                            className="w-6 h-6 bg-flow-accent-red hover:bg-red-600 text-flow-text-primary rounded-full flex items-center justify-center transition-all duration-200 shadow-md"
                            title="Remove from minimized"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* File Tooltip */}
                  {hoveredApp === `file-${index}` && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50">
                      <div className="bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg p-3 min-w-48">
                        <div className="text-sm font-medium text-flow-text-primary mb-1">{file.name}</div>
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center text-center py-8">
            <div className="w-12 h-12 rounded-lg bg-flow-surface/50 border border-flow-border/50 flex items-center justify-center mb-3">
              <Package className="w-6 h-6 text-flow-text-muted" />
            </div>
            <div className="text-sm text-flow-text-muted mb-2">No minimized items</div>
            <div className="text-xs text-flow-text-muted/70 max-w-48">
              {isEditMode 
                ? "Drag apps or files here to minimize them"
                : "Apps moved to background will appear here"
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
}