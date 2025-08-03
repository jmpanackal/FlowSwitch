import { Globe, MessageCircle, Code, Music, Calendar, Mail, Terminal, Camera, BarChart3, Play, FileText, Settings } from "lucide-react";

export const initialProfiles = [
  {
    id: 'work',
    name: 'Work',
    icon: 'work',
    description: 'Focused productivity setup with essential work tools',
    appCount: 10,
    tabCount: 15,
    fileCount: 9,
    globalVolume: 70,
    backgroundBehavior: 'keep' as const,
    restrictedApps: ['System Preferences', 'Activity Monitor'],
    estimatedStartupTime: 12,
    onStartup: false,
    autoLaunchOnBoot: false,
    autoSwitchTime: null,
    hotkey: 'Ctrl+Shift+W',
    schedule: null,
    launchMinimized: false,
    launchMaximized: false,
    launchOrder: 'all-at-once' as const,
    appLaunchDelays: {},
    monitors: [
      {
        id: 'monitor-1',
        name: 'Monitor 1',
        primary: true,
        resolution: '2560x1440',
        orientation: 'landscape' as const,
        predefinedLayout: null,
        apps: [
          { 
            name: 'VS Code', 
            icon: Code, 
            color: '#007ACC', 
            position: { x: 25, y: 30 },
            size: { width: 45, height: 55 },
            volume: 0,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: true,
            instanceId: 'vscode-work-main-1',
            associatedFiles: [
              {
                id: 'assoc-file-1',
                name: 'main.js',
                path: '/Users/developer/project/main.js',
                type: 'javascript',
                associatedApp: 'VS Code',
                useDefaultApp: false
              },
              {
                id: 'assoc-file-2',
                name: 'package.json',
                path: '/Users/developer/project/package.json',
                type: 'json',
                associatedApp: 'VS Code',
                useDefaultApp: false
              }
            ]
          },
          { 
            name: 'Terminal', 
            icon: Terminal, 
            color: '#000000', 
            position: { x: 75, y: 30 },
            size: { width: 45, height: 25 },
            volume: 30,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            instanceId: 'terminal-work-main-1'
          },
          { 
            name: 'Chrome', 
            icon: Globe, 
            color: '#4285F4', 
            position: { x: 75, y: 70 },
            size: { width: 45, height: 55 },
            volume: 60,
            launchBehavior: 'focus' as const,
            runAsAdmin: false,
            forceCloseOnExit: true,
            smartSave: true,
            monitorId: 'monitor-1',
            instanceId: 'chrome-work-main-1',
            associatedFiles: [
              {
                id: 'assoc-file-3',
                name: 'bookmarks.html',
                path: '/Users/developer/Downloads/bookmarks.html',
                type: 'html',
                associatedApp: 'Chrome',
                useDefaultApp: false
              }
            ]
          },
        ]
      },
      {
        id: 'monitor-2', 
        name: 'Monitor 2',
        primary: false,
        resolution: '1920x1080',
        orientation: 'landscape' as const,
        predefinedLayout: 'grid-4',
        apps: [
          { 
            name: 'Slack', 
            icon: MessageCircle, 
            color: '#4A154B', 
            position: { x: 50, y: 40 },
            size: { width: 80, height: 60 },
            volume: 80,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            instanceId: 'slack-work-mon2-1',
            associatedFiles: [
              {
                id: 'assoc-folder-1',
                name: 'Team Documents',
                path: '/Users/developer/Work/Team-Documents',
                type: 'folder',
                associatedApp: 'Slack',
                useDefaultApp: false
              }
            ]
          },
          { 
            name: 'Calendar', 
            icon: Calendar, 
            color: '#EA4335', 
            position: { x: 25, y: 80 },
            size: { width: 45, height: 35 },
            volume: 50,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            instanceId: 'calendar-work-mon2-1'
          },
          { 
            name: 'Mail', 
            icon: Mail, 
            color: '#1565C0', 
            position: { x: 75, y: 80 },
            size: { width: 45, height: 35 },
            volume: 70,
            launchBehavior: 'focus' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: true,
            instanceId: 'mail-work-mon2-1'
          },
        ]
      },
      {
        id: 'monitor-3',
        name: 'Monitor 3',
        primary: false,
        resolution: '1080x1920',
        orientation: 'portrait' as const,
        predefinedLayout: 'portrait-thirds',
        apps: [
          { 
            name: 'Discord', 
            icon: MessageCircle, 
            color: '#5865F2', 
            position: { x: 50, y: 25 },
            size: { width: 80, height: 30 },
            volume: 60,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            instanceId: 'discord-work-mon3-1'
          },
          { 
            name: 'Analytics', 
            icon: BarChart3, 
            color: '#FF6B35', 
            position: { x: 50, y: 60 },
            size: { width: 80, height: 35 },
            volume: 0,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            instanceId: 'analytics-work-mon3-1'
          },
          { 
            name: 'Camera', 
            icon: Camera, 
            color: '#8B5CF6', 
            position: { x: 50, y: 90 },
            size: { width: 80, height: 15 },
            volume: 40,
            launchBehavior: 'focus' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            monitorId: 'monitor-3',
            instanceId: 'camera-work-mon3-1'
          },
        ],
        files: [
          {
            id: 'file-1',
            name: 'project-notes.txt',
            path: '/Users/developer/Documents/project-notes.txt',
            type: 'text',
            associatedApp: 'VS Code',
            useDefaultApp: false,
            position: { x: 20, y: 70 },
            size: { width: 35, height: 25 },
            launchDelay: 0,
            windowSize: 'default' as const,
            targetMonitor: 'monitor-3'
          }
        ]
      }
    ],
    minimizedApps: [
      { name: 'Notes', icon: FileText, color: '#FFA500', volume: 0, launchBehavior: 'minimize' as const, targetMonitor: 'monitor-1', instanceId: 'notes-work-minimized-1' },
      { name: 'Calculator', icon: Settings, color: '#666666', volume: 0, launchBehavior: 'minimize' as const, targetMonitor: 'monitor-2', instanceId: 'calculator-work-minimized-1' },
      { name: 'Chrome', icon: Globe, color: '#4285F4', volume: 0, launchBehavior: 'minimize' as const, targetMonitor: 'monitor-2', instanceId: 'chrome-work-minimized-1',
        browserTabs: [
          { name: 'YouTube', url: 'https://youtube.com', isActive: true },
          { name: 'Gmail', url: 'https://gmail.com', isActive: false },
        ]
      },
    ],
    minimizedFiles: [
      {
        id: 'min-file-1',
        name: 'backup-script.sh',
        path: '/Users/developer/Scripts/backup-script.sh',
        type: 'script',
        associatedApp: 'Terminal',
        useDefaultApp: false,
        targetMonitor: 'monitor-1',
        sourcePosition: { x: 30, y: 40 },
        sourceSize: { width: 40, height: 25 },
        launchDelay: 0,
        windowSize: 'default' as const
      }
    ],
    files: [
      {
        id: 'file-sys-1',
        name: 'database-queries.sql',
        path: '/Users/developer/SQL/database-queries.sql',
        type: 'sql',
        associatedApp: 'SSMS',
        useDefaultApp: false,
        isFolder: false,
        files: []
      },
      {
        id: 'folder-1',
        name: 'Project Documents',
        path: '/Users/developer/Projects/current-project',
        type: 'folder',
        associatedApp: 'VS Code',
        useDefaultApp: false,
        isFolder: true,
        isExpanded: false,
        fileFilter: '*.md',
        files: [
          { name: 'README.md', type: 'markdown', size: '2.4 KB' },
          { name: 'CHANGELOG.md', type: 'markdown', size: '1.8 KB' },
          { name: 'TODO.md', type: 'markdown', size: '956 B' }
        ]
      }
    ],
    browserTabs: [
      { name: 'GitHub', url: 'https://github.com', browser: 'Chrome', newWindow: false, monitorId: 'monitor-1', isActive: true, appInstanceId: 'chrome-work-main-1' },
      { name: 'Documentation', url: 'https://docs.company.com', browser: 'Chrome', newWindow: true, monitorId: 'monitor-1', isActive: false, appInstanceId: 'chrome-work-main-1' },
      { name: 'Stack Overflow', url: 'https://stackoverflow.com', browser: 'Chrome', newWindow: false, monitorId: 'monitor-1', isActive: false, appInstanceId: 'chrome-work-main-1' },
    ]
  },
  {
    id: 'gaming',
    name: 'Gaming',
    icon: 'gaming',
    description: 'Optimized for gaming with communication tools',
    appCount: 6,
    tabCount: 3,
    fileCount: 2,
    globalVolume: 80,
    backgroundBehavior: 'minimize' as const,
    restrictedApps: ['Work Apps'],
    estimatedStartupTime: 8,
    onStartup: false,
    autoLaunchOnBoot: false,
    autoSwitchTime: '18:00',
    hotkey: 'Ctrl+Shift+G',
    schedule: { type: 'daily', time: '18:00', enabled: true },
    launchMinimized: false,
    launchMaximized: true,
    launchOrder: 'sequential' as const,
    appLaunchDelays: { 'Discord': 2, 'Spotify': 5 },
    monitors: [
      {
        id: 'monitor-1',
        name: 'Monitor 1',
        primary: true,
        resolution: '2560x1440',
        orientation: 'landscape' as const,
        predefinedLayout: 'fullscreen',
        apps: [
          { 
            name: 'Steam', 
            icon: Play, 
            color: '#1B2838', 
            position: { x: 50, y: 50 },
            size: { width: 95, height: 92 },
            volume: 80,
            launchBehavior: 'new' as const,
            runAsAdmin: true,
            forceCloseOnExit: true,
            smartSave: false,
            instanceId: 'steam-gaming-main-1'
          },
        ]
      },
      {
        id: 'monitor-2',
        name: 'Monitor 2', 
        primary: false,
        resolution: '1920x1080',
        orientation: 'landscape' as const,
        predefinedLayout: 'split-vertical',
        apps: [
          { 
            name: 'Discord', 
            icon: MessageCircle, 
            color: '#5865F2', 
            position: { x: 50, y: 30 },
            size: { width: 80, height: 45 },
            volume: 60,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            instanceId: 'discord-gaming-mon2-1'
          },
          { 
            name: 'Spotify', 
            icon: Music, 
            color: '#1DB954', 
            position: { x: 50, y: 75 },
            size: { width: 80, height: 40 },
            volume: 100,
            launchBehavior: 'focus' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            instanceId: 'spotify-gaming-mon2-1'
          },
        ],
        files: [
          {
            id: 'game-file-1',
            name: 'game-config.ini',
            path: '/Users/gamer/Games/Config/game-config.ini',
            type: 'config',
            associatedApp: 'Notepad++',
            useDefaultApp: false,
            position: { x: 80, y: 20 },
            size: { width: 35, height: 20 },
            launchDelay: 0,
            windowSize: 'default' as const,
            targetMonitor: 'monitor-2'
          }
        ]
      },
      {
        id: 'monitor-3',
        name: 'Monitor 3',
        primary: false,
        resolution: '1080x1920',
        orientation: 'portrait' as const,
        predefinedLayout: null,
        apps: [
          { 
            name: 'Chrome', 
            icon: Globe, 
            color: '#4285F4', 
            position: { x: 50, y: 40 },
            size: { width: 90, height: 70 },
            volume: 30,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: true,
            monitorId: 'monitor-3',
            instanceId: 'chrome-gaming-mon3-1'
          },
        ]
      }
    ],
    minimizedApps: [
      { name: 'OBS', icon: Camera, color: '#302E2B', volume: 0, launchBehavior: 'minimize' as const, targetMonitor: 'monitor-2', instanceId: 'obs-gaming-minimized-1' },
    ],
    minimizedFiles: [],
    files: [
      {
        id: 'game-folder-1',
        name: 'Game Saves',
        path: '/Users/gamer/Games/Saves',
        type: 'folder',
        associatedApp: 'Explorer',
        useDefaultApp: true,
        isFolder: true,
        isExpanded: false,
        fileFilter: '*.save',
        files: [
          { name: 'savegame-01.save', type: 'save', size: '4.2 MB' },
          { name: 'savegame-02.save', type: 'save', size: '4.1 MB' }
        ]
      }
    ],
    browserTabs: [
      { name: 'Twitch', url: 'https://twitch.tv', browser: 'Chrome', newWindow: true, monitorId: 'monitor-3', isActive: true, appInstanceId: 'chrome-gaming-mon3-1' },
      { name: 'YouTube Gaming', url: 'https://gaming.youtube.com', browser: 'Chrome', newWindow: false, monitorId: 'monitor-3', isActive: false, appInstanceId: 'chrome-gaming-mon3-1' },
    ]
  },
  {
    id: 'personal',
    name: 'Personal',
    icon: 'personal',
    description: 'Relaxed setup for personal browsing and media',
    appCount: 4,
    tabCount: 8,
    fileCount: 1,
    globalVolume: 60,
    backgroundBehavior: 'keep' as const,
    restrictedApps: [],
    estimatedStartupTime: 5,
    onStartup: true,
    autoLaunchOnBoot: true,
    autoSwitchTime: '09:00',
    hotkey: 'Ctrl+Shift+P',
    schedule: { type: 'weekdays', time: '09:00', enabled: false },
    launchMinimized: false,
    launchMaximized: false,
    launchOrder: 'all-at-once' as const,
    appLaunchDelays: {},
    monitors: [
      {
        id: 'monitor-1',
        name: 'Monitor 1',
        primary: true,
        resolution: '2560x1440',
        orientation: 'landscape' as const,
        predefinedLayout: null,
        apps: [
          { 
            name: 'Chrome', 
            icon: Globe, 
            color: '#4285F4', 
            position: { x: 40, y: 40 },
            size: { width: 70, height: 60 },
            volume: 70,
            launchBehavior: 'new' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: true,
            monitorId: 'monitor-1',
            instanceId: 'chrome-personal-main-1'
          },
          { 
            name: 'Spotify', 
            icon: Music, 
            color: '#1DB954', 
            position: { x: 70, y: 75 },
            size: { width: 50, height: 40 },
            volume: 20,
            launchBehavior: 'focus' as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            instanceId: 'spotify-personal-main-1'
          },
        ]
      }
    ],
    minimizedApps: [
      { name: 'Notes', icon: FileText, color: '#FFA500', volume: 0, launchBehavior: 'minimize' as const, targetMonitor: 'monitor-1', instanceId: 'notes-personal-minimized-1' },
    ],
    minimizedFiles: [],
    files: [
      {
        id: 'personal-folder-1',
        name: 'Photos',
        path: '/Users/personal/Photos',
        type: 'folder',
        associatedApp: 'Photos',
        useDefaultApp: true,
        isFolder: true,
        isExpanded: false,
        fileFilter: '*.jpg,*.png',
        files: [
          { name: 'vacation-2024.jpg', type: 'image', size: '2.8 MB' },
          { name: 'family-portrait.png', type: 'image', size: '5.1 MB' }
        ]
      }
    ],
    browserTabs: [
      { name: 'Netflix', url: 'https://netflix.com', browser: 'Chrome', newWindow: false, monitorId: 'monitor-1', isActive: true, appInstanceId: 'chrome-personal-main-1' },
      { name: 'YouTube', url: 'https://youtube.com', browser: 'Chrome', newWindow: false, monitorId: 'monitor-1', isActive: false, appInstanceId: 'chrome-personal-main-1' },
      { name: 'Reddit', url: 'https://reddit.com', browser: 'Chrome', newWindow: false, monitorId: 'monitor-1', isActive: false, appInstanceId: 'chrome-personal-main-1' },
      { name: 'Twitter', url: 'https://twitter.com', browser: 'Chrome', newWindow: false, monitorId: 'monitor-1', isActive: false, appInstanceId: 'chrome-personal-main-1' },
    ]
  }
];