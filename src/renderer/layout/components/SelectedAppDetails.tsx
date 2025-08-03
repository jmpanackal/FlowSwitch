import React, { useState } from "react";
import { Settings, Trash2, Monitor, Clock, Zap, Shield, Globe, FileText, Plus, Edit, Save, X, Volume2, VolumeX, Minimize2, Maximize2, Copy, ExternalLink, FolderOpen, Replace, Play, RotateCcw, Eye, EyeOff, Hash, StickyNote, TestTube, FileOutput, Tag, User, Sliders, Package, MoreHorizontal, Clipboard, Link2, File } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { FileIcon } from "./FileIcon";
import { AppFileAssociationModal } from "./AppFileAssociationModal";

interface SelectedApp {
  type: 'app' | 'browser' | 'file';
  source: 'monitor' | 'minimized';
  monitorId?: string;
  appIndex?: number;
  data: any; // The actual app/browser/file data
}

interface SelectedAppDetailsProps {
  selectedApp: SelectedApp | null;
  onClose: () => void;
  onUpdateApp?: (updates: any) => void;
  onUpdateAssociatedFiles?: (files: any[]) => void;
  onDeleteApp?: () => void;
  onMoveToMonitor?: (targetMonitorId: string) => void;
  onMoveToMinimized?: () => void;
  monitors?: any[];
  browserTabs?: any[]; // Browser tabs for the profile
  onUpdateBrowserTabs?: (tabs: any[]) => void;
  onAddBrowserTab?: (tab: any) => void;
}

type TabType = 'identity' | 'launch' | 'content' | 'metadata' | 'debug';

