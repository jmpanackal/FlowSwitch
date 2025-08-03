import { useState } from "react";
import { X, Plus, Trash2, File, Folder, Edit3, Save } from "lucide-react";
import { FileIcon } from "./FileIcon";

interface FileAssociation {
  id: string;
  name: string;
  path: string;
  type: string;
  associatedApp: string;
  useDefaultApp: boolean;
}

interface AppFileAssociationModalProps {
  isOpen: boolean;
  onClose: () => void;
  appName: string;
  appIcon: React.ComponentType<any>;
  appColor: string;
  files: FileAssociation[];
  onUpdateFiles: (files: FileAssociation[]) => void;
  onAddFile: () => void;
}

export function AppFileAssociationModal({
  isOpen,
  onClose,
  appName,
  appIcon: IconToShow,
  appColor,
  files = [], // Default to empty array
  onUpdateFiles,
  onAddFile
}: AppFileAssociationModalProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");

  if (!isOpen) return null;

  // Ensure files is always an array
  const safeFiles = files || [];

  const handleEditFile = (index: number) => {
    const file = safeFiles[index];
    if (!file) return;
    
    setEditingIndex(index);
    setEditName(file.name);
    setEditPath(file.path);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    
    const updatedFiles = safeFiles.map((file, index) => {
      if (index === editingIndex) {
        return {
          ...file,
          name: editName,
          path: editPath
        };
      }
      return file;
    });
    
    onUpdateFiles(updatedFiles);
    setEditingIndex(null);
    setEditName("");
    setEditPath("");
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditName("");
    setEditPath("");
  };

  const handleRemoveFile = (index: number) => {
    const updatedFiles = safeFiles.filter((_, i) => i !== index);
    onUpdateFiles(updatedFiles);
  };

  const handleSave = () => {
    // If currently editing, save the edit first
    if (editingIndex !== null) {
      handleSaveEdit();
    }
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="bg-flow-surface-elevated border border-flow-border rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-flow-border flex-shrink-0">
            <div className="flex items-center gap-4">
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center border border-white/20"
                style={{ backgroundColor: `${appColor}40` }}
              >
                {IconToShow && <IconToShow className="w-6 h-6 text-white" />}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-flow-text-primary">
                  {appName} - File Associations
                </h2>
                <p className="text-sm text-flow-text-secondary">
                  {safeFiles.length} file{safeFiles.length !== 1 ? 's' : ''} will open when launching this app
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-flow-surface rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-flow-text-secondary" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-elegant p-6 min-h-0">
            {safeFiles.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-6 bg-flow-surface rounded-full flex items-center justify-center">
                  <File className="w-10 h-10 text-flow-text-muted" />
                </div>
                <h3 className="text-lg font-medium text-flow-text-primary mb-2">No files associated</h3>
                <p className="text-sm text-flow-text-muted max-w-md mx-auto">
                  Add files or folders that should open when this app launches. These files will automatically open with {appName} when you launch your profile.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {safeFiles.map((file, index) => (
                  <div
                    key={file.id}
                    className="flex items-start gap-4 p-4 bg-flow-surface rounded-lg border border-flow-border hover:border-flow-border-accent transition-colors"
                  >
                    <div className="flex-shrink-0 mt-1">
                      <FileIcon type={file.type} className="w-6 h-6" />
                    </div>
                    
                    {editingIndex === index ? (
                      <div className="flex-1 space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-flow-text-secondary mb-1">
                            File Name
                          </label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 bg-flow-bg-secondary border border-flow-border rounded-lg text-flow-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
                            placeholder="File name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-flow-text-secondary mb-1">
                            File Path
                          </label>
                          <input
                            type="text"
                            value={editPath}
                            onChange={(e) => setEditPath(e.target.value)}
                            className="w-full px-3 py-2 bg-flow-bg-secondary border border-flow-border rounded-lg text-flow-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
                            placeholder="File path"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="flex items-center gap-2 px-3 py-2 bg-flow-accent-green hover:bg-flow-accent-green/80 text-white rounded-lg text-sm transition-colors"
                          >
                            <Save className="w-4 h-4" />
                            Save Changes
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="flex items-center gap-2 px-3 py-2 bg-flow-surface hover:bg-flow-surface-elevated border border-flow-border rounded-lg text-sm transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-flow-text-primary font-medium truncate">
                              {file.name}
                            </h4>
                            <span className="text-xs text-flow-text-muted bg-flow-surface px-2 py-1 rounded-md border border-flow-border">
                              {file.type.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-flow-text-secondary break-all">
                            {file.path}
                          </p>
                          <div className="mt-2 flex items-center gap-4 text-xs text-flow-text-muted">
                            <span>Associated with {file.associatedApp}</span>
                            {file.useDefaultApp && (
                              <span className="px-2 py-1 bg-flow-accent-blue/20 text-flow-accent-blue rounded-md">
                                Uses default app
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleEditFile(index)}
                            className="p-2 hover:bg-flow-surface-elevated rounded-lg text-flow-text-secondary hover:text-flow-text-primary transition-colors"
                            title="Edit file"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveFile(index)}
                            className="p-2 hover:bg-flow-accent-red/20 rounded-lg text-flow-text-secondary hover:text-flow-accent-red transition-colors"
                            title="Remove file"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-flow-border flex-shrink-0">
            <button
              onClick={onAddFile}
              className="flex items-center gap-2 px-4 py-2 bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add File
            </button>
            
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-flow-surface hover:bg-flow-surface-elevated border border-flow-border rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-flow-accent-green hover:bg-flow-accent-green/80 text-white rounded-lg transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}