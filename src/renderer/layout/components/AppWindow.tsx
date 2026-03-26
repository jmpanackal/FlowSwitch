
import { useState, useRef } from "react";
import { Settings, Trash2, Move, Shield, Minimize2, File, Folder, Link } from "lucide-react";
import { LucideIcon } from "lucide-react";

// Type guards for app types
function isDiscoveredApp(app: any): app is { iconPath: string | null } {
  return 'iconPath' in app;
}
function isFallbackApp(app: any): app is { icon: LucideIcon } {
  return 'icon' in app && typeof app.icon === 'function';
}

interface AppWindowProps {
  app: {
    name: string;
    iconPath?: string | null;
    icon?: LucideIcon;
    color: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    volume?: number;
    runAsAdmin?: boolean;
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
  };
  appIndex: number;
  monitorId: string;
  browserTabs?: {
    name: string;
    url: string;
    browser: string;
    monitorId: string;
    appInstanceId?: string;
    isActive?: boolean;
  }[];
  onDragStart: () => void;
  onDrag: (position: { x: number; y: number }) => void;
  onDragEnd: () => void;
  onCustomDragStart?: (startPos: { x: number; y: number }) => void;
  onSettings: () => void;
  onDelete: () => void;
  onResize: (newSize: { width: number; height: number }) => void;
  onMove: (newPosition: { x: number; y: number }) => void;
  isDragging?: boolean;
  showSettings?: boolean;
  isEditable?: boolean;
  isSnappedToZone?: boolean;
  isConflicting?: boolean;
  willBeDisplaced?: boolean;
  onMoveToMinimized?: () => void;
}

