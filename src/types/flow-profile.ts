import { safeIconSrc } from "../renderer/utils/safeIconSrc";

/** Canonical use-case for a profile (sidebar filter + settings). */
export const FLOW_PROFILE_KINDS = [
  "general",
  "work",
  "study",
  "gaming",
  "development",
  "creative",
  "streaming",
  "personal",
] as const;

export type FlowProfileKind = (typeof FLOW_PROFILE_KINDS)[number];

export const FLOW_PROFILE_KIND_LABELS: Record<FlowProfileKind, string> = {
  general: "General",
  work: "Work",
  study: "Study",
  gaming: "Gaming",
  development: "Development",
  creative: "Creative",
  streaming: "Streaming",
  personal: "Personal",
};

export function normalizeProfileKind(value: unknown): FlowProfileKind {
  if (typeof value !== "string") return "general";
  return (FLOW_PROFILE_KINDS as readonly string[]).includes(value)
    ? (value as FlowProfileKind)
    : "general";
}

/** Sidebar / header visual icon (independent of profile kind filter). */
export const FLOW_PROFILE_VISUAL_ICON_IDS = [
  "work",
  "gaming",
  "personal",
  "study",
  "development",
  "creative",
  "streaming",
  "music",
  "fitness",
  "coffee",
  "rocket",
  "moon",
  "laptop",
] as const;

export type FlowProfileVisualIconId = (typeof FLOW_PROFILE_VISUAL_ICON_IDS)[number];

export const FLOW_PROFILE_VISUAL_ICON_LABELS: Record<
  FlowProfileVisualIconId,
  string
> = {
  work: "Folder",
  gaming: "Gaming",
  personal: "Personal",
  study: "Study",
  development: "Development",
  creative: "Creative",
  streaming: "Streaming",
  music: "Music",
  fitness: "Fitness",
  coffee: "Coffee",
  rocket: "Rocket",
  moon: "Night",
  laptop: "Laptop",
};

export function normalizeProfileVisualIcon(
  value: unknown,
): FlowProfileVisualIconId {
  if (typeof value !== "string") return "work";
  const s = value.trim().toLowerCase().replace(/-/g, "_");
  return (FLOW_PROFILE_VISUAL_ICON_IDS as readonly string[]).includes(s)
    ? (s as FlowProfileVisualIconId)
    : "work";
}

/**
 * Canonical `profile.icon` value: a preset id or a validated raster `data:image/…;base64,…` URL.
 * Unknown / invalid strings fall back to `"work"`.
 */
export function normalizeStoredProfileIcon(value: unknown): string {
  if (typeof value !== "string") return "work";
  const trimmed = value.trim();
  const data = safeIconSrc(trimmed);
  if (data) return data;
  return normalizeProfileVisualIcon(trimmed);
}

