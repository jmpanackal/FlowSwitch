import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Shield, AlertCircle } from 'lucide-react';

interface AppSearchControlProps {
  restrictedApps: string[];
  onUpdateRestrictedApps: (apps: string[]) => void;
  placeholder?: string;
}


// Fallback: Expanded list of common applications for search
const fallbackApps = [
  'Chrome', 'Firefox', 'Safari', 'Edge', 'Opera', 'Brave', 'Vivaldi',
  'Discord', 'Slack', 'Microsoft Teams', 'Zoom', 'Skype', 'WhatsApp', 'Telegram',
  'Visual Studio Code', 'Visual Studio', 'IntelliJ IDEA', 'PyCharm', 'WebStorm',
  'Android Studio', 'Xcode', 'Sublime Text', 'Atom', 'Notepad++',
  'Photoshop', 'Illustrator', 'After Effects', 'Premiere Pro', 'Figma', 'Sketch',
  'Canva', 'GIMP', 'Blender', 'Cinema 4D', 'Maya', 'Substance Painter',
  'Steam', 'Epic Games Launcher', 'Origin', 'Battle.net', 'GOG Galaxy', 
  'Xbox Game Pass', 'Minecraft', 'Roblox', 'Fortnite', 'League of Legends',
  'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Outlook',
  'Google Drive', 'Dropbox', 'OneDrive', 'Notion', 'Obsidian', 'Evernote',
  'Trello', 'Asana', 'Monday.com', 'Todoist',
  'Spotify', 'Apple Music', 'YouTube Music', 'VLC Media Player', 'Netflix',
  'Disney+', 'Amazon Prime Video', 'Twitch', 'OBS Studio',
  'WinRAR', '7-Zip', 'CCleaner', 'Malwarebytes', 'Norton', 'Avast',
  'TeamViewer', 'AnyDesk', 'FileZilla', 'PuTTY', 'Wireshark',
  'Task Manager', 'Control Panel', 'Registry Editor', 'Command Prompt',
  'PowerShell', 'File Explorer', 'Notepad', 'Calculator', 'Paint',
  'QuickBooks', 'TurboTax', 'Sage', 'Xero', 'FreshBooks', 'Wave Accounting',
  'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'TikTok', 'Snapchat',
  'Pinterest', 'Reddit', 'YouTube',
  'VMware', 'VirtualBox', 'Docker', 'Postman', 'Chrome DevTools',
  'Firefox Developer Edition', 'Node.js', 'Python', 'Java',
].sort();

