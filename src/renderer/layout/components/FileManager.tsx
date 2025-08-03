import { useState } from "react";
import { FileIcon } from "./FileIcon";
import { AddFileModal } from "./AddFileModal";
import { 
  Plus, 
  FolderOpen, 
  Folder, 
  ChevronDown, 
  ChevronRight,
  Search,
  Filter,
  File,
  FileText,
  Code,
  Database,
  Image,
  Music,
  Video,
  Archive
} from "lucide-react";

interface FileManagerProps {
  profiles: any[];
  currentProfile: any;
  onUpdateProfile: (profileId: string, updates: any) => void;
  onAddFile: (monitorId: string, newFile: any) => void;
  onAddFileToMinimized: (newFile: any) => void;
  onDragStart: () => void;
  onCustomDragStart: (data: any, sourceType: string, sourceId: string, startPos: { x: number; y: number }, preview?: React.ReactNode) => void;
  compact?: boolean;
}

const fileTypeIcons = {
  'text': FileText,
  'document': FileText,
  'code': Code,
  'script': Code,
  'sql': Database,
  'markdown': FileText,
  'config': Code,
  'log': FileText,
  'image': Image,
  'photo': Image,
  'audio': Music,
  'video': Video,
  'archive': Archive,
  'zip': Archive,
  'folder': Folder,
  'default': File
};

const fileTypeColors = {
  'text': '#64748B',
  'document': '#3B82F6',
  'code': '#10B981',
  'script': '#8B5CF6',
  'sql': '#F59E0B',
  'markdown': '#6366F1',
  'config': '#EF4444',
  'log': '#64748B',
  'image': '#EC4899',
  'photo': '#EC4899',
  'audio': '#06B6D4',
  'video': '#8B5CF6',
  'archive': '#F59E0B',
  'zip': '#F59E0B',
  'folder': '#3B82F6',
  'default': '#64748B'
};

const commonApps = [
  { name: 'VS Code', types: ['code', 'script', 'text', 'markdown', 'config'], icon: Code, color: '#007ACC' },
  { name: 'Notepad++', types: ['text', 'code', 'config', 'log'], icon: FileText, color: '#90EE90' },
  { name: 'SSMS', types: ['sql'], icon: Database, color: '#CC2927' },
  { name: 'Explorer', types: ['folder'], icon: FolderOpen, color: '#FFD700' },
  { name: 'Photos', types: ['image', 'photo'], icon: Image, color: '#4A90E2' },
  { name: 'VLC', types: ['video', 'audio'], icon: Video, color: '#FF8800' },
  { name: 'Terminal', types: ['script'], icon: Code, color: '#000000' }
];

