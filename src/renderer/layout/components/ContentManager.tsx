import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link, FileText, Plus, Settings, Search, Star, ExternalLink, ChevronRight, ChevronDown, Folder, Home, Heart, Clock, Filter, HelpCircle, Info, Upload, LayoutGrid, List, Grid3X3, MoreVertical } from "lucide-react";
import { FileIcon, getFileTypeColor } from "./FileIcon";
import { AddContentModal } from "./AddContentModal";
import { useFlowSnackbar } from "./FlowSnackbar";
import { SidebarOverlayMenu } from "./SidebarOverlayMenu";
import {
  restoreDocumentTextSelection,
  suspendDocumentTextSelection,
} from "../utils/documentTextSelection";
import { FlowTooltip } from "./ui/tooltip";
import {
  FLOW_LIBRARY_TOOLBAR_ADD_PILL_CLASS,
  FLOW_LIBRARY_TOOLBAR_PILL_CLASS,
  FlowLibraryToolbar,
  type FlowLibraryViewMode,
} from "./FlowLibraryToolbar";
import { flowDropdownNativeSelectClass } from "./inspectorStyles";
import { AVAILABLE_APPS } from "../constants/availableAppsForOpensWith";
import { buildMonitorDisplayLabelMap } from "../utils/monitorChromeLabels";
import { safeIconSrc } from "../../utils/safeIconSrc";
import {
  getAppColor,
  getAppIcon,
  getBrowserColor,
  getBrowserIcon,
} from "../utils/layoutDropPresentation";

// Enhanced content types for the unified system
export interface ContentFolder {
  id: string;
  name: string;
  type: 'folder';
  parentId?: string;
  contentType: 'link' | 'file' | 'mixed';
  children: string[]; // IDs of child items and folders
  /** When set, this folder represents a single on-disk directory (children may be empty). */
  diskPath?: string;
  isExpanded?: boolean;
  isFavorite?: boolean;
  lastUsed?: string;
  defaultApp: string; // App to open folder with
}

export interface ContentItem {
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
  /** Places a content item on a monitor (parent supplies profile-scoped mutations). */
  onPlaceContentOnMonitor?: (monitorId: string, item: ContentItem) => void;
  onPlaceContentOnMinimized?: (item: ContentItem) => void;
  onPlaceLibraryFolderOnMonitor?: (
    monitorId: string,
    folder: ContentFolder,
  ) => void;
  onPlaceLibraryFolderOnMinimized?: (folder: ContentFolder) => void;
  /** Compact sidebar: open right inspector instead of cramming metadata in the list. */
  onInspectLibrarySelection?: (
    payload:
      | { kind: "item"; item: ContentItem }
      | { kind: "folder"; folder: ContentFolder },
  ) => void;
  /** When set, navigates into this folder then clears (e.g. from inspector “Open folder”). */
  openLibraryFolderId?: string | null;
  onConsumedOpenLibraryFolder?: () => void;
  /** Global library rows visible for the active profile (parent filters exclusions). */
  externalContentItems?: ContentItem[];
  externalContentFolders?: ContentFolder[];
  onPersistContentLibrary?: (next: {
    items: ContentItem[];
    folders: ContentFolder[];
  }) => void;
  /** Remove a library row from the global content library (compact overflow menu). */
  onDeleteLibraryEntry?: (scope: "item" | "folder", id: string) => void;
  /** IDs hidden for the active profile only (global library still contains them). */
  excludedContentIds?: string[];
  /** Installed-app catalog rows (name + shell icon path) for drag previews matching “Opens with”. */
  installedAppsCatalog?: { name: string; iconPath: string | null }[];
  compact?: boolean;
  /** When both set with `compact`, hides the local search field and uses this query. */
  sidebarSearchQuery?: string;
  onSidebarSearchQueryChange?: (query: string) => void;
}

const CONTENT_SIDEBAR_COMPACT_HELP =
  "Click a row to set path and Opens with. Use ⋯ on a row for Add to layout or Remove from library. Drag the content icon to place precisely on the canvas.";

const SIDEBAR_DRAG_BROWSER_NAMES = new Set(
  ["Chrome", "Firefox", "Safari", "Edge"].map((s) => s.toLowerCase()),
);

function resolveInstalledCatalogIconPath(
  catalog: { name: string; iconPath: string | null }[] | undefined,
  appName: string,
): string | null {
  if (!catalog?.length || !appName.trim()) return null;
  const t = appName.trim();
  const tl = t.toLowerCase();
  const byExact = catalog.find((a) => a.name.trim().toLowerCase() === tl);
  if (byExact?.iconPath) return byExact.iconPath;
  const byPartial = catalog.find((a) => {
    const al = a.name.trim().toLowerCase();
    return al.includes(tl) || tl.includes(al);
  });
  return byPartial?.iconPath ?? null;
}

