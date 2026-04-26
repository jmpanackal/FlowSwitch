import { useState, useRef } from "react";
import { X, ExternalLink, Upload, Folder, File, Globe } from "lucide-react";

interface AddContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'link' | 'file';
  currentFolder?: string;
  onAddContent: (contentData: any) => void;
}

type NativePickedEntry = { path: string; kind: 'file' | 'directory' };

type LibraryPickMode = 'files' | 'directory';

// Function to detect file type from file name
const getFileType = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension || 'unknown';
};

const baseName = (p: string) => {
  const s = p.replace(/[/\\]+$/, "");
  const parts = s.split(/[/\\]/);
  return parts[parts.length - 1] || s;
};

// Function to get default app for content
const getDefaultApp = (type: 'link' | 'file', fileName?: string, url?: string): string => {
  if (type === 'link') {
    if (url?.includes('youtube.com')) return 'Chrome';
    if (url?.includes('spotify.com')) return 'Chrome';
    if (url?.includes('github.com')) return 'Chrome';
    return 'Chrome';
  } else {
    if (!fileName) return 'File Explorer';

    const extension = fileName.split('.').pop()?.toLowerCase();
    const appMap: { [key: string]: string } = {
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
      'tsx': 'Visual Studio Code',
      'jsx': 'Visual Studio Code',
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
      '7z': '7-Zip'
    };

    return appMap[extension || ''] || 'File Explorer';
  }
};

// Best-effort page title inference from URL hostname.
const extractTitleFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');

    // Common site mappings
    const siteNames: { [key: string]: string } = {
      'github.com': 'GitHub',
      'youtube.com': 'YouTube',
      'spotify.com': 'Spotify',
      'figma.com': 'Figma',
      'gmail.com': 'Gmail',
      'google.com': 'Google',
      'stackoverflow.com': 'Stack Overflow',
      'reddit.com': 'Reddit',
      'twitter.com': 'Twitter',
      'x.com': 'X (Twitter)',
      'linkedin.com': 'LinkedIn',
      'facebook.com': 'Facebook',
      'instagram.com': 'Instagram',
      'notion.so': 'Notion',
      'slack.com': 'Slack',
      'discord.com': 'Discord'
    };

    return siteNames[hostname] || hostname.split('.')[0];
  } catch {
    return url;
  }
};

