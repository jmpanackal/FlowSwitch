import { useState } from "react";
import { X, Search, Plus, Scan, Folder, Monitor, Globe, Gamepad2, Music, Code, MessageCircle, Calendar, Mail, Terminal, Camera, BarChart3, FileText, Settings } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface CreateProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProfile: (profile: any) => void;
}

const availableApps = [
  { name: 'Chrome', icon: Globe, color: '#4285F4', category: 'Browser' },
  { name: 'VS Code', icon: Code, color: '#007ACC', category: 'Development' },
  { name: 'Terminal', icon: Terminal, color: '#000000', category: 'Development' },
  { name: 'Slack', icon: MessageCircle, color: '#4A154B', category: 'Communication' },
  { name: 'Discord', icon: MessageCircle, color: '#5865F2', category: 'Communication' },
  { name: 'Spotify', icon: Music, color: '#1DB954', category: 'Media' },
  { name: 'Calendar', icon: Calendar, color: '#EA4335', category: 'Productivity' },
  { name: 'Mail', icon: Mail, color: '#1565C0', category: 'Productivity' },
  { name: 'Notes', icon: FileText, color: '#FFA500', category: 'Productivity' },
  { name: 'Calculator', icon: Settings, color: '#666666', category: 'Utility' },
  { name: 'Camera', icon: Camera, color: '#8B5CF6', category: 'Media' },
  { name: 'Analytics', icon: BarChart3, color: '#FF6B35', category: 'Business' },
  { name: 'Steam', icon: Gamepad2, color: '#1B2838', category: 'Gaming' },
];

const mockCurrentApps = [
  { name: 'Chrome', icon: Globe, color: '#4285F4', position: { x: 30, y: 30 }, size: { width: 60, height: 70 }, monitor: 'Monitor 1' },
  { name: 'VS Code', icon: Code, color: '#007ACC', position: { x: 70, y: 30 }, size: { width: 50, height: 60 }, monitor: 'Monitor 1' },
  { name: 'Spotify', icon: Music, color: '#1DB954', position: { x: 50, y: 70 }, size: { width: 40, height: 30 }, monitor: 'Monitor 2' },
  { name: 'Slack', icon: MessageCircle, color: '#4A154B', position: { x: 25, y: 50 }, size: { width: 45, height: 50 }, monitor: 'Monitor 2' },
];

