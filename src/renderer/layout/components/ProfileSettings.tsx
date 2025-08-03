import { useState, useEffect } from "react";
import { X, Save, User, Settings, Zap, Shield, Volume2, Clock, Keyboard, Minimize2, Maximize2, RotateCcw, Play, ArrowRight, AlertTriangle, Sparkles, Monitor, Copy, Trash2 } from "lucide-react";
import { DeleteConfirmation } from "./profile-settings/DeleteConfirmation";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import { Slider } from "./ui/slider";
import { ScheduleControl } from "./ScheduleControl";
import { AppSearchControl } from "./AppSearchControl";

interface ScheduleData {
  type: 'daily' | 'weekly';
  dailyTime?: string;
  weeklySchedule?: {
    [key: string]: {
      enabled: boolean;
      time: string;
    };
  };
}

interface ProfileSettingsProps {
  profile: {
    id: string;
    name: string;
    description: string;
    globalVolume?: number;
    backgroundBehavior?: 'keep' | 'close' | 'minimize';
    restrictedApps?: string[];
    autoLaunchOnBoot?: boolean;
    autoSwitchTime?: string | null;
    scheduleData?: ScheduleData;
    hotkey?: string;
    launchMinimized?: boolean;
    launchMaximized?: boolean;
    launchOrder?: 'all-at-once' | 'sequential';
    appLaunchDelays?: Record<string, number>;
    monitors?: any[];
    minimizedApps?: any[];
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: any) => void;
  onDuplicate?: () => void;
  onRename?: (newName: string, newDescription: string) => void;
  onDelete?: () => void;
  allProfiles?: any[];
}

type SettingsSection = 'profile' | 'audio' | 'behavior' | 'automation' | 'security';

interface SettingsTab {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const settingsTabs: SettingsTab[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: 'Name, description, and actions'
  },
  {
    id: 'audio',
    label: 'Audio',
    icon: Volume2,
    description: 'Volume and sound settings'
  },
  {
    id: 'behavior',
    label: 'Behavior',
    icon: Settings,
    description: 'App and launch behavior'
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: Sparkles,
    description: 'Auto-launch and shortcuts'
  },
  {
    id: 'security',
    label: 'Security',
    icon: Shield,
    description: 'Restricted apps and permissions'
  }
];

