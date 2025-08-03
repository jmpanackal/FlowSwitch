import { useState } from "react";
import { Monitor, Folder, Globe, MoreVertical, Copy, Edit, Trash2, Settings, Download, Zap, ZapOff, Clock, Layers } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface Profile {
  id: string;
  name: string;
  icon: string;
  description: string;
  appCount: number;
  tabCount: number;
  isActive: boolean;
  onStartup?: boolean;
  autoLaunchOnBoot?: boolean;
  autoSwitchTime?: string | null;
  estimatedStartupTime?: number;
  hotkey?: string;
  monitors: {
    id: string;
    name: string;
    primary: boolean;
    resolution: string;
    apps: {
      name: string;
      icon: LucideIcon;
      color: string;
    }[];
  }[];
  minimizedApps?: {
    name: string;
    icon: LucideIcon;
    color: string;
  }[];
}

interface ProfileCardProps {
  profile: Profile;
  onClick: () => void;
  onSettings?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onSetOnStartup?: () => void;
  disabled?: boolean;
}

export function ProfileCard({ profile, onClick, onSettings, onDuplicate, onDelete, onExport, onSetOnStartup, disabled = false }: ProfileCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showActions, setShowActions] = useState(false);
  
  const getProfileIcon = () => {
    switch (profile.icon) {
      case 'work':
        return <Folder className="w-4 h-4" />;
      case 'gaming':
        return <Monitor className="w-4 h-4" />;
      case 'personal':
        return <Globe className="w-4 h-4" />;
      default:
        return <Folder className="w-4 h-4" />;
    }
  };

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setShowActions(false);
  };

  return (
    <div className="relative">
      <div
        onClick={disabled ? undefined : onClick}
        onMouseEnter={() => !disabled && setShowDetails(true)}
        onMouseLeave={() => !disabled && setShowDetails(false)}
        className={`relative p-4 rounded-lg transition-all duration-200 group border ${
          disabled
            ? 'bg-flow-surface border-flow-border opacity-60 cursor-not-allowed'
            : profile.isActive 
              ? 'border-flow-accent-blue/50 bg-flow-accent-blue/10 shadow-lg cursor-pointer' 
              : 'bg-flow-surface border-flow-border hover:bg-flow-surface-elevated hover:border-flow-border-accent shadow-sm cursor-pointer'
        }`}
        style={{ 
          boxShadow: profile.isActive 
            ? '0 0 0 1px var(--flow-accent-blue), var(--flow-shadow-md)' 
            : 'var(--flow-shadow-sm)'
        }}
      >
        {/* Status indicators - removed active dot */}
        {(profile.autoLaunchOnBoot || profile.autoSwitchTime) && (
          <div className="absolute top-2 left-2 flex gap-1">
            {profile.autoLaunchOnBoot && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-flow-accent-green/20 text-flow-accent-green border border-flow-accent-green/30">
                <Zap className="w-2.5 h-2.5" />
              </span>
            )}
            {profile.autoSwitchTime && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-flow-accent-purple/20 text-flow-accent-purple border border-flow-accent-purple/30">
                <Clock className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
        )}
        
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg transition-colors ${
            profile.isActive ? 'bg-flow-accent-blue/20' : 'bg-flow-surface-elevated group-hover:bg-flow-surface'
          }`}>
            {getProfileIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-medium truncate ${
                profile.isActive ? 'text-flow-accent-blue' : 'text-flow-text-primary'
              }`}>{profile.name}</h3>
              {profile.hotkey && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-flow-surface text-flow-text-muted border border-flow-border">
                  {profile.hotkey.replace('Ctrl+Shift+', '⌘')}
                </span>
              )}
            </div>
            
            <p className="text-flow-text-muted text-xs mb-3 line-clamp-2">{profile.description}</p>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1 text-flow-text-muted">
                <Layers className="w-3 h-3" />
                <span>{profile.appCount} apps</span>
              </div>
              <div className="flex items-center gap-1 text-flow-text-muted">
                <Globe className="w-3 h-3" />
                <span>{profile.tabCount} tabs</span>
              </div>
              <div className="flex items-center gap-1 text-flow-text-muted">
                <Monitor className="w-3 h-3" />
                <span>{profile.monitors.length} monitors</span>
              </div>
              <div className="flex items-center gap-1 text-flow-text-muted">
                <Clock className="w-3 h-3" />
                <span>{profile.estimatedStartupTime}s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Actions Menu */}
        {!disabled && (
          <div className="absolute top-3 right-3">
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(!showActions);
                }}
                className={`p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-flow-surface transition-all ${
                  profile.isActive ? 'opacity-100' : ''
                }`}
              >
                <MoreVertical className="w-3 h-3 text-flow-text-muted" />
              </button>
            
              {showActions && (
                <div className="absolute top-6 right-0 w-48 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg z-10 py-1">
                  {onSettings && (
                    <button
                      onClick={(e) => handleActionClick(e, onSettings)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary text-sm transition-colors"
                    >
                      <Settings className="w-3 h-3" />
                      Settings
                    </button>
                  )}
                  {onSetOnStartup && (
                    <button
                      onClick={(e) => handleActionClick(e, onSetOnStartup)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary text-sm transition-colors"
                    >
                      {profile.onStartup ? <ZapOff className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                      {profile.onStartup ? 'Disable On-Startup' : 'Set On-Startup'}
                    </button>
                  )}
                  {onExport && (
                    <button
                      onClick={(e) => handleActionClick(e, onExport)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary text-sm transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Export Profile
                    </button>
                  )}
                  {onDuplicate && (
                    <button
                      onClick={(e) => handleActionClick(e, onDuplicate)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary text-sm transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                      Duplicate
                    </button>
                  )}
                  <div className="h-px bg-flow-border my-1" />
                  {onDelete && (
                    <button
                      onClick={(e) => handleActionClick(e, onDelete)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-accent-red hover:bg-flow-accent-red/10 text-sm transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Hover details tooltip */}
      {showDetails && !showActions && !profile.isActive && (
        <div className="absolute top-0 left-full ml-4 w-80 p-4 bg-flow-surface-elevated border border-flow-border rounded-xl shadow-lg z-50">
          <h4 className="text-flow-text-primary font-medium mb-3">Apps &amp; Layout Preview</h4>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {profile.monitors.map((monitor, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center gap-2 text-flow-text-secondary text-sm">
                  <Monitor className="w-3 h-3" />
                  <span>{monitor.name}</span>
                  {monitor.primary && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30">Primary</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 ml-4">
                  {monitor.apps.slice(0, 6).map((app, appIndex) => (
                    <div key={appIndex} className="flex items-center gap-1.5 px-2 py-1 bg-flow-surface rounded text-xs text-flow-text-muted">
                      <div 
                        className="w-3 h-3 rounded flex items-center justify-center"
                        style={{ backgroundColor: `${app.color}40` }}
                      >
                        <app.icon className="w-2 h-2 text-white" />
                      </div>
                      <span>{app.name}</span>
                    </div>
                  ))}
                  {monitor.apps.length > 6 && (
                    <span className="text-xs text-flow-text-muted px-2 py-1">
                      +{monitor.apps.length - 6} more
                    </span>
                  )}
                </div>
              </div>
            ))}
            
            {profile.minimizedApps && profile.minimizedApps.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-flow-border">
                <div className="text-flow-text-secondary text-sm">Minimized Apps</div>
                <div className="flex flex-wrap gap-1.5">
                  {profile.minimizedApps.map((app, appIndex) => (
                    <div key={appIndex} className="flex items-center gap-1.5 px-2 py-1 bg-flow-surface rounded text-xs text-flow-text-muted">
                      <div 
                        className="w-3 h-3 rounded flex items-center justify-center"
                        style={{ backgroundColor: `${app.color}40` }}
                      >
                        <app.icon className="w-2 h-2 text-white" />
                      </div>
                      <span>{app.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}