export function AppSearchControl({ 
  restrictedApps, 
  onUpdateRestrictedApps, 
  placeholder = "Search for apps to restrict..." 
}: AppSearchControlProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [availableApps, setAvailableApps] = useState<string[]>(fallbackApps);

  // Try to fetch installed apps from main process via IPC on mount
  useEffect(() => {
    if (window.electron && typeof window.electron.getInstalledApps === 'function') {
      window.electron.getInstalledApps()
        .then((apps: string[]) => {
          if (Array.isArray(apps) && apps.length > 0) setAvailableApps(apps.sort());
        })
        .catch(() => setAvailableApps(fallbackApps));
    } else {
      setAvailableApps(fallbackApps);
    }
  }, []);

  // Filter apps based on search query
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return availableApps
      .filter(app => 
        app.toLowerCase().includes(query) && 
        !restrictedApps.includes(app)
      )
      .slice(0, 8); // Limit results to prevent overwhelming UI
  }, [searchQuery, restrictedApps, availableApps]);

  // Handle adding app to restricted list
  const handleAddApp = (appName: string) => {
    if (!restrictedApps.includes(appName)) {
      onUpdateRestrictedApps([...restrictedApps, appName]);
    }
    setSearchQuery('');
    setShowResults(false);
  };

  // Handle removing app from restricted list
  const handleRemoveApp = (appName: string) => {
    onUpdateRestrictedApps(restrictedApps.filter(app => app !== appName));
  };

  // Handle custom app addition (when user types something not in the list)
  const handleAddCustomApp = () => {
    const customApp = searchQuery.trim();
    if (customApp && !restrictedApps.includes(customApp)) {
      onUpdateRestrictedApps([...restrictedApps, customApp]);
      setSearchQuery('');
      setShowResults(false);
    }
  };

  // Show/hide results based on search query and focus
  useEffect(() => {
    setShowResults(searchQuery.trim().length > 0);
  }, [searchQuery]);

  const hasCustomApp = searchQuery.trim().length > 0 && 
    !availableApps.some(app => app.toLowerCase() === searchQuery.toLowerCase().trim()) &&
    !restrictedApps.includes(searchQuery.trim());

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-flow-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchQuery.trim() && setShowResults(true)}
            onBlur={() => {
              // Delay hiding to allow clicking on results
              setTimeout(() => setShowResults(false), 150);
            }}
            placeholder={placeholder}
            className="w-full pl-10 pr-4 py-2.5 bg-flow-bg-secondary border border-flow-border rounded-lg text-flow-text-primary placeholder:text-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue transition-colors text-sm"
          />
        </div>

        {/* Search Results Dropdown */}
        {showResults && (searchQuery.trim().length > 0) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-flow-surface-elevated border border-flow-border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto scrollbar-elegant">
            {filteredApps.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-flow-text-secondary mb-2 px-2">
                  Suggested Apps
                </div>
                {filteredApps.map((app) => (
                  <button
                    key={app}
                    onClick={() => handleAddApp(app)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-flow-surface rounded-lg transition-colors group"
                  >
                    <div className="flex items-center justify-center w-6 h-6 bg-flow-accent-blue/20 rounded text-flow-accent-blue">
                      <Shield className="w-3 h-3" />
                    </div>
                    <span className="text-sm text-flow-text-primary flex-1">{app}</span>
                    <Plus className="w-4 h-4 text-flow-text-muted group-hover:text-flow-accent-blue transition-colors" />
                  </button>
                ))}
              </div>
            )}

            {/* Custom App Option */}
            {hasCustomApp && (
              <div className="p-2 border-t border-flow-border">
                <div className="text-xs font-medium text-flow-text-secondary mb-2 px-2">
                  Custom App
                </div>
                <button
                  onClick={handleAddCustomApp}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-flow-surface rounded-lg transition-colors group"
                >
                  <div className="flex items-center justify-center w-6 h-6 bg-flow-accent-purple/20 rounded text-flow-accent-purple">
                    <Plus className="w-3 h-3" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm text-flow-text-primary">Add "{searchQuery.trim()}"</span>
                    <div className="text-xs text-flow-text-muted">Custom application</div>
                  </div>
                  <Plus className="w-4 h-4 text-flow-text-muted group-hover:text-flow-accent-purple transition-colors" />
                </button>
              </div>
            )}

            {/* No Results */}
            {filteredApps.length === 0 && !hasCustomApp && (
              <div className="p-4 text-center">
                <AlertCircle className="w-8 h-8 text-flow-text-muted mx-auto mb-2" />
                <div className="text-sm text-flow-text-muted">
                  No apps found matching "{searchQuery}"
                </div>
                <div className="text-xs text-flow-text-muted mt-1">
                  Try a different search term
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Currently Restricted Apps List */}
      {restrictedApps.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-flow-text-primary">
              Restricted Applications
            </h4>
            <span className="text-xs text-flow-text-muted bg-flow-bg-secondary px-2 py-1 rounded border border-flow-border">
              {restrictedApps.length} app{restrictedApps.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-elegant">
            {restrictedApps.map((app) => (
              <div
                key={app}
                className="flex items-center gap-3 p-3 bg-flow-bg-secondary border border-flow-border rounded-lg group hover:bg-flow-surface transition-colors"
              >
                <div className="flex items-center justify-center w-6 h-6 bg-flow-accent-red/20 rounded text-flow-accent-red">
                  <Shield className="w-3 h-3" />
                </div>
                
                <span className="text-sm text-flow-text-primary flex-1 line-through">
                  {app}
                </span>
                
                <button
                  onClick={() => handleRemoveApp(app)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-flow-text-muted hover:text-flow-accent-red hover:bg-flow-accent-red/10 rounded transition-all"
                  title={`Remove ${app} from restricted apps`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {restrictedApps.length === 0 && (
        <div className="text-center py-8 px-4 bg-flow-bg-secondary border border-flow-border rounded-lg">
          <Shield className="w-12 h-12 text-flow-text-muted mx-auto mb-3" />
          <div className="text-sm font-medium text-flow-text-secondary mb-1">
            No Restricted Apps
          </div>
          <div className="text-xs text-flow-text-muted">
            Search and add apps you want to restrict for this profile
          </div>
        </div>
      )}
    </div>
  );
}