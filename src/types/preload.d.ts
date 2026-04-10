import type { Profile } from './profile';
import type { FlowProfile, ProfileListResult } from './flow-profile';

export {};

declare global {
  interface Window {
    electron: {
      launchProfile: (profileId: string) => Promise<{
        ok: boolean;
        error?: string;
        storeErrorCode?: string;
        requestedProfileId?: string;
        profile?: Profile;
        launchedAppCount?: number;
        launchedTabCount?: number;
        requestedAppCount?: number;
        failedApps?: Array<{
          name: string;
          path: string;
          error: string;
        }>;
        skippedApps?: Array<{
          name: string;
          reason: string;
        }>;
      }>;
      getInstalledApps: () => Promise<{
        name: string;
        iconPath: string | null;
        executablePath?: string | null;
        shortcutPath?: string | null;
        launchUrl?: string | null;
      }[]>;
      captureRunningAppLayout: () => Promise<{
        capturedAt: number;
        appCount: number;
        monitors: Array<{
          id: string;
          name: string;
          systemName?: string | null;
          primary: boolean;
          resolution: string;
          orientation: 'landscape' | 'portrait';
          layoutPosition?: { x: number; y: number };
          apps: Array<{
            name: string;
            iconPath: string | null;
            executablePath?: string | null;
            position: { x: number; y: number };
            size: { width: number; height: number };
          }>;
        }>;
        minimizedApps?: Array<{
          name: string;
          iconPath: string | null;
          executablePath?: string | null;
          position: { x: number; y: number };
          size: { width: number; height: number };
          targetMonitor?: string;
          sourcePosition?: { x: number; y: number };
          sourceSize?: { width: number; height: number };
        }>;
        error?: string;
      }>;
      getSystemMonitors: () => Promise<Array<{
        id: string;
        name: string;
        systemName?: string | null;
        primary: boolean;
        scaleFactor: number;
        resolution: string;
        orientation: 'landscape' | 'portrait';
        layoutPosition?: { x: number; y: number };
        apps: Array<unknown>;
      }>>;
      listProfiles: () => Promise<ProfileListResult>;
      saveProfiles: (profiles: FlowProfile[]) => Promise<{ ok: boolean; count?: number; error?: string }>;
      getZoneHistoryStats: () => Promise<{
        ok: boolean;
        stats?: {
          totalEntries: number;
          totalUseCount: number;
          mostUsedApp: string | null;
          maxUseCount: number;
        };
        error?: string;
      }>;
    };
  }
}
