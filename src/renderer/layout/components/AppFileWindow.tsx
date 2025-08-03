import React, { useState, useRef, useEffect } from "react";
import { Settings, Trash2, Move, Shield, Minimize2, Maximize2, File, Folder, FolderOpen, ChevronDown, ChevronRight, Globe, MessageCircle, Code, Music, Calendar, Mail, Terminal, Camera, BarChart3, Play, FileText, Link } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { FileIcon, getFileTypeColor } from "./FileIcon";
import { AppSettings } from "./AppSettings";

interface BaseItem {
  name: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  monitorId?: string;
}

interface AppItem extends BaseItem {
  type: 'app';
  icon: LucideIcon;
  color: string;
  volume?: number;
  launchBehavior?: 'new' | 'focus' | 'minimize';
  runAsAdmin?: boolean;
  forceCloseOnExit?: boolean;
  smartSave?: boolean;
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

interface FileItem extends BaseItem {
  type: 'file';
  path: string;
  fileType: string;
  associatedApp: string;
  useDefaultApp?: boolean;
  isFolder?: boolean;
  files?: any[];
  launchDelay?: number;
  windowSize?: string;
  customDimensions?: { width: number; height: number };
}

interface AppFileWindowProps {
  item: AppItem | FileItem;
  itemIndex: number;
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
  isSelected?: boolean;
  isSnappedToZone?: boolean;
  isConflicting?: boolean;
  willBeDisplaced?: boolean;
  onMoveToMinimized?: () => void;
  onAssociateFileWithApp?: (fileData: any) => void;
  onUpdateAssociatedFiles?: (files: any[]) => void;
  onAppSelect?: () => void;
  onFileSelect?: () => void;
}

// App icon mapping - maps app names to their icons and colors
const APP_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
  // Code & Development
  'VS Code': { icon: Code, color: '#007ACC' },
  'Visual Studio Code': { icon: Code, color: '#007ACC' },
  'Sublime Text': { icon: Code, color: '#FF9800' },
  'Atom': { icon: Code, color: '#66595C' },
  'Notepad++': { icon: Code, color: '#90E59A' },
  
  // Terminal & Command Line
  'Terminal': { icon: Terminal, color: '#000000' },
  'Command Prompt': { icon: Terminal, color: '#000000' },
  'PowerShell': { icon: Terminal, color: '#012456' },
  'iTerm': { icon: Terminal, color: '#000000' },
  
  // Browsers
  'Chrome': { icon: Globe, color: '#4285F4' },
  'Firefox': { icon: Globe, color: '#FF7139' },
  'Safari': { icon: Globe, color: '#006CFF' },
  'Edge': { icon: Globe, color: '#0078D4' },
  'Internet Explorer': { icon: Globe, color: '#0078D4' },
  
  // Communication
  'Slack': { icon: MessageCircle, color: '#4A154B' },
  'Discord': { icon: MessageCircle, color: '#5865F2' },
  'Teams': { icon: MessageCircle, color: '#6264A7' },
  'Zoom': { icon: MessageCircle, color: '#2D8CFF' },
  
  // Media
  'Spotify': { icon: Music, color: '#1DB954' },
  'iTunes': { icon: Music, color: '#FA233B' },
  'VLC': { icon: Play, color: '#FF8800' },
  'Windows Media Player': { icon: Play, color: '#0078D4' },
  
  // Productivity
  'Calendar': { icon: Calendar, color: '#EA4335' },
  'Outlook': { icon: Mail, color: '#0078D4' },
  'Mail': { icon: Mail, color: '#1565C0' },
  'Notes': { icon: FileText, color: '#FFA500' },
  'Notepad': { icon: FileText, color: '#0078D4' },
  
  // System & Utilities
  'Calculator': { icon: Settings, color: '#666666' },
  'Settings': { icon: Settings, color: '#0078D4' },
  'Control Panel': { icon: Settings, color: '#0078D4' },
  'Activity Monitor': { icon: BarChart3, color: '#34C759' },
  'Task Manager': { icon: BarChart3, color: '#0078D4' },
  