export function FileManager({ 
  profiles, 
  currentProfile,
  onUpdateProfile,
  onAddFile,
  onAddFileToMinimized,
  onDragStart,
  onCustomDragStart,
  compact = false 
}: FileManagerProps) {
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const files = currentProfile?.files || [];

  const filteredFiles = files.filter((file: any) => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         file.path.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || file.type === filterType || 
                         (filterType === "folder" && file.isFolder);
    return matchesSearch && matchesFilter;
  });

  const handleFileMouseDown = (e: React.MouseEvent, file: any) => {
    e.preventDefault();
    onDragStart();
    
    const startPos = { x: e.clientX, y: e.clientY };
    
    // Get file type icon and color
    const FileTypeIcon = fileTypeIcons[file.type as keyof typeof fileTypeIcons] || fileTypeIcons.default;
    const fileColor = fileTypeColors[file.type as keyof typeof fileTypeColors] || fileTypeColors.default;
    
    // Get associated app info
    const associatedApp = commonApps.find(app => app.name === file.associatedApp);
    
    const dragData = {
      source: 'sidebar',
      type: 'file',
      name: file.name,
      path: file.path,
      fileType: file.type,
      fileIcon: FileTypeIcon,
      fileColor: fileColor,
      associatedApp: file.associatedApp,
      useDefaultApp: file.useDefaultApp,
      isFolder: file.isFolder,
      files: file.files || []
    };
    
    console.log('📁 FILE DRAG START:', dragData);
    
    onCustomDragStart(dragData, 'sidebar', 'files', startPos);
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const updateFileSettings = (fileId: string, updates: any) => {
    if (!currentProfile) return;
    
    const updatedFiles = files.map((file: any) => 
      file.id === fileId ? { ...file, ...updates } : file
    );
    
    onUpdateProfile(currentProfile.id, { files: updatedFiles });
  };

  const removeFile = (fileId: string) => {
    if (!currentProfile) return;
    
    const updatedFiles = files.filter((file: any) => file.id !== fileId);
    onUpdateProfile(currentProfile.id, { 
      files: updatedFiles,
      fileCount: Math.max(0, (currentProfile.fileCount || 0) - 1)
    });
  };

  const getAssociatedAppIcon = (appName: string) => {
    const app = commonApps.find(a => a.name === appName);
    return app?.icon || Code;
  };

  const getAssociatedAppColor = (appName: string) => {
    const app = commonApps.find(a => a.name === appName);
    return app?.color || '#64748B';
  };

  const fileTypes = Array.from(new Set(files.map((f: any) => f.type))).filter(Boolean);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-flow-text-secondary uppercase tracking-wide">Files</h2>
        <button 
          onClick={() => setShowAddFileModal(true)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>

      {/* Search and Filter */}
      <div className="space-y-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-flow-text-muted" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
          />
        </div>
        
        {fileTypes.length > 0 && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
          >
            <option value="all">All types</option>
            <option value="folder">Folders</option>
            {fileTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        )}
      </div>

      {files.length === 0 ? (
        <div className="text-center py-8">
          <File className="w-8 h-8 text-flow-text-muted mx-auto mb-2" />
          <p className="text-sm text-flow-text-muted mb-3">No files added yet</p>
          <button
            onClick={() => setShowAddFileModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-flow-accent-blue text-flow-text-primary rounded-lg text-sm hover:bg-flow-accent-blue-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add First File
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredFiles.map((file: any, index: number) => {
            const FileTypeIcon = fileTypeIcons[file.type as keyof typeof fileTypeIcons] || fileTypeIcons.default;
            const fileColor = fileTypeColors[file.type as keyof typeof fileTypeColors] || fileTypeColors.default;
            const AssociatedAppIcon = getAssociatedAppIcon(file.associatedApp);
            const appColor = getAssociatedAppColor(file.associatedApp);
            const isExpanded = expandedFolders.has(file.id);

            return (
              <div key={file.id} className="group">
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border border-transparent hover:border-flow-border-accent hover:bg-flow-surface transition-all duration-200 cursor-grab active:cursor-grabbing"
                  onMouseDown={(e) => handleFileMouseDown(e, file)}
                >
                  {/* File Type Icon */}
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/10"
                    style={{ backgroundColor: `${fileColor}20`, borderColor: `${fileColor}30` }}
                  >
                    <FileTypeIcon 
                      className="w-4 h-4" 
                      style={{ color: fileColor }}
                    />
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-flow-text-primary truncate">
                        {file.name}
                      </span>
                      {file.isFolder && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFolder(file.id);
                          }}
                          className="p-0.5 text-flow-text-muted hover:text-flow-text-secondary"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 mt-1">
                      {/* Associated App */}
                      <div 
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                        style={{ 
                          backgroundColor: `${appColor}20`, 
                          color: appColor,
                          border: `1px solid ${appColor}30`
                        }}
                      >
                        <AssociatedAppIcon className="w-3 h-3" />
                        <span>{file.associatedApp}</span>
                      </div>
                      
                      {/* File Count for Folders */}
                      {file.isFolder && file.files && (
                        <span className="text-xs text-flow-text-muted">
                          {file.files.length} files
                        </span>
                      )}
                    </div>
                    
                    <div className="text-xs text-flow-text-muted truncate mt-0.5">
                      {file.path}
                    </div>
                  </div>

                  {/* File type badge */}
                  <div className="px-2 py-1 bg-flow-surface border border-flow-border rounded text-xs text-flow-text-muted">
                    {file.isFolder ? 'folder' : file.type}
                  </div>
                </div>

                {/* Expanded Folder Contents */}
                {file.isFolder && isExpanded && file.files && file.files.length > 0 && (
                  <div className="ml-6 mt-1 space-y-1">
                    {file.files.slice(0, 5).map((subFile: any, subIndex: number) => {
                      const SubFileIcon = fileTypeIcons[subFile.type as keyof typeof fileTypeIcons] || fileTypeIcons.default;
                      const subFileColor = fileTypeColors[subFile.type as keyof typeof fileTypeColors] || fileTypeColors.default;
                      
                      return (
                        <div 
                          key={subIndex}
                          className="flex items-center gap-2 p-2 rounded border border-flow-border/50 bg-flow-surface/50 text-xs"
                        >
                          <SubFileIcon 
                            className="w-3 h-3" 
                            style={{ color: subFileColor }}
                          />
                          <span className="text-flow-text-secondary truncate">{subFile.name}</span>
                          <span className="text-flow-text-muted">{subFile.size}</span>
                        </div>
                      );
                    })}
                    {file.files.length > 5 && (
                      <div className="text-xs text-flow-text-muted text-center py-1">
                        +{file.files.length - 5} more files
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {searchTerm && filteredFiles.length === 0 && (
        <div className="text-center py-6">
          <Search className="w-6 h-6 text-flow-text-muted mx-auto mb-2" />
          <p className="text-sm text-flow-text-muted">No files match your search</p>
        </div>
      )}

      <AddFileModal
        isOpen={showAddFileModal}
        onClose={() => setShowAddFileModal(false)}
        onAddFile={(fileData) => {
          const newFile = {
            id: `file-${Date.now()}`,
            ...fileData
          };
          
          const updatedFiles = [...files, newFile];
          onUpdateProfile(currentProfile.id, { 
            files: updatedFiles,
            fileCount: (currentProfile.fileCount || 0) + 1
          });
          setShowAddFileModal(false);
        }}
        commonApps={commonApps}
      />
    </div>
  );
}