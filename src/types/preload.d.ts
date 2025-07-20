export {};

declare global {
  interface Window {
    electron: {
      launchProfile: (profileId: string) => void;
    };
  }
}
