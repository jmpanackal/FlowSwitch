import { useState, useRef, useEffect } from "react";
import { Link, FileText, Plus, Settings, Search, Star, ExternalLink, Play, ChevronRight, ChevronDown, Folder, FolderPlus, Home, Heart, Clock, Filter, HelpCircle, Info, Upload, LayoutGrid, List, Grid3X3 } from "lucide-react";
import { FileIcon, getFileTypeColor } from "./FileIcon";
import { AddContentModal } from "./AddContentModal";

// Enhanced content types for the unified system
interface ContentFolder {
  id: string;
  name: string;
  type: 'folder';
  parentId?: string;
  contentType: 'link' | 'file' | 'mixed';
  children: string[]; // IDs of child items and folders
  isExpanded?: boolean;
  isFavorite?: boolean;
  lastUsed?: string;
  defaultApp: string; // App to open folder with
}

interface ContentItem {
  id: string;
  type: 'link' | 'file';
  name: string;
  // Link properties
  url?: string;
  // File properties  
  path?: string;
  fileType?: string;
  isFolder?: boolean;
  files?: any[];
  // Shared properties
  defaultApp: string;
  description?: string;
  parentId?: string; // Folder ID
  isFavorite?: boolean;
  lastUsed?: string;
  dateAdded?: string;
}

interface ContentManagerProps {
  profiles: any[];
  currentProfile?: any;
  onUpdateProfile?: (profileId: string, updates: any) => void;
  onCustomDragStart: (data: any, sourceType: 'sidebar' | 'monitor' | 'minimized', sourceId: string, startPos: { x: number; y: number }, preview?: React.ReactNode) => void;
  onDragStart?: () => void;
  compact?: boolean;
}

// Available apps for users to choose from
const AVAILABLE_APPS = [
  // Browsers
  'Chrome',
  'Firefox', 
  'Safari',
  'Edge',
  
  // Office Applications
  'Microsoft Word',
  'Microsoft Excel',
  'Microsoft PowerPoint',
  'Microsoft Outlook',
  
  // Development Tools
  'Visual Studio Code',
  'Visual Studio',
  'Sublime Text',
  'Atom',
  'IntelliJ IDEA',
  
  // File & Media
  'Adobe Acrobat',
  'Notepad',
  'Notepad++',
  'Photos',
  'VLC Media Player',
  'Windows Media Player',
  'Adobe Photoshop',
  'Adobe Illustrator',
  
  // System & Utilities
  'File Explorer',
  'WinRAR',
  '7-Zip',
  'Command Prompt',
  'PowerShell',
  
  // Communication
  'Discord',
  'Slack',
  'Microsoft Teams',
  'Zoom',
  
  // Design & Creativity
  'Figma',
  'Adobe XD',
  'Sketch',
  'Canva'
];

// Default app mappings by content type (for initial suggestions)
const DEFAULT_APP_MAPPINGS = {
  // Link types
  'http': 'Chrome',
  'https': 'Chrome', 
  'youtube': 'Chrome',
  'github': 'Chrome',
  'social': 'Chrome',
  'documentation': 'Chrome',
  
  // File types
  'pdf': 'Adobe Acrobat',
  'doc': 'Microsoft Word',
  'docx': 'Microsoft Word',
  'xls': 'Microsoft Excel',
  'xlsx': 'Microsoft Excel',
  'ppt': 'Microsoft PowerPoint',
  'pptx': 'Microsoft PowerPoint',
  'txt': 'Notepad',
  'md': 'Visual Studio Code',
  'js': 'Visual Studio Code',
  'ts': 'Visual Studio Code',
  'py': 'Visual Studio Code',
  'html': 'Visual Studio Code',
  'css': 'Visual Studio Code',
  'json': 'Visual Studio Code',
  'jpg': 'Photos',
  'jpeg': 'Photos',
  'png': 'Photos',
  'gif': 'Photos',
  'svg': 'Visual Studio Code',
  'mp4': 'VLC Media Player',
  'avi': 'VLC Media Player',
  'mov': 'VLC Media Player',
  'mp3': 'Windows Media Player',
  'wav': 'Windows Media Player',
  'zip': 'WinRAR',
  'rar': 'WinRAR',
  '7z': '7-Zip',
  'folder': 'File Explorer'
};

type SortOption = 'name' | 'lastUsed' | 'dateAdded' | 'type' | 'favorites';
type ViewMode = 'normal' | 'detailed' | 'simplified';

