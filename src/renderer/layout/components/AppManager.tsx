import { useState } from "react";
import { Search, Settings, Trash2, Users, Monitor, Volume2, VolumeX, Shield, Power, Save, Filter, Move } from "lucide-react";
import { Globe, FileText, MessageCircle, Code, Music, Calendar, Mail, Terminal, Camera, BarChart3 } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface AppManagerProps {
  profiles: any[];
  onUpdateProfile: (profileId: string, updates: any) => void;
  onAddApp?: (profileId: string, monitorId: string, newApp: any) => void;
  onAddAppToMinimized?: (profileId: string, newApp: any) => void;
  onDragStart?: () => void;
  onCustomDragStart: (data: any, sourceType: 'sidebar' | 'monitor' | 'minimized', sourceId: string, startPos: { x: number; y: number }, preview?: React.ReactNode) => void;
  currentProfile?: any;
  compact?: boolean;
}

const allApps = [
  { name: 'Chrome', icon: Globe, color: '#4285F4', category: 'Browser' },
  { name: 'VS Code', icon: Code, color: '#007ACC', category: 'Development' },
  { name: 'Terminal', icon: Terminal, color: '#000000', category: 'Development' },
  { name: 'Slack', icon: MessageCircle, color: '#4A154B', category: 'Communication' },
  { name: 'Discord', icon: MessageCircle, color: '#5865F2', category: 'Communication' },
  { name: 'Spotify', icon: Music, color: '#1DB954', category: 'Media' },
  { name: 'Calendar', icon: Calendar, color: '#EA4335', category: 'Productivity' },
  { name: 'Mail', icon: Mail, color: '#1565C0', category: 'Productivity' },
  { name: 'Notes', icon: FileText, color: '#FFA500', category: 'Productivity' },
  { name: 'Camera', icon: Camera, color: '#8B5CF6', category: 'Media' },
  { name: 'Analytics', icon: BarChart3, color: '#FF6B35', category: 'Business' },
];