export function AddContentModal({ isOpen, onClose, type, currentFolder, onAddContent }: AddContentModalProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [nativeEntries, setNativeEntries] = useState<NativePickedEntry[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasDesktopPicker = Boolean(
    typeof window !== 'undefined'
    && window.electron?.pickContentLibraryPaths,
  );

  const handleUrlChange = (newUrl: string) => {
    setUrl(newUrl);

    // Auto-generate name from URL if name is empty
    if (!name && newUrl) {
      const extractedTitle = extractTitleFromUrl(newUrl);
      setName(extractedTitle);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setSelectedFiles(files);
    setNativeEntries(null);

    // Auto-generate name from first file if name is empty
    if (files && files.length > 0 && !name) {
      if (files.length === 1) {
        setName(files[0].name);
      } else {
        setName(`${files.length} files`);
      }
    }
  };

  const handleChooseFromComputer = async (pickMode: LibraryPickMode) => {
    const pick = window.electron?.pickContentLibraryPaths;
    if (!pick) {
      window.alert('Desktop file picker is not available in this environment.');
      return;
    }
    try {
      const res = await pick({ mode: pickMode });
      if (res.canceled || !res.entries?.length) return;
      setSelectedFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setNativeEntries(res.entries);
      if (!name) {
        if (res.entries.length === 1) {
          setName(baseName(res.entries[0].path));
        } else {
          const dirs = res.entries.filter((e) => e.kind === 'directory');
          const files = res.entries.filter((e) => e.kind === 'file');
          if (dirs.length === 1 && files.length === 0) {
            setName(baseName(dirs[0].path));
          } else {
            setName(`${res.entries.length} paths`);
          }
        }
      }
    } catch {
      window.alert('Could not open the file picker.');
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      if (type === 'link') {
        if (!url || !name) {
          alert('Please provide both URL and name');
          return;
        }

        const contentData = {
          type: 'link',
          name: name.trim(),
          url: url.trim(),
          defaultApp: getDefaultApp('link', undefined, url)
        };

        onAddContent(contentData);
      } else {
        if (nativeEntries?.length) {
          const dirs = nativeEntries.filter((e) => e.kind === 'directory');
          const files = nativeEntries.filter((e) => e.kind === 'file');
          if (dirs.length && files.length) {
            alert('Choose only files or only folders in the same pick — not both.');
            return;
          }
          if (dirs.length >= 1) {
            for (let di = 0; di < dirs.length; di++) {
              const dpath = dirs[di].path;
              const base = baseName(dpath);
              onAddContent({
                libraryDiskFolder: true,
                diskPath: dpath,
                name:
                  dirs.length === 1 && name.trim()
                    ? name.trim()
                    : base,
                defaultApp: 'File Explorer',
              });
            }
          }
          if (files.length) {
            for (let i = 0; i < files.length; i++) {
              const fp = files[i].path;
              const bn = baseName(fp);
              onAddContent({
                type: 'file',
                name: files.length === 1 && name ? name.trim() : bn,
                path: fp,
                fileType: getFileType(bn),
                isFolder: false,
                defaultApp: getDefaultApp('file', bn),
              });
            }
          }
        } else if (selectedFiles && selectedFiles.length > 0) {
          for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const isFolder = Boolean(
              file.webkitRelativePath && file.webkitRelativePath.includes("/"),
            );
            const absolutePath =
              (file as File & { path?: string }).path
              || file.webkitRelativePath
              || file.name;

            const contentData = {
              type: 'file',
              name: selectedFiles.length === 1 && name ? name.trim() : file.name,
              path: absolutePath,
              fileType: isFolder ? 'folder' : getFileType(file.name),
              isFolder: isFolder,
              defaultApp: getDefaultApp('file', file.name)
            };

            onAddContent(contentData);
          }
        } else {
          alert('Please select at least one file or folder');
          return;
        }
      }

      // Reset form and close
      setUrl('');
      setName('');
      setSelectedFiles(null);
      setNativeEntries(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onClose();
    } catch (error) {
      console.error('Error adding content:', error);
      alert('Failed to add content. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setUrl('');
    setName('');
    setSelectedFiles(null);
    setNativeEntries(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const fileHasSelection = Boolean(
    (nativeEntries && nativeEntries.length > 0)
    || (selectedFiles && selectedFiles.length > 0),
  );

  const previewFileLabel = (() => {
    if (!fileHasSelection) return '';
    if (nativeEntries?.length) {
      const dirs = nativeEntries.filter((e) => e.kind === 'directory');
      if (dirs.length === 1 && nativeEntries.every((e) => e.kind === 'directory')) {
        return name.trim() || baseName(dirs[0].path);
      }
      if (nativeEntries.length === 1 && nativeEntries[0].kind === 'file') {
        return name.trim() || baseName(nativeEntries[0].path);
      }
      return `${nativeEntries.length} paths`;
    }
    if (selectedFiles?.length === 1) {
      return name.trim() || selectedFiles[0].name;
    }
    return `${selectedFiles?.length ?? 0} files`;
  })();

  const previewDefaultApp = (() => {
    if (type === 'link') return getDefaultApp('link', undefined, url);
    if (nativeEntries?.length) {
      const dirs = nativeEntries.filter((e) => e.kind === 'directory');
      if (dirs.length === 1 && nativeEntries.every((e) => e.kind === 'directory')) {
        return 'File Explorer';
      }
      if (nativeEntries.length === 1 && nativeEntries[0].kind === 'file') {
        return getDefaultApp('file', baseName(nativeEntries[0].path));
      }
      return 'Various';
    }
    if (selectedFiles && selectedFiles.length === 1) {
      return getDefaultApp('file', selectedFiles[0].name);
    }
    return 'Various';
  })();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm flow-modal-backdrop-enter">
      <div className="app-no-drag w-full max-w-md rounded-lg border border-flow-border bg-flow-surface-elevated shadow-lg flow-modal-panel-enter">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-flow-border">
          <div className="flex items-center gap-2">
            {type === 'link' ? (
              <ExternalLink className="w-4 h-4 text-blue-400" />
            ) : (
              <Upload className="w-4 h-4 text-green-400" />
            )}
            <h3 className="text-lg font-semibold text-flow-text-primary">
              {type === 'link' ? 'Add Link' : 'Add files or folder'}
            </h3>
          </div>
          <button
            onClick={handleCancel}
            className="p-1 text-flow-text-muted hover:text-flow-text-primary rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {currentFolder && (
            <div className="flex items-center gap-2 text-sm text-flow-text-secondary bg-flow-bg-tertiary px-3 py-2 rounded-lg">
              <Folder className="w-4 h-4 text-yellow-400" />
              <span>Adding to: {currentFolder}</span>
            </div>
          )}

          {type === 'link' ? (
            <>
              {/* URL Input */}
              <div>
                <label className="block text-sm font-medium text-flow-text-secondary mb-2">
                  URL *
                </label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-flow-text-muted" />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full pl-10 pr-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50"
                    required
                  />
                </div>
              </div>

              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-flow-text-secondary mb-2">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter a name for this link"
                  className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50"
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-flow-text-secondary mb-2">
                  From your computer *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {hasDesktopPicker ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => void handleChooseFromComputer('files')}
                      className="w-full rounded-lg border-2 border-dashed border-flow-border bg-flow-surface p-4 text-center transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated"
                    >
                      <Upload className="mx-auto mb-2 h-8 w-8 text-flow-text-muted" />
                      <p className="text-sm font-medium text-flow-text-primary">
                        Choose files
                      </p>
                      <p className="mt-1 text-xs text-flow-text-muted">
                        One or more files; each becomes its own library entry.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleChooseFromComputer('directory')}
                      className="w-full rounded-lg border-2 border-dashed border-flow-border bg-flow-surface p-4 text-center transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated"
                    >
                      <Folder
                        className="mx-auto mb-2 h-8 w-8 text-amber-400/90"
                        aria-hidden
                      />
                      <p className="text-sm font-medium text-flow-text-primary">
                        Choose folder
                      </p>
                      <p className="mt-1 text-xs text-flow-text-muted">
                        One folder path as a single entry (contents are not scanned).
                      </p>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg border-2 border-dashed border-flow-border bg-flow-surface p-4 text-center transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated"
                  >
                    <Upload className="mx-auto mb-2 h-8 w-8 text-flow-text-muted" />
                    <p className="text-sm font-medium text-flow-text-primary">
                      Choose files
                    </p>
                    <p className="mt-1 text-xs text-flow-text-muted">
                      Adding a folder path from disk requires the FlowSwitch desktop app.
                    </p>
                  </button>
                )}

                {nativeEntries && nativeEntries.length > 0 && (
                  <div className="mt-2 p-3 bg-flow-bg-tertiary rounded-lg">
                    <div className="text-xs text-flow-text-secondary font-medium mb-2">
                      Selected ({nativeEntries.length}):
                    </div>
                    <div className="scrollbar-elegant max-h-24 space-y-1 overflow-y-auto">
                      {nativeEntries.slice(0, 6).map((e, index) => (
                        <div key={`${e.path}:${index}`} className="flex items-center gap-2 text-xs text-flow-text-muted">
                          {e.kind === 'directory' ? (
                            <Folder className="w-3 h-3 flex-shrink-0 text-amber-400/90" />
                          ) : (
                            <File className="w-3 h-3 flex-shrink-0" />
                          )}
                          <span className="truncate">{baseName(e.path)}</span>
                        </div>
                      ))}
                      {nativeEntries.length > 6 && (
                        <div className="text-xs text-flow-text-muted italic">
                          ... and {nativeEntries.length - 6} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedFiles && selectedFiles.length > 0 && (
                  <div className="mt-2 p-3 bg-flow-bg-tertiary rounded-lg">
                    <div className="text-xs text-flow-text-secondary font-medium mb-2">
                      Selected ({selectedFiles.length}):
                    </div>
                    <div className="scrollbar-elegant max-h-20 space-y-1 overflow-y-auto">
                      {Array.from(selectedFiles).slice(0, 5).map((file, index) => (
                        <div key={index} className="flex items-center gap-2 text-xs text-flow-text-muted">
                          <File className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </div>
                      ))}
                      {selectedFiles.length > 5 && (
                        <div className="text-xs text-flow-text-muted italic">
                          ... and {selectedFiles.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {(
                (selectedFiles && selectedFiles.length === 1)
                || (nativeEntries?.length === 1 && nativeEntries[0].kind === 'file')
              ) && (
                <div>
                  <label className="block text-sm font-medium text-flow-text-secondary mb-2">
                    Custom Name (optional)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Leave empty to use file name"
                    className="w-full px-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50"
                  />
                </div>
              )}
            </>
          )}



          {/* Preview Info */}
          {((type === 'link' && url && name) || (type === 'file' && fileHasSelection)) && (
            <div className="p-3 bg-flow-bg-tertiary rounded-lg border border-flow-border">
              <div className="text-xs text-flow-text-secondary font-medium mb-2">Preview:</div>
              <div className="flex items-center gap-2 text-sm">
                {type === 'link' ? (
                  <ExternalLink className="w-4 h-4 text-blue-400" />
                ) : (
                  <File className="w-4 h-4 text-green-400" />
                )}
                <span className="text-flow-text-primary font-medium">
                  {type === 'link' ? name : previewFileLabel}
                </span>
              </div>
              <div className="text-xs text-flow-text-muted mt-1">
                Default app: {previewDefaultApp}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-flow-border">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-flow-text-secondary hover:text-flow-text-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              isSubmitting
              || (type === 'link' ? !url || !name : !fileHasSelection)
            }
            className="px-4 py-2 text-sm font-medium bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Adding...' : `Add ${type === 'link' ? 'Link' : 'content'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