export function ProfileSettings({ 
  profile, 
  isOpen, 
  onClose, 
  onSave, 
  onDuplicate, 
  onRename,
  onDelete,
  allProfiles = []
}: ProfileSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsSection>('profile');
  
  // Initialize with default values
  const [globalVolume, setGlobalVolume] = useState(70);
  const [isMuted, setIsMuted] = useState(false);
  const [backgroundBehavior, setBackgroundBehavior] = useState<'keep' | 'close' | 'minimize'>('keep');
  const [restrictedApps, setRestrictedApps] = useState<string[]>([]);
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Advanced settings
  const [autoLaunchOnBoot, setAutoLaunchOnBoot] = useState(false);
  const [scheduleData, setScheduleData] = useState<ScheduleData>({
    type: 'daily',
    dailyTime: '',
    weeklySchedule: {}
  });
  const [hotkey, setHotkey] = useState('');
  const [launchMinimized, setLaunchMinimized] = useState(false);
  const [launchMaximized, setLaunchMaximized] = useState(false);
  const [launchOrder, setLaunchOrder] = useState<'all-at-once' | 'sequential'>('all-at-once');
  const [appLaunchDelays, setAppLaunchDelays] = useState<Record<string, number>>({});
  
  // App-specific volume settings
  const [appVolumes, setAppVolumes] = useState<Record<string, number>>({});
  const [selectedAppsForVolumeEdit, setSelectedAppsForVolumeEdit] = useState<Set<string>>(new Set());
  const [bulkVolumeValue, setBulkVolumeValue] = useState(50);

  // Update all form fields when profile changes
  useEffect(() => {
    if (profile) {
      setGlobalVolume(profile.globalVolume || 70);
      setIsMuted((profile.globalVolume || 70) === 0);
      setBackgroundBehavior(profile.backgroundBehavior || 'keep');
      setRestrictedApps(profile.restrictedApps || []);
      setProfileName(profile.name || '');
      setProfileDescription(profile.description || '');
      setAutoLaunchOnBoot(profile.autoLaunchOnBoot || false);
      
      // Handle both new scheduleData format and legacy autoSwitchTime
      if (profile.scheduleData) {
        setScheduleData(profile.scheduleData);
      } else if (profile.autoSwitchTime) {
        // Convert legacy format to new format
        setScheduleData({
          type: 'daily',
          dailyTime: profile.autoSwitchTime,
          weeklySchedule: {}
        });
      } else {
        setScheduleData({
          type: 'daily',
          dailyTime: '',
          weeklySchedule: {}
        });
      }
      
      setHotkey(profile.hotkey || '');
      setLaunchMinimized(profile.launchMinimized || false);
      setLaunchMaximized(profile.launchMaximized || false);
      setLaunchOrder(profile.launchOrder || 'all-at-once');
      setAppLaunchDelays(profile.appLaunchDelays || {});
      
      // Initialize app volumes
      const volumes: Record<string, number> = {};
      getAllApps().forEach(app => {
        volumes[app.instanceId || app.name] = app.volume || 50;
      });
      setAppVolumes(volumes);
    }
  }, [profile]);

  // Reset to first tab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('profile');
    }
  }, [isOpen]);

  if (!isOpen || !profile) return null;

  const handleApply = () => {
    const conflicts = validateSettings();
    if (conflicts.length > 0) {
      alert(`Cannot apply due to conflicts:\n${conflicts.join('\n')}`);
      return;
    }

    onSave({
      globalVolume: isMuted ? 0 : globalVolume,
      backgroundBehavior,
      restrictedApps,
      autoLaunchOnBoot,
      scheduleData,
      hotkey: hotkey || null,
      launchMinimized,
      launchMaximized,
      launchOrder,
      appLaunchDelays,
      appVolumes,
    });
    // Don't close modal - just apply settings
  };

  const handleSave = () => {
    const conflicts = validateSettings();
    if (conflicts.length > 0) {
      alert(`Cannot save due to conflicts:\n${conflicts.join('\n')}`);
      return;
    }

    onSave({
      globalVolume: isMuted ? 0 : globalVolume,
      backgroundBehavior,
      restrictedApps,
      autoLaunchOnBoot,
      scheduleData,
      hotkey: hotkey || null,
      launchMinimized,
      launchMaximized,
      launchOrder,
      appLaunchDelays,
      appVolumes,
    });
    onClose();
  };

  const validateSettings = () => {
    const conflicts = [];
    
    if (autoLaunchOnBoot) {
      const otherBootProfiles = allProfiles.filter(p => 
        p.id !== profile.id && p.autoLaunchOnBoot
      );
      if (otherBootProfiles.length > 0) {
        conflicts.push(`Only one profile can auto-launch on boot. Currently set: ${otherBootProfiles[0].name}`);
      }
    }
    
    // Check for schedule conflicts
    if (scheduleData && ((scheduleData.type === 'daily' && scheduleData.dailyTime) || 
        (scheduleData.type === 'weekly' && scheduleData.weeklySchedule && Object.values(scheduleData.weeklySchedule).some(day => day.enabled)))) {
      
      const conflictingProfiles = allProfiles.filter(p => {
        if (p.id === profile.id) return false;
        
        // Check legacy autoSwitchTime conflicts
        if (p.autoSwitchTime && scheduleData.type === 'daily' && scheduleData.dailyTime === p.autoSwitchTime) {
          return true;
        }
        
        // Check new scheduleData conflicts
        if (!p.scheduleData) return false;
        
        if (scheduleData.type === 'daily' && p.scheduleData.type === 'daily') {
          return scheduleData.dailyTime === p.scheduleData.dailyTime;
        }
        
        if (scheduleData.type === 'weekly' && p.scheduleData.type === 'weekly' && 
            scheduleData.weeklySchedule && p.scheduleData.weeklySchedule) {
          // Check if any enabled days/times conflict
          return Object.keys(scheduleData.weeklySchedule).some(dayKey => {
            const myDay = scheduleData.weeklySchedule![dayKey];
            const theirDay = p.scheduleData.weeklySchedule[dayKey];
            return myDay?.enabled && theirDay?.enabled && myDay.time === theirDay.time;
          });
        }
        
        // Check daily vs weekly conflicts
        if (scheduleData.type === 'daily' && p.scheduleData.type === 'weekly' && scheduleData.dailyTime) {
          return Object.values(p.scheduleData.weeklySchedule || {}).some(day => 
            day.enabled && day.time === scheduleData.dailyTime
          );
        }
        
        if (scheduleData.type === 'weekly' && p.scheduleData.type === 'daily' && p.scheduleData.dailyTime) {
          return Object.values(scheduleData.weeklySchedule || {}).some(day => 
            day.enabled && day.time === p.scheduleData.dailyTime
          );
        }
        
        return false;
      });
      
      if (conflictingProfiles.length > 0) {
        conflicts.push(`Schedule conflicts with: ${conflictingProfiles[0].name}`);
      }
    }
    
    if (hotkey) {
      const conflictingProfiles = allProfiles.filter(p => 
        p.id !== profile.id && p.hotkey === hotkey
      );
      if (conflictingProfiles.length > 0) {
        conflicts.push(`Hotkey ${hotkey} conflicts with: ${conflictingProfiles[0].name}`);
      }
    }
    
    return conflicts;
  };

  // Auto-update profile info when fields change
  const handleProfileNameChange = (newName: string) => {
    setProfileName(newName);
    if (onRename) {
      onRename(newName, profileDescription);
    }
  };

  const handleProfileDescriptionChange = (newDescription: string) => {
    setProfileDescription(newDescription);
    if (onRename) {
      onRename(profileName, newDescription);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setGlobalVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
  };

  const handleDeleteConfirm = () => {
    onDelete?.();
    setShowDeleteConfirm(false);
    onClose();
  };

  const getAvailableApps = () => {
    const apps: string[] = [];
    profile.monitors?.forEach(monitor => {
      monitor.apps?.forEach((app: any) => {
        if (!apps.includes(app.name)) {
          apps.push(app.name);
        }
      });
    });
    profile.minimizedApps?.forEach((app: any) => {
      if (!apps.includes(app.name)) {
        apps.push(app.name);
      }
    });
    return apps;
  };

  // Get all apps with their full data for volume editing
  const getAllApps = () => {
    const apps: any[] = [];
    profile?.monitors?.forEach(monitor => {
      monitor.apps?.forEach((app: any) => {
        apps.push({
          ...app,
          location: `Monitor ${monitor.name || monitor.id}`,
          type: 'monitor'
        });
      });
    });
    profile?.minimizedApps?.forEach((app: any) => {
      apps.push({
        ...app,
        location: 'Minimized',
        type: 'minimized'
      });
    });
    return apps;
  };

  // Handle individual app volume change
  const handleAppVolumeChange = (appId: string, volume: number) => {
    setAppVolumes(prev => ({
      ...prev,
      [appId]: volume
    }));
  };

  // Handle bulk volume application
  const handleApplyBulkVolume = () => {
    const newVolumes = { ...appVolumes };
    selectedAppsForVolumeEdit.forEach(appId => {
      newVolumes[appId] = bulkVolumeValue;
    });
    setAppVolumes(newVolumes);
  };

  // Handle app selection for bulk editing
  const handleAppSelectionToggle = (appId: string) => {
    setSelectedAppsForVolumeEdit(prev => {
      const newSet = new Set(prev);
      if (newSet.has(appId)) {
        newSet.delete(appId);
      } else {
        newSet.add(appId);
      }
      return newSet;
    });
  };

  // Select all apps for bulk editing
  const handleSelectAllApps = () => {
    const allAppIds = getAllApps().map(app => app.instanceId || app.name);
    setSelectedAppsForVolumeEdit(new Set(allAppIds));
  };

  // Clear all app selections
  const handleClearAppSelections = () => {
    setSelectedAppsForVolumeEdit(new Set());
  };

  // Helper function to get schedule summary for header
  const getScheduleSummary = () => {
    if (scheduleData.type === 'daily' && scheduleData.dailyTime) {
      return 'Daily scheduled';
    } else if (scheduleData.type === 'weekly' && scheduleData.weeklySchedule) {
      const enabledDays = Object.values(scheduleData.weeklySchedule).filter(day => day.enabled);
      if (enabledDays.length > 0) {
        return `${enabledDays.length} days scheduled`;
      }
    }
    
    // Check legacy format
    if (profile.autoSwitchTime) {
      return 'Daily scheduled';
    }
    
    return null;
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-4">
            {/* Profile Information & Actions - Combined */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-flow-accent-blue/15 border border-flow-accent-blue/30 rounded-lg flex items-center justify-center">
                  <User className="w-4 h-4 text-flow-accent-blue" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Profile Information</h3>
                  <p className="text-xs text-flow-text-muted">Update name, description, and manage profile</p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-flow-text-secondary mb-1">Profile Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => handleProfileNameChange(e.target.value)}
                    className="w-full px-3 py-2 bg-flow-bg-secondary border border-flow-border rounded-lg text-flow-text-primary placeholder:text-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue transition-colors text-sm"
                    placeholder="Enter profile name"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-flow-text-secondary mb-1">Description</label>
                  <textarea
                    value={profileDescription}
                    onChange={(e) => handleProfileDescriptionChange(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-flow-bg-secondary border border-flow-border rounded-lg text-flow-text-primary placeholder:text-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue transition-colors resize-none text-sm"
                    placeholder="Describe what this profile is for"
                  />
                </div>
                
                <div className="flex gap-2 pt-2">
                  {onDuplicate && (
                    <button
                      onClick={onDuplicate}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-flow-border bg-flow-bg-secondary hover:bg-flow-surface-elevated hover:border-flow-border-accent text-flow-text-secondary hover:text-flow-text-primary transition-all text-sm"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicate
                    </button>
                  )}
                  
                  {onDelete && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-flow-accent-red/30 bg-flow-accent-red/10 hover:bg-flow-accent-red/20 text-flow-accent-red transition-all text-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className="space-y-4">
            {/* Global Audio Settings */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-flow-accent-green/15 border border-flow-accent-green/30 rounded-lg flex items-center justify-center">
                  <Volume2 className="w-4 h-4 text-flow-accent-green" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Global Audio</h3>
                  <p className="text-xs text-flow-text-muted">Master volume level for all applications</p>
                </div>
              </div>
              
              <div className="space-y-4">
                {/* Volume Control */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleMuteToggle}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                      isMuted ? 'bg-flow-accent-red/20 text-flow-accent-red' : 'bg-flow-surface-elevated text-flow-text-secondary hover:text-flow-text-primary'
                    }`}
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  
                  <div className="flex-1">
                    <Slider
                      value={[isMuted ? 0 : globalVolume]}
                      onValueChange={(value) => handleVolumeChange(value[0])}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-flow-text-muted mt-1">
                      <span>0</span>
                      <span>50</span>
                      <span>100</span>
                    </div>
                  </div>
                  
                  <div className="text-right flex-shrink-0 min-w-12">
                    <div className="text-sm font-medium text-flow-text-primary">{isMuted ? 0 : globalVolume}%</div>
                    <div className={`text-xs ${isMuted ? 'text-flow-accent-red' : 'text-flow-accent-green'}`}>
                      {isMuted ? 'Muted' : 'Active'}
                    </div>
                  </div>
                </div>

                {/* Visual Level Indicator */}
                <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-3">
                  <div className="w-full bg-flow-border rounded-full h-2 mb-2">
                    <div 
                      className="bg-gradient-to-r from-flow-accent-green to-flow-accent-blue h-2 rounded-full transition-all duration-300"
                      style={{ width: `${isMuted ? 0 : globalVolume}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-flow-text-muted">
                    <span>Silent</span>
                    <span>Moderate</span>
                    <span>Loud</span>
                  </div>
                </div>
              </div>
            </div>

            {/* App-Specific Volume Settings */}
            {getAllApps().length > 0 && (
              <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-flow-accent-blue/15 border border-flow-accent-blue/30 rounded-lg flex items-center justify-center">
                      <Settings className="w-4 h-4 text-flow-accent-blue" />
                    </div>
                    <div>
                      <h3 className="font-medium text-flow-text-primary">App Volume Settings</h3>
                      <p className="text-xs text-flow-text-muted">Individual volume control for each application</p>
                    </div>
                  </div>
                  <span className="text-xs text-flow-text-muted bg-flow-bg-secondary px-2 py-1 rounded border border-flow-border">
                    {getAllApps().length} apps
                  </span>
                </div>

                {/* Bulk Edit Controls */}
                <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-3 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-medium text-flow-text-primary">Bulk Edit</h4>
                      <p className="text-xs text-flow-text-muted">Apply volume to multiple apps at once</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSelectAllApps}
                        className="text-xs px-2 py-1.5 bg-flow-accent-blue/20 text-flow-accent-blue rounded hover:bg-flow-accent-blue/30 transition-colors font-medium"
                      >
                        Select All
                      </button>
                      <button
                        onClick={handleClearAppSelections}
                        className="text-xs px-2 py-1.5 bg-flow-surface text-flow-text-secondary rounded hover:bg-flow-surface-elevated border border-flow-border transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[bulkVolumeValue]}
                      onValueChange={(value) => setBulkVolumeValue(value[0])}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-flow-text-primary min-w-8">{bulkVolumeValue}%</span>
                    <button
                      onClick={handleApplyBulkVolume}
                      disabled={selectedAppsForVolumeEdit.size === 0}
                      className="text-xs px-3 py-2 bg-flow-accent-blue text-flow-text-primary rounded-lg hover:bg-flow-accent-blue-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      Apply to {selectedAppsForVolumeEdit.size} apps
                    </button>
                  </div>
                </div>

                {/* Individual App Controls */}
                <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-elegant">
                  {getAllApps().map(app => {
                    const appId = app.instanceId || app.name;
                    const isSelected = selectedAppsForVolumeEdit.has(appId);
                    const currentVolume = appVolumes[appId] || app.volume || 50;
                    
                    return (
                      <div 
                        key={appId} 
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          isSelected 
                            ? 'bg-flow-accent-blue/10 border-flow-accent-blue/30' 
                            : 'bg-flow-bg-secondary border-flow-border hover:bg-flow-surface'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleAppSelectionToggle(appId)}
                          />
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {app.icon && <app.icon className="w-4 h-4 text-flow-text-secondary flex-shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm text-flow-text-primary truncate">{app.name}</div>
                              <div className="text-xs text-flow-text-muted">{app.location}</div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 min-w-24">
                          <Slider
                            value={[currentVolume]}
                            onValueChange={(value) => handleAppVolumeChange(appId, value[0])}
                            max={100}
                            step={1}
                            className="flex-1"
                          />
                          <span className="text-xs font-medium text-flow-text-primary w-8 text-right">{currentVolume}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                {selectedAppsForVolumeEdit.size > 0 && (
                  <div className="mt-3 p-2 bg-flow-accent-blue/10 border border-flow-accent-blue/20 rounded text-xs text-flow-accent-blue">
                    {selectedAppsForVolumeEdit.size} app{selectedAppsForVolumeEdit.size !== 1 ? 's' : ''} selected for bulk editing
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'behavior':
        return (
          <div className="space-y-4">
            {/* Background Behavior Card */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-flow-accent-blue/15 border border-flow-accent-blue/30 rounded-lg flex items-center justify-center">
                  <Monitor className="w-4 h-4 text-flow-accent-blue" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Background Behavior</h3>
                  <p className="text-xs text-flow-text-muted">Configure how apps behave when switching profiles</p>
                </div>
              </div>
              
              <div className="space-y-2">
                {[
                  { id: 'keep', label: 'Keep running', desc: 'Apps continue running in background', icon: Play },
                  { id: 'minimize', label: 'Minimize all', desc: 'Minimize apps to system tray', icon: Minimize2 },
                  { id: 'close', label: 'Close all', desc: 'Completely close all applications', icon: X }
                ].map(({ id, label, desc, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setBackgroundBehavior(id as any)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      backgroundBehavior === id
                        ? 'border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue'
                        : 'border-flow-border bg-flow-bg-secondary text-flow-text-secondary hover:bg-flow-surface-elevated hover:border-flow-border-accent'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs opacity-75">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Launch Settings Card */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-flow-accent-green/15 border border-flow-accent-green/30 rounded-lg flex items-center justify-center">
                  <Play className="w-4 h-4 text-flow-accent-green" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Launch Settings</h3>
                  <p className="text-xs text-flow-text-muted">Configure how apps are launched</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-flow-text-secondary mb-2">Window State</label>
                  <div className="space-y-2">
                    {[
                      { id: 'normal', label: 'Normal', desc: 'Default window state', icon: RotateCcw, values: { min: false, max: false } },
                      { id: 'minimized', label: 'Minimized', desc: 'Launch all apps minimized', icon: Minimize2, values: { min: true, max: false } },
                      { id: 'maximized', label: 'Maximized', desc: 'Launch all apps maximized', icon: Maximize2, values: { min: false, max: true } }
                    ].map(({ id, label, desc, icon: Icon, values }) => (
                      <button
                        key={id}
                        onClick={() => {
                          setLaunchMinimized(values.min);
                          setLaunchMaximized(values.max);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          launchMinimized === values.min && launchMaximized === values.max
                            ? 'border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue'
                            : 'border-flow-border bg-flow-bg-secondary text-flow-text-secondary hover:bg-flow-surface-elevated'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <div className="text-left">
                          <div className="font-medium text-sm">{label}</div>
                          <div className="text-xs opacity-75">{desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-flow-text-secondary mb-2">Launch Order</label>
                  <div className="space-y-2">
                    {[
                      { id: 'all-at-once', label: 'All at once', desc: 'Launch all apps simultaneously', icon: Zap },
                      { id: 'sequential', label: 'Sequential', desc: 'Launch apps one by one with delays', icon: ArrowRight }
                    ].map(({ id, label, desc, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setLaunchOrder(id as any)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          launchOrder === id
                            ? 'border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue'
                            : 'border-flow-border bg-flow-bg-secondary text-flow-text-secondary hover:bg-flow-surface-elevated'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <div className="text-left">
                          <div className="font-medium text-sm">{label}</div>
                          <div className="text-xs opacity-75">{desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* App Launch Delays */}
                {launchOrder === 'sequential' && (
                  <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-3">
                    <h5 className="text-flow-text-primary mb-3 font-medium text-sm">App Launch Delays</h5>
                    <div className="space-y-3 max-h-48 overflow-y-auto scrollbar-elegant">
                      {getAvailableApps().map(appName => (
                        <div key={appName} className="flex items-center gap-3">
                          <span className="text-flow-text-secondary text-sm flex-1">{appName}</span>
                          <input
                            type="number"
                            min="0"
                            max="30"
                            value={appLaunchDelays[appName] || 0}
                            onChange={(e) => setAppLaunchDelays(prev => ({
                              ...prev,
                              [appName]: parseInt(e.target.value) || 0
                            }))}
                            className="w-16 px-2 py-1 bg-flow-surface border border-flow-border rounded text-flow-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-flow-accent-blue/50"
                          />
                          <span className="text-flow-text-muted text-xs">sec</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-flow-text-muted text-xs mt-2">
                      Set delay in seconds before launching each app
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'automation':
        return (
          <div className="space-y-4">
            {/* Automation Settings Card */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-flow-accent-purple/15 border border-flow-accent-purple/30 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-flow-accent-purple" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Automation</h3>
                  <p className="text-xs text-flow-text-muted">Auto-launch, scheduling, and shortcuts</p>
                </div>
              </div>
              
              <div className="space-y-4">
                {/* System Boot Toggle */}
                <div className="flex items-center justify-between p-3 bg-flow-bg-secondary border border-flow-border rounded-lg">
                  <div>
                    <label className="text-sm font-medium text-flow-text-secondary">Launch on system boot</label>
                    <p className="text-xs text-flow-text-muted">Only one profile can auto-launch</p>
                  </div>
                  <Switch
                    checked={autoLaunchOnBoot}
                    onCheckedChange={setAutoLaunchOnBoot}
                  />
                </div>

                {/* Schedule Control */}
                <ScheduleControl
                  value={scheduleData}
                  onChange={setScheduleData}
                />

                {/* Keyboard Shortcut */}
                <div>
                  <label className="block text-xs font-medium text-flow-text-secondary mb-2">Keyboard shortcut</label>
                  <input
                    type="text"
                    value={hotkey}
                    onChange={(e) => setHotkey(e.target.value)}
                    placeholder="Ctrl+Shift+W"
                    className="w-full px-3 py-2 bg-flow-bg-secondary border border-flow-border rounded-lg text-flow-text-primary placeholder:text-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue transition-colors text-sm"
                  />
                  <p className="text-xs text-flow-text-muted mt-1">Must be unique across all profiles</p>
                </div>

                {/* Active Confirmations */}
                {(autoLaunchOnBoot || getScheduleSummary() || hotkey) && (
                  <div className="bg-flow-accent-blue/10 border border-flow-accent-blue/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-flow-accent-blue" />
                      <span className="text-sm font-medium text-flow-accent-blue">Active Automation</span>
                    </div>
                    <div className="space-y-1 text-xs text-flow-accent-blue">
                      {autoLaunchOnBoot && <div>• Launches automatically on system boot</div>}
                      {getScheduleSummary() && <div>• {getScheduleSummary()}</div>}
                      {hotkey && <div>• Press {hotkey} for instant activation</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-4">
            {/* Security Settings Card */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-flow-accent-red/15 border border-flow-accent-red/30 rounded-lg flex items-center justify-center">
                    <Shield className="w-4 h-4 text-flow-accent-red" />
                  </div>
                  <div>
                    <h3 className="font-medium text-flow-text-primary">Application Security</h3>
                    <p className="text-xs text-flow-text-muted">Manage restricted applications for this profile</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${restrictedApps.length > 5 ? 'text-flow-accent-red' : restrictedApps.length > 0 ? 'text-flow-accent-purple' : 'text-flow-accent-green'}`}>
                    {restrictedApps.length > 5 ? 'High Security' : restrictedApps.length > 0 ? 'Medium Security' : 'Open Access'}
                  </div>
                  <div className="text-xs text-flow-text-muted">
                    {restrictedApps.length} restricted app{restrictedApps.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              
              {/* App Search Control */}
              <AppSearchControl
                restrictedApps={restrictedApps}
                onUpdateRestrictedApps={setRestrictedApps}
                placeholder="Search for apps to restrict..."
              />

              {/* Security Policy Info */}
              <div className="mt-4 bg-flow-accent-red/10 border border-flow-accent-red/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-flow-accent-red flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-flow-accent-red">
                    <div className="font-medium mb-1">Security Policy</div>
                    <div>Restricted apps cannot be launched with this profile and will be automatically closed if currently running. This helps maintain focus and productivity by blocking distracting applications.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-flow-surface-elevated backdrop-blur-xl border border-flow-border rounded-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 hover:bg-flow-surface rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-flow-text-muted" />
        </button>

        {/* Compact Profile Header */}
        <div className="border-b border-flow-border px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-flow-accent-blue/15 border border-flow-accent-blue/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Settings className="w-5 h-5 text-flow-accent-blue" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-semibold text-flow-text-primary truncate">
                  {profile.name}
                </h1>
                <span className="text-xs text-flow-text-muted px-2 py-0.5 bg-flow-surface rounded border border-flow-border flex-shrink-0">
                  Settings
                </span>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-flow-text-secondary truncate flex-shrink-0">{profile.description}</p>
                
                {profile.autoLaunchOnBoot && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-green/20 text-flow-accent-green">
                    <Zap className="w-2.5 h-2.5" />
                    Boot
                  </span>
                )}
                {getScheduleSummary() && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-purple/20 text-flow-accent-purple">
                    <Clock className="w-2.5 h-2.5" />
                    {getScheduleSummary()}
                  </span>
                )}
                {profile.hotkey && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-blue/20 text-flow-accent-blue">
                    {profile.hotkey}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Fixed Height with Flex */}
        <div className="flex flex-1 min-h-0">
          {/* Compact Sidebar - Fixed Width */}
          <div className="w-56 bg-flow-bg-secondary border-r border-flow-border flex flex-col flex-shrink-0">
            <div className="p-3 flex-1 overflow-y-auto scrollbar-elegant">
              <nav className="space-y-1">
                {settingsTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 ${
                        isActive
                          ? 'bg-flow-accent-blue/15 text-flow-accent-blue border border-flow-accent-blue/30'
                          : 'text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${
                        isActive ? 'text-flow-accent-blue' : 'text-flow-text-muted'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${
                          isActive ? 'text-flow-accent-blue' : 'text-flow-text-secondary'
                        }`}>
                          {tab.label}
                        </div>
                        <div className="text-xs text-flow-text-muted truncate">
                          {tab.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content Area - Fixed Height with Scroll */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto scrollbar-elegant p-4">
              {renderTabContent()}
            </div>

            {/* Conflicts Warning - Fixed at Bottom of Content */}
            {validateSettings().length > 0 && (
              <div className="mx-4 mb-4 p-3 bg-flow-accent-red/10 border border-flow-accent-red/30 rounded-lg flex-shrink-0">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-flow-accent-red flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-flow-accent-red font-medium text-sm">Configuration Conflicts</h5>
                    <ul className="text-flow-accent-red text-xs mt-1 space-y-1">
                      {validateSettings().map((conflict, index) => (
                        <li key={index}>• {conflict}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Actions - Fixed at Bottom */}
            <div className="border-t border-flow-border p-4 flex-shrink-0">
              <div className="flex gap-2 justify-end">
                <button 
                  onClick={onClose}
                  className="px-3 py-2 bg-flow-surface hover:bg-flow-surface-elevated text-flow-text-secondary border border-flow-border rounded-lg transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleApply}
                  disabled={validateSettings().length > 0}
                  className="px-3 py-2 bg-flow-accent-purple hover:bg-flow-accent-purple-hover text-flow-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 text-sm"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Apply
                </button>
                <button 
                  onClick={handleSave}
                  disabled={validateSettings().length > 0}
                  className="px-3 py-2 bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-flow-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2 text-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmation
          isOpen={showDeleteConfirm}
          profileName={profile.name}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteConfirm}
        />
      </div>
    </div>
  );
}