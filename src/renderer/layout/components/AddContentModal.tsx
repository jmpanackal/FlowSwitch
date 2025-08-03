import { useState, useRef } from "react";
import { X, ExternalLink, Upload, Folder, File, Globe, Link as LinkIcon } from "lucide-react";

interface AddContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'link' | 'file';
  currentFolder?: string;
  onAddContent: (contentData: any) => void;
}

// Function to detect file type from file name
const getFileType = (fileName: string): string => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension || 'unknown';
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

// Function to extract page title from URL (mock implementation)
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    
    // Auto-generate name from first file if name is empty
    if (files && files.length > 0 && !name) {
      if (files.length === 1) {
        setName(files[0].name);
      } else {
        setName(`${files.length} files`);
      }
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
        console.log('🔗 Adding link:', contentData);
      } else {
        if (!selectedFiles || selectedFiles.length === 0) {
          alert('Please select at least one file or folder');
          return;
        }
        
        // Process each selected file
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          const isFolder = file.webkitRelativePath && file.webkitRelativePath.includes('/');
          
          const contentData = {
            type: 'file',
            name: selectedFiles.length === 1 && name ? name.trim() : file.name,
            path: file.webkitRelativePath || file.name, // Mock path
            fileType: isFolder ? 'folder' : getFileType(file.name),
            isFolder: isFolder,
            defaultApp: getDefaultApp('file', file.name)
          };
          
          onAddContent(contentData);
          console.log('📁 Adding file:', contentData);
        }
      }
      
      // Reset form and close
      setUrl('');
      setName('');
      setSelectedFiles(null);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-flow-border">
          <div className="flex items-center gap-2">
            {type === 'link' ? (
              <ExternalLink className="w-4 h-4 text-blue-400" />
            ) : (
              <Upload className="w-4 h-4 text-green-400" />
            )}
            <h3 className="text-lg font-semibold text-flow-text-primary">
              {type === 'link' ? 'Add Link' : 'Add File/Folder'}
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
              {/* File Input */}
              <div>
                <label className="block text-sm font-medium text-flow-text-secondary mb-2">
                  Select Files/Folders *
                </label>
                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    webkitdirectory=""
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full p-4 border-2 border-dashed border-flow-border hover:border-flow-border-accent rounded-lg cursor-pointer transition-colors bg-flow-surface hover:bg-flow-surface-elevated"
                  >
                    <div className="flex flex-col items-center text-center">
                      <Upload className="w-8 h-8 text-flow-text-muted mb-2" />
                      <p className="text-sm text-flow-text-primary font-medium">
                        Click to select files or folders
                      </p>
                      <p className="text-xs text-flow-text-muted mt-1">
                        Multiple files and folders supported
                      </p>
                    </div>
                  </div>
                </div>
                
                {selectedFiles && selectedFiles.length > 0 && (
                  <div className="mt-2 p-3 bg-flow-bg-tertiary rounded-lg">
                    <div className="text-xs text-flow-text-secondary font-medium mb-2">
                      Selected ({selectedFiles.length}):
                    </div>
                    <div className="space-y-1 max-h-20 overflow-y-auto">
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

              {/* Custom Name Input (for single file) */}
              {selectedFiles && selectedFiles.length === 1 && (
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
          {((type === 'link' && url && name) || (type === 'file' && selectedFiles && selectedFiles.length > 0)) && (
            <div className="p-3 bg-flow-bg-tertiary rounded-lg border border-flow-border">
              <div className="text-xs text-flow-text-secondary font-medium mb-2">Preview:</div>
              <div className="flex items-center gap-2 text-sm">
                {type === 'link' ? (
                  <ExternalLink className="w-4 h-4 text-blue-400" />
                ) : (
                  <File className="w-4 h-4 text-green-400" />
                )}
                <span className="text-flow-text-primary font-medium">
                  {type === 'link' ? name : (selectedFiles?.length === 1 ? (name || selectedFiles[0].name) : `${selectedFiles?.length} files`)}
                </span>
              </div>
              <div className="text-xs text-flow-text-muted mt-1">
                Default app: {type === 'link' 
                  ? getDefaultApp('link', undefined, url)
                  : selectedFiles && selectedFiles.length === 1 
                    ? getDefaultApp('file', selectedFiles[0].name)
                    : 'Various'
                }
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
            disabled={isSubmitting || (type === 'link' ? !url || !name : !selectedFiles || selectedFiles.length === 0)}
            className="px-4 py-2 text-sm font-medium bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Adding...' : `Add ${type === 'link' ? 'Link' : 'File(s)'}`}
          </button>
        </div>
      </div>
    </div>
  );
}