/** Profile document used by the main layout UI and IPC persistence. */
export type FlowProfile = {
  id: string;
  name: string;
  description: string;
  /** Use-case category for the library sidebar filter and organization. */
  profileKind: FlowProfileKind;
  /** Preset id from {@link FLOW_PROFILE_VISUAL_ICON_IDS} or a validated raster data URL. */
  icon: string;
  appCount: number;
  tabCount: number;
  fileCount: number;
  globalVolume: number;
  /**
   * When true (default), FlowSwitch may apply per-app `volume` values on profile launch.
   * When false, launch should leave Windows session volumes unchanged for those apps.
   */
  applyProfileVolumesOnLaunch: boolean;
  /**
   * Legacy: same values as `preLaunchOutsideProfileBehavior` (apps not in this profile).
   * Kept in sync when saving from the renderer for older readers.
   */
  backgroundBehavior: "keep" | "minimize" | "close";
  /** Running instances of profile-slot apps before launch: reuse, close for fresh start, or minimize first. */
  preLaunchInProfileBehavior: "reuse" | "close_for_fresh_launch" | "minimize_then_launch";
  /** When `selected`, only `preLaunchInProfileTargetKeys` (placement keys) are affected; `reuse` closes others for fresh start. */
  preLaunchInProfileTargetMode: "all" | "selected";
  /** Placement keys for profile-slot apps; must be a subset of computed slot keys when mode is `selected`. */
  preLaunchInProfileTargetKeys: string[];
  /** Other apps on the system (not in this profile) before launch. */
  preLaunchOutsideProfileBehavior: "keep" | "minimize" | "close";
  /** When `selected`, only processes matching `preLaunchOutsideTargetNames` (like Filters) are affected. */
  preLaunchOutsideTargetMode: "all" | "selected";
  /** Display names / process labels to match running processes when outside mode is `selected`. */
  preLaunchOutsideTargetNames: string[];
  restrictedApps: string[];
  estimatedStartupTime: number;
  onStartup: boolean;
  autoLaunchOnBoot: boolean;
  autoSwitchTime: string | null;
  hotkey: string;
  /** When true, schedule is active for this profile. */
  scheduleEnabled: boolean;
  schedule?: unknown;
  launchMinimized: boolean;
  launchMaximized: boolean;
  launchOrder: "all-at-once" | "sequential";
  /** Ordered list of app ids (instanceId/name) for sequential launch. */
  appLaunchOrder: string[];
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
  const preLaunchOutsideProfileBehavior: FlowProfile["preLaunchOutsideProfileBehavior"] = (() => {
    const o = r?.preLaunchOutsideProfileBehavior;
    if (o === "keep" || o === "minimize" || o === "close") return o;
    if (r?.backgroundBehavior === "minimize" || r?.backgroundBehavior === "close") {
      return r.backgroundBehavior;
    }
    return "keep";
  })();

  const preLaunchInProfileTargetKeys: FlowProfile["preLaunchInProfileTargetKeys"] = Array.isArray(
    r?.preLaunchInProfileTargetKeys,
  )
    ? (r.preLaunchInProfileTargetKeys as unknown[])
        .map((k) => String(k || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  const preLaunchInProfileTargetMode: FlowProfile["preLaunchInProfileTargetMode"] =
    preLaunchInProfileTargetKeys.length > 0 ? "selected" : "all";

  let preLaunchOutsideTargetNames: FlowProfile["preLaunchOutsideTargetNames"] = Array.isArray(
    r?.preLaunchOutsideTargetNames,
  )
    ? (r.preLaunchOutsideTargetNames as unknown[])
        .map((n) => String(n || "").trim())
        .filter(Boolean)
    : [];
  if (preLaunchOutsideProfileBehavior === "keep") {
    preLaunchOutsideTargetNames = [];
  }
  const preLaunchOutsideTargetMode: FlowProfile["preLaunchOutsideTargetMode"] =
    preLaunchOutsideTargetNames.length > 0 ? "selected" : "all";

  return {
    ...(typeof rawProfile === "object" && rawProfile !== null ? rawProfile : {}),
    id: String(r?.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    name: String(r?.name || "Untitled Profile"),
    description: String(r?.description || "Profile without description"),
    icon: normalizeStoredProfileIcon(r?.icon),
    appCount: Number(r?.appCount || 0),
    tabCount: Number(r?.tabCount || 0),
    fileCount: Number(r?.fileCount || 0),
    globalVolume: Number(r?.globalVolume || 70),
    // Applying OS/app volumes on launch is not implemented yet; default to "don't change volumes".
    applyProfileVolumesOnLaunch: false,
    preLaunchInProfileBehavior:
      r?.preLaunchInProfileBehavior === "close_for_fresh_launch"
      || r?.preLaunchInProfileBehavior === "minimize_then_launch"
        ? r.preLaunchInProfileBehavior
        : "reuse",
    preLaunchInProfileTargetMode,
    preLaunchInProfileTargetKeys,
    preLaunchOutsideProfileBehavior,
    preLaunchOutsideTargetMode,
    preLaunchOutsideTargetNames,
    backgroundBehavior: preLaunchOutsideProfileBehavior,
    estimatedStartupTime: Number(r?.estimatedStartupTime || 3),
    onStartup: Boolean(r?.onStartup),
    autoLaunchOnBoot: Boolean(r?.autoLaunchOnBoot),
    autoSwitchTime: (r?.autoSwitchTime as string | null) || null,
    hotkey: String(r?.hotkey || ""),
    scheduleEnabled: Boolean(r?.scheduleEnabled),
    launchMinimized: Boolean(r?.launchMinimized),
    launchMaximized: Boolean(r?.launchMaximized),
    // Sequential is the only implemented execution mode right now.
    // Treat any legacy/all-at-once values as sequential until implemented.
    launchOrder: "sequential",
    appLaunchOrder: Array.isArray(r?.appLaunchOrder)
      ? (r.appLaunchOrder as unknown[]).map((v) => String(v || "").trim()).filter(Boolean)
      : [],
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
    profileKind: normalizeProfileKind(r?.profileKind),
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
