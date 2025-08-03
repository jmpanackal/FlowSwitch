import { useState, useRef } from "react";
import { FileIcon, getFileTypeColor } from "./FileIcon";
import { AppSettings } from "./AppSettings";
import { 
  Settings, 
  X, 
  Minimize2, 
  Maximize2,
  File,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  MoreHorizontal
} from "lucide-react";

interface FileWindowProps {
  file: any;
  isEditMode?: boolean;
  onUpdate?: (updates: any) => void;
  onRemove?: () => void;
  onMinimize?: () => void;
  onCustomDragStart?: (data: any, sourceType: string, sourceId: string, startPos: { x: number; y: number }) => void;
  sourceMonitorId?: string;
  fileIndex?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function FileWindow({ 
  file, 
  isEditMode = false, 
  onUpdate, 
  onRemove, 
  onMinimize,
  onCustomDragStart,
  sourceMonitorId,
  fileIndex,
  style = {},
  className = ""
}: FileWindowProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  const fileColor = getFileTypeColor(file.type);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditMode || !onCustomDragStart || showSettings) return;
    
    e.preventDefault();
    const startPos = { x: e.clientX, y: e.clientY };
    
    const dragData = {
      source: 'monitor',
      type: 'file',
      sourceMonitorId,
      fileIndex,
      name: file.name,
      path: file.path,
      fileType: file.type,
      fileIcon: FileIcon,
      fileColor: fileColor,
      associatedApp: file.associatedApp,
      useDefaultApp: file.useDefaultApp,
      isFolder: file.isFolder
    };
    
    onCustomDragStart(dragData, 'monitor', sourceMonitorId || '', startPos);
  };

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSettings(true);
  };

  const handleMinimizeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMinimize?.();
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.();
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const truncateFileName = (name: string, maxLength: number = 15) => {
    if (name.length <= maxLength) return name;
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const nameWithoutExt = ext ? name.slice(0, -(ext.length + 1)) : name;
    const truncated = nameWithoutExt.slice(0, maxLength - (ext ? ext.length + 4 : 3)) + '...';
    return ext ? `${truncated}.${ext}` : truncated;
  };

  return (
    <>
      <div
        ref={windowRef}
        className={`absolute select-none group ${className} ${
          isEditMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        }`}
        style={style}
        onMouseDown={handleMouseDown}
        title={`${file.name}\n${file.path}\nOpens with: ${file.associatedApp}`}
      >
        {/* File Window */}
        <div 
          className="relative w-full h-full bg-flow-surface border border-flow-border rounded-lg shadow-sm hover:shadow-md hover:border-flow-border-accent transition-all duration-200 overflow-hidden"
          style={{
            borderColor: isEditMode ? `${fileColor}40` : undefined,
            backgroundColor: `${fileColor}08`
          }}
        >
          {/* Header with Controls */}
          {isEditMode && (
            <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {onMinimize && (
                <button
                  onClick={handleMinimizeClick}
                  className="w-5 h-5 bg-flow-surface border border-flow-border rounded flex items-center justify-center text-flow-text-muted hover:text-flow-text-primary hover:bg-flow-surface-elevated transition-colors"
                  title="Minimize file"
                >
                  <Minimize2 className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={handleSettingsClick}
                className="w-5 h-5 bg-flow-surface border border-flow-border rounded flex items-center justify-center text-flow-text-muted hover:text-flow-text-primary hover:bg-flow-surface-elevated transition-colors"
                title="File settings"
              >
                <Settings className="w-3 h-3" />
              </button>
              {onRemove && (
                <button
                  onClick={handleRemoveClick}
                  className="w-5 h-5 bg-flow-surface border border-flow-border rounded flex items-center justify-center text-flow-text-muted hover:text-flow-accent-red hover:bg-flow-accent-red/20 transition-colors"
                  title="Remove file"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* File Content */}
          <div className="flex flex-col items-center justify-center h-full p-3 text-center">
            {/* File Icon */}
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 border border-white/10"
              style={{ backgroundColor: `${fileColor}20`, borderColor: `${fileColor}30` }}
            >
              {file.isFolder ? (
                isExpanded ? (
                  <FolderOpen className="w-5 h-5" style={{ color: fileColor }} />
                ) : (
                  <Folder className="w-5 h-5" style={{ color: fileColor }} />
                )
              ) : (
                <FileIcon type={file.type} className="w-5 h-5" />
              )}
            </div>

            {/* File Name */}
            <div className="text-xs font-medium text-flow-text-primary leading-tight">
              {truncateFileName(file.name)}
            </div>

            {/* Associated App Badge */}
            <div 
              className="mt-1 px-1.5 py-0.5 rounded text-xs border"
              style={{ 
                backgroundColor: `${fileColor}15`, 
                color: fileColor,
                borderColor: `${fileColor}30`
              }}
            >
              {file.associatedApp}
            </div>

            {/* Folder Expansion Button */}
            {file.isFolder && file.files && file.files.length > 0 && (
              <button
                onClick={handleExpandClick}
                className="mt-1 p-1 text-flow-text-muted hover:text-flow-text-primary transition-colors"
                title={`${isExpanded ? 'Collapse' : 'Expand'} folder`}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            )}
          </div>

          {/* Expanded Folder Contents */}
          {file.isFolder && isExpanded && file.files && (
            <div className="absolute top-full left-0 right-0 bg-flow-surface border border-flow-border rounded-lg shadow-lg mt-1 p-2 z-20 max-h-32 overflow-y-auto">
              <div className="space-y-1">
                {file.files.slice(0, 5).map((subFile: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <FileIcon type={subFile.type} className="w-3 h-3" />
                    <span className="text-flow-text-secondary truncate flex-1">{subFile.name}</span>
                    <span className="text-flow-text-muted">{subFile.size}</span>
                  </div>
                ))}
                {file.files.length > 5 && (
                  <div className="text-flow-text-muted text-xs text-center py-1">
                    +{file.files.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* File Type Badge */}
          {!file.isFolder && (
            <div className="absolute bottom-1 left-1 px-1 py-0.5 bg-flow-surface/80 border border-flow-border/50 rounded text-xs text-flow-text-muted">
              {file.type}
            </div>
          )}

          {/* Multi-file Group Indicator */}
          {file.isFolder && file.files && file.files.length > 1 && (
            <div className="absolute top-1 left-1 px-1 py-0.5 bg-flow-surface/80 border border-flow-border/50 rounded text-xs text-flow-text-muted">
              {file.files.length}
            </div>
          )}
        </div>
      </div>

      {/* File Settings Modal */}
      {showSettings && (
        <AppSettings
          app={{
            ...file,
            name: file.name,
            icon: file.isFolder ? Folder : File,
            color: fileColor,
            volume: 0,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false
          }}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          onSave={(updates) => {
            // Map app settings back to file settings
            const fileUpdates = {
              name: updates.name,
              associatedApp: updates.associatedApp,
              useDefaultApp: updates.useDefaultApp,
              launchDelay: updates.launchDelay,
              windowSize: updates.windowSize,
              customDimensions: updates.customDimensions
            };
            onUpdate?.(fileUpdates);
            setShowSettings(false);
          }}
          isFile={true}
          filePath={file.path}
          fileType={file.type}
        />
      )}
    </>
  );
}