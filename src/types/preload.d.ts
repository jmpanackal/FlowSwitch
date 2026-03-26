import type { Profile } from './profile';

export {};

declare global {
  interface Window {
    electron: {
      launchProfile: (profileId: string) => void;
      onProfileLoaded: (callback: (profile: Profile) => void) => void;
      getInstalledApps: () => Promise<{ name: string; iconPath: string | null }[]>;
    };
  }
}