function renderOpensWithDragPreview(
  defaultApp: string,
  label: string,
  catalog: { name: string; iconPath: string | null }[] | undefined,
) {
  const raster = safeIconSrc(
    resolveInstalledCatalogIconPath(catalog, defaultApp) ?? undefined,
  );
  const AppGlyph = getAppIcon(defaultApp);
  const BrowserGlyph = getBrowserIcon(defaultApp);
  const tl = defaultApp.trim().toLowerCase();
  const isLikelyBrowser =
    SIDEBAR_DRAG_BROWSER_NAMES.has(tl)
    || tl.includes("chrome")
    || tl.includes("firefox")
    || tl.includes("edge")
    || tl.includes("safari");
  return (
    <div className="flex max-w-[240px] items-center gap-2">
      {raster ? (
        <img src={raster} alt="" className="h-4 w-4 shrink-0 rounded object-contain" />
      ) : isLikelyBrowser ? (
        <BrowserGlyph
          className="h-4 w-4 shrink-0"
          style={{ color: getBrowserColor(defaultApp) }}
        />
      ) : (
        <AppGlyph
          className="h-4 w-4 shrink-0"
          style={{ color: getAppColor(defaultApp) }}
        />
      )}
      <span className="truncate font-medium text-white">{label}</span>
    </div>
  );
}

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
  onPlaceContentOnMonitor,
  onPlaceContentOnMinimized,
  onPlaceLibraryFolderOnMonitor,
  onPlaceLibraryFolderOnMinimized,
  onInspectLibrarySelection,
  openLibraryFolderId,
  onConsumedOpenLibraryFolder,
  externalContentItems,
  externalContentFolders,
  onPersistContentLibrary,
  onDeleteLibraryEntry,
  excludedContentIds,
  installedAppsCatalog,
  compact = false,
  sidebarSearchQuery,
  onSidebarSearchQueryChange,
}: ContentManagerProps) {
  const { push: pushLibrarySnackbar } = useFlowSnackbar();
  const [content, setContent] = useState<ContentItem[]>([]);
  const [folders, setFolders] = useState<ContentFolder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const sidebarSearchControlled =
    Boolean(compact)
    && typeof sidebarSearchQuery === "string"
    && typeof onSidebarSearchQueryChange === "function";
  const effectiveSearchQuery = sidebarSearchControlled
    ? sidebarSearchQuery
    : searchQuery;
  const [contentLibraryView, setContentLibraryView] =
    useState<FlowLibraryViewMode>("list");
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
  type ContentRowOverflowMenuState =
    | { scope: "item"; item: ContentItem; anchor: HTMLElement }
    | { scope: "folder"; folder: ContentFolder; anchor: HTMLElement };

  const [contentRowOverflowMenu, setContentRowOverflowMenu] =
    useState<ContentRowOverflowMenuState | null>(null);
  const [contentRowAddToSubmenu, setContentRowAddToSubmenu] = useState<{
    scope: "item" | "folder";
    id: string;
    anchor: HTMLElement;
  } | null>(null);
  const contentAddSubmenuCloseTimerRef = useRef<number | null>(null);
  const libraryHydratedRef = useRef(false);
  const lastExternalLibrarySigRef = useRef("");
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeContentRowMenus = useCallback(() => {
    if (contentAddSubmenuCloseTimerRef.current != null) {
      window.clearTimeout(contentAddSubmenuCloseTimerRef.current);
      contentAddSubmenuCloseTimerRef.current = null;
    }
    setContentRowAddToSubmenu(null);
    setContentRowOverflowMenu(null);
  }, []);

  const monitorsSortedForMenu = useMemo(() => {
    const list = [...(currentProfile?.monitors ?? [])] as {
      id: string;
      name?: string;
      systemName?: string | null;
      primary?: boolean;
    }[];
    list.sort((a, b) => {
      if (a.primary === b.primary) return 0;
      return a.primary ? -1 : 1;
    });
    return list;
  }, [currentProfile?.monitors]);

  const monitorDisplayLabelMap = useMemo(
    () =>
      buildMonitorDisplayLabelMap(
        monitorsSortedForMenu.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          systemName: m.systemName ?? null,
          primary: m.primary,
        })),
      ),
    [monitorsSortedForMenu],
  );

  useEffect(() => {
    if (externalContentItems == null || externalContentFolders == null) {
      libraryHydratedRef.current = false;
    }

    if (!currentProfile) {
      setContent([]);
      setFolders([]);
      setCurrentFolderId(null);
      lastExternalLibrarySigRef.current = "";
      return;
    }

    if (
      externalContentItems != null
      && externalContentFolders != null
    ) {
      const sig = [
        externalContentItems.length,
        externalContentFolders.length,
        externalContentItems
          .map(
            (i) =>
              `${i.id}:${i.defaultApp}:${i.type}:${i.path ?? ""}:${i.url ?? ""}:${i.name}`,
          )
          .join("|"),
        externalContentFolders
          .map(
            (f) =>
              `${f.id}:${f.defaultApp}:${f.name}:${f.diskPath ?? ""}:${(f.children || []).join(",")}`,
          )
          .join("|"),
      ].join("::");
      if (lastExternalLibrarySigRef.current !== sig) {
        lastExternalLibrarySigRef.current = sig;
        setContent(externalContentItems);
        setFolders(externalContentFolders);
      }
      libraryHydratedRef.current = true;
      setCurrentFolderId((prev) => {
        if (!prev) return null;
        return externalContentFolders.some((f) => f.id === prev) ? prev : null;
      });
      return;
    }

    lastExternalLibrarySigRef.current = "";
    const profileContent = Array.isArray(currentProfile.contentItems)
      ? currentProfile.contentItems
      : [];
    const profileFolders = Array.isArray(currentProfile.contentFolders)
      ? currentProfile.contentFolders
      : [];

    setContent(profileContent);
    setFolders(profileFolders);
    setCurrentFolderId(null);
  }, [currentProfile?.id, externalContentItems, externalContentFolders]);

  useEffect(() => {
    closeContentRowMenus();
  }, [currentProfile?.id, closeContentRowMenus]);

  useEffect(() => {
    if (!contentRowOverflowMenu) {
      setContentRowAddToSubmenu(null);
      return;
    }
    if (contentRowAddToSubmenu) {
      let oid: string;
      if (contentRowOverflowMenu.scope === "item") {
        oid = contentRowOverflowMenu.item.id;
      } else {
        oid = contentRowOverflowMenu.folder.id;
      }
      if (
        contentRowAddToSubmenu.id !== oid
        || contentRowAddToSubmenu.scope !== contentRowOverflowMenu.scope
      ) {
        setContentRowAddToSubmenu(null);
      }
    }
  }, [contentRowOverflowMenu, contentRowAddToSubmenu]);

  useEffect(() => {
    if (!openLibraryFolderId) return;
    setCurrentFolderId(openLibraryFolderId);
    onConsumedOpenLibraryFolder?.();
  }, [openLibraryFolderId, onConsumedOpenLibraryFolder]);

  useEffect(() => {
    if (!currentProfile?.id) return;

    if (onPersistContentLibrary) {
      if (!libraryHydratedRef.current) return;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        onPersistContentLibrary({ items: content, folders: folders });
      }, 350);
      return () => {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      };
    }

    if (!onUpdateProfile) return;
    onUpdateProfile(currentProfile.id, {
      contentItems: content,
      contentFolders: folders,
    });
  }, [content, folders, currentProfile?.id, onUpdateProfile, onPersistContentLibrary]);

  // Timer and state for click vs drag detection
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

    const excluded = new Set(excludedContentIds || []);
    displayFolders = displayFolders.filter((f) => !excluded.has(f.id));
    displayContent = displayContent.filter((i) => !excluded.has(i.id));

    console.log(`📊 Display results: ${displayFolders.length} folders, ${displayContent.length} items`);

    // Apply search filter
    if (effectiveSearchQuery) {
      const query = effectiveSearchQuery.toLowerCase();
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
    const t = e.target as HTMLElement;
    if (t.closest("[data-content-row-menu]")) {
      return;
    }

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
    restoreDocumentTextSelection();
  };

  const initiateDrag = (clientX: number, clientY: number) => {
    if (mouseStateRef.current.dragInitiated || !mouseStateRef.current.itemData) return;

    const item = mouseStateRef.current.itemData;
    mouseStateRef.current.dragInitiated = true;

    if (onDragStart) {
      onDragStart();
    }

    if (item.type === "folder") {
      const folder = item as ContentFolder;
      const dragData = {
        source: "sidebar" as const,
        type: "libraryFolder" as const,
        folder: { ...folder },
        name: folder.name,
        defaultApp: folder.defaultApp,
      };
      const preview = renderOpensWithDragPreview(
        folder.defaultApp,
        folder.name,
        installedAppsCatalog,
      );
      onCustomDragStart(
        dragData,
        "sidebar",
        "content",
        { x: clientX, y: clientY },
        preview,
      );
      document.removeEventListener("mousemove", handleMouseMoveForClickDetection);
      document.removeEventListener("mouseup", handleMouseUpForClickDetection);
      return;
    }

    const contentItem = item as ContentItem;

    const dragData = {
      source: "sidebar" as const,
      type: "content" as const,
      contentType: contentItem.type,
      contentId: contentItem.id,
      name: contentItem.name,
      url: contentItem.url,
      path: contentItem.path,
      fileType: contentItem.fileType,
      defaultApp: contentItem.defaultApp,
      isFolder: contentItem.isFolder,
      useDefaultApp: true,
      createNewApp: true,
      associatedApp: contentItem.defaultApp,
    };

    const preview = renderOpensWithDragPreview(
      contentItem.defaultApp,
      contentItem.name,
      installedAppsCatalog,
    );

    onCustomDragStart(
      dragData,
      "sidebar",
      "content",
      { x: clientX, y: clientY },
      preview,
    );

    document.removeEventListener("mousemove", handleMouseMoveForClickDetection);
    document.removeEventListener("mouseup", handleMouseUpForClickDetection);
  };

  const handleContentClick = (item: ContentItem | ContentFolder | null) => {
    if (!item) return;
    
    console.log('🎯 CONTENT CLICKED:', item.name, 'type:', item.type);
    
    if (item.type === 'folder') {
      if (compact && onInspectLibrarySelection) {
        onInspectLibrarySelection({
          kind: "folder",
          folder: item as ContentFolder,
        });
        return;
      }
      if (selectedType === 'all' || selectedType === 'folder') {
        console.log('📁 NAVIGATING INTO FOLDER:', item.id);
        setCurrentFolderId(item.id);
      }
    } else {
      const contentItem = item as ContentItem;
      if (compact && onInspectLibrarySelection) {
        onInspectLibrarySelection({ kind: "item", item: contentItem });
        return;
      }
      if (contentItem.type === 'link' && contentItem.url) {
        console.log('🔗 Opening link:', contentItem.url);
      } else if (contentItem.type === 'file' && contentItem.path) {
        console.log('📁 Opening file:', contentItem.path);
      }
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
    if (contentData.libraryDiskFolder && contentData.diskPath) {
      const folderId = `folder-${Date.now()}`;
      const newFolder: ContentFolder = {
        id: folderId,
        name: String(contentData.name || "Folder").trim() || "Folder",
        type: "folder",
        contentType: "mixed",
        children: [],
        defaultApp: contentData.defaultApp || "File Explorer",
        diskPath: String(contentData.diskPath).trim(),
        parentId: currentFolderId ?? undefined,
        isFavorite: false,
      };
      setFolders((prev) => [...prev, newFolder]);
      return;
    }

    const newItem: ContentItem = {
      id: `${contentData.type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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

  const stopContentRowPointer = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAddContentToMonitor = (item: ContentItem, monitorId: string) => {
    if (!onPlaceContentOnMonitor) return;
    onPlaceContentOnMonitor(monitorId, item);
    closeContentRowMenus();
  };

  const handleAddContentToMinimized = (item: ContentItem) => {
    if (!onPlaceContentOnMinimized) return;
    onPlaceContentOnMinimized(item);
    closeContentRowMenus();
  };

  const handleAddLibraryFolderToMonitor = (
    folder: ContentFolder,
    monitorId: string,
  ) => {
    if (!onPlaceLibraryFolderOnMonitor) return;
    onPlaceLibraryFolderOnMonitor(monitorId, folder);
    closeContentRowMenus();
  };

  const handleAddLibraryFolderToMinimized = (folder: ContentFolder) => {
    if (!onPlaceLibraryFolderOnMinimized) return;
    onPlaceLibraryFolderOnMinimized(folder);
    closeContentRowMenus();
  };

  /** Compact sidebar: ⋯ overflow (Add to + remove), matching Apps row menus. */
  const renderCompactLibraryOverflowMenu = (
    target:
      | { scope: "item"; item: ContentItem }
      | { scope: "folder"; folder: ContentFolder },
  ) => {
    if (!compact) return null;
    const scope = target.scope;
    const entity = scope === "item" ? target.item : target.folder;
    const name = entity.name;
    const id = entity.id;
    const canAddToLayout =
      scope === "item" ? Boolean(onPlaceContentOnMonitor) : Boolean(onPlaceLibraryFolderOnMonitor);

    if (!canAddToLayout && !onDeleteLibraryEntry) return null;

    let overflowOpen = false;
    if (contentRowOverflowMenu != null) {
      if (
        scope === "item"
        && contentRowOverflowMenu.scope === "item"
        && contentRowOverflowMenu.item.id === id
      ) {
        overflowOpen = true;
      }
      if (
        scope === "folder"
        && contentRowOverflowMenu.scope === "folder"
        && contentRowOverflowMenu.folder.id === id
      ) {
        overflowOpen = true;
      }
    }

    const submenuOpen =
      overflowOpen
      && contentRowAddToSubmenu != null
      && contentRowAddToSubmenu.scope === scope
      && contentRowAddToSubmenu.id === id;

    const menuStackId = `compact-content-${scope}-${id}`;

    return (
      <div
        data-content-row-menu
        className={`flex shrink-0 items-center gap-0 ${
          contentLibraryView === "grid"
            ? "justify-center self-center"
            : "self-center"
        }`}
        onMouseDown={stopContentRowPointer}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <FlowTooltip label={`More actions for ${name}`}>
            <button
              type="button"
              className="rounded-md p-1 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`More actions for ${name}`}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              onClick={(e) => {
                stopContentRowPointer(e);
                setAppDropdownOpen(null);
                if (contentAddSubmenuCloseTimerRef.current != null) {
                  window.clearTimeout(contentAddSubmenuCloseTimerRef.current);
                  contentAddSubmenuCloseTimerRef.current = null;
                }
                setContentRowAddToSubmenu(null);
                setContentRowOverflowMenu((prev) => {
                  let sameRowOpen = false;
                  if (prev != null) {
                    if (
                      scope === "item"
                      && prev.scope === "item"
                      && prev.item.id === id
                    ) {
                      sameRowOpen = true;
                    }
                    if (
                      scope === "folder"
                      && prev.scope === "folder"
                      && prev.folder.id === id
                    ) {
                      sameRowOpen = true;
                    }
                  }
                  if (sameRowOpen) {
                    return null;
                  }
                  if (scope === "item") {
                    return {
                      scope: "item",
                      item: target.item,
                      anchor: e.currentTarget as HTMLElement,
                    };
                  }
                  return {
                    scope: "folder",
                    folder: target.folder,
                    anchor: e.currentTarget as HTMLElement,
                  };
                });
              }}
            >
              <MoreVertical
                className="h-3.5 w-3.5"
                strokeWidth={2}
                aria-hidden
              />
            </button>
          </FlowTooltip>
          {overflowOpen && contentRowOverflowMenu ? (
            <SidebarOverlayMenu
              open
              anchorEl={contentRowOverflowMenu.anchor}
              menuStackId={menuStackId}
              onClose={() => {
                setContentRowAddToSubmenu(null);
                setContentRowOverflowMenu(null);
              }}
            >
              {canAddToLayout ? (
                <div className="px-1 py-0.5">
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={submenuOpen}
                    disabled={!currentProfile}
                    className="flow-menu-item w-full text-left text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={(e) => {
                      stopContentRowPointer(e);
                      setContentRowAddToSubmenu({
                        scope,
                        id,
                        anchor: e.currentTarget as HTMLElement,
                      });
                    }}
                    onMouseEnter={(e) => {
                      if (contentAddSubmenuCloseTimerRef.current != null) {
                        window.clearTimeout(contentAddSubmenuCloseTimerRef.current);
                        contentAddSubmenuCloseTimerRef.current = null;
                      }
                      setContentRowAddToSubmenu({
                        scope,
                        id,
                        anchor: e.currentTarget as HTMLElement,
                      });
                    }}
                    onMouseLeave={() => {
                      if (contentAddSubmenuCloseTimerRef.current != null) {
                        window.clearTimeout(contentAddSubmenuCloseTimerRef.current);
                      }
                      contentAddSubmenuCloseTimerRef.current = window.setTimeout(() => {
                        setContentRowAddToSubmenu(null);
                      }, 120);
                    }}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>Add to</span>
                      <span aria-hidden className="text-flow-text-muted">
                        ▸
                      </span>
                    </span>
                  </button>
                </div>
              ) : null}
              {submenuOpen && canAddToLayout && contentRowAddToSubmenu ? (
                <SidebarOverlayMenu
                  open
                  anchorEl={contentRowAddToSubmenu.anchor}
                  menuStackId={menuStackId}
                  onClose={() => setContentRowAddToSubmenu(null)}
                  unconstrainedHeight
                  placement="right-start"
                >
                  <div
                    className="px-1 py-0.5"
                    onMouseEnter={() => {
                      if (contentAddSubmenuCloseTimerRef.current != null) {
                        window.clearTimeout(contentAddSubmenuCloseTimerRef.current);
                        contentAddSubmenuCloseTimerRef.current = null;
                      }
                    }}
                    onMouseLeave={() => {
                      if (contentAddSubmenuCloseTimerRef.current != null) {
                        window.clearTimeout(contentAddSubmenuCloseTimerRef.current);
                      }
                      contentAddSubmenuCloseTimerRef.current = window.setTimeout(() => {
                        setContentRowAddToSubmenu(null);
                      }, 120);
                    }}
                  >
                    {monitorsSortedForMenu.length ? (
                      monitorsSortedForMenu.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="menuitem"
                          disabled={
                            !currentProfile
                            || (scope === "item" ? !onPlaceContentOnMonitor : !onPlaceLibraryFolderOnMonitor)
                          }
                          className="flow-menu-item min-w-0 text-left text-xs disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={(e) => {
                            stopContentRowPointer(e);
                            if (scope === "item") {
                              handleAddContentToMonitor(target.item, m.id);
                            } else {
                              handleAddLibraryFolderToMonitor(target.folder, m.id);
                            }
                          }}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate">
                              {monitorDisplayLabelMap.get(m.id)?.headline
                                ?? (m.name || m.id)}
                            </span>
                            <span className="truncate text-[10px] leading-snug text-flow-text-muted">
                              {monitorDisplayLabelMap.get(m.id)?.detail
                                ?? m.name
                                ?? m.id}
                            </span>
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-[11px] text-flow-text-muted">
                        No monitors in this profile.
                      </div>
                    )}
                    <div
                      className="my-0.5 h-px bg-flow-border/50"
                      role="separator"
                      aria-hidden
                    />
                    <FlowTooltip
                      label={
                        !currentProfile ? "Select a profile first" : undefined
                      }
                    >
                      <span className="flex w-full">
                        <button
                          type="button"
                          role="menuitem"
                          disabled={
                            !currentProfile
                            || (scope === "item"
                              ? !onPlaceContentOnMinimized
                              : !onPlaceLibraryFolderOnMinimized)
                          }
                          className="flow-menu-item w-full text-left text-xs disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={(e) => {
                            stopContentRowPointer(e);
                            if (scope === "item") {
                              handleAddContentToMinimized(target.item);
                            } else {
                              handleAddLibraryFolderToMinimized(target.folder);
                            }
                          }}
                        >
                          Minimized row
                        </button>
                      </span>
                    </FlowTooltip>
                  </div>
                </SidebarOverlayMenu>
              ) : null}
              {onDeleteLibraryEntry ? (
                <>
                  {canAddToLayout ? (
                    <div
                      className="my-1 h-px bg-flow-border/60"
                      role="separator"
                      aria-hidden
                    />
                  ) : null}
                  <div className="bg-flow-bg-tertiary/25 px-1 py-0.5">
                    <button
                      type="button"
                      role="menuitem"
                      className="flow-menu-item w-full text-left text-xs text-flow-accent-red hover:text-flow-accent-red"
                      onClick={(e) => {
                        stopContentRowPointer(e);
                        onDeleteLibraryEntry(scope, id);
                        pushLibrarySnackbar(`Removed "${name}" from Content library.`);
                        closeContentRowMenus();
                      }}
                    >
                      Remove from content library
                    </button>
                  </div>
                </>
              ) : null}
            </SidebarOverlayMenu>
          ) : null}
        </div>
      </div>
    );
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

    if (compact) {
      const isGrid = contentLibraryView === "grid";
      const tight = contentLibraryView === "compact";
      const rowPad = tight ? "p-2" : "p-3";
      const titleSz = tight ? "text-xs" : "text-sm";
      return (
        <div key={folder.id} className={baseClasses}>
          <div className="flow-card-quiet min-w-0 rounded-lg">
            <div
              className={`flex cursor-grab gap-3 ${rowPad} active:cursor-grabbing ${
                isGrid
                  ? "min-w-0 flex-col items-center text-center"
                  : "items-center"
              }`}
              onMouseDown={(e) => handleMouseDown(e, folder)}
              onMouseEnter={() => setHoveredItem(folder.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-bg-tertiary/50">
                <Folder className="h-4 w-4 text-amber-400" aria-hidden />
              </div>
              <div className={`min-w-0 ${isGrid ? "w-full" : "flex-1"}`}>
                <h3
                  className={`truncate font-medium text-flow-text-primary ${titleSz}`}
                >
                  {folder.name}
                </h3>
              </div>
              {renderCompactLibraryOverflowMenu({ scope: "folder", folder })}
            </div>
          </div>
        </div>
      );
    }
    
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
                      <div className="scrollbar-elegant max-h-40 overflow-y-auto">
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
                      <div className="scrollbar-elegant max-h-40 overflow-y-auto">
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
              <FlowTooltip
                label={
                  folder.isFavorite ? "Remove from favorites" : "Add to favorites"
                }
              >
                <button
                  type="button"
                  onClick={(e) => handleToggleFavorite(e, folder.id, true)}
                  className={`p-1.5 rounded transition-colors ${
                    folder.isFavorite 
                      ? 'text-red-400 hover:text-red-300' 
                      : 'text-flow-text-muted hover:text-red-400'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${folder.isFavorite ? 'fill-current' : ''}`} />
                </button>
              </FlowTooltip>
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
                    <div className="scrollbar-elegant max-h-40 overflow-y-auto">
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
            <FlowTooltip
              label={
                folder.isFavorite ? "Remove from favorites" : "Add to favorites"
              }
            >
              <button
                type="button"
                onClick={(e) => handleToggleFavorite(e, folder.id, true)}
                className={`p-1 rounded transition-colors ${
                  folder.isFavorite 
                    ? 'text-red-400 hover:text-red-300' 
                    : 'text-flow-text-muted hover:text-red-400'
                }`}
              >
                <Heart className={`w-3 h-3 ${folder.isFavorite ? 'fill-current' : ''}`} />
              </button>
            </FlowTooltip>
            <ChevronRight className="w-3 h-3 text-flow-text-muted" />
          </div>
        </div>
      </div>
    );
  };

  // Render content item based on view mode
  const renderContentItem = (item: ContentItem) => {
    const baseClasses = "group relative cursor-grab active:cursor-grabbing";

    if (compact) {
      const isGrid = contentLibraryView === "grid";
      const tight = contentLibraryView === "compact";
      const rowPad = tight ? "p-2" : "p-3";
      const titleSz = tight ? "text-xs" : "text-sm";
      return (
        <div key={item.id} className={baseClasses}>
          <div className="flow-card-quiet min-w-0 rounded-lg">
            <div
              className={`flex cursor-grab gap-3 ${rowPad} active:cursor-grabbing ${
                isGrid
                  ? "min-w-0 flex-col items-center text-center"
                  : "items-center"
              }`}
              onMouseDown={(e) => handleMouseDown(e, item)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-flow-bg-tertiary/50">
                {getContentIcon(item)}
              </div>
              <div className={`min-w-0 ${isGrid ? "w-full" : "flex-1"}`}>
                <h3
                  className={`truncate font-medium text-flow-text-primary ${titleSz}`}
                >
                  {item.name}
                </h3>
              </div>
              {renderCompactLibraryOverflowMenu({ scope: "item", item })}
            </div>
          </div>
        </div>
      );
    }
    
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
                      <div className="scrollbar-elegant max-h-40 overflow-y-auto">
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
                      <div className="scrollbar-elegant max-h-40 overflow-y-auto">
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
                    <div className="scrollbar-elegant max-h-40 overflow-y-auto">
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
        </div>

        {hoveredItem === item.id && (
          <div className="absolute -top-1 -right-1 px-2 py-1 bg-flow-accent-blue/20 border border-flow-accent-blue/30 rounded text-xs text-flow-accent-blue backdrop-blur-sm">
            Drag to app or monitor
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    return () => {
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

  const libraryTypeCounts = useMemo(
    () => ({
      all: content.length + folders.length,
      link: content.filter((i) => i.type === "link").length,
      file: content.filter((i) => i.type === "file").length,
      folder: folders.length,
    }),
    [content, folders],
  );

  useEffect(() => {
    if (selectedType === "link" && libraryTypeCounts.link === 0) {
      setSelectedType("all");
    }
    if (selectedType === "file" && libraryTypeCounts.file === 0) {
      setSelectedType("all");
    }
    if (selectedType === "folder" && libraryTypeCounts.folder === 0) {
      setSelectedType("all");
    }
  }, [
    selectedType,
    libraryTypeCounts.link,
    libraryTypeCounts.file,
    libraryTypeCounts.folder,
  ]);

  const { folders: displayFolders, content: displayContent } = getDisplayItems();
  const breadcrumbs = getCurrentBreadcrumbs();

  // Get current folder info for context
  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;

  return (
    <div
      className={
        compact
          ? "flex min-h-0 min-w-0 flex-1 flex-col"
          : "p-4"
      }
    >
      {compact ? (
        <FlowLibraryToolbar
          toolbarStart={
            <FlowTooltip label={CONTENT_SIDEBAR_COMPACT_HELP}>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-flow-text-muted transition-colors hover:bg-white/[0.06] hover:text-flow-text-primary"
                aria-label={CONTENT_SIDEBAR_COMPACT_HELP}
              >
                <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              </button>
            </FlowTooltip>
          }
          toolbarEnd={
            <div className="relative min-w-0">
              <FlowTooltip
                label={
                  !currentProfile
                    ? "Select a profile first"
                    : "Add link or files"
                }
              >
                <span className="inline-flex">
                  <button
                    type="button"
                    disabled={!currentProfile}
                    onClick={() => {
                      if (!currentProfile) return;
                      setShowAddMenu(!showAddMenu);
                    }}
                    className={`${FLOW_LIBRARY_TOOLBAR_ADD_PILL_CLASS}${
                      !currentProfile ? " cursor-not-allowed opacity-50" : ""
                    }`}
                    aria-expanded={showAddMenu}
                    aria-haspopup="menu"
                    aria-label={
                      !currentProfile
                        ? "Select a profile first"
                        : "Add link or files"
                    }
                  >
                    <Plus
                      className="h-3.5 w-3.5 shrink-0"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 opacity-80 ${showAddMenu ? "rotate-180" : ""} transition-transform duration-150`}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                </span>
              </FlowTooltip>

              {showAddMenu ? (
                <div className="flow-menu-panel flow-menu-panel-enter absolute right-0 top-full z-[30000] mt-1 w-40 min-w-0 py-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAddModalType("link");
                      setShowAddModal(true);
                      setShowAddMenu(false);
                    }}
                    className="flow-menu-item text-xs"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    Add Link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddModalType("file");
                      setShowAddModal(true);
                      setShowAddMenu(false);
                    }}
                    className="flow-menu-item text-xs"
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    Add files…
                  </button>
                </div>
              ) : null}
            </div>
          }
          filterChips={[
            {
              id: "all",
              label: "All",
              count: libraryTypeCounts.all,
            },
            {
              id: "link",
              label: "Links",
              count: libraryTypeCounts.link,
              disabled: libraryTypeCounts.link === 0,
            },
            {
              id: "file",
              label: "Files",
              count: libraryTypeCounts.file,
              disabled: libraryTypeCounts.file === 0,
            },
            {
              id: "folder",
              label: "Folders",
              count: libraryTypeCounts.folder,
              disabled: libraryTypeCounts.folder === 0,
            },
          ]}
          selectedFilterId={selectedType}
          onSelectFilter={(id) =>
            setSelectedType(id as "all" | "link" | "file" | "folder")
          }
          searchValue={effectiveSearchQuery}
          onSearchChange={
            sidebarSearchControlled
              ? onSidebarSearchQueryChange!
              : setSearchQuery
          }
          searchPlaceholder="Search content…"
          searchAriaLabel="Search content library"
          sortOptions={[
            { id: "name", label: "Name" },
            { id: "lastUsed", label: "Recent" },
            { id: "dateAdded", label: "Added" },
            { id: "type", label: "Type" },
            { id: "favorites", label: "Favorites" },
          ]}
          selectedSortId={sortBy}
          onSelectSort={(id) => setSortBy(id as SortOption)}
          viewMode={contentLibraryView}
          onViewModeChange={setContentLibraryView}
          showViewModes
        />
      ) : (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <Link
              className="h-4 w-4 shrink-0 text-flow-text-muted"
              strokeWidth={1.75}
              aria-hidden
            />
            <h2 className="text-sm font-medium uppercase tracking-wide text-flow-text-secondary">
              Content
            </h2>

            <div className="relative">
              <button
                type="button"
                onMouseEnter={() => setShowHelpTooltip(true)}
                onMouseLeave={() => setShowHelpTooltip(false)}
                className="inline-flex items-center justify-center rounded p-1 text-flow-text-muted transition-colors hover:text-flow-text-secondary"
                aria-label="Show help"
              >
                <Info className="h-3 w-3" />
              </button>

              {showHelpTooltip ? (
                <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-flow-border bg-flow-surface-elevated p-3 shadow-lg">
                  <div className="mb-2 text-xs font-medium text-flow-text-secondary">
                    Actions:
                  </div>
                  <div className="space-y-1 text-xs text-flow-text-muted">
                    {getHelpTooltipContent().map((line, index) => (
                      <div key={index}>{line}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {currentFolder && selectedType === "all" ? (
              <span className="text-xs text-flow-text-muted">
                in {currentFolder.name}
              </span>
            ) : null}
            {selectedType === "link" || selectedType === "file" ? (
              <span className="text-xs text-flow-text-muted">
                {selectedType}s from all folders
              </span>
            ) : null}
          </div>
          <div className="relative shrink-0">
            <FlowTooltip
              label={!currentProfile ? "Select a profile first" : "Add Content"}
            >
              <span className="inline-flex">
                <button
                  type="button"
                  disabled={!currentProfile}
                  onClick={() => {
                    if (!currentProfile) return;
                    setShowAddMenu(!showAddMenu);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-flow-text-secondary transition-colors hover:bg-flow-surface hover:text-flow-text-primary"
                  aria-expanded={showAddMenu}
                  aria-haspopup="menu"
                >
                  <Plus
                    className="h-3 w-3 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  Add
                  <ChevronDown className="h-3 w-3" aria-hidden />
                </button>
              </span>
            </FlowTooltip>

            {showAddMenu ? (
              <div className="flow-menu-panel flow-menu-panel-enter absolute right-0 top-full z-[30000] mt-1 w-40 min-w-0 py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setAddModalType("link");
                    setShowAddModal(true);
                    setShowAddMenu(false);
                  }}
                  className="flow-menu-item text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  Add Link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddModalType("file");
                    setShowAddModal(true);
                    setShowAddMenu(false);
                  }}
                  className="flow-menu-item text-xs"
                >
                  <Upload className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  Add files…
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {!compact ? (
        <div className="mb-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 transform text-flow-text-muted" />
            <input
              type="text"
              placeholder="Search content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-flow-border bg-flow-surface py-2 pl-9 pr-3 text-sm text-flow-text-primary placeholder-flow-text-muted transition-all duration-200 focus:border-flow-accent-blue/50 focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50"
            />
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <FlowTooltip label="Filter by content type">
                <select
                  value={selectedType}
                  onChange={(e) =>
                    setSelectedType(
                      e.target.value as "all" | "link" | "file" | "folder",
                    )
                  }
                  className={flowDropdownNativeSelectClass}
                >
                  <option value="all">All Types</option>
                  <option value="link">Links</option>
                  <option value="file">Files</option>
                  <option value="folder">Folders</option>
                </select>
              </FlowTooltip>

              <FlowTooltip label="Sort content by">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className={flowDropdownNativeSelectClass}
                >
                  <option value="name">Name</option>
                  <option value="lastUsed">Recent</option>
                  <option value="dateAdded">Added</option>
                  <option value="type">Type</option>
                  <option value="favorites">Favorites</option>
                </select>
              </FlowTooltip>
            </div>

            <div className="flex items-center gap-2">
              <FlowTooltip label="Change view mode">
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as ViewMode)}
                  className={`min-w-0 flex-1 ${flowDropdownNativeSelectClass}`}
                >
                  <option value="normal">Normal</option>
                  <option value="detailed">Detailed</option>
                  <option value="simplified">Compact</option>
                </select>
              </FlowTooltip>

              <FlowTooltip
                label={
                  showFavoritesOnly ? "Show all content" : "Show favorites only"
                }
              >
                <button
                  type="button"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs transition-colors ${
                    showFavoritesOnly
                      ? "border border-flow-accent-blue/30 bg-flow-accent-blue/20 text-flow-accent-blue"
                      : "border border-flow-border bg-flow-surface text-flow-text-secondary hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary"
                  }`}
                >
                  <Heart
                    className={`h-3 w-3 ${showFavoritesOnly ? "fill-current" : ""}`}
                  />
                  <span className="whitespace-nowrap">
                    {showFavoritesOnly ? "Favs" : "All"}
                  </span>
                </button>
              </FlowTooltip>
            </div>
          </div>
        </div>
      ) : null}

      {/* Breadcrumbs - Moved to appear under filters */}
      {breadcrumbs.length > 1 && selectedType === 'all' && (
        <div
          className={`flex items-center gap-1 border border-flow-border bg-flow-surface p-2 rounded-lg ${
            compact ? "mx-3 mb-3 shrink-0" : "mb-4"
          }`}
        >
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



      {/* Content list: compact = fill sidebar remainder, scroll only when rows overflow; non-compact = capped height */}
      <div
        className={
          compact
            ? "scrollbar-elegant min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pl-3 pr-0 pt-3 pb-3"
            : "scrollbar-elegant max-h-[60vh] overflow-x-hidden overflow-y-auto"
        }
      >
        <div
          className={
            compact
              ? contentLibraryView === "grid"
                ? "grid grid-cols-2 gap-2 pr-2.5"
                : contentLibraryView === "compact"
                  ? "space-y-1 pr-2.5"
                  : "space-y-2 pr-2.5"
              : `${viewMode === "simplified" ? "space-y-1" : "space-y-2"}`
          }
        >
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
              {effectiveSearchQuery || showFavoritesOnly 
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
      </div>

      {/* Add Content Modal */}
      <AddContentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        type={addModalType}
        currentFolder={currentFolder?.name}
        onAddContent={handleAddContent}
        onNotify={pushLibrarySnackbar}
      />
    </div>
  );
}