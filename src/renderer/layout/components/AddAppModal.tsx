import { useState } from "react";
import { X, Search, Plus, Monitor, Globe, Code, MessageCircle, Music, Calendar, Mail, Terminal, Camera, BarChart3, FileText, Settings } from "lucide-react";

interface App {
  name: string;
  icon: any;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  volume?: number;
  launchBehavior?: 'new' | 'focus' | 'minimize';
  runAsAdmin?: boolean;
  forceCloseOnExit?: boolean;
  smartSave?: boolean;
  monitorId?: string;
}

interface AddAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddApp: (app: any) => void;
  monitorId?: string;
  monitorName?: string;
  existingApps?: App[];
  monitorOrientation?: string;
  monitors?: Array<{
    id: string;
    name: string;
    primary: boolean;
    orientation?: string;
  }>;
  allowMonitorSelection?: boolean;
}

const availableApps = [
  { name: 'Chrome', icon: Globe, color: '#4285F4' },
  { name: 'VS Code', icon: Code, color: '#007ACC' },
  { name: 'Terminal', icon: Terminal, color: '#000000' },
  { name: 'Slack', icon: MessageCircle, color: '#4A154B' },
  { name: 'Discord', icon: MessageCircle, color: '#5865F2' },
  { name: 'Spotify', icon: Music, color: '#1DB954' },
  { name: 'Calendar', icon: Calendar, color: '#EA4335' },
  { name: 'Mail', icon: Mail, color: '#1565C0' },
  { name: 'Analytics', icon: BarChart3, color: '#FF6B35' },
  { name: 'Camera', icon: Camera, color: '#8B5CF6' },
  { name: 'Notes', icon: FileText, color: '#FFA500' },
  { name: 'Calculator', icon: Settings, color: '#666666' },
];

export function AddAppModal({ 
  isOpen, 
  onClose, 
  onAddApp, 
  monitorId, 
  monitorName, 
  existingApps = [],
  monitorOrientation = 'landscape',
  monitors = [],
  allowMonitorSelection = false
}: AddAppModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonitor, setSelectedMonitor] = useState(monitorId || (monitors.length > 0 ? monitors[0].id : ''));
  const [selectedApp, setSelectedApp] = useState<any>(null);

  const filteredApps = availableApps.filter(app =>
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !existingApps.some(existing => existing.name === app.name)
  );

  const handleAddApp = () => {
    if (!selectedApp) return;

    const targetMonitorId = allowMonitorSelection ? selectedMonitor : monitorId;
    const targetMonitor = monitors.find(m => m.id === targetMonitorId);
    const isPortrait = targetMonitor?.orientation === 'portrait';

    const newApp = {
      name: selectedApp.name,
      icon: selectedApp.icon,
      color: selectedApp.color,
      position: { x: 50, y: 50 },
      size: { 
        width: isPortrait ? 80 : 60, 
        height: isPortrait ? 40 : 60 
      },
      volume: 50,
      launchBehavior: 'new' as const,
      runAsAdmin: false,
      forceCloseOnExit: false,
      smartSave: false,
      monitorId: targetMonitorId
    };

    onAddApp(newApp);
    setSelectedApp(null);
    setSearchTerm('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-flow-surface-elevated border border-flow-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-flow-border">
          <div>
            <h2 className="text-lg text-flow-text-primary font-semibold">Add Application</h2>
            <p className="text-sm text-flow-text-secondary mt-1">
              {allowMonitorSelection 
                ? 'Choose an app and select which monitor to place it on'
                : `Add to ${monitorName || 'Monitor'}`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-flow-surface rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-flow-text-secondary" />
          </button>
        </div>

        {/* Monitor Selection */}
        {allowMonitorSelection && monitors.length > 0 && (
          <div className="p-6 border-b border-flow-border">
            <label className="text-sm text-flow-text-secondary mb-3 block">Target Monitor</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {monitors.map((monitor) => (
                <button
                  key={monitor.id}
                  onClick={() => setSelectedMonitor(monitor.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    selectedMonitor === monitor.id
                      ? 'border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue'
                      : 'border-flow-border bg-flow-surface hover:bg-flow-surface-elevated text-flow-text-secondary'
                  }`}
                >
                  <Monitor className="w-4 h-4 flex-shrink-0" />
                  <div className="text-left min-w-0">
                    <div className="text-sm font-medium truncate">{monitor.name}</div>
                    <div className="text-xs opacity-70 flex items-center gap-1">
                      {monitor.primary && <span>Primary</span>}
                      {monitor.orientation === 'portrait' && <span>Portrait</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="p-6 border-b border-flow-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-flow-text-muted" />
            <input
              type="text"
              placeholder="Search applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-flow-surface border border-flow-border rounded-lg text-flow-text-primary placeholder-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue"
            />
          </div>
        </div>

        {/* App List */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredApps.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredApps.map((app) => {
                const IconComponent = app.icon;
                return (
                  <button
                    key={app.name}
                    onClick={() => setSelectedApp(app)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-lg border transition-all hover:scale-105 ${
                      selectedApp?.name === app.name
                        ? 'border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue'
                        : 'border-flow-border bg-flow-surface hover:bg-flow-surface-elevated text-flow-text-secondary hover:text-flow-text-primary'
                    }`}
                  >
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${app.color}20` }}
                    >
                      <IconComponent className="w-5 h-5" style={{ color: app.color }} />
                    </div>
                    <span className="text-sm font-medium">{app.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-flow-surface rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-6 h-6 text-flow-text-muted" />
              </div>
              <p className="text-flow-text-secondary">
                {searchTerm ? 'No apps found matching your search' : 'No more apps available'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-flow-border">
          <div className="text-sm text-flow-text-muted">
            {selectedApp && (
              <span>Selected: <strong className="text-flow-text-secondary">{selectedApp.name}</strong></span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-flow-text-secondary hover:bg-flow-surface rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddApp}
              disabled={!selectedApp}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-flow-accent-blue hover:bg-flow-accent-blue-hover text-flow-text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Add App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}