/** Profile document used by the main layout UI and IPC persistence. */
export type FlowProfile = {
  id: string;
  name: string;
  description: string;
  icon: string;
  appCount: number;
  tabCount: number;
  fileCount: number;
  globalVolume: number;
  backgroundBehavior: "keep" | "minimize" | "close";
  restrictedApps: string[];
  estimatedStartupTime: number;
  onStartup: boolean;
  autoLaunchOnBoot: boolean;
  autoSwitchTime: string | null;
  hotkey: string;
  schedule?: unknown;
  launchMinimized: boolean;
  launchMaximized: boolean;
  launchOrder: "all-at-once" | "sequential";
  appLaunchDelays: Record<string, number>;
  monitors: any[];
  minimizedApps: any[];
  minimizedFiles: any[];
  files: any[];
  browserTabs: any[];
  contentItems?: any[];
  contentFolders?: any[];
};

/**
 * Main `profiles:list` / profile-store read path and renderer load catch.
 * Codes: `ENCRYPTION_UNAVAILABLE` | `DECRYPT_FAILED` | `PARSE_FAILED` | `READ_FAILED` | `LOAD_FAILED` (renderer IPC).
 */
export type ProfileStoreError = {
  code: string;
  message: string;
};

/** Global content library (shared across all profiles). */
export type ContentLibrarySnapshot = {
  items: unknown[];
  folders: unknown[];
};

/** Full document written by `profiles:save-all`. */
export type ProfileSavePayload = {
  profiles: FlowProfile[];
  contentLibrary: ContentLibrarySnapshot;
  contentLibraryExclusions: Record<string, string[]>;
};

export type ProfileListResult =
  | FlowProfile[]
  | {
      profiles: FlowProfile[];
      storeError: ProfileStoreError | null;
      contentLibrary?: ContentLibrarySnapshot;
      contentLibraryExclusions?: Record<string, string[]>;
    };

export function normalizeFlowProfile(rawProfile: unknown): FlowProfile {
  const r = rawProfile as Record<string, unknown>;
  return {
    ...(typeof rawProfile === "object" && rawProfile !== null ? rawProfile : {}),
    id: String(r?.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    name: String(r?.name || "Untitled Profile"),
    description: String(r?.description || "Profile without description"),
    icon: String(r?.icon || "work"),
    appCount: Number(r?.appCount || 0),
    tabCount: Number(r?.tabCount || 0),
    fileCount: Number(r?.fileCount || 0),
    globalVolume: Number(r?.globalVolume || 70),
    backgroundBehavior:
      r?.backgroundBehavior === "minimize" || r?.backgroundBehavior === "close"
        ? r.backgroundBehavior
        : "keep",
    estimatedStartupTime: Number(r?.estimatedStartupTime || 3),
    onStartup: Boolean(r?.onStartup),
    autoLaunchOnBoot: Boolean(r?.autoLaunchOnBoot),
    autoSwitchTime: (r?.autoSwitchTime as string | null) || null,
    hotkey: String(r?.hotkey || ""),
    launchMinimized: Boolean(r?.launchMinimized),
    launchMaximized: Boolean(r?.launchMaximized),
    launchOrder: r?.launchOrder === "sequential" ? "sequential" : "all-at-once",
    monitors: Array.isArray(r?.monitors) ? r.monitors : [],
    minimizedApps: Array.isArray(r?.minimizedApps) ? r.minimizedApps : [],
    minimizedFiles: Array.isArray(r?.minimizedFiles) ? r.minimizedFiles : [],
    browserTabs: Array.isArray(r?.browserTabs) ? r.browserTabs : [],
    files: Array.isArray(r?.files) ? r.files : [],
    contentItems: Array.isArray(r?.contentItems) ? r.contentItems : [],
    contentFolders: Array.isArray(r?.contentFolders) ? r.contentFolders : [],
    restrictedApps: Array.isArray(r?.restrictedApps) ? r.restrictedApps : [],
    appLaunchDelays:
      r?.appLaunchDelays && typeof r.appLaunchDelays === "object"
        ? (r.appLaunchDelays as Record<string, number>)
        : {},
  } as FlowProfile;
}

export function toSerializableProfiles(inputProfiles: FlowProfile[]): FlowProfile[] {
  try {
    return JSON.parse(JSON.stringify(inputProfiles)) as FlowProfile[];
  } catch {
    return (Array.isArray(inputProfiles) ? inputProfiles : []).map(
      (profile) => ({ ...profile }),
    );
  }
}
