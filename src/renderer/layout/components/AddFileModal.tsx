import { useState } from "react";
import { FileIcon, getFileTypeColor } from "./FileIcon";
import { 
  Plus, 
  X, 
  File, 
  Folder, 
  FolderOpen,
  Code,
  Database,
  FileText,
  Image,
  Music,
  Video,
  Settings,
  Terminal,
  Globe
} from "lucide-react";

interface AddFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFile: (fileData: any) => void;
  commonApps: Array<{
    name: string;
    types: string[];
    icon: any;
    color: string;
  }>;
}

const fileTypes = [
  { value: 'text', label: 'Text File', icon: FileText },
  { value: 'code', label: 'Code File', icon: Code },
  { value: 'script', label: 'Script File', icon: Terminal },
  { value: 'sql', label: 'SQL File', icon: Database },
  { value: 'markdown', label: 'Markdown File', icon: FileText },
  { value: 'config', label: 'Config File', icon: Settings },
  { value: 'log', label: 'Log File', icon: FileText },
  { value: 'image', label: 'Image File', icon: Image },
  { value: 'audio', label: 'Audio File', icon: Music },
  { value: 'video', label: 'Video File', icon: Video },
  { value: 'archive', label: 'Archive File', icon: FileText },
  { value: 'web', label: 'Web File', icon: Globe },
  { value: 'document', label: 'Document', icon: FileText }
];

const windowSizePresets = [
  { value: 'default', label: 'Default' },
  { value: 'small', label: 'Small (800x600)' },
  { value: 'medium', label: 'Medium (1200x800)' },
  { value: 'large', label: 'Large (1600x1000)' },
  { value: 'maximized', label: 'Maximized' },
  { value: 'custom', label: 'Custom' }
];