export function CreateProfileModal({ isOpen, onClose, onCreateProfile }: CreateProfileModalProps) {
  const [creationMode, setCreationMode] = useState<'manual' | 'memory'>('manual');
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileIcon, setProfileIcon] = useState('work');
  const [selectedApps, setSelectedApps] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = Array.from(new Set(availableApps.map(app => app.category)));
  
  const filteredApps = availableApps.filter(app => {
    const matchesSearch = app.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleApp = (app: any) => {
    setSelectedApps(prev => 
      prev.find(a => a.name === app.name)
        ? prev.filter(a => a.name !== app.name)
        : [...prev, { ...app, volume: 50, launchBehavior: 'new' }]
    );
  };

  const createManualProfile = () => {
    if (!profileName.trim()) return;
    
    const newProfile = {
      id: `profile-${Date.now()}`,
      name: profileName,
      icon: profileIcon,
      description: profileDescription || `Custom profile with ${selectedApps.length} apps`,
      appCount: selectedApps.length,
      tabCount: 0,
      globalVolume: 70,
      backgroundBehavior: 'keep' as const,
      restrictedApps: [],
      estimatedStartupTime: Math.max(3, selectedApps.length * 0.8),
      autoLaunch: false,
      monitors: [
        {
          id: 'monitor-1',
          name: 'Monitor 1',
          primary: true,
          resolution: '2560x1440',
          orientation: 'landscape' as const,
          apps: selectedApps.slice(0, Math.ceil(selectedApps.length / 2)).map((app, index) => ({
            name: app.name,
            icon: app.icon,
            color: app.color,
            position: { x: 30 + (index % 2) * 40, y: 30 + Math.floor(index / 2) * 40 },
            size: { width: 35, height: 30 },
            volume: app.volume,
            launchBehavior: app.launchBehavior
          }))
        },
        {
          id: 'monitor-2',
          name: 'Monitor 2',
          primary: false,
          resolution: '1920x1080',
          orientation: 'landscape' as const,
          apps: selectedApps.slice(Math.ceil(selectedApps.length / 2)).map((app, index) => ({
            name: app.name,
            icon: app.icon,
            color: app.color,
            position: { x: 30 + (index % 2) * 40, y: 30 + Math.floor(index / 2) * 40 },
            size: { width: 35, height: 30 },
            volume: app.volume,
            launchBehavior: app.launchBehavior
          }))
        }
      ],
      minimizedApps: [],
      browserTabs: []
    };
    
    onCreateProfile(newProfile);
  };

  const createMemoryProfile = () => {
    if (!profileName.trim()) return;
    
    const newProfile = {
      id: `memory-${Date.now()}`,
      name: profileName,
      icon: profileIcon,
      description: profileDescription || `Captured layout with ${mockCurrentApps.length} apps`,
      appCount: mockCurrentApps.length,
      tabCount: 0,
      globalVolume: 70,
      backgroundBehavior: 'keep' as const,
      restrictedApps: [],
      estimatedStartupTime: Math.max(3, mockCurrentApps.length * 0.5),
      autoLaunch: false,
      monitors: [
        {
          id: 'monitor-1',
          name: 'Monitor 1',
          primary: true,
          resolution: '2560x1440',
          orientation: 'landscape' as const,
          apps: mockCurrentApps.filter(app => app.monitor === 'Monitor 1').map(app => ({
            name: app.name,
            icon: app.icon,
            color: app.color,
            position: app.position,
            size: app.size,
            volume: 50,
            launchBehavior: 'new' as const
          }))
        },
        {
          id: 'monitor-2',
          name: 'Monitor 2',
          primary: false,
          resolution: '1920x1080',
          orientation: 'landscape' as const,
          apps: mockCurrentApps.filter(app => app.monitor === 'Monitor 2').map(app => ({
            name: app.name,
            icon: app.icon,
            color: app.color,
            position: app.position,
            size: app.size,
            volume: 50,
            launchBehavior: 'new' as const
          }))
        }
      ],
      minimizedApps: [],
      browserTabs: []
    };
    
    onCreateProfile(newProfile);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto scrollbar-elegant">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-white text-xl">Create New Profile</h3>
            <p className="text-white/60 text-sm">Build a custom workspace or capture your current layout</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Creation Mode Toggle */}
        <div className="flex bg-white/10 border border-white/20 rounded-lg p-1 mb-6">
          <button 
            onClick={() => setCreationMode('manual')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-sm transition-colors ${
              creationMode === 'manual' 
                ? 'bg-purple-500/30 text-purple-200' 
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            Manual Selection
          </button>
          <button 
            onClick={() => setCreationMode('memory')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded text-sm transition-colors ${
              creationMode === 'memory' 
                ? 'bg-purple-500/30 text-purple-200' 
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Scan className="w-4 h-4" />
            App Layout Memory
          </button>
        </div>

        {/* Profile Basic Info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-white mb-2">Profile Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
              placeholder="Enter profile name..."
            />
          </div>
          <div>
            <label className="block text-white mb-2">Icon</label>
            <div className="flex gap-2">
              {[
                { id: 'work', icon: Folder, label: 'Work' },
                { id: 'gaming', icon: Monitor, label: 'Gaming' },
                { id: 'personal', icon: Globe, label: 'Personal' },
              ].map((iconOption) => (
                <button
                  key={iconOption.id}
                  onClick={() => setProfileIcon(iconOption.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    profileIcon === iconOption.id
                      ? 'border-purple-400/60 bg-purple-500/20'
                      : 'border-white/20 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <iconOption.icon className="w-4 h-4 text-white" />
                  <span className="text-white text-sm">{iconOption.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-white mb-2">Description (Optional)</label>
          <textarea
            value={profileDescription}
            onChange={(e) => setProfileDescription(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50 resize-none"
            rows={2}
            placeholder="Describe this profile..."
          />
        </div>

        {/* Manual Selection Mode */}
        {creationMode === 'manual' && (
          <div className="space-y-6">
            {/* Search and Filter */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/50" />
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                />
              </div>
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-400/50"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* App Selection Grid */}
            <div>
              <h4 className="text-white mb-3">Select Applications ({selectedApps.length} selected)</h4>
              <div className="grid grid-cols-6 gap-3 max-h-64 overflow-y-auto scrollbar-elegant">
                {filteredApps.map((app, index) => (
                  <button
                    key={index}
                    onClick={() => toggleApp(app)}
                    className={`p-3 rounded-lg border transition-all ${
                      selectedApps.find(a => a.name === app.name)
                        ? 'border-purple-400/60 bg-purple-500/20'
                        : 'border-white/20 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center mx-auto mb-2"
                      style={{ backgroundColor: `${app.color}20` }}
                    >
                      <app.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-white text-xs text-center truncate">{app.name}</div>
                    <div className="text-white/50 text-xs text-center">{app.category}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* App Layout Memory Mode */}
        {creationMode === 'memory' && (
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/20 rounded-lg p-4">
              <h4 className="text-white mb-3 flex items-center gap-2">
                <Scan className="w-4 h-4" />
                Current App Layout Detection
              </h4>
              <p className="text-white/70 text-sm mb-4">
                FlowSwitch has detected {mockCurrentApps.length} apps currently running. This will capture their positions and sizes.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h5 className="text-white/80 text-sm mb-2">Monitor 1</h5>
                  <div className="space-y-2">
                    {mockCurrentApps.filter(app => app.monitor === 'Monitor 1').map((app, index) => (
                      <div key={index} className="flex items-center gap-2 text-white/70 text-sm">
                        <div 
                          className="w-4 h-4 rounded flex items-center justify-center"
                          style={{ backgroundColor: `${app.color}40` }}
                        >
                          <app.icon className="w-2.5 h-2.5 text-white" />
                        </div>
                        <span>{app.name}</span>
                        <span className="text-white/50 text-xs">
                          {Math.round(app.size.width)}% × {Math.round(app.size.height)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h5 className="text-white/80 text-sm mb-2">Monitor 2</h5>
                  <div className="space-y-2">
                    {mockCurrentApps.filter(app => app.monitor === 'Monitor 2').map((app, index) => (
                      <div key={index} className="flex items-center gap-2 text-white/70 text-sm">
                        <div 
                          className="w-4 h-4 rounded flex items-center justify-center"
                          style={{ backgroundColor: `${app.color}40` }}
                        >
                          <app.icon className="w-2.5 h-2.5 text-white" />
                        </div>
                        <span>{app.name}</span>
                        <span className="text-white/50 text-xs">
                          {Math.round(app.size.width)}% × {Math.round(app.size.height)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 mt-8">
          <button 
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={creationMode === 'manual' ? createManualProfile : createMemoryProfile}
            disabled={!profileName.trim() || (creationMode === 'manual' && selectedApps.length === 0)}
            className="flex-1 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Profile
          </button>
        </div>
      </div>
    </div>
  );
}