export function SelectedAppDetails({
  selectedApp,
  onClose,
  onUpdateApp,
  onUpdateAssociatedFiles,
  onDeleteApp,
  onMoveToMonitor,
  onMoveToMinimized,
  monitors = [],
  browserTabs = [],
  onUpdateBrowserTabs,
  onAddBrowserTab
}: SelectedAppDetailsProps) {
  const [showFileAssociationModal, setShowFileAssociationModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('identity');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Direct paste functionality
  const [pasteInput, setPasteInput] = useState('');
  const [pasteType, setPasteType] = useState<'auto' | 'file' | 'link'>('auto');

  if (!selectedApp) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-flow-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Monitor className="w-8 h-8 text-flow-text-muted" />
          </div>
          <h3 className="font-semibold text-flow-text-primary mb-2">No App Selected</h3>
          <p className="text-sm text-flow-text-muted leading-relaxed">
            Click on any app in the monitor layout or minimized section to view and edit its settings.
          </p>
        </div>
      </div>
    );
  }

  const { data, type, source, monitorId } = selectedApp;

  // Handle field updates with auto-save
  const handleFieldUpdate = (field: string, value: any) => {
    if (onUpdateApp) {
      onUpdateApp({ [field]: value });
    }
  };

  // Get current data
  const currentData = data;

  // Render app icon with proper fallback
  const renderAppIcon = (app: any, size: string = "w-12 h-12") => {
    if (!app.icon) {
      return (
        <div className={`${size} bg-flow-surface rounded-xl flex items-center justify-center border border-flow-border`}>
          <span className="text-flow-text-muted text-lg">📱</span>
        </div>
      );
    }
    
    try {
      const IconComponent = app.icon;
      return (
        <div 
          className={`${size} rounded-xl flex items-center justify-center border border-white/20 shadow-sm`}
          style={{ backgroundColor: `${app.color}80` }}
        >
          <IconComponent className="w-1/2 h-1/2 text-white" />
        </div>
      );
    } catch (error) {
      return (
        <div className={`${size} bg-flow-surface rounded-xl flex items-center justify-center border border-flow-border`}>
          <span className="text-flow-text-muted text-lg">❓</span>
        </div>
      );
    }
  };

  // Tab configuration
  const tabs = [
    { id: 'identity' as TabType, label: 'Identity', icon: User },
    { id: 'launch' as TabType, label: 'Launch', icon: Sliders },
    { id: 'content' as TabType, label: 'Content', icon: Package },
    { id: 'metadata' as TabType, label: 'Metadata', icon: Tag },
    { id: 'debug' as TabType, label: 'Debug', icon: MoreHorizontal }
  ];

  // Render Identity Tab Content
  const renderIdentityTab = () => (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Quick Actions</label>
        <div className="grid grid-cols-2 gap-2">
          <button className="flex items-center gap-2 px-3 py-2 text-sm bg-flow-surface border border-flow-border text-flow-text-secondary hover:text-flow-text-primary hover:border-flow-border-accent rounded-lg transition-all">
            <Replace className="w-4 h-4" />
            Replace App
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-sm bg-flow-surface border border-flow-border text-flow-text-secondary hover:text-flow-text-primary hover:border-flow-border-accent rounded-lg transition-all">
            <FolderOpen className="w-4 h-4" />
            Open Location
          </button>
          <button 
            onClick={onDeleteApp}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-flow-accent-red/10 border border-flow-accent-red/30 text-flow-accent-red hover:bg-flow-accent-red/20 rounded-lg transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Remove App
          </button>
          <button className="flex items-center gap-2 px-3 py-2 text-sm bg-flow-accent-blue/10 border border-flow-accent-blue/30 text-flow-accent-blue hover:bg-flow-accent-blue/20 rounded-lg transition-all">
            <TestTube className="w-4 h-4" />
            Test Launch
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-flow-text-secondary">Basic Information</label>
        
        <div>
          <label className="block text-xs font-medium text-flow-text-muted mb-2">App Name</label>
          <input
            type="text"
            value={currentData.name || ''}
            onChange={(e) => handleFieldUpdate('name', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
            placeholder="Enter app name"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-flow-text-muted mb-2">Executable Path</label>
          <input
            type="text"
            value={currentData.executablePath || 'C:\\Program Files\\App\\app.exe'}
            onChange={(e) => handleFieldUpdate('executablePath', e.target.value)}
            className="w-full px-3 py-2 text-xs bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
            placeholder="C:\\Program Files\\App\\app.exe"
          />
        </div>
      </div>
    </div>
  );

  // Render Launch Tab Content
  const renderLaunchTab = () => (
    <div className="space-y-6">
      {/* Monitor Assignment */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Monitor Assignment</label>
        <div>
          <label className="block text-xs font-medium text-flow-text-muted mb-2">Target Monitor</label>
          <select 
            value={currentData.monitorId || monitorId || 'monitor-1'}
            onChange={(e) => handleFieldUpdate('monitorId', e.target.value)}
            className="w-full px-3 py-2 text-sm bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
          >
            {monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {monitor.name} {monitor.primary ? '(Primary)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Window Settings */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Window Settings</label>
        
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-flow-text-muted mb-2">Window State</label>
            <select 
              value={currentData.windowState || 'maximized'}
              onChange={(e) => handleFieldUpdate('windowState', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
            >
              <option value="fullscreen">Fullscreen</option>
              <option value="maximized">Maximized</option>
              <option value="minimized">Minimized</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-flow-text-muted mb-2">Launch Delay (seconds)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={currentData.launchDelay || 0}
              onChange={(e) => handleFieldUpdate('launchDelay', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Launch Options */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Launch Options</label>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-flow-surface rounded-lg border border-flow-border">
            <div>
              <div className="text-sm font-medium text-flow-text-primary">Run as Administrator</div>
              <div className="text-xs text-flow-text-muted">Launch with elevated privileges</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={currentData.runAsAdmin || false}
                onChange={(e) => handleFieldUpdate('runAsAdmin', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-flow-bg-primary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-flow-accent-blue"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-3 bg-flow-surface rounded-lg border border-flow-border">
            <div>
              <div className="text-sm font-medium text-flow-text-primary">Force Close on Exit</div>
              <div className="text-xs text-flow-text-muted">Kill app when switching profiles</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={currentData.forceCloseOnExit || false}
                onChange={(e) => handleFieldUpdate('forceCloseOnExit', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-flow-bg-primary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-flow-accent-blue"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-3 bg-flow-surface rounded-lg border border-flow-border">
            <div>
              <div className="text-sm font-medium text-flow-text-primary">Smart Save (Ctrl+S)</div>
              <div className="text-xs text-flow-text-muted">Send save command before closing</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={currentData.smartSave || false}
                onChange={(e) => handleFieldUpdate('smartSave', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-flow-bg-primary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-flow-accent-blue"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  // Get browser tabs for this specific app/browser
  const getAppBrowserTabs = () => {
    if (type !== 'browser' && !data.name?.toLowerCase().includes('chrome') && !data.name?.toLowerCase().includes('browser') && !data.name?.toLowerCase().includes('firefox') && !data.name?.toLowerCase().includes('safari') && !data.name?.toLowerCase().includes('edge')) {
      return [];
    }

    const isBrowser = type === 'browser' || data.name?.toLowerCase().includes('chrome') || data.name?.toLowerCase().includes('browser') || data.name?.toLowerCase().includes('firefox') || data.name?.toLowerCase().includes('safari') || data.name?.toLowerCase().includes('edge');
    
    if (!isBrowser) return [];

    // Get tabs for this specific browser app
    if (source === 'monitor' && monitorId) {
      // For monitor apps, filter from global browserTabs array using instance ID
      return browserTabs.filter(tab => 
        tab.monitorId === monitorId && 
        tab.browser === data.name &&
        tab.appInstanceId === data.instanceId
      );
    } else if (source === 'minimized') {
      // For minimized apps, return the tabs stored directly in the app data
      return data.browserTabs || [];
    }
    
    return [];
  };

  // Handle adding content via paste
  const handlePasteContent = () => {
    if (!pasteInput.trim()) return;

    const trimmedInput = pasteInput.trim();
    let contentType = pasteType;
    
    // Auto-detect type if set to auto
    if (contentType === 'auto') {
      if (trimmedInput.match(/^https?:\/\//i)) {
        contentType = 'link';
      } else if (trimmedInput.match(/^[a-zA-Z]:\\/i) || trimmedInput.startsWith('/') || trimmedInput.includes('\\')) {
        contentType = 'file';
      } else {
        contentType = 'link'; // Default to link
      }
    }

    if (contentType === 'link') {
      // Add as browser tab if this is a browser app
      const isBrowser = type === 'browser' || data.name?.toLowerCase().includes('chrome') || data.name?.toLowerCase().includes('browser') || data.name?.toLowerCase().includes('firefox') || data.name?.toLowerCase().includes('safari') || data.name?.toLowerCase().includes('edge');
      
      if (isBrowser) {
        if (source === 'monitor' && onAddBrowserTab) {
          // For monitor apps, add to global browserTabs array
          const newTab = {
            name: extractTitleFromUrl(trimmedInput),
            url: trimmedInput,
            browser: data.name,
            newWindow: false,
            monitorId: monitorId,
            isActive: false,
            appInstanceId: data.instanceId,
            id: `pasted-tab-${Date.now()}`
          };
          onAddBrowserTab(newTab);
        } else if (source === 'minimized' && onUpdateApp) {
          // For minimized apps, add to app's own browserTabs array
          const currentTabs = data.browserTabs || [];
          const newTab = {
            name: extractTitleFromUrl(trimmedInput),
            url: trimmedInput,
            isActive: false
          };
          onUpdateApp({ browserTabs: [...currentTabs, newTab] });
        }
      } else if (type === 'app' && onUpdateAssociatedFiles) {
        // Add as associated content for regular apps
        const newFile = {
          id: `pasted-content-${Date.now()}`,
          name: extractTitleFromUrl(trimmedInput),
          path: trimmedInput,
          type: 'url',
          url: trimmedInput,
          associatedApp: 'Default Browser',
          useDefaultApp: true
        };
        const currentFiles = currentData.associatedFiles || [];
        onUpdateAssociatedFiles([...currentFiles, newFile]);
      }
    } else if (contentType === 'file') {
      // Add as associated file
      if (type === 'app' && onUpdateAssociatedFiles) {
        const fileName = trimmedInput.split(/[/\\]/).pop() || 'Unknown File';
        const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'unknown';
        
        const newFile = {
          id: `pasted-file-${Date.now()}`,
          name: fileName,
          path: trimmedInput,
          type: fileExtension,
          associatedApp: 'Default',
          useDefaultApp: true
        };
        const currentFiles = currentData.associatedFiles || [];
        onUpdateAssociatedFiles([...currentFiles, newFile]);
      }
    }

    // Clear input
    setPasteInput('');
  };

  // Extract title from URL
  const extractTitleFromUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '') || 'New Tab';
    } catch {
      return url.length > 30 ? url.substring(0, 30) + '...' : url;
    }
  };

  // Remove browser tab
  const removeBrowserTab = (tabIndex: number) => {
    const appTabs = getAppBrowserTabs();
    const tabToRemove = appTabs[tabIndex];
    if (!tabToRemove) return;

    if (source === 'monitor' && onUpdateBrowserTabs) {
      // For monitor apps, remove from global browserTabs array
      const updatedTabs = browserTabs.filter(tab => 
        !(tab.monitorId === tabToRemove.monitorId && 
          tab.browser === tabToRemove.browser && 
          tab.name === tabToRemove.name && 
          tab.url === tabToRemove.url &&
          tab.appInstanceId === data.instanceId)
      );
      onUpdateBrowserTabs(updatedTabs);
    } else if (source === 'minimized' && onUpdateApp) {
      // For minimized apps, remove from app's own browserTabs array
      const currentTabs = data.browserTabs || [];
      const updatedAppTabs = currentTabs.filter((_: any, index: number) => index !== tabIndex);
      onUpdateApp({ browserTabs: updatedAppTabs });
    }
  };

  // Remove associated file
  const removeAssociatedFile = (fileIndex: number) => {
    if (!onUpdateAssociatedFiles) return;
    
    const currentFiles = currentData.associatedFiles || [];
    const updatedFiles = currentFiles.filter((_: any, index: number) => index !== fileIndex);
    onUpdateAssociatedFiles(updatedFiles);
  };

  // Render Content Tab Content
  const renderContentTab = () => {
    const isBrowser = type === 'browser' || data.name?.toLowerCase().includes('chrome') || data.name?.toLowerCase().includes('browser') || data.name?.toLowerCase().includes('firefox') || data.name?.toLowerCase().includes('safari') || data.name?.toLowerCase().includes('edge');
    const appBrowserTabs = getAppBrowserTabs();

    return (
      <div className="space-y-6">
        {/* Quick Add Section */}
        <div>
          <label className="block text-sm font-medium text-flow-text-secondary mb-3">Quick Add Content</label>
          <div className="p-4 bg-flow-surface rounded-lg border border-flow-border space-y-3">
            <div>
              <label className="block text-xs font-medium text-flow-text-muted mb-2">Paste File Path or URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pasteInput}
                  onChange={(e) => setPasteInput(e.target.value)}
                  placeholder="C:\\path\\to\\file.txt or https://example.com"
                  className="flex-1 px-3 py-2 text-sm bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
                  onKeyDown={(e) => e.key === 'Enter' && handlePasteContent()}
                />
                <button
                  onClick={handlePasteContent}
                  disabled={!pasteInput.trim()}
                  className="px-3 py-2 bg-flow-accent-blue hover:bg-flow-accent-blue-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-flow-text-muted">Type:</label>
              <div className="flex gap-2">
                {['auto', 'file', 'link'].map((typeOption) => (
                  <button
                    key={typeOption}
                    onClick={() => setPasteType(typeOption as any)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      pasteType === typeOption
                        ? 'bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30'
                        : 'bg-flow-bg-primary text-flow-text-secondary hover:bg-flow-surface border border-flow-border'
                    }`}
                  >
                    {typeOption === 'auto' ? 'Auto' : typeOption === 'file' ? 'File' : 'Link'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Browser Tabs (for browser apps) */}
        {isBrowser && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-flow-text-secondary">Browser Tabs</label>
              <span className="text-xs text-flow-text-muted">
                {appBrowserTabs.length} tab{appBrowserTabs.length !== 1 ? 's' : ''}
              </span>
            </div>
            
            {appBrowserTabs.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-elegant">
                {appBrowserTabs.map((tab: any, index: number) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-flow-surface rounded-lg border border-flow-border group">
                    <Globe className="w-4 h-4 flex-shrink-0 text-flow-text-muted" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-flow-text-primary truncate">{tab.name}</div>
                      <div className="text-xs text-flow-text-muted truncate">{tab.url}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tab.isActive && <div className="w-2 h-2 bg-flow-accent-blue rounded-full" />}
                      <button 
                        onClick={() => window.open(tab.url, '_blank')}
                        className="p-1.5 text-flow-text-muted hover:text-flow-accent-blue rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => removeBrowserTab(index)}
                        className="p-1.5 text-flow-text-muted hover:text-flow-accent-red rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center bg-flow-surface rounded-lg border border-flow-border">
                <Globe className="w-8 h-8 text-flow-text-muted mx-auto mb-2" />
                <p className="text-sm text-flow-text-muted">No tabs configured</p>
                <p className="text-xs text-flow-text-muted mt-1">Paste URLs above to add browser tabs</p>
              </div>
            )}
          </div>
        )}

        {/* Associated Content/Files (for all apps, including browsers) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-flow-text-secondary">Associated Files & Content</label>
            <button 
              onClick={() => setShowFileAssociationModal(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-white rounded-lg text-xs transition-colors"
            >
              <Plus className="w-3 h-3" />
              Browse Files
            </button>
          </div>
          
          {(currentData.associatedFiles || []).length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-elegant">
              {(currentData.associatedFiles || []).map((file: any, index: number) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-flow-surface rounded-lg border border-flow-border group">
                  {file.type === 'url' || file.url ? (
                    <Link2 className="w-4 h-4 flex-shrink-0 text-flow-accent-blue" />
                  ) : (
                    <FileIcon type={file.type} className="w-4 h-4 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-flow-text-primary truncate">{file.name}</div>
                    <div className="text-xs text-flow-text-muted truncate">{file.path || file.url}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(file.url || file.type === 'url') && (
                      <button 
                        onClick={() => window.open(file.url || file.path, '_blank')}
                        className="p-1.5 text-flow-text-muted hover:text-flow-accent-blue rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                    <button 
                      onClick={() => removeAssociatedFile(index)}
                      className="p-1.5 text-flow-text-muted hover:text-flow-accent-red rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center bg-flow-surface rounded-lg border border-flow-border">
              <FileText className="w-8 h-8 text-flow-text-muted mx-auto mb-2" />
              <p className="text-sm text-flow-text-muted">No files or content associated with this app</p>
              <p className="text-xs text-flow-text-muted mt-1">Paste file paths above to add content</p>
            </div>
          )}
        </div>

        {/* Custom Launch Arguments */}
        <div>
          <label className="block text-sm font-medium text-flow-text-secondary mb-3">Custom Launch Arguments</label>
          <input
            type="text"
            value={currentData.customArgs || ''}
            onChange={(e) => handleFieldUpdate('customArgs', e.target.value)}
            placeholder="--profile dev --disable-extensions"
            className="w-full px-3 py-2 text-sm bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
          />
        </div>
      </div>
    );
  };

  // Render Metadata Tab Content
  const renderMetadataTab = () => (
    <div className="space-y-6">
      {/* Tags */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Tags</label>
        <input
          type="text"
          value={currentData.tags || ''}
          onChange={(e) => handleFieldUpdate('tags', e.target.value)}
          placeholder="productivity, work, development"
          className="w-full px-3 py-2 text-sm bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
        />
        {currentData.tags && (
          <div className="flex flex-wrap gap-2 mt-2">
            {currentData.tags.split(',').map((tag: string, index: number) => (
              <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-flow-accent-blue/20 text-flow-accent-blue rounded-lg text-xs">
                <Hash className="w-3 h-3" />
                {tag.trim()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Notes</label>
        <textarea
          value={currentData.notes || ''}
          onChange={(e) => handleFieldUpdate('notes', e.target.value)}
          placeholder="Add notes or reminders about this app..."
          rows={4}
          className="w-full px-3 py-2 text-sm bg-flow-bg-primary border border-flow-border rounded-lg text-flow-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
        />
      </div>

      {/* Preview Settings */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Preview Settings</label>
        <div className="flex items-center justify-between p-3 bg-flow-surface rounded-lg border border-flow-border">
          <div>
            <div className="text-sm font-medium text-flow-text-primary">Preview on Hover</div>
            <div className="text-xs text-flow-text-muted">Show app in monitor preview when hovering</div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={currentData.previewOnHover || false}
              onChange={(e) => handleFieldUpdate('previewOnHover', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-flow-bg-primary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-flow-accent-blue"></div>
          </label>
        </div>
      </div>
    </div>
  );

  // Render Debug Tab Content
  const renderDebugTab = () => (
    <div className="space-y-6">
      {/* Test Launch */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Test Launch</label>
        <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-white rounded-lg text-sm transition-colors">
          <TestTube className="w-4 h-4" />
          Launch App with Current Settings
        </button>
      </div>

      {/* Movement Actions */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Movement Actions</label>
        <div className="space-y-2">
          {source === 'monitor' && onMoveToMinimized && (
            <button 
              onClick={onMoveToMinimized}
              className="w-full flex items-center gap-3 px-4 py-3 bg-flow-surface border border-flow-border text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary hover:border-flow-border-accent rounded-lg transition-all text-sm"
            >
              <Minimize2 className="w-4 h-4" />
              Move to Minimized
            </button>
          )}
          
          {source === 'minimized' && monitors.map((monitor: any) => (
            <button 
              key={monitor.id}
              onClick={() => onMoveToMonitor && onMoveToMonitor(monitor.id)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-flow-surface border border-flow-border text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary hover:border-flow-border-accent rounded-lg transition-all text-sm"
            >
              <Monitor className="w-4 h-4" />
              Move to {monitor.name}
            </button>
          ))}
        </div>
      </div>

      {/* Reset Options */}
      <div>
        <label className="block text-sm font-medium text-flow-text-secondary mb-3">Reset Options</label>
        <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-flow-accent-red/10 border border-flow-accent-red/30 text-flow-accent-red hover:bg-flow-accent-red/20 rounded-lg text-sm transition-colors">
          <RotateCcw className="w-4 h-4" />
          Reset to Default Settings
        </button>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'identity': return renderIdentityTab();
      case 'launch': return renderLaunchTab();
      case 'content': return renderContentTab();
      case 'metadata': return renderMetadataTab();
      case 'debug': return renderDebugTab();
      default: return renderIdentityTab();
    }
  };

  return (
    <div className="h-full flex flex-col bg-flow-bg-secondary">
      {/* App Header - Always visible */}
      <div className="px-6 py-4 border-b border-flow-border bg-flow-bg-tertiary">
        <div className="flex items-start gap-4">
          {renderAppIcon(currentData)}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg font-semibold text-flow-text-primary truncate">
                {currentData.name}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                source === 'monitor' 
                  ? 'bg-flow-accent-blue/20 text-flow-accent-blue' 
                  : 'bg-flow-accent-purple/20 text-flow-accent-purple'
              }`}>
                {source === 'monitor' ? 'On Monitor' : 'Minimized'}
              </span>
            </div>
            <p className="text-sm text-flow-text-muted truncate font-mono">
              {currentData.executablePath || 'C:\\Program Files\\App\\app.exe'}
            </p>
            {monitorId && (
              <p className="text-xs text-flow-text-muted mt-1">
                Monitor: {monitors.find(m => m.id === monitorId)?.name || 'Unknown'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-flow-border bg-flow-bg-tertiary">
        <div className="flex">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition-all duration-200 border-b-2 ${
                  activeTab === tab.id
                    ? 'border-flow-accent-blue text-flow-accent-blue bg-flow-bg-secondary'
                    : 'border-transparent text-flow-text-muted hover:text-flow-text-primary hover:bg-flow-surface'
                }`}
              >
                <IconComponent className="w-3 h-3" />
                <span className="hidden sm:block">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-elegant">
        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>

      {/* File Association Modal */}
      {showFileAssociationModal && (
        <AppFileAssociationModal
          isOpen={showFileAssociationModal}
          onClose={() => setShowFileAssociationModal(false)}
          onSave={(files) => {
            if (onUpdateAssociatedFiles) {
              onUpdateAssociatedFiles(files);
            }
            setShowFileAssociationModal(false);
          }}
          currentFiles={currentData.associatedFiles || []}
        />
      )}
    </div>
  );
}