export function ContentManager({ 
  profiles, 
  currentProfile, 
  onUpdateProfile, 
  onCustomDragStart, 
  onDragStart, 
  compact = false 
}: ContentManagerProps) {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [folders, setFolders] = useState<ContentFolder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'link' | 'file' | 'folder'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalType, setAddModalType] = useState<'link' | 'file'>('link');
  const [appDropdownOpen, setAppDropdownOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!currentProfile) {
      setContent([]);
      setFolders([]);
      setCurrentFolderId(null);
      return;
    }

    const profileContent = Array.isArray(currentProfile.contentItems)
      ? currentProfile.contentItems
      : [];
    const profileFolders = Array.isArray(currentProfile.contentFolders)
      ? currentProfile.contentFolders
      : [];

    setContent(profileContent);
    setFolders(profileFolders);
    setCurrentFolderId(null);
  }, [currentProfile?.id]);

  useEffect(() => {
    if (!currentProfile?.id || !onUpdateProfile) return;
    onUpdateProfile(currentProfile.id, {
      contentItems: content,
      contentFolders: folders,
    });
  }, [content, folders, currentProfile?.id, onUpdateProfile]);

  // Timer and state for click vs drag detection
  const dragTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mouseStateRef = useRef({
    isMouseDown: false,
    startX: 0,
    startY: 0,
    hasMoved: false,
    dragInitiated: false,
    itemId: '',
    itemData: null as ContentItem | ContentFolder | null
  });

  // Get folder name by ID
  const getFolderName = (folderId: string | undefined): string => {
    if (!folderId) return '';
    const folder = folders.find(f => f.id === folderId);
    return folder?.name || '';
  };

  // Get current folder breadcrumbs
  const getCurrentBreadcrumbs = () => {
    const breadcrumbs = [{ id: null, name: 'All Content' }];
    
    if (currentFolderId) {
      const folder = folders.find(f => f.id === currentFolderId);
      if (folder) {
        // Build breadcrumb path
        let current = folder;
        const path = [];
        while (current) {
          path.unshift(current);
          current = current.parentId ? folders.find(f => f.id === current.parentId)! : null;
        }
        breadcrumbs.push(...path.map(f => ({ id: f.id, name: f.name })));
      }
    }
    
    return breadcrumbs;
  };

  // Get items to display (enhanced with global type filtering)
  const getDisplayItems = () => {
    console.log('🔍 Getting display items for folder:', currentFolderId, 'type filter:', selectedType);
    
    let displayFolders: ContentFolder[] = [];
    let displayContent: ContentItem[] = [];

    // Handle type-based filtering
    if (selectedType === 'link') {
      // Show ALL links regardless of folder
      displayContent = content.filter(item => item.type === 'link');
      displayFolders = []; // Don't show folders when filtering by specific type
      console.log('🔗 Showing all links:', displayContent.length);
    } else if (selectedType === 'file') {
      // Show ALL files regardless of folder
      displayContent = content.filter(item => item.type === 'file');
      displayFolders = []; // Don't show folders when filtering by specific type
      console.log('📄 Showing all files:', displayContent.length);
    } else if (selectedType === 'folder') {
      // Show only folders in current location
      displayFolders = folders.filter(folder => {
        const shouldShow = currentFolderId ? folder.parentId === currentFolderId : !folder.parentId;
        return shouldShow;
      });
      displayContent = []; // Don't show content items when filtering by folders
      console.log('📁 Showing folders in current location:', displayFolders.length);
    } else {
      // 'all' type - respect current folder context
      displayFolders = folders.filter(folder => {
        const shouldShow = currentFolderId ? folder.parentId === currentFolderId : !folder.parentId;
        if (shouldShow) {
          console.log('📁 Showing folder:', folder.name, 'parentId:', folder.parentId);
        }
        return shouldShow;
      });
      
      displayContent = content.filter(item => {
        const shouldShow = currentFolderId ? item.parentId === currentFolderId : !item.parentId;
        if (shouldShow) {
          console.log('📄 Showing item:', item.name, 'parentId:', item.parentId);
        }
        return shouldShow;
      });
    }

    console.log(`📊 Display results: ${displayFolders.length} folders, ${displayContent.length} items`);

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      displayFolders = displayFolders.filter(folder => 
        folder.name.toLowerCase().includes(query)
      );
      displayContent = displayContent.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.url?.toLowerCase().includes(query) ||
        item.path?.toLowerCase().includes(query)
      );
    }

    // Apply favorites filter
    if (showFavoritesOnly) {
      displayFolders = displayFolders.filter(folder => folder.isFavorite);
      displayContent = displayContent.filter(item => item.isFavorite);
    }

    // FIXED: Sort all items together instead of separately
    const sortFunction = (a: ContentItem | ContentFolder, b: ContentItem | ContentFolder) => {
      if (sortBy === 'favorites') {
        const aFav = a.isFavorite ? 1 : 0;
        const bFav = b.isFavorite ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        return a.name.localeCompare(b.name);
      }
      
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'lastUsed':
          return (b.lastUsed || '').localeCompare(a.lastUsed || '');
        case 'dateAdded': {
          const aDate = (a as ContentItem).dateAdded || '';
          const bDate = (b as ContentItem).dateAdded || '';
          return bDate.localeCompare(aDate);
        }
        case 'type':
          return a.type.localeCompare(b.type);
        default:
          return 0;
      }
    };

    // Combine all items and sort them together
    const allItems: (ContentItem | ContentFolder)[] = [...displayFolders, ...displayContent];
    allItems.sort(sortFunction);

    // Separate them back into folders and content for rendering
    const sortedFolders: ContentFolder[] = [];
    const sortedContent: ContentItem[] = [];
    
    allItems.forEach(item => {
      if (item.type === 'folder') {
        sortedFolders.push(item as ContentFolder);
      } else {
        sortedContent.push(item as ContentItem);
      }
    });

    return { folders: sortedFolders, content: sortedContent };
  };

  // Enhanced mouse system for drag detection
  const handleMouseDown = (e: React.MouseEvent, item: ContentItem | ContentFolder) => {
    e.preventDefault();
    
    console.log('🖱️ CONTENT MOUSE DOWN:', item.name);
    
    // Initialize mouse state
    mouseStateRef.current = {
      isMouseDown: true,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
      dragInitiated: false,
      itemId: item.id,
      itemData: item
    };
    
    // Set up timer for drag initiation (500ms)
    dragTimerRef.current = setTimeout(() => {
      if (mouseStateRef.current.isMouseDown && !mouseStateRef.current.dragInitiated) {
        console.log('⏰ CONTENT DRAG TIMER EXPIRED - Initiating drag');
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
      
      console.log('🖱️ CONTENT MOUSE MOVED BEYOND THRESHOLD - Initiating drag');
      initiateDrag(e.clientX, e.clientY);
    }
  };

  const handleMouseUpForClickDetection = (e: MouseEvent) => {
    if (!mouseStateRef.current.isMouseDown) return;
    
    console.log('🖱️ CONTENT MOUSE UP - Processing click/drag result', {
      dragInitiated: mouseStateRef.current.dragInitiated,
      hasMoved: mouseStateRef.current.hasMoved
    });
    
    // Clear the drag timer
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    
    // If drag wasn't initiated and mouse didn't move much, it's a click
    if (!mouseStateRef.current.dragInitiated && !mouseStateRef.current.hasMoved) {
      console.log('🎯 CONTENT CLICK DETECTED');
      handleContentClick(mouseStateRef.current.itemData);
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
    
    console.log('🚀 INITIATING CONTENT DRAG MODE');
    mouseStateRef.current.dragInitiated = true;
    
    const item = mouseStateRef.current.itemData;
    
    // Only allow dragging content items, not folders
    if (item.type === 'folder') return;
    
    // Trigger edit mode
    if (onDragStart) {
      onDragStart();
    }
    
    const contentItem = item as ContentItem;
    
    // Create drag data for the content item
    const dragData = {
      source: 'sidebar',
      type: 'content',
      contentType: contentItem.type,
      contentId: contentItem.id,
      name: contentItem.name,
      url: contentItem.url,
      path: contentItem.path,
      fileType: contentItem.fileType,
      defaultApp: contentItem.defaultApp,
      isFolder: contentItem.isFolder,
      useDefaultApp: true,
      // For creating new app instances
      createNewApp: true,
      associatedApp: contentItem.defaultApp
    };
    
    // Create preview element
    const preview = (
      <div className="flex items-center gap-2">
        {getContentIcon(contentItem)}
        <span className="text-white font-medium">{contentItem.name}</span>
      </div>
    );
    
    onCustomDragStart(
      dragData,
      'sidebar',
      'content',
      { x: clientX, y: clientY },
      preview
    );
    
    // Remove click detection listeners
    document.removeEventListener('mousemove', handleMouseMoveForClickDetection);
    document.removeEventListener('mouseup', handleMouseUpForClickDetection);
  };

  const handleContentClick = (item: ContentItem | ContentFolder | null) => {
    if (!item) return;
    
    console.log('🎯 CONTENT CLICKED:', item.name, 'type:', item.type);
    
    if (item.type === 'folder') {
      // Navigate into folder (only if not filtering by specific type)
      if (selectedType === 'all' || selectedType === 'folder') {
        console.log('📁 NAVIGATING INTO FOLDER:', item.id);
        setCurrentFolderId(item.id);
      }
    } else {
      const contentItem = item as ContentItem;
      if (contentItem.type === 'link' && contentItem.url) {
        console.log('🔗 Opening link:', contentItem.url);
        // In a real app, this would open the link
      } else if (contentItem.type === 'file' && contentItem.path) {
        console.log('📁 Opening file:', contentItem.path);
        // In a real app, this would open the file
      }
    }
  };

  const handleDirectOpen = (e: React.MouseEvent, item: ContentItem) => {
    e.stopPropagation();
    
    if (item.type === 'link' && item.url) {
      console.log('🚀 Direct open link:', item.url);
      // Update last used
      setContent(prev => prev.map(c => 
        c.id === item.id ? { ...c, lastUsed: new Date().toISOString().split('T')[0] } : c
      ));
    } else if (item.type === 'file' && item.path) {
      console.log('🚀 Direct open file:', item.path);
      // Update last used
      setContent(prev => prev.map(c => 
        c.id === item.id ? { ...c, lastUsed: new Date().toISOString().split('T')[0] } : c
      ));
    }
  };

  const handleToggleFavorite = (e: React.MouseEvent, itemId: string, isFolder: boolean = false) => {
    e.stopPropagation();
    
    if (isFolder) {
      setFolders(prev => prev.map(folder =>
        folder.id === itemId ? { ...folder, isFavorite: !folder.isFavorite } : folder
      ));
    } else {
      setContent(prev => prev.map(item =>
        item.id === itemId ? { ...item, isFavorite: !item.isFavorite } : item
      ));
    }
  };

  const handleBreadcrumbClick = (folderId: string | null) => {
    console.log('🧭 BREADCRUMB CLICKED:', folderId);
    setCurrentFolderId(folderId);
  };

  const handleAddContent = (contentData: any) => {
    const newItem: ContentItem = {
      id: `${contentData.type}-${Date.now()}`,
      type: contentData.type,
      name: contentData.name,
      url: contentData.url,
      path: contentData.path,
      fileType: contentData.fileType,
      isFolder: contentData.isFolder,
      defaultApp: contentData.defaultApp,
      parentId: currentFolderId, // Add to current folder
      isFavorite: false,
      lastUsed: undefined,
      dateAdded: new Date().toISOString().split('T')[0]
    };

    setContent(prev => [...prev, newItem]);
    console.log('✅ Added new content:', newItem);
  };

  const handleChangeDefaultApp = (itemId: string, newDefaultApp: string, isFolder: boolean = false) => {
    if (isFolder) {
      setFolders(prev => prev.map(folder =>
        folder.id === itemId ? { ...folder, defaultApp: newDefaultApp } : folder
      ));
      console.log('✅ Changed default app for folder', itemId, 'to', newDefaultApp);
    } else {
      setContent(prev => prev.map(item =>
        item.id === itemId ? { ...item, defaultApp: newDefaultApp } : item
      ));
      console.log('✅ Changed default app for content', itemId, 'to', newDefaultApp);
    }
    setAppDropdownOpen(null);
  };

  // Get icon for content item
  const getContentIcon = (item: ContentItem) => {
    if (item.type === 'link') {
      return <ExternalLink className="w-4 h-4 text-blue-400" />;
    } else if (item.isFolder) {
      return <Folder className="w-4 h-4 text-yellow-400" />;
    } else {
      return <FileIcon type={item.fileType || 'unknown'} className="w-4 h-4" />;
    }
  };

  // Get color for content item
  const getContentColor = (item: ContentItem) => {
    if (item.type === 'link') {
      return '#3B82F6'; // blue
    } else if (item.isFolder) {
      return '#F59E0B'; // yellow  
    } else {
      return getFileTypeColor(item.fileType || 'unknown');
    }
  };

  // Get help tooltip content based on current state
  const getHelpTooltipContent = () => {
    const content = [
      '• Click folder to navigate into it',
      '• Click content to open directly',
      '• Click app name to change default app (all types)',
      '• ❤️ Click heart to favorite items',
      '• ▶️ Click play to quick open',
      '• Drag content to associate with apps'
    ];

    if (selectedType === 'link' || selectedType === 'file') {
      content.push('• 📁 Folder tags show content location');
    }

    return content;
  };

  // Render folder based on view mode
  const renderFolder = (folder: ContentFolder) => {
    const baseClasses = "group relative cursor-pointer";
    
    if (viewMode === 'simplified') {
      return (
        <div key={folder.id} className={baseClasses}>
          <div
            className="flex items-center gap-2 p-1.5 bg-flow-surface hover:bg-flow-surface-elevated border border-flow-border hover:border-flow-border-accent rounded-lg transition-all duration-200"
            onClick={() => handleContentClick(folder)}
            onMouseEnter={() => setHoveredItem(folder.id)}
            onMouseLeave={() => setHoveredItem(null)}
            style={{ borderLeftColor: '#F59E0B', borderLeftWidth: '2px' }}
          >
            <div className="flex-shrink-0">
              <Folder className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-flow-text-primary truncate">
                {folder.name}
              </h3>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="relative app-dropdown">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAppDropdownOpen(appDropdownOpen === folder.id ? null : folder.id);
                    }}
                    className="px-1 py-0.5 bg-flow-bg-tertiary hover:bg-flow-surface border border-transparent hover:border-flow-border-accent rounded text-xs transition-colors cursor-pointer"
                  >
                    {folder.defaultApp}
                  </button>
                  
                  {appDropdownOpen === folder.id && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg overflow-hidden z-50">
                      <div className="max-h-40 overflow-y-auto">
                        {AVAILABLE_APPS.map((app) => (
                          <button
                            key={app}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChangeDefaultApp(folder.id, app, true);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-flow-surface transition-colors ${
                              app === folder.defaultApp 
                                ? 'bg-flow-accent-blue/20 text-flow-accent-blue' 
                                : 'text-flow-text-primary'
                            }`}
                          >
                            {app}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1">
              <button
                onClick={(e) => handleToggleFavorite(e, folder.id, true)}
                className={`p-1 rounded transition-colors ${
                  folder.isFavorite 
                    ? 'text-red-400 hover:text-red-300' 
                    : 'text-flow-text-muted hover:text-red-400'
                }`}
              >
                <Heart className={`w-3 h-3 ${folder.isFavorite ? 'fill-current' : ''}`} />
              </button>
              <ChevronRight className="w-3 h-3 text-flow-text-muted" />
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === 'detailed') {
      return (
        <div key={folder.id} className={baseClasses}>
          <div
            className="flex items-start gap-3 p-4 bg-flow-surface hover:bg-flow-surface-elevated border border-flow-border hover:border-flow-border-accent rounded-lg transition-all duration-200"
            onClick={() => handleContentClick(folder)}
            onMouseEnter={() => setHoveredItem(folder.id)}
            onMouseLeave={() => setHoveredItem(null)}
            style={{ borderLeftColor: '#F59E0B', borderLeftWidth: '3px' }}
          >
            <div className="flex-shrink-0 mt-1">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                <Folder className="w-5 h-5 text-yellow-400" />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-base font-semibold text-flow-text-primary">
                  {folder.name}
                </h3>
                <span className="text-xs text-flow-text-muted">
                  ({folder.children.length} items)
                </span>
              </div>
              
              <div className="flex items-center gap-3 text-xs text-flow-text-muted">
                <div className="relative app-dropdown">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAppDropdownOpen(appDropdownOpen === folder.id ? null : folder.id);
                    }}
                    className="px-2 py-1 bg-flow-bg-tertiary hover:bg-flow-surface border border-transparent hover:border-flow-border-accent rounded font-medium transition-colors cursor-pointer"
                  >
                    {folder.defaultApp}
                  </button>
                  
                  {appDropdownOpen === folder.id && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg overflow-hidden z-50">
                      <div className="max-h-40 overflow-y-auto">
                        {AVAILABLE_APPS.map((app) => (
                          <button
                            key={app}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChangeDefaultApp(folder.id, app, true);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-flow-surface transition-colors ${
                              app === folder.defaultApp 
                                ? 'bg-flow-accent-blue/20 text-flow-accent-blue' 
                                : 'text-flow-text-primary'
                            }`}
                          >
                            {app}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <span className="px-2 py-1 bg-flow-bg-tertiary rounded capitalize font-medium">
                  {folder.contentType} folder
                </span>
                {folder.lastUsed && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {folder.lastUsed}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center gap-1">
              <button
                onClick={(e) => handleToggleFavorite(e, folder.id, true)}
                className={`p-1.5 rounded transition-colors ${
                  folder.isFavorite 
                    ? 'text-red-400 hover:text-red-300' 
                    : 'text-flow-text-muted hover:text-red-400'
                }`}
                title={folder.isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart className={`w-4 h-4 ${folder.isFavorite ? 'fill-current' : ''}`} />
              </button>
              <ChevronRight className="w-4 h-4 text-flow-text-muted" />
            </div>
          </div>
        </div>
      );
    }

    // Normal view (default)
    return (
      <div key={folder.id} className={baseClasses}>
        <div
          className="flex items-center gap-2 p-2 bg-flow-surface hover:bg-flow-surface-elevated border border-flow-border hover:border-flow-border-accent rounded-lg transition-all duration-200"
          onClick={() => handleContentClick(folder)}
          onMouseEnter={() => setHoveredItem(folder.id)}
          onMouseLeave={() => setHoveredItem(null)}
          style={{ borderLeftColor: '#F59E0B', borderLeftWidth: '3px' }}
        >
          <div className="flex-shrink-0">
            <Folder className="w-4 h-4 text-yellow-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-medium text-flow-text-primary truncate">
                {folder.name}
              </h3>
              <span className="text-xs text-flow-text-muted">
                ({folder.children.length} items)
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-flow-text-muted">
              <div className="relative app-dropdown">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAppDropdownOpen(appDropdownOpen === folder.id ? null : folder.id);
                  }}
                  className="px-1.5 py-0.5 bg-flow-bg-tertiary hover:bg-flow-surface border border-transparent hover:border-flow-border-accent rounded transition-colors cursor-pointer"
                >
                  {folder.defaultApp}
                </button>
                
                {appDropdownOpen === folder.id && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg overflow-hidden z-50">
                    <div className="max-h-40 overflow-y-auto">
                      {AVAILABLE_APPS.map((app) => (
                        <button
                          key={app}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChangeDefaultApp(folder.id, app, true);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-flow-surface transition-colors ${
                            app === folder.defaultApp 
                              ? 'bg-flow-accent-blue/20 text-flow-accent-blue' 
                              : 'text-flow-text-primary'
                          }`}
                        >
                          {app}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {folder.lastUsed && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {folder.lastUsed}
                </span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-1">
            <button
              onClick={(e) => handleToggleFavorite(e, folder.id, true)}
              className={`p-1 rounded transition-colors ${
                folder.isFavorite 
                  ? 'text-red-400 hover:text-red-300' 
                  : 'text-flow-text-muted hover:text-red-400'
              }`}
              title={folder.isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart className={`w-3 h-3 ${folder.isFavorite ? 'fill-current' : ''}`} />
            </button>
            <ChevronRight className="w-3 h-3 text-flow-text-muted" />
          </div>
        </div>
      </div>
    );
  };

  // Render content item based on view mode
  const renderContentItem = (item: ContentItem) => {
    const baseClasses = "group relative cursor-grab active:cursor-grabbing";
    
    if (viewMode === 'simplified') {
      return (
        <div key={item.id} className={baseClasses}>
          <div
            className="flex items-center gap-2 p-1.5 bg-flow-surface hover:bg-flow-surface-elevated border border-flow-border hover:border-flow-border-accent rounded-lg transition-all duration-200"
            onMouseDown={(e) => handleMouseDown(e, item)}
            onMouseEnter={() => setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
            style={{ borderLeftColor: getContentColor(item), borderLeftWidth: '2px' }}
          >
            <div className="flex-shrink-0">
              {getContentIcon(item)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-flow-text-primary truncate">
                {item.name}
              </h3>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="relative app-dropdown">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAppDropdownOpen(appDropdownOpen === item.id ? null : item.id);
                    }}
                    className="px-1 py-0.5 bg-flow-bg-tertiary hover:bg-flow-surface border border-transparent hover:border-flow-border-accent rounded text-xs transition-colors cursor-pointer"
                  >
                    {item.defaultApp}
                  </button>
                  
                  {appDropdownOpen === item.id && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg overflow-hidden z-50">
                      <div className="max-h-40 overflow-y-auto">
                        {AVAILABLE_APPS.map((app) => (
                          <button
                            key={app}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChangeDefaultApp(item.id, app);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-flow-surface transition-colors ${
                              app === item.defaultApp 
                                ? 'bg-flow-accent-blue/20 text-flow-accent-blue' 
                                : 'text-flow-text-primary'
                            }`}
                          >
                            {app}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 flex items-center gap-1">
              <button
                onClick={(e) => handleToggleFavorite(e, item.id)}
                className={`p-1 rounded transition-colors ${
                  item.isFavorite 
                    ? 'text-red-400 hover:text-red-300' 
                    : 'text-flow-text-muted hover:text-red-400'
                }`}
              >
                <Heart className={`w-3 h-3 ${item.isFavorite ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === 'detailed') {
      return (
        <div key={item.id} className={baseClasses}>
          <div
            className="flex items-start gap-3 p-4 bg-flow-surface hover:bg-flow-surface-elevated border border-flow-border hover:border-flow-border-accent rounded-lg transition-all duration-200"
            onMouseDown={(e) => handleMouseDown(e, item)}
            onMouseEnter={() => setHoveredItem(item.id)}
            onMouseLeave={() => setHoveredItem(null)}
            style={{ borderLeftColor: getContentColor(item), borderLeftWidth: '3px' }}
          >
            <div className="flex-shrink-0 mt-1">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                {item.type === 'link' ? (
                  <ExternalLink className="w-5 h-5 text-blue-400" />
                ) : item.isFolder ? (
                  <Folder className="w-5 h-5 text-yellow-400" />
                ) : (
                  <FileIcon type={item.fileType || 'unknown'} className="w-5 h-5" />
                )}
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-base font-semibold text-flow-text-primary">
                  {item.name}
                </h3>
                {item.type === 'link' && (
                  <ExternalLink className="w-3 h-3 text-flow-text-muted flex-shrink-0" />
                )}
              </div>
              
              {item.description && (
                <p className="text-sm text-flow-text-secondary mb-2 leading-relaxed">
                  {item.description}
                </p>
              )}
              
              <div className="text-xs text-flow-text-muted mb-3 font-mono bg-flow-bg-tertiary px-2 py-1 rounded">
                {item.type === 'link' ? item.url : item.path}
              </div>
              
              <div className="flex items-center gap-3 text-xs text-flow-text-muted">
                <div className="relative app-dropdown">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAppDropdownOpen(appDropdownOpen === item.id ? null : item.id);
                    }}
                    className="px-2 py-1 bg-flow-bg-tertiary hover:bg-flow-surface border border-transparent hover:border-flow-border-accent rounded font-medium transition-colors cursor-pointer"
                  >
                    {item.defaultApp}
                  </button>
                  
                  {appDropdownOpen === item.id && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg overflow-hidden z-50">
                      <div className="max-h-40 overflow-y-auto">
                        {AVAILABLE_APPS.map((app) => (
                          <button
                            key={app}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChangeDefaultApp(item.id, app);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-flow-surface transition-colors ${
                              app === item.defaultApp 
                                ? 'bg-flow-accent-blue/20 text-flow-accent-blue' 
                                : 'text-flow-text-primary'
                            }`}
                          >
                            {app}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {(selectedType === 'link' || selectedType === 'file') && item.parentId && (
                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 rounded border border-yellow-500/30">
                    📁 {getFolderName(item.parentId)}
                  </span>
                )}
                {item.lastUsed && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {item.lastUsed}
                  </span>
                )}
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center gap-1">
              <button
                onClick={(e) => handleToggleFavorite(e, item.id)}
                className={`p-1.5 rounded transition-colors ${
                  item.isFavorite 
                    ? 'text-red-400 hover:text-red-300' 
                    : 'text-flow-text-muted hover:text-red-400'
                }`}
              >
                <Heart className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={(e) => handleDirectOpen(e, item)}
                className="p-1.5 text-flow-text-muted hover:text-flow-accent-blue rounded transition-colors"
              >
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {hoveredItem === item.id && (
            <div className="absolute -top-1 -right-1 px-2 py-1 bg-flow-accent-blue/20 border border-flow-accent-blue/30 rounded text-xs text-flow-accent-blue backdrop-blur-sm">
              Drag to app or monitor
            </div>
          )}
        </div>
      );
    }

    // Normal view (current)
    return (
      <div key={item.id} className={baseClasses}>
        <div
          className="flex items-center gap-2 p-2 bg-flow-surface hover:bg-flow-surface-elevated border border-flow-border hover:border-flow-border-accent rounded-lg transition-all duration-200"
          onMouseDown={(e) => handleMouseDown(e, item)}
          onMouseEnter={() => setHoveredItem(item.id)}
          onMouseLeave={() => setHoveredItem(null)}
          style={{ borderLeftColor: getContentColor(item), borderLeftWidth: '3px' }}
        >
          <div className="flex-shrink-0">
            {getContentIcon(item)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-sm font-medium text-flow-text-primary truncate">
                {item.name}
              </h3>
              {item.type === 'link' && (
                <ExternalLink className="w-3 h-3 text-flow-text-muted flex-shrink-0" />
              )}
            </div>
            
            <div className="text-xs text-flow-text-muted truncate mb-1">
              {item.type === 'link' ? item.url : item.path}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-flow-text-muted">
              <div className="relative app-dropdown">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAppDropdownOpen(appDropdownOpen === item.id ? null : item.id);
                  }}
                  className="px-1.5 py-0.5 bg-flow-bg-tertiary hover:bg-flow-surface border border-transparent hover:border-flow-border-accent rounded transition-colors cursor-pointer"
                >
                  {item.defaultApp}
                </button>
                
                {appDropdownOpen === item.id && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg overflow-hidden z-50">
                    <div className="max-h-40 overflow-y-auto">
                      {AVAILABLE_APPS.map((app) => (
                        <button
                          key={app}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleChangeDefaultApp(item.id, app);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-flow-surface transition-colors ${
                            app === item.defaultApp 
                              ? 'bg-flow-accent-blue/20 text-flow-accent-blue' 
                              : 'text-flow-text-primary'
                          }`}
                        >
                          {app}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {(selectedType === 'link' || selectedType === 'file') && item.parentId && (
                <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded text-xs border border-yellow-500/30">
                  📁 {getFolderName(item.parentId)}
                </span>
              )}
              {item.lastUsed && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {item.lastUsed}
                </span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-1">
            <button
              onClick={(e) => handleToggleFavorite(e, item.id)}
              className={`p-1 rounded transition-colors ${
                item.isFavorite 
                  ? 'text-red-400 hover:text-red-300' 
                  : 'text-flow-text-muted hover:text-red-400'
              }`}
            >
              <Heart className={`w-3 h-3 ${item.isFavorite ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={(e) => handleDirectOpen(e, item)}
              className="p-1 text-flow-text-muted hover:text-flow-accent-blue rounded transition-colors"
            >
              <Play className="w-3 h-3" />
            </button>
          </div>
        </div>

        {hoveredItem === item.id && (
          <div className="absolute -top-1 -right-1 px-2 py-1 bg-flow-accent-blue/20 border border-flow-accent-blue/30 rounded text-xs text-flow-accent-blue backdrop-blur-sm">
            Drag to app or monitor
          </div>
        )}
      </div>
    );
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

  // Close app dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (appDropdownOpen) {
        const target = event.target as Element;
        const dropdown = target.closest('.app-dropdown');
        if (!dropdown) {
          setAppDropdownOpen(null);
        }
      }
    };

    if (appDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [appDropdownOpen]);

  const { folders: displayFolders, content: displayContent } = getDisplayItems();
  const breadcrumbs = getCurrentBreadcrumbs();
  
  // Get current folder info for context
  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link className="w-4 h-4 text-flow-text-muted" />
          <h2 className="text-sm font-medium text-flow-text-secondary uppercase tracking-wide">Content</h2>
          
          {/* Help Tooltip */}
          <div className="relative">
            <button
              onMouseEnter={() => setShowHelpTooltip(true)}
              onMouseLeave={() => setShowHelpTooltip(false)}
              className="inline-flex items-center justify-center p-1 text-flow-text-muted hover:text-flow-text-secondary rounded transition-colors"
              aria-label="Show help"
            >
              <Info className="w-3 h-3" />
            </button>
            
            {showHelpTooltip && (
              <div className="absolute left-0 top-full mt-2 w-64 p-3 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg z-50">
                <div className="text-xs text-flow-text-secondary font-medium mb-2">Actions:</div>
                <div className="space-y-1 text-xs text-flow-text-muted">
                  {getHelpTooltipContent().map((line, index) => (
                    <div key={index}>{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          

          {currentFolder && selectedType === 'all' && (
            <span className="text-xs text-flow-text-muted">
              in {currentFolder.name}
            </span>
          )}
          {(selectedType === 'link' || selectedType === 'file') && (
            <span className="text-xs text-flow-text-muted">
              {selectedType}s from all folders
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Enhanced Add Button */}
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary rounded-lg transition-colors"
              title="Add Content"
            >
              <Plus className="w-3 h-3" />
              Add
              <ChevronDown className="w-3 h-3" />
            </button>
            
            {showAddMenu && (
              <div className="absolute top-full right-0 mt-1 w-40 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg overflow-hidden z-50">
                <button
                  onClick={() => {
                    setAddModalType('link');
                    setShowAddModal(true);
                    setShowAddMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-flow-text-primary hover:bg-flow-surface transition-colors"
                >
                  <ExternalLink className="w-3 h-3 text-blue-400" />
                  Add Link
                </button>
                <button
                  onClick={() => {
                    setAddModalType('file');
                    setShowAddModal(true);
                    setShowAddMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-flow-text-primary hover:bg-flow-surface transition-colors"
                >
                  <Upload className="w-3 h-3 text-green-400" />
                  Add File/Folder
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search and Filters - CLEAN: Consistent with UI */}
      <div className="space-y-3 mb-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-flow-text-muted" />
          <input
            type="text"
            placeholder="Search content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50 transition-all duration-200"
          />
        </div>

        {/* Inline Filter Controls - Compact design */}
        <div className="space-y-3">
          {/* Type and Sort Row */}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'all' | 'link' | 'file' | 'folder')}
              className="px-2 py-1.5 bg-flow-surface border border-flow-border rounded text-xs text-flow-text-primary focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50 transition-all duration-200"
              title="Filter by content type"
            >
              <option value="all">All Types</option>
              <option value="link">Links</option>
              <option value="file">Files</option>
              <option value="folder">Folders</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-2 py-1.5 bg-flow-surface border border-flow-border rounded text-xs text-flow-text-primary focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50 transition-all duration-200"
              title="Sort content by"
            >
              <option value="name">Name</option>
              <option value="lastUsed">Recent</option>
              <option value="dateAdded">Added</option>
              <option value="type">Type</option>
              <option value="favorites">Favorites</option>
            </select>
          </div>

          {/* View and Favorites Row */}
          <div className="flex items-center gap-2">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className="flex-1 px-2 py-1.5 bg-flow-surface border border-flow-border rounded text-xs text-flow-text-primary focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50 transition-all duration-200"
              title="Change view mode"
            >
              <option value="normal">Normal</option>
              <option value="detailed">Detailed</option>
              <option value="simplified">Compact</option>
            </select>

            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors ${
                showFavoritesOnly 
                  ? 'bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30' 
                  : 'bg-flow-surface border border-flow-border text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary hover:border-flow-border-accent'
              }`}
              title={showFavoritesOnly ? "Show all content" : "Show favorites only"}
            >
              <Heart className={`w-3 h-3 ${showFavoritesOnly ? 'fill-current' : ''}`} />
              <span className="whitespace-nowrap">{showFavoritesOnly ? 'Favs' : 'All'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumbs - Moved to appear under filters */}
      {breadcrumbs.length > 1 && selectedType === 'all' && (
        <div className="flex items-center gap-1 mb-4 p-2 bg-flow-surface border border-flow-border rounded-lg">
          <Home className="w-3 h-3 text-flow-text-muted" />
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.id || 'root'} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="w-3 h-3 text-flow-text-muted" />}
              <button
                onClick={() => handleBreadcrumbClick(crumb.id)}
                className={`text-xs hover:text-flow-text-primary transition-colors ${
                  index === breadcrumbs.length - 1 
                    ? 'text-flow-text-primary font-medium' 
                    : 'text-flow-text-secondary'
                }`}
              >
                {crumb.name}
              </button>
            </div>
          ))}
        </div>
      )}



      {/* Content List - Smart scrolling with elegant scrollbar, no horizontal scroll */}
      <div className={`${viewMode === 'simplified' ? 'space-y-1' : 'space-y-2'} max-h-[60vh] overflow-y-auto overflow-x-hidden scrollbar-elegant`}>
        {displayFolders.length === 0 && displayContent.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-flow-text-muted mx-auto mb-2" />
            <p className="text-sm text-flow-text-muted">
              {currentFolder && selectedType === 'all' ? `No content in ${currentFolder.name}` : 
               selectedType === 'link' ? 'No links found' :
               selectedType === 'file' ? 'No files found' :
               selectedType === 'folder' ? 'No folders found' :
               'No content found'}
            </p>
            <p className="text-xs text-flow-text-muted mt-1">
              {searchQuery || showFavoritesOnly 
                ? 'Try adjusting your search or filters' 
                : 'Start by adding some content'
              }
            </p>
          </div>
        ) : (
          <>
            {/* Folders */}
            {displayFolders.map((folder) => renderFolder(folder))}

            {/* Content Items */}
            {displayContent.map((item) => renderContentItem(item))}
          </>
        )}
      </div>

      {/* Add Content Modal */}
      <AddContentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        type={addModalType}
        currentFolder={currentFolder?.name}
        onAddContent={handleAddContent}
      />
    </div>
  );
}