export function AppManager({ 
  profiles, 
  onUpdateProfile, 
  onAddApp, 
  onAddAppToMinimized, 
  onDragStart,
  onCustomDragStart,
  currentProfile, 
  compact = false 
}: AppManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const categories = Array.from(new Set(allApps.map(app => app.category)));
  
  const filteredApps = allApps.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getAppUsage = (appName: string) => {
    const usage = {
      profiles: [] as any[],
      totalInstances: 0,
      avgVolume: 0,
      commonBehavior: 'new' as string,
      runAsAdmin: false,
      forceCloseOnExit: false,
      smartSave: false
    };

    profiles.forEach(profile => {
      const instances: any[] = [];
      
      // Check monitors
      profile.monitors?.forEach((monitor: any) => {
        monitor.apps?.forEach((app: any) => {
          if (app.name === appName) {
            instances.push({ ...app, location: monitor.name, type: 'monitor' });
          }
        });
      });
      
      // Check minimized apps
      profile.minimizedApps?.forEach((app: any) => {
        if (app.name === appName) {
          instances.push({ ...app, location: 'Minimized', type: 'minimized' });
        }
      });

      if (instances.length > 0) {
        usage.profiles.push({ profile, instances });
        usage.totalInstances += instances.length;
      }
    });

    // Calculate averages and common settings
    if (usage.totalInstances > 0) {
      const allInstances = usage.profiles.flatMap(p => p.instances);
      
      const volumes = allInstances.map(i => i.volume || 0);
      usage.avgVolume = Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length);
      
      const behaviors = allInstances.map(i => i.launchBehavior);
      usage.commonBehavior = behaviors.sort((a, b) =>
        behaviors.filter(v => v === a).length - behaviors.filter(v => v === b).length
      ).pop() || 'new';

      // Check if any instance has special settings
      usage.runAsAdmin = allInstances.some(i => i.runAsAdmin);
      usage.forceCloseOnExit = allInstances.some(i => i.forceCloseOnExit);
      usage.smartSave = allInstances.some(i => i.smartSave);
    }

    return usage;
  };

  const removeAppFromProfile = (appName: string, profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    const updatedMonitors = profile.monitors.map((monitor: any) => ({
      ...monitor,
      apps: monitor.apps.filter((app: any) => app.name !== appName)
    }));

    const updatedMinimizedApps = profile.minimizedApps?.filter((app: any) => app.name !== appName) || [];

    onUpdateProfile(profileId, {
      monitors: updatedMonitors,
      minimizedApps: updatedMinimizedApps,
      appCount: Math.max(0, profile.appCount - 1)
    });
  };

  // CUSTOM DRAG SYSTEM - Mouse-based dragging
  const handleMouseDown = (e: React.MouseEvent, app: any) => {
    e.preventDefault();
    
    console.log('🎯 CUSTOM DRAG START (SIDEBAR):', app);
    
    const dragData = {
      source: 'sidebar',
      type: 'app',
      name: app.name,
      icon: app.icon,
      color: app.color,
      category: app.category
    };
    
    const preview = (
      <div className="flex items-center gap-2">
        <app.icon className="w-4 h-4" style={{ color: app.color }} />
        <span>{app.name}</span>
      </div>
    );
    
    onCustomDragStart(
      dragData,
      'sidebar',
      'apps',
      { x: e.clientX, y: e.clientY },
      preview
    );
    
    // Call parent's onDragStart to enable edit mode
    if (onDragStart) {
      onDragStart();
    }
  };

  if (compact) {
    return (
      <div className="p-4">
        {/* Header - CLEAN: Consistent with UI */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-flow-text-muted" />
            <h2 className="text-xs font-medium text-flow-text-secondary uppercase tracking-wide">Apps</h2>
          </div>
          <span className="text-flow-text-muted text-xs">{filteredApps.length} available</span>
        </div>

        {/* Search and Filters - CLEAN: Consistent with content section */}
        <div className="space-y-3 mb-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 text-flow-text-muted" />
            <input
              type="text"
              placeholder="Search apps..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-flow-surface border border-flow-border rounded-lg text-sm text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50 transition-all duration-200"
            />
          </div>

          {/* Category Filter - Compact design */}
          <div className="flex items-center gap-2">
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="flex-1 px-2 py-1.5 bg-flow-surface border border-flow-border rounded text-xs text-flow-text-primary focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue/50 transition-all duration-200"
              title="Filter by category"
            >
              <option value="">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>

            <button
              onClick={() => setExpandedApp(expandedApp ? null : 'toggle-all')}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded transition-colors ${
                expandedApp ? 'bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30' : 'bg-flow-surface border border-flow-border text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary hover:border-flow-border-accent'
              }`}
              title="Show app details"
            >
              <Settings className="w-3 h-3" />
              <span className="whitespace-nowrap">Details</span>
            </button>
          </div>
        </div>

        {/* Drag Instructions - Compact */}
        <div className="bg-flow-accent-blue/10 border border-flow-accent-blue/30 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-xs text-flow-accent-blue">
            <Move className="w-3 h-3" />
            <span>Drag apps to monitors or minimized section</span>
          </div>
        </div>

        {/* App List - CLEAN: Smart scrolling with elegant scrollbar, no horizontal scroll */}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto overflow-x-hidden scrollbar-elegant">
          {filteredApps.map((app, index) => {
            const usage = getAppUsage(app.name);
            const isExpanded = expandedApp === app.name || expandedApp === 'toggle-all';
            
            return (
              <div 
                key={index} 
                className="bg-flow-surface border border-flow-border rounded-lg transition-all duration-200 hover:border-flow-border-accent"
              >
                <div className="flex items-center gap-3 p-3">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-grab active:cursor-grabbing transition-transform hover:scale-105 select-none"
                    style={{ backgroundColor: `${app.color}20` }}
                    onMouseDown={(e) => handleMouseDown(e, app)}
                    title="Drag to add to monitor or minimized apps"
                  >
                    <app.icon className="w-4 h-4 text-white" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h4 className="text-flow-text-primary text-sm font-medium truncate">{app.name}</h4>
                      <div className="flex items-center gap-1">
                        {usage.runAsAdmin && (
                          <span className="text-yellow-400 text-xs" title="Run as Admin">⚡</span>
                        )}
                        {usage.forceCloseOnExit && (
                          <Power className="w-3 h-3 text-flow-accent-red" title="Force Close" />
                        )}
                        {usage.smartSave && (
                          <Save className="w-3 h-3 text-flow-accent-green" title="Smart Save" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-flow-text-muted">
                      <span className="px-1.5 py-0.5 bg-flow-bg-tertiary rounded text-xs">{app.category}</span>
                      {usage.totalInstances > 0 && (
                        <>
                          <span>{usage.profiles.length} profiles</span>
                          <span>{usage.totalInstances} instances</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setExpandedApp(isExpanded ? null : app.name)}
                    className="p-1 text-flow-text-muted hover:text-flow-text-primary transition-colors"
                    title="Toggle details"
                  >
                    <Settings className="w-3 h-3" />
                  </button>
                </div>

                {/* Expanded Details - CLEAN: More compact */}
                {isExpanded && usage.profiles.length > 0 && (
                  <div className="px-3 pb-3 space-y-1">
                    {usage.profiles.slice(0, 3).map((profileUsage, pIndex) => (
                      <div key={pIndex} className="flex items-center justify-between text-xs p-2 bg-flow-bg-tertiary rounded">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-flow-text-primary font-medium truncate">{profileUsage.profile.name}</span>
                          <div className="flex gap-1">
                            {profileUsage.instances.slice(0, 2).map((instance: any, iIndex: number) => (
                              <span key={iIndex} className="px-1 py-0.5 bg-flow-surface text-flow-text-muted rounded text-xs">
                                {instance.location}
                              </span>
                            ))}
                            {profileUsage.instances.length > 2 && (
                              <span className="px-1 py-0.5 bg-flow-surface text-flow-text-muted rounded text-xs">
                                +{profileUsage.instances.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeAppFromProfile(app.name, profileUsage.profile.id)}
                          className="p-1 hover:bg-flow-accent-red/20 rounded text-flow-accent-red transition-colors flex-shrink-0"
                          title="Remove from profile"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {usage.profiles.length > 3 && (
                      <div className="text-xs text-flow-text-muted text-center py-1">
                        +{usage.profiles.length - 3} more profiles
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* App Settings Modal */}
        {showAppSettings && selectedApp && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-flow-surface-elevated backdrop-blur-xl border border-flow-border rounded-2xl p-4 max-w-md w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${selectedApp.color}20` }}
                  >
                    <selectedApp.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-flow-text-primary font-medium">{selectedApp.name}</h3>
                    <p className="text-flow-text-muted text-xs">Global app settings</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAppSettings(false)}
                  className="p-1 hover:bg-flow-surface rounded transition-colors"
                >
                  <Save className="w-4 h-4 text-flow-text-muted rotate-45" />
                </button>
              </div>

              <div className="space-y-4">
                {selectedApp.usage.profiles.map((profileUsage: any, index: number) => (
                  <div key={index} className="bg-flow-surface border border-flow-border rounded-lg p-3">
                    <h4 className="text-flow-text-primary text-sm mb-2">{profileUsage.profile.name}</h4>
                    <div className="space-y-2">
                      {profileUsage.instances.map((instance: any, iIndex: number) => (
                        <div key={iIndex} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-flow-text-secondary">{instance.location}</span>
                            <div className="flex items-center gap-1">
                              {instance.runAsAdmin && <span className="text-yellow-400">⚡</span>}
                              {instance.forceCloseOnExit && <Power className="w-3 h-3 text-flow-accent-red" />}
                              {instance.smartSave && <Save className="w-3 h-3 text-flow-accent-green" />}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-flow-text-muted">{instance.volume || 50}%</span>
                            <span className="text-flow-text-muted">{instance.launchBehavior}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-4">
                <button 
                  onClick={() => setShowAppSettings(false)}
                  className="flex-1 px-3 py-2 bg-flow-surface text-flow-text-secondary border border-flow-border rounded-lg text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full size version (existing code would go here for non-compact mode)
  return (
    <div className="space-y-6">
      {/* Full implementation would be here */}
      <div className="text-flow-text-muted text-center py-8">
        Full App Manager (non-compact mode)
      </div>
    </div>
  );
}