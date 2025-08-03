import { useState } from "react";
import { Globe, X, Copy, Bookmark, Plus, MoreVertical, ExternalLink, Monitor, Minimize2, Maximize2 } from "lucide-react";

interface BrowserTab {
  name: string;
  url: string;
  browser: string;
  newWindow: boolean;
  monitorId?: string;
  isActive?: boolean;
  id?: string;
}

interface MinimizedApp {
  name: string;
  icon: any;
  color: string;
  volume?: number;
  launchBehavior?: 'new' | 'focus' | 'minimize';
  targetMonitor?: string;
  browserTabs?: { name: string; url: string; isActive: boolean }[];
}

interface BrowserTabsProps {
  tabs: BrowserTab[];
  minimizedApps?: MinimizedApp[];
  onUpdateTabs: (tabs: BrowserTab[]) => void;
  onAddTab: (tab: BrowserTab) => void;
  onTabBookmark?: (tab: BrowserTab) => void;
  isEditMode?: boolean;
  monitors?: Array<{
    id: string;
    name: string;
    primary: boolean;
    apps?: Array<{
      name: string;
      icon: any;
      color: string;
      monitorId?: string;
    }>;
  }>;
}

export function BrowserTabs({ 
  tabs, 
  minimizedApps = [],
  onUpdateTabs, 
  onAddTab, 
  onTabBookmark,
  isEditMode = false,
  monitors = []
}: BrowserTabsProps) {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [draggedTab, setDraggedTab] = useState<number | null>(null);
  const [hoveredTab, setHoveredTab] = useState<number | null>(null);

  // Get all browser instances from monitors, minimized apps, and standalone tabs
  const getAllBrowserInstances = () => {
    const instances: Array<{
      id: string;
      browser: string;
      type: 'monitor' | 'minimized' | 'standalone';
      monitorId?: string;
      monitorName: string;
      tabs: BrowserTab[];
      isPrimary?: boolean;
      appName?: string;
    }> = [];

    // Track which browser apps and tabs we've already processed to avoid duplicates
    const processedBrowserApps = new Set<string>();
    const processedTabs = new Set<string>();

    // Add browser apps from monitors
    monitors.forEach((monitor, monitorIndex) => {
      monitor.apps?.forEach((app, appIndex) => {
        const isBrowser = app.name.toLowerCase().includes('chrome') || 
                         app.name.toLowerCase().includes('browser') ||
                         app.name.toLowerCase().includes('firefox') ||
                         app.name.toLowerCase().includes('safari') ||
                         app.name.toLowerCase().includes('edge');
        
        if (isBrowser) {
          const browserKey = `${monitor.id}-${app.name}`;
          
          // Only process if we haven't seen this browser app on this monitor before
          if (!processedBrowserApps.has(browserKey)) {
            processedBrowserApps.add(browserKey);
            
            const relatedTabs = tabs.filter(tab => {
              const tabKey = `${tab.monitorId}-${tab.browser}-${tab.name}-${tab.url}`;
              if (tab.monitorId === monitor.id && tab.browser === app.name && !processedTabs.has(tabKey)) {
                processedTabs.add(tabKey);
                return true;
              }
              return false;
            });
            
            instances.push({
              id: `monitor-${monitor.id}-${app.name}-${monitorIndex}-${appIndex}`,
              browser: app.name,
              type: 'monitor',
              monitorId: monitor.id,
              monitorName: monitor.name,
              tabs: relatedTabs,
              isPrimary: monitor.primary,
              appName: app.name
            });
          }
        }
      });
    });

    // Add browser apps from minimized apps
    minimizedApps.forEach((app, index) => {
      const isBrowser = app.name.toLowerCase().includes('chrome') || 
                       app.name.toLowerCase().includes('browser') ||
                       app.name.toLowerCase().includes('firefox') ||
                       app.name.toLowerCase().includes('safari') ||
                       app.name.toLowerCase().includes('edge');
      
      if (isBrowser) {
        const monitor = monitors.find(m => m.id === app.targetMonitor);
        const browserTabs = app.browserTabs || [];
        
        // Only show minimized browser apps that actually have tabs or aren't already on a monitor
        const monitorKey = `${app.targetMonitor}-${app.name}`;
        const hasTabsOrNotOnMonitor = browserTabs.length > 0 || !processedBrowserApps.has(monitorKey);
        
        if (hasTabsOrNotOnMonitor) {
          const standaloneTabsFormat = browserTabs.map((tab, tabIndex) => {
            const tabKey = `minimized-${index}-${tabIndex}-${tab.name}-${tab.url}`;
            processedTabs.add(tabKey);
            return {
              ...tab,
              browser: app.name,
              newWindow: false,
              monitorId: app.targetMonitor,
              id: tabKey
            };
          });

          instances.push({
            id: `minimized-${index}-${app.name}-${Date.now()}`,
            browser: app.name,
            type: 'minimized',
            monitorId: app.targetMonitor,
            monitorName: monitor?.name || 'Unassigned',
            tabs: standaloneTabsFormat,
            isPrimary: monitor?.primary,
            appName: app.name
          });
        }
      }
    });

    // Add standalone browser tabs (those not covered by apps or minimized apps)
    const uncoveredTabs = tabs.filter(tab => {
      const tabKey = `${tab.monitorId}-${tab.browser}-${tab.name}-${tab.url}`;
      return !processedTabs.has(tabKey);
    });
    
    if (uncoveredTabs.length > 0) {
      const groupedByMonitorAndBrowser = uncoveredTabs.reduce((acc, tab) => {
        const monitorId = tab.monitorId || 'unassigned';
        const browser = tab.browser || 'Browser';
        const key = `${monitorId}-${browser}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(tab);
        return acc;
      }, {} as { [key: string]: BrowserTab[] });

      Object.entries(groupedByMonitorAndBrowser).forEach(([key, tabGroup], groupIndex) => {
        const [monitorId, browser] = key.split('-');
        const monitor = monitors.find(m => m.id === monitorId);
        
        // Mark these tabs as processed
        tabGroup.forEach(tab => {
          const tabKey = `${tab.monitorId}-${tab.browser}-${tab.name}-${tab.url}`;
          processedTabs.add(tabKey);
        });
        
        instances.push({
          id: `standalone-${key}-${groupIndex}-${Date.now()}`,
          browser: browser,
          type: 'standalone',
          monitorId: monitorId === 'unassigned' ? undefined : monitorId,
          monitorName: monitor?.name || 'Unassigned',
          tabs: tabGroup,
          isPrimary: monitor?.primary
        });
      });
    }

    return instances;
  };

  const duplicateTab = (tabIndex: number) => {
    const tab = tabs[tabIndex];
    const newTab = {
      ...tab,
      id: `${tab.id || tabIndex}-copy-${Date.now()}`,
      name: `${tab.name} (Copy)`,
      isActive: false
    };
    
    const newTabs = [...tabs];
    newTabs.splice(tabIndex + 1, 0, newTab);
    onUpdateTabs(newTabs);
  };

  const deleteTab = (tabIndex: number) => {
    const newTabs = tabs.filter((_, index) => index !== tabIndex);
    onUpdateTabs(newTabs);
  };

  const makeTabActive = (tabIndex: number) => {
    const browserGroup = tabs[tabIndex];
    const newTabs = tabs.map((tab, index) => ({
      ...tab,
      isActive: index === tabIndex && tab.browser === browserGroup.browser && tab.monitorId === browserGroup.monitorId
    }));
    onUpdateTabs(newTabs);
  };

  const bookmarkTab = (tabIndex: number) => {
    const tab = tabs[tabIndex];
    if (onTabBookmark) {
      onTabBookmark(tab);
    }
  };

  const addNewTab = (monitorId: string, browser: string = 'Chrome') => {
    const newTab: BrowserTab = {
      name: 'New Tab',
      url: 'about:blank',
      browser: browser,
      newWindow: false,
      monitorId: monitorId,
      isActive: false,
      id: `tab-${Date.now()}`
    };
    
    onAddTab(newTab);
  };

  const handleDragStart = (e: React.DragEvent, tabIndex: number) => {
    setDraggedTab(tabIndex);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({
      source: 'browser-tab',
      tabIndex: tabIndex,
      tab: tabs[tabIndex]
    }));
  };

  const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedTab !== null && draggedTab !== targetIndex) {
      const newTabs = [...tabs];
      const draggedItem = newTabs[draggedTab];
      newTabs.splice(draggedTab, 1);
      newTabs.splice(targetIndex, 0, draggedItem);
      onUpdateTabs(newTabs);
      setDraggedTab(targetIndex);
    }
  };

  const handleDragEnd = () => {
    setDraggedTab(null);
  };

  const browserInstances = getAllBrowserInstances();

  // Don't render anything if no browser instances exist
  if (browserInstances.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-white/70" />
          <h4 className="text-white text-sm">Browser Windows</h4>
          <span className="text-white/50 text-xs">({browserInstances.length} instance{browserInstances.length !== 1 ? 's' : ''})</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {browserInstances.map((instance, instanceIndex) => {
          const activeTabs = instance.tabs.filter(tab => tab.isActive);
          const typeIcon = instance.type === 'minimized' ? Minimize2 : Monitor;
          const TypeIconComponent = typeIcon;
          
          return (
            <div key={`${instance.id}-${instanceIndex}`} className="bg-flow-surface border border-flow-border rounded-lg overflow-hidden">
              {/* Compact Browser Header */}
              <div className="flex items-center justify-between p-3 bg-flow-bg-tertiary">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Globe className="w-4 h-4 text-flow-accent-blue flex-shrink-0" />
                  <span className="text-flow-text-primary text-sm font-medium truncate">{instance.browser}</span>
                  
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <TypeIconComponent className="w-3 h-3 text-flow-text-muted" />
                    <span className="text-flow-text-secondary text-xs">
                      {instance.monitorName}
                    </span>
                    {instance.isPrimary && (
                      <div className="w-1.5 h-1.5 bg-flow-accent-blue rounded-full" title="Primary Monitor" />
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-flow-text-muted text-xs">
                    {instance.tabs.length} tab{instance.tabs.length !== 1 ? 's' : ''}
                  </span>
                  {isEditMode && (
                    <button
                      onClick={() => addNewTab(instance.monitorId || 'monitor-1', instance.browser)}
                      className="p-1 hover:bg-flow-surface-elevated rounded transition-colors"
                      title="Add Tab"
                    >
                      <Plus className="w-3 h-3 text-flow-text-muted" />
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Tab List */}
              {instance.tabs.length > 0 && (
                <div className="p-3 space-y-2">
                  {instance.tabs.slice(0, 3).map((tab, localIndex) => {
                    const globalIndex = tabs.indexOf(tab);
                    const isActive = tab.isActive;
                    
                    return (
                      <div
                        key={`${instance.id}-tab-${localIndex}-${tab.id || tab.name}-${tab.url}`}
                        className={`flex items-center gap-2 p-2 rounded-lg transition-all duration-200 ${
                          isActive 
                            ? 'bg-flow-accent-blue/20 border border-flow-accent-blue/30' 
                            : 'bg-flow-bg-tertiary hover:bg-flow-surface border border-transparent'
                        }`}
                        onClick={() => !isEditMode && globalIndex >= 0 && makeTabActive(globalIndex)}
                      >
                        <Globe className="w-3 h-3 text-flow-text-muted flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-flow-text-primary truncate">{tab.name}</div>
                          {tab.url && tab.url !== 'about:blank' && (
                            <div className="text-xs text-flow-text-muted truncate">{tab.url}</div>
                          )}
                        </div>
                        {isActive && (
                          <div className="w-2 h-2 bg-flow-accent-blue rounded-full flex-shrink-0" />
                        )}
                        {tab.newWindow && (
                          <ExternalLink className="w-3 h-3 text-flow-text-muted flex-shrink-0" />
                        )}
                        {isEditMode && globalIndex >= 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTab(globalIndex);
                            }}
                            className="p-1 hover:bg-flow-accent-red/20 rounded transition-colors"
                            title="Close Tab"
                          >
                            <X className="w-3 h-3 text-flow-accent-red" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  
                  {instance.tabs.length > 3 && (
                    <div className="text-center">
                      <span className="text-xs text-flow-text-muted">
                        +{instance.tabs.length - 3} more tab{instance.tabs.length - 3 !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Type Indicator */}
              <div className="px-3 pb-2">
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
                  instance.type === 'minimized' 
                    ? 'bg-flow-accent-purple/20 text-flow-accent-purple border border-flow-accent-purple/30'
                    : instance.type === 'monitor'
                    ? 'bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30'
                    : 'bg-flow-accent-green/20 text-flow-accent-green border border-flow-accent-green/30'
                }`}>
                  <TypeIconComponent className="w-3 h-3" />
                  {instance.type === 'minimized' ? 'Minimized' : 
                   instance.type === 'monitor' ? 'Active' : 'Standalone'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}