  // Gaming & Entertainment
  'Steam': { icon: Play, color: '#1B2838' },
  'Epic Games': { icon: Play, color: '#0078F2' },
  'Origin': { icon: Play, color: '#F56C2C' },
  
  // Creative & Media
  'Camera': { icon: Camera, color: '#8B5CF6' },
  'Photos': { icon: Camera, color: '#007AFF' },
  'Photoshop': { icon: Camera, color: '#31A8FF' },
  'GIMP': { icon: Camera, color: '#5C5543' },
  
  // File Management
  'Explorer': { icon: Folder, color: '#FFD60A' },
  'Finder': { icon: Folder, color: '#007AFF' },
  'File Manager': { icon: Folder, color: '#FFD60A' },
  
  // Database & Analytics
  'SSMS': { icon: BarChart3, color: '#CC2927' },
  'MySQL Workbench': { icon: BarChart3, color: '#00618A' },
  'Analytics': { icon: BarChart3, color: '#FF6B35' },
  
  // Default fallback
  'default': { icon: FileText, color: '#6B7280' }
};

export function AppFileWindow({
  item,
  itemIndex,
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
  isSelected = false,
  isSnappedToZone = false,
  isConflicting = false,
  willBeDisplaced = false,
  onMoveToMinimized,
  onAssociateFileWithApp,
  onUpdateAssociatedFiles,
  onAppSelect,
  onFileSelect
}: AppFileWindowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [localDragging, setLocalDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [fileIconHovered, setFileIconHovered] = useState(false);
  const [mainWindowHovered, setMainWindowHovered] = useState(false);
  const [mainTooltipPosition, setMainTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  
  const fileIconRef = useRef<HTMLDivElement>(null);
  const mainWindowRef = useRef<HTMLDivElement>(null);
  
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startPosition: { x: 0, y: 0 },
    monitorElement: null as HTMLElement | null
  });

  // Timer and state for click vs drag detection
  const dragTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mouseStateRef = useRef({
    isMouseDown: false,
    startX: 0,
    startY: 0,
    hasMoved: false,
    dragInitiated: false
  });

  const isFile = item.type === 'file';
  
  // Get the appropriate icon and color for both apps and files
  const getIconAndColor = () => {
    if (isFile) {
      const file = item as FileItem;
      // For files, use the associated app's icon and color
      const appInfo = APP_ICON_MAP[file.associatedApp] || APP_ICON_MAP['default'];
      return {
        icon: appInfo.icon,
        color: appInfo.color,
        fileColor: getFileTypeColor(file.fileType)
      };
    } else {
      const app = item as AppItem;
      return {
        icon: app.icon,
        color: app.color,
        fileColor: null
      };
    }
  };

  const { icon: mainIcon, color: mainColor, fileColor } = getIconAndColor();

  // Get the file count for display
  const getFileCount = () => {
    if (isFile) {
      const file = item as FileItem;
      if (file.isFolder && file.files) {
        return file.files.length;
      }
      return 1; // Single file
    } else {
      // For apps, count associated files
      const app = item as AppItem;
      if (app.associatedFiles && app.associatedFiles.length > 0) {
        return app.associatedFiles.length;
      }
      return 0;
    }
  };

  // FIXED: Bigger app icons with proper CSS classes
  const renderMainIcon = () => {
    if (!mainIcon) {
      return (
        <div className="app-icon-fallback bg-white/20 rounded-lg">
          <span className="text-white text-sm">📱</span>
        </div>
      );
    }
    
    try {
      const IconComponent = mainIcon;
      return <IconComponent className="app-icon text-white" />;
    } catch (error) {
      console.warn('Failed to render icon:', error);
      return (
        <div className="app-icon-fallback bg-white/20 rounded-lg">
          <span className="text-white text-sm">⚠️</span>
        </div>
      );
    }
  };

  // FIXED: Simple content indicator hover for concise tooltip
  const handleContentIndicatorHover = (e: React.MouseEvent, entering: boolean) => {
    e.stopPropagation();
    setFileIconHovered(entering);
  };

  // Handle main window hover for file items
  const handleMainWindowHover = (e: React.MouseEvent, entering: boolean) => {
    if (!isFile) return;
    
    if (entering && mainWindowRef.current) {
      const rect = mainWindowRef.current.getBoundingClientRect();
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      
      // Calculate optimal position to avoid screen edges
      let x = rect.right + 16;
      let y = rect.top - 20;
      
      if (x + 420 > screenWidth) {
        x = rect.left - 436;
      }
      
      if (y + 400 > screenHeight) {
        y = screenHeight - 420;
      }
      
      if (y < 20) {
        y = 20;
      }
      
      if (x < 20) {
        x = 20;
      }
      
      setMainTooltipPosition({ x, y });
      setMainWindowHovered(true);
    } else if (!entering) {
      setMainWindowHovered(false);
    }
  };

  // FIXED: Content indicator with browser tabs and files combined
  const renderContentIndicator = () => {
    if (isFile) return null; // Only for apps
    
    const app = item as AppItem;
    
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
      <>
        <div 
          ref={fileIconRef}
          className={`content-indicator ${contentType}`}
          onMouseEnter={(e) => handleContentIndicatorHover(e, true)}
          onMouseLeave={(e) => handleContentIndicatorHover(e, false)}
          data-file-icon="true"
        >
          <span className="count">{totalContent}</span>
        </div>
        
        {/* ENHANCED: Concise tooltip that appears close to the indicator */}
        {fileIconHovered && (
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
      </>
    );
  };

  // Legacy file count indicator (for backward compatibility if needed)
  const renderFileCountIndicator = () => {
    if (isFile) return null; // Only for apps
    
    const app = item as AppItem;
    const hasAssociatedFiles = app.associatedFiles && app.associatedFiles.length > 0;
    
    if (!hasAssociatedFiles) return null;
    
    const hasFolder = app.associatedFiles?.some(f => f.type === 'folder');
    const fileCount = app.associatedFiles!.length;
    
    return (
      <div 
        className={`file-indicator ${hasFolder ? 'folder-style' : 'file-style'} pointer-events-auto z-20`}
        title={`${fileCount} ${hasFolder ? 'folders/files' : 'files'} associated`}
      >
        {fileCount > 99 ? '99+' : fileCount}
      </div>
    );
  };

  // FIXED: Simple content structure with working centering
  const renderContent = () => {
    if (isFile) {
      const file = item as FileItem;
      return (
        <>
          {/* File app icon */}
          <div className="app-icon-container">
            <div className="relative">
              {renderMainIcon()}
            </div>
          </div>
          
          {/* App name */}
          <div className="app-text-container">
            <span className="text-white text-xs font-medium text-center truncate">
              {file.associatedApp}
            </span>
            
            {/* Admin indicator if applicable */}
            {file.associatedApp === 'Terminal' && (
              <Shield className="w-3 h-3 text-yellow-400 mt-1" title="May require Admin" />
            )}
          </div>
        </>
      );
    } else {
      const app = item as AppItem;
      
      return (
        <>
          {/* App icon with content indicator */}
          <div className="app-icon-container">
            <div className="relative inline-block">
              {renderMainIcon()}
              {renderContentIndicator()}
            </div>
          </div>
          
          {/* App name */}
          <div className="app-text-container">
            <span className="text-white text-xs font-medium text-center truncate">
              {truncateText(app.name)}
            </span>
            
            {/* Admin indicator */}
            {app.runAsAdmin && (
              <Shield className="w-3 h-3 text-yellow-400 mt-1" title="Run as Admin" />
            )}
          </div>
        </>
      );
    }
  };

  // HTML5 DRAG AND DROP SYSTEM
  const handleDragStartEvent = (e: React.DragEvent) => {
    if (!isEditable) {
      e.preventDefault();
      return;
    }
    
    const dragData = isFile ? {
      source: 'monitor',
      type: 'file',
      sourceMonitorId: monitorId,
      fileIndex: itemIndex,
      name: item.name,
      path: (item as FileItem).path,
      fileType: (item as FileItem).fileType,
      fileIcon: FileIcon,
      fileColor: fileColor,
      associatedApp: (item as FileItem).associatedApp,
      useDefaultApp: (item as FileItem).useDefaultApp,
      isFolder: (item as FileItem).isFolder
    } : {
      source: 'monitor',
      type: 'app',
      monitorId: monitorId,
      appIndex: itemIndex,
      app: {
        name: item.name,
        icon: (item as AppItem).icon,
        color: (item as AppItem).color,
        volume: (item as AppItem).volume,
        runAsAdmin: (item as AppItem).runAsAdmin,
        position: item.position,
        size: item.size,
        launchBehavior: 'new' as const,
        forceCloseOnExit: false,
        smartSave: false
      }
    };
    
    console.log('📦 UNIFIED WINDOW DRAG START:', dragData);
    
    try {
      e.dataTransfer.setData('application/json', JSON.stringify(dragData));
      e.dataTransfer.effectAllowed = 'move';
    } catch (error) {
      console.log('Could not set drag data:', error);
    }
    
    const globalDragEvent = new CustomEvent('flowswitch:dragstart', {
      detail: dragData,
      bubbles: true
    });
    
    document.dispatchEvent(globalDragEvent);
    (window as any).flowswitchDragData = dragData;
  };

  const handleDragEndEvent = (e: React.DragEvent) => {
    console.log('📦 UNIFIED WINDOW DRAG END');
    
    const globalDragEndEvent = new CustomEvent('flowswitch:dragend', {
      bubbles: true
    });
    
    document.dispatchEvent(globalDragEndEvent);
    delete (window as any).flowswitchDragData;
  };

  // ENHANCED MOUSE SYSTEM with click vs drag detection
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditable || isResizing) return;
    
    const target = e.target as HTMLElement;
    
    // Check if clicking on file indicator or other interactive elements
    if (target.closest('[data-file-icon="true"]') || 
        target.closest('.file-indicator')) {
      console.log('🗂️ FILE INDICATOR CLICK DETECTED - Skipping interaction');
      return;
    }
    
    if (target.closest('button') || 
        target.tagName === 'BUTTON' || 
        target.closest('.pointer-events-auto')) {
      console.log('🔘 BUTTON CLICK DETECTED - Skipping interaction');
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🖱️ MOUSE DOWN - Starting interaction detection');
    
    // Initialize mouse state
    mouseStateRef.current = {
      isMouseDown: true,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
      dragInitiated: false
    };
    
    // Set up timer for drag initiation (500ms)
    dragTimerRef.current = setTimeout(() => {
      if (mouseStateRef.current.isMouseDown && !mouseStateRef.current.dragInitiated) {
        console.log('⏰ DRAG TIMER EXPIRED - Initiating drag');
        initiateDrag(e.clientX, e.clientY);
      }
    }, 500);
    
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
      console.log('🖱️ MOUSE MOVED BEYOND THRESHOLD - Initiating drag');
      initiateDrag(e.clientX, e.clientY);
    }
  };

  const handleMouseUpForClickDetection = (e: MouseEvent) => {
    if (!mouseStateRef.current.isMouseDown) return;
    
    console.log('🖱️ MOUSE UP - Processing click/drag result');
    
    // Clear the drag timer
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    
    // If drag wasn't initiated and mouse didn't move much, it's a click
    if (!mouseStateRef.current.dragInitiated && !mouseStateRef.current.hasMoved) {
      console.log('🎯 CLICK DETECTED - Triggering selection');
      if (isFile && onFileSelect) {
        onFileSelect();
      } else if (!isFile && onAppSelect) {
        onAppSelect();
      }
    }
    
    // Clean up mouse state
    mouseStateRef.current.isMouseDown = false;
    mouseStateRef.current.dragInitiated = false;
    
    // Remove global listeners
    document.removeEventListener('mousemove', handleMouseMoveForClickDetection);
    document.removeEventListener('mouseup', handleMouseUpForClickDetection);
    document.body.style.userSelect = '';
    
    // If drag was initiated, handle drag end
    if (mouseStateRef.current.dragInitiated && dragStateRef.current.isDragging) {
      handleGlobalMouseUp(e);
    }
  };

  const initiateDrag = (clientX: number, clientY: number) => {
    if (mouseStateRef.current.dragInitiated) return;
    
    console.log('🚀 INITIATING DRAG MODE');
    mouseStateRef.current.dragInitiated = true;
    
    if (onCustomDragStart) {
      onCustomDragStart({ x: clientX, y: clientY });
    }
    
    const monitorContainer = document.elementFromPoint(clientX, clientY)?.closest('.monitor-container');
    if (!monitorContainer) return;
    
    dragStateRef.current = {
      isDragging: true,
      startX: clientX,
      startY: clientY,
      startPosition: { ...item.position },
      monitorElement: monitorContainer as HTMLElement
    };
    
    setLocalDragging(true);
    onDragStart();
    
    // Remove click detection listeners and add drag listeners
    document.removeEventListener('mousemove', handleMouseMoveForClickDetection);
    document.removeEventListener('mouseup', handleMouseUpForClickDetection);
    
    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);
  };

  // Handle app selection on click (when not in edit mode)
  const handleAppClick = (e: React.MouseEvent) => {
    if (isEditable) return; // Don't handle selection in edit mode - this is handled by the mouse down system
    
    const target = e.target as HTMLElement;
    
    // Don't trigger selection if clicking on interactive elements
    if (target.closest('button') || 
        target.tagName === 'BUTTON' || 
        target.closest('.pointer-events-auto')) {
      return;
    }
    
    e.stopPropagation();
    console.log('🎯 ITEM SELECTED (READ-ONLY MODE):', item.name);
    
    if (isFile && onFileSelect) {
      onFileSelect();
    } else if (!isFile && onAppSelect) {
      onAppSelect();
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
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (!dragStateRef.current.isDragging || !dragStateRef.current.monitorElement) {
      return;
    }
    
    const deltaX = e.clientX - dragStateRef.current.startX;
    const deltaY = e.clientY - dragStateRef.current.startY;
    
    const monitorRect = dragStateRef.current.monitorElement.getBoundingClientRect();
    
    const percentDeltaX = (deltaX / monitorRect.width) * 100;
    const percentDeltaY = (deltaY / monitorRect.height) * 100;
    
    const newX = Math.max(
      item.size.width / 2,
      Math.min(
        100 - item.size.width / 2,
        dragStateRef.current.startPosition.x + percentDeltaX
      )
    );
    
    const newY = Math.max(
      item.size.height / 2,
      Math.min(
        100 - item.size.height / 2,
        dragStateRef.current.startPosition.y + percentDeltaY
      )
    );
    
    const newPosition = { x: newX, y: newY };
    onDrag(newPosition);
  };

  const handleGlobalMouseUp = (e: MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;
    
    console.log('🏁 DRAG END');
    
    dragStateRef.current.isDragging = false;
    setLocalDragging(false);
    
    document.removeEventListener('mousemove', handleGlobalMouseMove);
    document.removeEventListener('mouseup', handleGlobalMouseUp);
    document.body.style.userSelect = '';
    
    onDragEnd();
    
    // Reset mouse state
    mouseStateRef.current.dragInitiated = false;
    mouseStateRef.current.isMouseDown = false;
  };

  // Resize handling
  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    if (!isEditable) return;
    
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startSize = { ...item.size };
    
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

  // Button click handlers
  const handleSettingsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('⚙️ SETTINGS BUTTON CLICKED for:', item.name);
    onSettings();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('🗑️ DELETE BUTTON CLICKED for:', item.name);
    onDelete();
  };

  const handleMinimizeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('📦 MINIMIZE BUTTON CLICKED for:', item.name);
    if (onMoveToMinimized) {
      onMoveToMinimized();
    }
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const isCurrentlyDragging = isDragging || localDragging;

  // Visual styling based on state
  const getVisualState = () => {
    if (isCurrentlyDragging) {
      if (isSnappedToZone) {
        return 'snapping';
      }
      return 'dragging';
    }
    return 'normal';
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
          background: `${mainColor}20`,
          shadow: ''
        };
    }
  };

  const styling = getStyling();

  // Smart text truncation for names
  const truncateText = (text: string, maxLength: number = 12) => {
    if (text.length <= maxLength) return text;
    
    // For files, try to preserve the extension
    if (isFile && text.includes('.')) {
      const parts = text.split('.');
      const ext = parts.pop();
      const name = parts.join('.');
      const availableLength = maxLength - ext!.length - 1; // -1 for the dot
      
      if (availableLength > 3) {
        return `${name.slice(0, availableLength)}...${ext}`;
      }
    }
    
    return text.slice(0, maxLength - 3) + '...';
  };

  // Enhanced tooltip for apps with files
  const getTooltipText = () => {
    if (isFile) {
      const file = item as FileItem;
      return `File: ${file.name}\\nLocation: ${file.path}\\nOpens with: ${file.associatedApp}`;
    } else {
      const app = item as AppItem;
      return app.name;
    }
  };

  const fileCount = getFileCount();

  return (
    <>
      <div 
        className={`absolute transition-all duration-200 ${
          isCurrentlyDragging ? 'opacity-90 scale-105 z-50' : 'z-10'
        } ${styling.shadow}`}
        style={{
          left: `${item.position.x - item.size.width/2}%`,
          top: `${item.position.y - item.size.height/2}%`,
          width: `${item.size.width}%`,
          height: `${item.size.height}%`,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={isEditable}
        onDragStart={handleDragStartEvent}
        onDragEnd={handleDragEndEvent}
        data-unified-window="true"
        data-monitor-id={monitorId}
        data-item-index={itemIndex}
        data-item-type={item.type}
      >
        <div 
          ref={mainWindowRef}
          className={`relative w-full h-full rounded-lg border-2 transition-all duration-200 select-none ${
            isEditable ? 'cursor-move' : 'cursor-pointer'
          } ${isSelected 
            ? 'border-flow-accent-blue shadow-lg shadow-flow-accent-blue/50 ring-2 ring-flow-accent-blue/60 scale-[1.02]' 
            : styling.border
          }`}
          style={{ 
            backgroundColor: styling.background,
            backdropFilter: 'blur(8px)'
          }}
          onMouseDown={handleMouseDown}
          onClick={handleAppClick}
          onMouseEnter={(e) => handleMainWindowHover(e, true)}
          onMouseLeave={(e) => handleMainWindowHover(e, false)}
          title={isFile ? getTooltipText() : undefined}
        >
          {/* FIXED: Simple content centering */}
          <div className="app-window-content">
            {renderContent()}
          </div>
          
          {/* File Count Indicator for File items (folders) only */}
          {isFile && fileCount > 1 && (
            <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-sky-500 border-2 border-white rounded-full flex items-center justify-center shadow-sm backdrop-blur-sm z-10">
              <span className="text-white text-xs font-semibold leading-none" style={{ fontSize: '10px' }}>
                {fileCount > 99 ? '99+' : fileCount}
              </span>
            </div>
          )}
          
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
          
          {/* Settings and Actions */}
          {(isHovered || showSettings) && isEditable && !isCurrentlyDragging && (
            <div className="absolute -top-2 -right-2 flex items-center gap-1 z-20">
              <button
                onClick={handleSettingsClick}
                className="w-6 h-6 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full flex items-center justify-center text-white/70 hover:bg-white/30 hover:text-white transition-all duration-200"
                title="Settings"
              >
                <Settings className="w-3 h-3" />
              </button>
              <button
                onClick={handleDeleteClick}
                className="w-6 h-6 bg-red-500/20 backdrop-blur-sm border border-red-500/30 rounded-full flex items-center justify-center text-red-300 hover:bg-red-500/30 hover:text-red-100 transition-all duration-200"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              {onMoveToMinimized && (
                <button
                  onClick={handleMinimizeClick}
                  className="w-6 h-6 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full flex items-center justify-center text-white/70 hover:bg-white/30 hover:text-white transition-all duration-200"
                  title="Minimize"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          
          {/* Resize handles */}
          {isEditable && !isCurrentlyDragging && (
            <div className="absolute bottom-0 right-0 w-4 h-4 cursor-nw-resize hover:bg-white/20 transition-colors duration-200"
                 onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
                 title="Resize"
            >
              <div className="absolute bottom-1 right-1 w-1 h-1 bg-white/60 rounded-full" />
              <div className="absolute bottom-1 right-2 w-1 h-1 bg-white/40 rounded-full" />
              <div className="absolute bottom-2 right-1 w-1 h-1 bg-white/40 rounded-full" />
            </div>
          )}
        </div>
      </div>
      

      
      {/* Enhanced tooltip for file items */}
      {mainWindowHovered && mainTooltipPosition && isFile && (
        <div 
          className="fixed z-[99999] pointer-events-none"
          style={{
            left: mainTooltipPosition.x,
            top: mainTooltipPosition.y
          }}
        >
          <div className="bg-flow-surface-elevated border border-flow-border rounded-xl shadow-2xl p-5 min-w-[420px] max-w-[600px] backdrop-blur-lg">
            {(() => {
              const file = item as FileItem;
              return (
                <>
                  <div className="flex items-center gap-4 mb-5 pb-4 border-b border-flow-border">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/20 shadow-lg"
                      style={{ backgroundColor: `${fileColor}60` }}
                    >
                      <FileIcon type={file.fileType} className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-flow-text-primary">{file.name}</h3>
                      <p className="text-sm text-flow-text-secondary">
                        {file.isFolder ? 'Folder' : 'File'} • {file.fileType.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-medium text-flow-text-muted mb-2 uppercase tracking-wide">Full Path:</div>
                      <div className="text-sm text-flow-text-secondary font-mono bg-flow-bg-primary px-3 py-2 rounded-lg border border-flow-border break-all leading-relaxed">
                        {file.path}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-xs font-medium text-flow-text-muted mb-2 uppercase tracking-wide">Opens with:</div>
                      <div className="flex items-center gap-3 p-3 bg-flow-surface rounded-lg border border-flow-border">
                        {mainIcon && React.createElement(mainIcon, { className: "w-5 h-5" })}
                        <span className="text-sm font-medium text-flow-text-primary">{file.associatedApp}</span>
                        {file.useDefaultApp && (
                          <span className="text-xs px-2 py-1 bg-flow-accent-green/20 text-flow-accent-green rounded-md border border-flow-accent-green/30 font-medium ml-auto">
                            Default app
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {file.isFolder && file.files && file.files.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-flow-text-muted mb-3 uppercase tracking-wide">
                          Folder Contents ({file.files.length} items):
                        </div>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {file.files.slice(0, 10).map((subFile: any, index: number) => (
                            <div key={index} className="flex items-center gap-3 p-3 bg-flow-bg-primary rounded-lg border border-flow-border">
                              <FileIcon type={subFile.type || 'default'} className="w-4 h-4 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-flow-text-primary truncate">{subFile.name}</div>
                                <div className="text-xs text-flow-text-muted">{subFile.size || 'Unknown size'}</div>
                              </div>
                            </div>
                          ))}
                          {file.files.length > 10 && (
                            <div className="text-xs text-flow-text-muted text-center py-3 border-t border-flow-border">
                              +{file.files.length - 10} more files...
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-flow-border">
                    <div className="flex items-center justify-between text-xs text-flow-text-muted">
                      <span>
                        {file.isFolder ? 'Folder will open with ' : 'File will open with '}{file.associatedApp}
                      </span>
                      {file.launchDelay && file.launchDelay > 0 && (
                        <span className="px-2 py-1 bg-flow-accent-purple/20 text-flow-accent-purple rounded-md font-medium">
                          {file.launchDelay}s delay
                        </span>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}