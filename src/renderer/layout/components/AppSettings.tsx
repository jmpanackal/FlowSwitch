import { useState } from "react";
import { X, Volume2, VolumeX, Shield, Power, Save, Monitor, Minimize2, FileText, Folder, Plus, Trash2 } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { FileIcon } from "./FileIcon";

interface AppSettingsProps {
  app: {
    name: string;
    icon: LucideIcon;
    color: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    volume?: number;
    launchBehavior?: 'new' | 'focus' | 'minimize';
    runAsAdmin?: boolean;
    forceCloseOnExit?: boolean;
    smartSave?: boolean;
    associatedFiles?: {
      id: string;
      name: string;
      path: string;
      type: string;
      associatedApp: string;
      useDefaultApp: boolean;
    }[];
  };
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: any) => void;
  onDelete?: () => void;
  onMinimize?: () => void;
}

export function AppSettings({ 
  app, 
  isOpen, 
  onClose, 
  onSave, 
  onDelete, 
  onMinimize 
}: AppSettingsProps) {
  const [volume, setVolume] = useState(app.volume || 50);
  const [launchBehavior, setLaunchBehavior] = useState(app.launchBehavior || 'new');
  const [runAsAdmin, setRunAsAdmin] = useState(app.runAsAdmin || false);
  const [forceCloseOnExit, setForceCloseOnExit] = useState(app.forceCloseOnExit || false);
  const [smartSave, setSmartSave] = useState(app.smartSave || false);
  const [associatedFiles, setAssociatedFiles] = useState(app.associatedFiles || []);
  const [showAddFileForm, setShowAddFileForm] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileType, setNewFileType] = useState("document");

  if (!isOpen) return null;

  // Safely handle the icon component
  const renderIcon = () => {
    if (!app.icon) {
      return (
        <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center">
          <span className="text-white text-sm">📱</span>
        </div>
      );
    }
    
    // Check if it's a valid React component
    if (typeof app.icon === 'function') {
      try {
        const IconComponent = app.icon;
        return <IconComponent className="w-6 h-6 text-white" />;
      } catch (error) {
        console.warn('Failed to render icon for app:', app.name, error);
        return (
          <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center">
            <span className="text-white text-sm">⚠️</span>
          </div>
        );
      }
    }
    
    // If it's not a function, show fallback
    return (
      <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center">
        <span className="text-white text-sm">❓</span>
      </div>
    );
  };

  const hasPosition = app.position && app.size;

  const handleSave = () => {
    onSave({
      volume,
      launchBehavior,
      runAsAdmin,
      forceCloseOnExit,
      smartSave,
      associatedFiles
    });
    onClose();
  };

  const handleAddFile = () => {
    if (!newFilePath.trim()) return;
    
    const fileName = newFilePath.split('/').pop() || newFilePath;
    const newFile = {
      id: `file-${Date.now()}`,
      name: fileName,
      path: newFilePath,
      type: newFileType,
      associatedApp: app.name,
      useDefaultApp: false
    };
    
    setAssociatedFiles(prev => [...prev, newFile]);
    setNewFilePath("");
    setNewFileType("document");
    setShowAddFileForm(false);
  };

  const handleRemoveFile = (fileId: string) => {
    setAssociatedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const moveFile = (fromIndex: number, toIndex: number) => {
    const newFiles = [...associatedFiles];
    const [movedFile] = newFiles.splice(fromIndex, 1);
    newFiles.splice(toIndex, 0, movedFile);
    setAssociatedFiles(newFiles);
  };

  return (
    <div className="bg-flow-surface-elevated backdrop-blur-xl border border-flow-border rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div 
            className="p-3 rounded-lg"
            style={{ backgroundColor: `${app.color}20` }}
          >
            {renderIcon()}
          </div>
          <div>
            <h3 className="text-flow-text-primary font-semibold">{app.name}</h3>
            <p className="text-flow-text-muted text-sm">App Settings</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-flow-surface rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-flow-text-muted" />
        </button>
      </div>

      <div className="space-y-6">
        {/* Volume Control */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            {volume === 0 ? (
              <VolumeX className="w-4 h-4 text-flow-text-secondary" />
            ) : (
              <Volume2 className="w-4 h-4 text-flow-text-secondary" />
            )}
            <span className="text-flow-text-primary text-sm font-medium">Volume</span>
            <span className="text-flow-text-muted text-sm">{volume}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(parseInt(e.target.value))}
            className="w-full h-2 bg-flow-surface rounded-lg appearance-none cursor-pointer"
          />
        </div>

        {/* Launch Behavior */}
        <div>
          <label className="text-flow-text-primary text-sm font-medium mb-3 block">
            Launch Behavior
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'new', label: 'New Window' },
              { value: 'focus', label: 'Focus Existing' },
              { value: 'minimize', label: 'Start Minimized' }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setLaunchBehavior(option.value as any)}
                className={`p-3 rounded-lg text-sm transition-colors ${
                  launchBehavior === option.value
                    ? 'bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30'
                    : 'bg-flow-surface text-flow-text-secondary hover:bg-flow-surface-elevated border border-flow-border'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Settings */}
        <div>
          <h4 className="text-flow-text-primary text-sm font-medium mb-3">Advanced Settings</h4>
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-flow-text-secondary" />
                <span className="text-flow-text-primary text-sm">Run as Administrator</span>
              </div>
              <input
                type="checkbox"
                checked={runAsAdmin}
                onChange={(e) => setRunAsAdmin(e.target.checked)}
                className="w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Power className="w-4 h-4 text-flow-text-secondary" />
                <span className="text-flow-text-primary text-sm">Force Close on Exit</span>
              </div>
              <input
                type="checkbox"
                checked={forceCloseOnExit}
                onChange={(e) => setForceCloseOnExit(e.target.checked)}
                className="w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4 text-flow-text-secondary" />
                <span className="text-flow-text-primary text-sm">Smart Save State</span>
              </div>
              <input
                type="checkbox"
                checked={smartSave}
                onChange={(e) => setSmartSave(e.target.checked)}
                className="w-4 h-4"
              />
            </label>
          </div>
        </div>

        {/* Position & Size Info - Only show if app has position data */}
        {hasPosition && (
          <div className="bg-flow-surface border border-flow-border rounded-lg p-3">
            <h4 className="text-flow-text-primary text-sm font-medium mb-2">Window Layout</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-flow-text-muted">Position:</span>
                <div className="text-flow-text-secondary">
                  {Math.round(app.position!.x)}%, {Math.round(app.position!.y)}%
                </div>
              </div>
              <div>
                <span className="text-flow-text-muted">Size:</span>
                <div className="text-flow-text-secondary">
                  {Math.round(app.size!.width)}% × {Math.round(app.size!.height)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Files and Folders to Open */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-flow-text-primary text-sm font-medium">Files and Folders to Open</h4>
            <button
              onClick={() => setShowAddFileForm(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-flow-accent-blue hover:bg-flow-accent-blue/10 rounded transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add File
            </button>
          </div>

          {associatedFiles.length > 0 ? (
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {associatedFiles.map((file, index) => (
                <div key={file.id} className="flex items-center gap-3 p-2 bg-flow-surface border border-flow-border rounded-lg">
                  <FileIcon type={file.type} className="w-4 h-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-flow-text-primary text-sm truncate">{file.name}</div>
                    <div className="text-flow-text-muted text-xs truncate">{file.path}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {index > 0 && (
                      <button
                        onClick={() => moveFile(index, index - 1)}
                        className="p-1 text-flow-text-muted hover:text-flow-text-primary transition-colors"
                        title="Move up"
                      >
                        ↑
                      </button>
                    )}
                    {index < associatedFiles.length - 1 && (
                      <button
                        onClick={() => moveFile(index, index + 1)}
                        className="p-1 text-flow-text-muted hover:text-flow-text-primary transition-colors"
                        title="Move down"
                      >
                        ↓
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveFile(file.id)}
                      className="p-1 text-flow-accent-red hover:text-red-400 transition-colors"
                      title="Remove file"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-flow-text-muted text-sm">
              No files associated with this app
            </div>
          )}

          {showAddFileForm && (
            <div className="mt-3 p-3 bg-flow-surface border border-flow-border rounded-lg">
              <div className="space-y-3">
                <div>
                  <label className="block text-flow-text-primary text-sm font-medium mb-1">
                    File Path
                  </label>
                  <input
                    type="text"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    placeholder="/path/to/file.ext"
                    className="w-full px-3 py-2 bg-flow-surface-elevated border border-flow-border rounded text-flow-text-primary text-sm"
                  />
                </div>
                <div>
                  <label className="block text-flow-text-primary text-sm font-medium mb-1">
                    File Type
                  </label>
                  <select
                    value={newFileType}
                    onChange={(e) => setNewFileType(e.target.value)}
                    className="w-full px-3 py-2 bg-flow-surface-elevated border border-flow-border rounded text-flow-text-primary text-sm"
                  >
                    <option value="document">Document</option>
                    <option value="code">Code</option>
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                    <option value="audio">Audio</option>
                    <option value="archive">Archive</option>
                    <option value="config">Config</option>
                    <option value="script">Script</option>
                    <option value="data">Data</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddFile}
                    className="flex-1 px-3 py-2 bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-white rounded text-sm transition-colors"
                  >
                    Add File
                  </button>
                  <button
                    onClick={() => {
                      setShowAddFileForm(false);
                      setNewFilePath("");
                      setNewFileType("document");
                    }}
                    className="px-3 py-2 bg-flow-surface border border-flow-border text-flow-text-secondary hover:bg-flow-surface-elevated rounded text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Show app type info for minimized apps */}
        {!hasPosition && (
          <div className="bg-flow-surface border border-flow-border rounded-lg p-3">
            <h4 className="text-flow-text-primary text-sm font-medium mb-2">App Type</h4>
            <div className="flex items-center gap-2 text-sm">
              <Minimize2 className="w-4 h-4 text-flow-text-muted" />
              <span className="text-flow-text-muted">Minimized Application</span>
            </div>
            <p className="text-flow-text-muted text-xs mt-1">
              This app will start minimized in the system tray
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-flow-border">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-white rounded-lg transition-colors"
          >
            Save Changes
          </button>
          {onMinimize && (
            <button
              onClick={() => {
                onMinimize();
                onClose();
              }}
              className="px-4 py-2 bg-flow-surface border border-flow-border text-flow-text-secondary hover:bg-flow-surface-elevated rounded-lg transition-colors"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="px-4 py-2 bg-flow-accent-red hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}