import type { Profile } from './profile';

export {};

declare global {
  interface Window {
    electron: {
      launchProfile: (profileId: string) => void;
      onProfileLoaded: (callback: (profile: Profile) => void) => void;
      getInstalledApps: () => Promise<{ name: string; iconPath: string | null; executablePath?: string | null }[]>;
      captureRunningAppLayout: () => Promise<{
        capturedAt: number;
        appCount: number;
        monitors: Array<{
          id: string;
          name: string;
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
    };
  }
}