export function AddFileModal({ isOpen, onClose, onAddFile, commonApps }: AddFileModalProps) {
  const [isFolder, setIsFolder] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [type, setType] = useState("text");
  const [associatedApp, setAssociatedApp] = useState(commonApps[0]?.name || "");
  const [useDefaultApp, setUseDefaultApp] = useState(true);
  const [fileFilter, setFileFilter] = useState("*.*");
  const [launchDelay, setLaunchDelay] = useState(0);
  const [windowSize, setWindowSize] = useState("default");
  const [customWidth, setCustomWidth] = useState(1200);
  const [customHeight, setCustomHeight] = useState(800);
  const [groupFiles, setGroupFiles] = useState(false);

  const handleSubmit = () => {
    if (!name.trim() || !path.trim()) return;

    // Auto-detect file type from extension if not a folder
    let finalType = type;
    if (!isFolder && name.includes('.')) {
      const extension = name.split('.').pop()?.toLowerCase();
      const detectedType = fileTypes.find(ft => 
        extension === ft.value || 
        (ft.value === 'code' && ['js', 'ts', 'py', 'java', 'cpp'].includes(extension!)) ||
        (ft.value === 'image' && ['jpg', 'png', 'gif', 'svg'].includes(extension!)) ||
        (ft.value === 'audio' && ['mp3', 'wav', 'flac'].includes(extension!)) ||
        (ft.value === 'video' && ['mp4', 'avi', 'mkv'].includes(extension!))
      );
      if (detectedType) {
        finalType = detectedType.value;
      }
    }

    // Auto-suggest associated app based on file type
    let finalAssociatedApp = associatedApp;
    if (!useDefaultApp) {
      const suggestedApp = commonApps.find(app => app.types.includes(finalType));
      if (suggestedApp) {
        finalAssociatedApp = suggestedApp.name;
      }
    }

    const fileData = {
      name: name.trim(),
      path: path.trim(),
      type: isFolder ? 'folder' : finalType,
      associatedApp: finalAssociatedApp,
      useDefaultApp,
      isFolder,
      isExpanded: false,
      fileFilter: isFolder ? fileFilter : undefined,
      files: isFolder ? [] : undefined,
      launchDelay,
      windowSize,
      customDimensions: windowSize === 'custom' ? { width: customWidth, height: customHeight } : undefined,
      groupFiles: isFolder ? groupFiles : undefined
    };

    onAddFile(fileData);
    handleClose();
  };

  const handleClose = () => {
    setIsFolder(false);
    setName("");
    setPath("");
    setType("text");
    setAssociatedApp(commonApps[0]?.name || "");
    setUseDefaultApp(true);
    setFileFilter("*.*");
    setLaunchDelay(0);
    setWindowSize("default");
    setCustomWidth(1200);
    setCustomHeight(800);
    setGroupFiles(false);
    onClose();
  };

  const availableApps = useDefaultApp 
    ? [{ name: 'System Default', types: [], icon: Settings, color: '#64748B' }]
    : commonApps.filter(app => app.types.includes(type) || isFolder);

  const selectedType = fileTypes.find(ft => ft.value === type);
  const SelectedTypeIcon = selectedType?.icon || File;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-flow-bg-secondary border border-flow-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              {isFolder ? (
                <Folder className="w-5 h-5 text-flow-accent-blue" />
              ) : (
                <SelectedTypeIcon 
                  className="w-5 h-5" 
                  style={{ color: getFileTypeColor(type) }}
                />
              )}
              <h2 className="text-lg font-semibold text-flow-text-primary">
                Add {isFolder ? 'Folder' : 'File'}
              </h2>
            </div>
            <button
              onClick={handleClose}
              className="p-1 text-flow-text-muted hover:text-flow-text-primary hover:bg-flow-surface rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {/* File or Folder Toggle */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-flow-text-secondary">Type:</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!isFolder}
                    onChange={() => setIsFolder(false)}
                    className="text-flow-accent-blue"
                  />
                  <File className="w-4 h-4 text-flow-text-secondary" />
                  <span className="text-sm text-flow-text-primary">File</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={isFolder}
                    onChange={() => setIsFolder(true)}
                    className="text-flow-accent-blue"
                  />
                  <Folder className="w-4 h-4 text-flow-text-secondary" />
                  <span className="text-sm text-flow-text-primary">Folder</span>
                </label>
              </div>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-flow-text-secondary mb-1">
                {isFolder ? 'Folder Name' : 'File Name'}
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isFolder ? "e.g., Project Documents" : "e.g., database-queries.sql"}
                className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
              />
            </div>

            {/* Path */}
            <div>
              <label htmlFor="path" className="block text-sm font-medium text-flow-text-secondary mb-1">
                {isFolder ? 'Folder Path' : 'File Path'}
              </label>
              <input
                id="path"
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={isFolder ? "/Users/username/Documents/Projects" : "/Users/username/SQL/database-queries.sql"}
                className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
              />
            </div>

            {/* File Type (only for files) */}
            {!isFolder && (
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-flow-text-secondary mb-1">
                  File Type
                </label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
                >
                  {fileTypes.map(ft => (
                    <option key={ft.value} value={ft.value}>{ft.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* File Filter (only for folders) */}
            {isFolder && (
              <div>
                <label htmlFor="fileFilter" className="block text-sm font-medium text-flow-text-secondary mb-1">
                  File Filter
                </label>
                <input
                  id="fileFilter"
                  type="text"
                  value={fileFilter}
                  onChange={(e) => setFileFilter(e.target.value)}
                  placeholder="e.g., *.sql, *.md, *.*"
                  className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
                />
                <p className="text-xs text-flow-text-muted mt-1">
                  Filter which files to show when expanded
                </p>
              </div>
            )}

            {/* Use Default App */}
            <div className="flex items-center justify-between">
              <label htmlFor="useDefaultApp" className="text-sm font-medium text-flow-text-secondary">
                Use system default app
              </label>
              <input
                id="useDefaultApp"
                type="checkbox"
                checked={useDefaultApp}
                onChange={(e) => setUseDefaultApp(e.target.checked)}
                className="w-4 h-4 text-flow-accent-blue bg-flow-surface border-flow-border rounded focus:ring-flow-accent-blue focus:ring-2"
              />
            </div>

            {/* Associated App */}
            {!useDefaultApp && (
              <div>
                <label htmlFor="associatedApp" className="block text-sm font-medium text-flow-text-secondary mb-1">
                  Associated Application
                </label>
                <select
                  id="associatedApp"
                  value={associatedApp}
                  onChange={(e) => setAssociatedApp(e.target.value)}
                  className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
                >
                  {availableApps.map(app => (
                    <option key={app.name} value={app.name}>{app.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Launch Delay */}
            <div>
              <label htmlFor="launchDelay" className="block text-sm font-medium text-flow-text-secondary mb-1">
                Launch Delay (seconds)
              </label>
              <input
                id="launchDelay"
                type="number"
                min="0"
                max="60"
                value={launchDelay}
                onChange={(e) => setLaunchDelay(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
              />
            </div>

            {/* Window Size */}
            <div>
              <label htmlFor="windowSize" className="block text-sm font-medium text-flow-text-secondary mb-1">
                Window Size
              </label>
              <select
                id="windowSize"
                value={windowSize}
                onChange={(e) => setWindowSize(e.target.value)}
                className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
              >
                {windowSizePresets.map(preset => (
                  <option key={preset.value} value={preset.value}>{preset.label}</option>
                ))}
              </select>
            </div>

            {/* Custom Dimensions */}
            {windowSize === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="customWidth" className="block text-sm font-medium text-flow-text-secondary mb-1">
                    Width (px)
                  </label>
                  <input
                    id="customWidth"
                    type="number"
                    min="200"
                    max="3840"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(parseInt(e.target.value) || 1200)}
                    className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
                  />
                </div>
                <div>
                  <label htmlFor="customHeight" className="block text-sm font-medium text-flow-text-secondary mb-1">
                    Height (px)
                  </label>
                  <input
                    id="customHeight"
                    type="number"
                    min="200"
                    max="2160"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(parseInt(e.target.value) || 800)}
                    className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
                  />
                </div>
              </div>
            )}

            {/* Group Files (only for folders with multi-file support) */}
            {isFolder && (
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="groupFiles" className="text-sm font-medium text-flow-text-secondary">
                    Group files under one app instance
                  </label>
                  <p className="text-xs text-flow-text-muted">
                    Open all files in a single app window if supported
                  </p>
                </div>
                <input
                  id="groupFiles"
                  type="checkbox"
                  checked={groupFiles}
                  onChange={(e) => setGroupFiles(e.target.checked)}
                  className="w-4 h-4 text-flow-accent-blue bg-flow-surface border-flow-border rounded focus:ring-flow-accent-blue focus:ring-2"
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-flow-border">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-flow-surface border border-flow-border text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || !path.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-flow-accent-blue text-flow-text-primary hover:bg-flow-accent-blue-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add {isFolder ? 'Folder' : 'File'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}