export function AppWindow({
  app,
  appIndex,
  monitorId,
  browserTabs = [],
  onDragStart,
  onDrag,
  onDragEnd,
  onCustomDragStart,
  onSettings,
  onDelete,
  onResize,
  onMove,
  isDragging = false,
  showSettings = false,
  isEditable = false,
  isSnappedToZone = false,
  isConflicting = false,
  willBeDisplaced = false,
  onMoveToMinimized
}: AppWindowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [contentIndicatorHovered, setContentIndicatorHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [localDragging, setLocalDragging] = useState(false);
  
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startPosition: { x: 0, y: 0 },
    monitorElement: null as HTMLElement | null
  });

  // Render the app icon: prefer real iconPath, fallback to LucideIcon, then emoji
  const renderIcon = () => {
    if (isDiscoveredApp(app) && app.iconPath) {
      return (
        <img
          src={app.iconPath}
          alt={app.name}
          className="app-icon w-8 h-8 object-contain rounded"
          draggable={false}
          onError={e => {
            // Hide broken image and show fallback below
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      );
    }
    if (isFallbackApp(app)) {
      const IconComponent = app.icon;
      return <IconComponent className="app-icon text-white w-8 h-8" />;
    }
    // Fallback: emoji
    return (
      <div className="app-icon-fallback bg-white/20 rounded w-8 h-8 flex items-center justify-center">
        <span className="text-white text-sm">📱</span>
      </div>
    );
  };

  // FIXED: Content indicator with browser tabs and files combined
  const renderContentIndicator = () => {
    // Check if this is a browser app
    const isBrowser = app.name?.toLowerCase().includes('chrome') || 
                     app.name?.toLowerCase().includes('browser') ||
                     app.name?.toLowerCase().includes('firefox') ||
                     app.name?.toLowerCase().includes('safari') ||
                     app.name?.toLowerCase().includes('edge');
    
    // Get associated files
    const files = app.associatedFiles || [];
    
    // Get browser tabs for this specific app instance
    const relatedTabs = isBrowser && app.instanceId ? 
      browserTabs.filter(tab => 
        tab.monitorId === monitorId && 
        tab.browser === app.name &&
        tab.appInstanceId === app.instanceId
      ) : [];
    
    // Calculate total content count
    const totalContent = files.length + relatedTabs.length;
    
    if (totalContent === 0) return null;
    
    // Analyze content types to determine the appropriate color
    const hasFolder = files.some(f => f.type === 'folder');
    const hasLink = files.some(f => f.type === 'link' || f.type === 'url') || relatedTabs.length > 0;
    const hasRegularFiles = files.some(f => f.type !== 'folder' && f.type !== 'link' && f.type !== 'url');
    
    // Determine content type and color based on content analysis
    let contentType: string;
    let tooltipContent: string[];
    let contentLabel: string;
    
    // Count different content types
    const contentTypes = [hasFolder, hasLink, hasRegularFiles].filter(Boolean).length;
    
    if (contentTypes > 1) {
      // Multiple content types = red
      contentType = 'content-mixed';
      contentLabel = 'mixed content';
      tooltipContent = [
        ...relatedTabs.slice(0, 2).map(t => t.name),
        ...files.slice(0, 2).map(f => f.name)
      ];
      if (totalContent > 4) tooltipContent.push(`+${totalContent - 4} more`);
    } else if (hasFolder) {
      // Only folders = yellow
      contentType = 'content-folder';
      contentLabel = 'folders';
      tooltipContent = files.slice(0, 3).map(f => f.name);
      if (files.length > 3) tooltipContent.push(`+${files.length - 3} more`);
    } else if (hasLink) {
      // Only links/browser tabs = blue
      contentType = 'content-link';
      contentLabel = relatedTabs.length > 0 ? 'browser tabs' : 'links';
      tooltipContent = [
        ...relatedTabs.slice(0, 3).map(t => t.name),
        ...files.filter(f => f.type === 'link' || f.type === 'url').slice(0, 3).map(f => f.name)
      ];
      if (totalContent > 3) tooltipContent.push(`+${totalContent - 3} more`);
    } else {
      // Only regular files = green
      contentType = 'content-file';
      contentLabel = 'files';
      tooltipContent = files.slice(0, 3).map(f => f.name);
      if (files.length > 3) tooltipContent.push(`+${files.length - 3} more`);
    }
    
    return (
      <div className="relative">
        <div 
          className={`content-indicator ${contentType}`}
          onMouseEnter={() => setContentIndicatorHovered(true)}
          onMouseLeave={() => setContentIndicatorHovered(false)}
        >
          <span className="count">{totalContent}</span>
        </div>
        
        {/* ENHANCED: Concise tooltip that appears close to the indicator */}
        {contentIndicatorHovered && (
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-50 pointer-events-none">
            <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg border border-gray-700 min-w-max max-w-48">
              <div className="font-medium mb-1">
                {totalContent} {contentLabel}
                {relatedTabs.length > 0 && files.length > 0 && (
                  <div className="text-gray-400 text-xs">
                    {relatedTabs.length} tabs • {files.length} files
                  </div>
                )}
              </div>
              <div className="space-y-0.5">
                {tooltipContent.map((item, index) => (
                  <div key={index} className="text-gray-300 truncate">
                    {item}
                  </div>
                ))}
              </div>
              {/* Arrow pointing up to the indicator */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2">
                <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-900"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // HTML5 DRAG AND DROP SYSTEM (for minimized apps)
  const handleDragStartEvent = (e: React.DragEvent) => {
    if (!isEditable) {
      e.preventDefault();
      return;
    }
    
    const dragData = {
      source: 'monitor',
      monitorId: monitorId,
      appIndex: appIndex,
      app: {
        name: app.name,
        icon: app.icon,
        color: app.color,
        volume: app.volume,
        runAsAdmin: app.runAsAdmin,
        position: app.position,
        size: app.size,
        launchBehavior: 'new' as const,
        forceCloseOnExit: false,
        smartSave: false
      }
    };
    
    console.log('📦 APP WINDOW DRAG START:', dragData);
    
    // Set dataTransfer data
    try {
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));
      e.dataTransfer.effectAllowed = 'move';
    } catch (error) {
      console.log('Could not set drag data:', error);
    }
    
    // CRITICAL: Dispatch global event and set global fallback
    const globalDragEvent = new CustomEvent('flowswitch:dragstart', {
      detail: dragData,
      bubbles: true
    });
    
    document.dispatchEvent(globalDragEvent);
    (window as any).flowswitchDragData = dragData;
  };

  const handleDragEndEvent = (e: React.DragEvent) => {
    console.log('📦 APP WINDOW DRAG END');
    
    // CRITICAL: Dispatch global end event and clear fallback
    const globalDragEndEvent = new CustomEvent('flowswitch:dragend', {
      bubbles: true
    });
    
    document.dispatchEvent(globalDragEndEvent);
    delete (window as any).flowswitchDragData;
  };

  // ENHANCED MOUSE DRAG SYSTEM with custom drag support
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditable || isResizing) return;
    
    // CRITICAL FIX: Check if the click is on a button or button-related element
    const target = e.target as HTMLElement;
    
    // Check if clicked element is a button or inside a button
    if (target.closest('button') || 
        target.tagName === 'BUTTON' || 
        target.closest('.pointer-events-auto')) {
      console.log('🔘 BUTTON CLICK DETECTED - Skipping drag initiation');
      return; // Don't start drag when clicking on buttons
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🖱️ MOUSE DOWN - Starting drag from:', target.tagName, target.className);
    
    // CUSTOM DRAG: Trigger custom drag start if available
    if (onCustomDragStart) {
      onCustomDragStart({ x: e.clientX, y: e.clientY });
    }
    
    // Find monitor container
    const monitorContainer = (e.target as HTMLElement).closest('.monitor-container');
    if (!monitorContainer) return;
    
    // Store initial state
    dragStateRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startPosition: { ...app.position },
      monitorElement: monitorContainer as HTMLElement
    };
    
    setLocalDragging(true);
    onDragStart(); // Notify parent
    
    // Add global listeners
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    // Prevent text selection
    document.body.style.userSelect = 'none';
  };

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (!dragStateRef.current.isDragging || !dragStateRef.current.monitorElement) {
      return;
    }
    
    const deltaX = e.clientX - dragStateRef.current.startX;
    const deltaY = e.clientY - dragStateRef.current.startY;
    
    const monitorRect = dragStateRef.current.monitorElement.getBoundingClientRect();
    
    // Convert pixel delta to percentage
    const percentDeltaX = (deltaX / monitorRect.width) * 100;
    const percentDeltaY = (deltaY / monitorRect.height) * 100;
    
    // Calculate new position
    const newX = Math.max(
      app.size.width / 2,
      Math.min(
        100 - app.size.width / 2,
        dragStateRef.current.startPosition.x + percentDeltaX
      )
    );
    
    const newY = Math.max(
      app.size.height / 2,
      Math.min(
        100 - app.size.height / 2,
        dragStateRef.current.startPosition.y + percentDeltaY
      )
    );
    
    const newPosition = { x: newX, y: newY };
    
    // Notify parent of new position
    onDrag(newPosition);
  };

  const handleGlobalMouseUp = (e: MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;
    
    // Clean up
    dragStateRef.current.isDragging = false;
    setLocalDragging(false);
    
    document.removeEventListener('mousemove', handleGlobalMouseMove);
    document.removeEventListener('mouseup', handleGlobalMouseUp);
    document.body.style.userSelect = '';
    
    // Notify parent drag ended
    onDragEnd();
  };

  // Resize handling
  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    if (!isEditable) return;
    
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startSize = { ...app.size };
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const parentRect = (e.target as HTMLElement).closest('.monitor-container')?.getBoundingClientRect();
      if (!parentRect) return;
      
      const percentX = (deltaX / parentRect.width) * 100;
      const percentY = (deltaY / parentRect.height) * 100;
      
      let newSize = { ...startSize };
      
      if (direction.includes('right')) {
        newSize.width = Math.max(15, Math.min(90, startSize.width + percentX));
      }
      if (direction.includes('bottom')) {
        newSize.height = Math.max(15, Math.min(90, startSize.height + percentY));
      }
      
      onResize(newSize);
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsResizing(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Button click handlers with enhanced debugging
  const handleSettingsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('⚙️ SETTINGS BUTTON CLICKED for:', app.name);
    onSettings();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🗑️ DELETE BUTTON CLICKED for:', app.name);
    onDelete();
  };

  const handleMinimizeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('📦 MINIMIZE BUTTON CLICKED for:', app.name);
    if (onMoveToMinimized) {
      onMoveToMinimized();
    }
  };

  const isCurrentlyDragging = isDragging || localDragging;

  // Visual styling based on state
  const getVisualState = () => {
    if (isCurrentlyDragging) {
      if (isSnappedToZone) {
        return 'snapping'; // Green - snap zone active
      }
      return 'dragging'; // Blue - normal dragging
    }
    return 'normal'; // Default state
  };

  const visualState = getVisualState();

  const getStyling = () => {
    switch (visualState) {
      case 'snapping':
        return {
          border: 'border-green-400',
          background: 'bg-green-400/20',
          shadow: 'shadow-lg shadow-green-400/50'
        };
      case 'dragging':
        return {
          border: 'border-blue-400',
          background: 'bg-blue-400/10',
          shadow: 'shadow-lg shadow-blue-400/50'
        };
      default:
        return {
          border: isEditable ? 'border-white/30 hover:border-white/60' : 'border-white/20',
          background: `${app.color}20`,
          shadow: ''
        };
    }
  };

  const styling = getStyling();

  return (
    <div 
      className={`app-window absolute transition-all duration-200 ${
        isCurrentlyDragging ? 'opacity-90 scale-105 z-50' : 'z-10'
      } ${styling.shadow}`}
      style={{
        left: `${app.position.x - app.size.width/2}%`,
        top: `${app.position.y - app.size.height/2}%`,
        width: `${app.size.width}%`,
        height: `${app.size.height}%`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable={isEditable}
      onDragStart={handleDragStartEvent}
      onDragEnd={handleDragEndEvent}
      // CRITICAL: Add data attributes for global drag detection
      data-app-window="true"
      data-monitor-id={monitorId}
      data-app-index={appIndex}
    >
      <div 
        className={`relative w-full h-full rounded-lg border-2 transition-all duration-200 select-none ${
          isEditable ? 'cursor-move' : ''
        } ${styling.border}`}
        style={{ 
          backgroundColor: styling.background,
          backdropFilter: 'blur(8px)'
        }}
        onMouseDown={handleMouseDown}
      >
        {/* FIXED: App Content with simple, working centering */}
        <div className="app-window-content">
          {/* App icon with content indicator */}
          <div className="app-icon-container">
            <div className="relative inline-block">
              {renderIcon()}
              {renderContentIndicator()}
            </div>
          </div>
          
          {/* App name and admin indicator */}
          <div className="app-text-container">
            <span className="app-text text-white text-xs font-medium text-center truncate">
              {app.name}
            </span>
            {app.runAsAdmin && (
              <Shield className="w-3 h-3 text-yellow-400 mt-1" title="Run as Admin" />
            )}
          </div>
        </div>
        
        {/* Drag indicator */}
        {isEditable && !isCurrentlyDragging && (
          <div className="absolute top-1 left-1 text-white/60 hover:text-white/80 pointer-events-none">
            <Move className="w-3 h-3" />
          </div>
        )}

        {/* Drag state indicator */}
        {isCurrentlyDragging && (
          <div className="absolute -inset-1 border-2 rounded-lg animate-pulse">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`text-xs font-bold px-3 py-1 rounded-full shadow-lg border backdrop-blur-sm ${
                visualState === 'snapping'
                  ? 'text-green-200 bg-green-900/90 border-green-300/50'
                  : 'text-blue-200 bg-blue-900/90 border-blue-300/50'
              }`}>
                {visualState === 'snapping' && '🪟 SNAP ZONE!'}
                {visualState === 'dragging' && '🎯 DRAGGING'}
              </div>
            </div>
            
            {/* Corner indicators */}
            <div className={`absolute -top-2 -left-2 w-4 h-4 rounded-full animate-ping ${
              visualState === 'snapping' ? 'bg-green-400' : 'bg-blue-400'
            }`} />
            <div className={`absolute -top-2 -right-2 w-4 h-4 rounded-full animate-ping ${
              visualState === 'snapping' ? 'bg-green-400' : 'bg-blue-400'
            }`} />
            <div className={`absolute -bottom-2 -left-2 w-4 h-4 rounded-full animate-ping ${
              visualState === 'snapping' ? 'bg-green-400' : 'bg-blue-400'
            }`} />
            <div className={`absolute -bottom-2 -right-2 w-4 h-4 rounded-full animate-ping ${
              visualState === 'snapping' ? 'bg-green-400' : 'bg-blue-400'
            }`} />
          </div>
        )}
        
        {/* Settings and Actions - ENHANCED WITH BETTER CLICK HANDLING */}
        {(isHovered || showSettings) && isEditable && !isCurrentlyDragging && (
          <div className="absolute -top-2 -right-2 flex gap-1 pointer-events-auto z-[60]">
            <button
              onMouseDown={(e) => {
                // Prevent mouseDown from propagating to prevent drag
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleMinimizeClick}
              className="w-6 h-6 bg-flow-accent-purple/90 hover:bg-flow-accent-purple rounded-full flex items-center justify-center transition-colors shadow-lg hover:scale-110 cursor-pointer"
              title="Minimize App"
              type="button"
            >
              <Minimize2 className="w-3 h-3 text-white pointer-events-none" />
            </button>
            <button
              onMouseDown={(e) => {
                // Prevent mouseDown from propagating to prevent drag
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleSettingsClick}
              className="w-6 h-6 bg-white/90 hover:bg-white rounded-full flex items-center justify-center transition-colors shadow-lg hover:scale-110 cursor-pointer"
              title="App Settings"
              type="button"
            >
              <Settings className="w-3 h-3 text-gray-700 pointer-events-none" />
            </button>
            <button
              onMouseDown={(e) => {
                // Prevent mouseDown from propagating to prevent drag
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={handleDeleteClick}
              className="w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors shadow-lg hover:scale-110 cursor-pointer"
              title="Delete App"
              type="button"
            >
              <Trash2 className="w-3 h-3 text-white pointer-events-none" />
            </button>
          </div>
        )}
        
        {/* Resize Handle */}
        {isEditable && !isCurrentlyDragging && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 bg-white/60 hover:bg-white/80 cursor-se-resize rounded-tl-lg transition-colors pointer-events-auto"
            onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
          />
        )}
      </div>
    </div>
  );
}