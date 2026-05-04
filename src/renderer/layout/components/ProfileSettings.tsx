import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, useId } from "react";
import { X, User, Settings, Zap, Volume2, VolumeX, Clock, Minimize2, Maximize2, RotateCcw, Play, ArrowRight, AlertTriangle, Sparkles, Monitor, Copy, Trash2, Ban, HelpCircle, ChevronUp, ChevronDown, ChevronRight, Download, RefreshCw, Upload, Image } from "lucide-react";
import { DeleteConfirmation } from "./profile-settings/DeleteConfirmation";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import { Slider } from "./ui/slider";
import { ScheduleControl } from "./ScheduleControl";
import { AppSearchControl } from "./AppSearchControl";
import { HotkeyRecorderField } from "./HotkeyRecorderField";
import { FlowTooltip } from "./ui/tooltip";
import { safeIconSrc } from "../../utils/safeIconSrc";
import { profileAppPlacementKey } from "../../utils/profileAppPlacementKey";
import type { FlowProfileKind } from "../../../types/flow-profile";
import {
  FLOW_PROFILE_KINDS,
  FLOW_PROFILE_KIND_LABELS,
  FLOW_PROFILE_VISUAL_ICON_IDS,
  FLOW_PROFILE_VISUAL_ICON_LABELS,
  normalizeProfileKind,
  normalizeProfileVisualIcon,
  normalizeStoredProfileIcon,
} from "../../../types/flow-profile";
import { ProfileIconFrame } from "../utils/profileHeaderPresentation";
import { flowDropdownNativeSelectClass } from "./inspectorStyles";

const PROFILE_CUSTOM_ICON_MAX_FILE_BYTES = Math.floor(1.5 * 1024 * 1024);

interface ScheduleData {
  type: 'daily' | 'weekly';
  dailyTime?: string;
  weeklySchedule?: {
    [key: string]: {
      enabled: boolean;
      time: string;
    };
  };
}

interface ProfileSettingsProps {
  profile: {
    id: string;
    name: string;
    description: string;
    profileKind?: FlowProfileKind;
    icon?: string;
    globalVolume?: number;
    applyProfileVolumesOnLaunch?: boolean;
    backgroundBehavior?: "keep" | "close" | "minimize";
    preLaunchInProfileBehavior?: "reuse" | "close_for_fresh_launch" | "minimize_then_launch";
    preLaunchOutsideProfileBehavior?: "keep" | "minimize" | "close";
    restrictedApps?: string[];
    autoLaunchOnBoot?: boolean;
    autoSwitchTime?: string | null;
    scheduleData?: ScheduleData;
    hotkey?: string;
    launchMinimized?: boolean;
    launchMaximized?: boolean;
    launchOrder?: 'all-at-once' | 'sequential';
    appLaunchOrder?: string[];
    appLaunchDelays?: Record<string, number>;
    monitors?: any[];
    minimizedApps?: any[];
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: any) => void;
  onDuplicate?: () => void;
  onRename?: (newName: string, newDescription: string) => void;
  onDelete?: () => void;
  onExport?: () => void;
  /** When set, Profile tab shows Import wired to a hidden `<input type="file" id={…}>` (e.g. in MainLayout). */
  importProfileInputId?: string;
  allProfiles?: any[];
  /** When the modal opens, select this section (e.g. Automation). Legacy `"security"` opens Behavior. */
  initialSection?: ProfileSettingsInitialSection;
}

type ProfileSettingsInnerProps = Omit<ProfileSettingsProps, "profile"> & {
  profile: NonNullable<ProfileSettingsProps["profile"]>;
};

export type ProfileSettingsSection =
  | 'profile'
  | 'audio'
  | 'behavior'
  | 'automation';

/** Includes legacy `"security"`; opens Behavior tab. */
export type ProfileSettingsInitialSection = ProfileSettingsSection | "security";

type SettingsSection = ProfileSettingsSection;

interface SettingsTab {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const settingsTabs: SettingsTab[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: "Name, icon, type, description, and actions",
  },
  {
    id: 'audio',
    label: 'App audio',
    icon: Volume2,
    description: 'Per-app levels and whether to apply them on launch',
  },
  {
    id: 'behavior',
    label: 'Behavior',
    icon: Settings,
    description: 'Launch behavior and pre-launch actions'
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: Sparkles,
    description: 'Auto-launch and shortcuts'
  },
];

function ProfileSettingsInner({
  profile,
  onClose,
  onSave,
  onDuplicate,
  onRename,
  onDelete,
  onExport,
  importProfileInputId,
  allProfiles = [],
  initialSection,
}: ProfileSettingsInnerProps) {
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const persistBaselineProfileIdRef = useRef<string | null>(null);
  const lastPersistedPayloadJsonRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  /** Only reset pre-launch accordions when switching profiles, not on every autosave `profile` refresh. */
  const preLaunchSyncedProfileIdRef = useRef<string | null>(null);
  const normalizeInitialSection = (s: ProfileSettingsInitialSection | undefined): SettingsSection => {
    if (!s) return "profile";
    if (s === "security") return "behavior";
    return s;
  };

  const [activeTab, setActiveTab] = useState<SettingsSection>(() =>
    normalizeInitialSection(initialSection),
  );

  useEffect(() => {
    setActiveTab(normalizeInitialSection(initialSection));
  }, [initialSection, profile.id]);
  
  type PreLaunchInProfileBehavior = "reuse" | "close_for_fresh_launch" | "minimize_then_launch";
  type PreLaunchOutsideProfileBehavior = "keep" | "minimize" | "close";
  const mapOutsideFromProfile = (p: ProfileSettingsInnerProps["profile"]): PreLaunchOutsideProfileBehavior => {
    const o = (p as { preLaunchOutsideProfileBehavior?: string }).preLaunchOutsideProfileBehavior;
    if (o === "keep" || o === "minimize" || o === "close") return o;
    const b = p.backgroundBehavior;
    if (b === "minimize" || b === "close" || b === "keep") return b;
    return "keep";
  };

  const mapInFromProfile = (p: ProfileSettingsInnerProps["profile"]): PreLaunchInProfileBehavior => {
    const v = (p as { preLaunchInProfileBehavior?: string }).preLaunchInProfileBehavior;
    if (v === "reuse" || v === "close_for_fresh_launch" || v === "minimize_then_launch") return v;
    return "reuse";
  };

  const [preLaunchInProfileBehavior, setPreLaunchInProfileBehavior] =
    useState<PreLaunchInProfileBehavior>("reuse");
  const [preLaunchOutsideProfileBehavior, setPreLaunchOutsideProfileBehavior] =
    useState<PreLaunchOutsideProfileBehavior>("keep");
  const [preLaunchInProfileTargetKeys, setPreLaunchInProfileTargetKeys] = useState<string[]>([]);
  const [preLaunchOutsideTargetNames, setPreLaunchOutsideTargetNames] = useState<string[]>([]);
  /** Accordion: which row’s scope panel is open (at most one per group). */
  const [preLaunchInScopeAccordionId, setPreLaunchInScopeAccordionId] =
    useState<PreLaunchInProfileBehavior | null>(null);
  const [preLaunchOutsideScopeAccordionId, setPreLaunchOutsideScopeAccordionId] =
    useState<PreLaunchOutsideProfileBehavior | null>(null);
  const [restrictedApps, setRestrictedApps] = useState<string[]>([]);
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileKind, setProfileKind] = useState<FlowProfileKind>("general");
  const [profileIcon, setProfileIcon] = useState<string>("work");
  const [iconPickError, setIconPickError] = useState<string | null>(null);
  const profileCustomIconInputId = useId();
  const profileCustomIconInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Advanced settings
  const [autoLaunchOnBoot, setAutoLaunchOnBoot] = useState(false);
  const [scheduleData, setScheduleData] = useState<ScheduleData>({
    type: 'daily',
    dailyTime: '',
    weeklySchedule: {}
  });
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [hotkey, setHotkey] = useState('');
  const [launchMinimized, setLaunchMinimized] = useState(false);
  const [launchMaximized, setLaunchMaximized] = useState(false);
  const [launchOrder, setLaunchOrder] = useState<'all-at-once' | 'sequential'>('sequential');
  const [appLaunchOrder, setAppLaunchOrder] = useState<string[]>([]);
  const [appLaunchDelays, setAppLaunchDelays] = useState<Record<string, number>>({});
  
  // App-specific volume settings
  const [appVolumes, setAppVolumes] = useState<Record<string, number>>({});
  const [applyProfileVolumesOnLaunch, setApplyProfileVolumesOnLaunch] = useState(false);

  const getAllApps = useCallback(() => {
    const apps: any[] = [];
    profile.monitors?.forEach((monitor) => {
      const monitorLabel = String(monitor.name || "").trim() || `Monitor ${monitor.id}`;
      monitor.apps?.forEach((app: any) => {
        apps.push({
          ...app,
          location: monitorLabel,
          type: "monitor",
        });
      });
    });
    profile.minimizedApps?.forEach((app: any) => {
      apps.push({
        ...app,
        location: "Minimized",
        type: "minimized",
      });
    });
    return apps;
  }, [profile]);

  const getAvailableApps = useCallback(() => {
    const apps: string[] = [];
    profile.monitors?.forEach((monitor) => {
      monitor.apps?.forEach((app: any) => {
        if (!apps.includes(app.name)) {
          apps.push(app.name);
        }
      });
    });
    profile.minimizedApps?.forEach((app: any) => {
      if (!apps.includes(app.name)) {
        apps.push(app.name);
      }
    });
    return apps;
  }, [profile]);

  // Update all form fields when profile changes
  useEffect(() => {
    if (profile) {
      const profileSwitched = preLaunchSyncedProfileIdRef.current !== profile.id;
      preLaunchSyncedProfileIdRef.current = profile.id;
      if (profileSwitched) {
        setPreLaunchInScopeAccordionId(null);
        setPreLaunchOutsideScopeAccordionId(null);
      }
      setPreLaunchInProfileBehavior(mapInFromProfile(profile));
      setPreLaunchOutsideProfileBehavior(mapOutsideFromProfile(profile));
      const pInKeys = (profile as { preLaunchInProfileTargetKeys?: string[] }).preLaunchInProfileTargetKeys;
      setPreLaunchInProfileTargetKeys(
        Array.isArray(pInKeys) ? pInKeys.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean) : [],
      );
      const pOutNames = (profile as { preLaunchOutsideTargetNames?: string[] }).preLaunchOutsideTargetNames;
      setPreLaunchOutsideTargetNames(
        Array.isArray(pOutNames) ? pOutNames.map((n) => String(n || "").trim()).filter(Boolean) : [],
      );
      setRestrictedApps(profile.restrictedApps || []);
      setProfileName(profile.name || '');
      setProfileDescription(profile.description || '');
      setProfileKind(normalizeProfileKind(profile.profileKind));
      setProfileIcon(normalizeStoredProfileIcon(profile.icon));
      setIconPickError(null);
      setAutoLaunchOnBoot(profile.autoLaunchOnBoot || false);
      
      // Handle both new scheduleData format and legacy autoSwitchTime
      if (profile.scheduleData) {
        setScheduleData(profile.scheduleData);
      } else if (profile.autoSwitchTime) {
        // Convert legacy format to new format
        setScheduleData({
          type: 'daily',
          dailyTime: profile.autoSwitchTime,
          weeklySchedule: {}
        });
      } else {
        setScheduleData({
          type: 'daily',
          dailyTime: '',
          weeklySchedule: {}
        });
      }
      setScheduleEnabled(Boolean((profile as any).scheduleEnabled));
      
      setHotkey(profile.hotkey || '');
      setLaunchMinimized(profile.launchMinimized || false);
      setLaunchMaximized(profile.launchMaximized || false);
      setLaunchOrder('sequential');
      setAppLaunchDelays(profile.appLaunchDelays || {});
      // Applying volumes on launch is not implemented yet; keep UI aligned with current behavior.
      setApplyProfileVolumesOnLaunch(false);
      const currentAppIds = getAllApps().map((app) => String(app.instanceId || app.name)).filter(Boolean);
      const preferred = (Array.isArray(profile.appLaunchOrder) ? profile.appLaunchOrder : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...preferred, ...currentAppIds]));
      setAppLaunchOrder(merged);

      // Initialize app volumes
      const volumes: Record<string, number> = {};
      getAllApps().forEach(app => {
        volumes[app.instanceId || app.name] = app.volume ?? 50;
      });
      setAppVolumes(volumes);
    }
  }, [profile, getAllApps]);

  const validateSettings = useCallback(() => {
    const conflicts: string[] = [];

    if (autoLaunchOnBoot) {
      const otherBootProfiles = allProfiles.filter(
        (p) => p.id !== profile.id && p.autoLaunchOnBoot,
      );
      if (otherBootProfiles.length > 0) {
        conflicts.push(
          `Only one profile can auto-launch on boot. Currently set: ${otherBootProfiles[0].name}`,
        );
      }
    }

    const scheduleActive = Boolean(
      scheduleEnabled
      && scheduleData
      && (
        (scheduleData.type === "daily" && scheduleData.dailyTime)
        || (
          scheduleData.type === "weekly"
          && scheduleData.weeklySchedule
          && Object.values(scheduleData.weeklySchedule).some((day) => day.enabled)
        )
      )
    );

    if (scheduleActive) {
      const conflictingProfiles = allProfiles.filter((p) => {
        if (p.id === profile.id) return false;

        if (
          p.autoSwitchTime
          && scheduleData.type === "daily"
          && scheduleData.dailyTime === p.autoSwitchTime
        ) {
          return true;
        }

        if (!p.scheduleData) return false;

        if (scheduleData.type === "daily" && p.scheduleData.type === "daily") {
          return scheduleData.dailyTime === p.scheduleData.dailyTime;
        }

        if (
          scheduleData.type === "weekly"
          && p.scheduleData.type === "weekly"
          && scheduleData.weeklySchedule
          && p.scheduleData.weeklySchedule
        ) {
          return Object.keys(scheduleData.weeklySchedule).some((dayKey) => {
            const myDay = scheduleData.weeklySchedule![dayKey];
            const theirDay = p.scheduleData.weeklySchedule[dayKey];
            return myDay?.enabled && theirDay?.enabled && myDay.time === theirDay.time;
          });
        }

        if (scheduleData.type === "daily" && p.scheduleData.type === "weekly" && scheduleData.dailyTime) {
          return Object.values(p.scheduleData.weeklySchedule || {}).some(
            (day) => day.enabled && day.time === scheduleData.dailyTime,
          );
        }

        if (scheduleData.type === "weekly" && p.scheduleData.type === "daily" && p.scheduleData.dailyTime) {
          return Object.values(scheduleData.weeklySchedule || {}).some(
            (day) => day.enabled && day.time === p.scheduleData.dailyTime,
          );
        }

        return false;
      });

      if (conflictingProfiles.length > 0) {
        conflicts.push(`Schedule conflicts with: ${conflictingProfiles[0].name}`);
      }
    }

    if (hotkey) {
      const conflictingProfiles = allProfiles.filter(
        (p) => p.id !== profile.id && p.hotkey === hotkey,
      );
      if (conflictingProfiles.length > 0) {
        conflicts.push(`Hotkey ${hotkey} conflicts with: ${conflictingProfiles[0].name}`);
      }
    }

    return conflicts;
  }, [profile, allProfiles, autoLaunchOnBoot, scheduleData, scheduleEnabled, hotkey]);

  const settingsConflicts = useMemo(() => validateSettings(), [validateSettings]);

  const buildVolumeProfilePayload = useCallback(() => {
    const applyOne = (app: any) => {
      const id = app.instanceId || app.name;
      if (!Object.prototype.hasOwnProperty.call(appVolumes, id)) return app;
      const v = Math.max(0, Math.min(100, Math.round(Number(appVolumes[id]))));
      return { ...app, volume: v };
    };
    return {
      monitors: (profile.monitors || []).map((m) => ({
        ...m,
        apps: (m.apps || []).map(applyOne),
      })),
      minimizedApps: (profile.minimizedApps || []).map(applyOne),
    };
  }, [profile, appVolumes]);

  const buildPersistPayload = useCallback(
    () => ({
      profileKind,
      icon: profileIcon,
      globalVolume: profile.globalVolume ?? 70,
      applyProfileVolumesOnLaunch,
      backgroundBehavior: preLaunchOutsideProfileBehavior,
      preLaunchInProfileBehavior,
      preLaunchInProfileTargetMode:
        preLaunchInProfileTargetKeys.length > 0 ? ("selected" as const) : ("all" as const),
      preLaunchInProfileTargetKeys:
        preLaunchInProfileTargetKeys.length > 0 ? preLaunchInProfileTargetKeys : [],
      preLaunchOutsideProfileBehavior,
      preLaunchOutsideTargetMode:
        preLaunchOutsideProfileBehavior !== "keep" && preLaunchOutsideTargetNames.length > 0
          ? ("selected" as const)
          : ("all" as const),
      preLaunchOutsideTargetNames:
        preLaunchOutsideProfileBehavior !== "keep" && preLaunchOutsideTargetNames.length > 0
          ? preLaunchOutsideTargetNames
          : [],
      restrictedApps,
      autoLaunchOnBoot,
      scheduleEnabled,
      scheduleData,
      hotkey: hotkey || null,
      launchMinimized,
      launchMaximized,
      launchOrder,
      appLaunchOrder,
      appLaunchDelays,
      ...buildVolumeProfilePayload(),
    }),
    [
      profileKind,
      profileIcon,
      profile.globalVolume,
      applyProfileVolumesOnLaunch,
      preLaunchInProfileBehavior,
      preLaunchInProfileTargetKeys,
      preLaunchOutsideProfileBehavior,
      preLaunchOutsideTargetNames,
      restrictedApps,
      autoLaunchOnBoot,
      scheduleEnabled,
      scheduleData,
      hotkey,
      launchMinimized,
      launchMaximized,
      launchOrder,
      appLaunchOrder,
      appLaunchDelays,
      buildVolumeProfilePayload,
    ],
  );

  useEffect(() => {
    if (persistBaselineProfileIdRef.current !== profile.id) {
      persistBaselineProfileIdRef.current = profile.id;
      lastPersistedPayloadJsonRef.current = JSON.stringify(buildPersistPayload());
      return;
    }

    if (settingsConflicts.length > 0) {
      return;
    }

    const payload = buildPersistPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastPersistedPayloadJsonRef.current) {
      return;
    }

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    const handle = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      lastPersistedPayloadJsonRef.current = serialized;
      onSaveRef.current(payload);
    }, 300);
    autosaveTimerRef.current = handle;

    return () => {
      if (autosaveTimerRef.current !== null) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [profile.id, settingsConflicts.length, buildPersistPayload]);

  const flushPendingSettings = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    const conflicts = validateSettings();
    if (conflicts.length > 0) return;
    const payload = buildPersistPayload();
    const serialized = JSON.stringify(payload);
    if (serialized === lastPersistedPayloadJsonRef.current) return;
    lastPersistedPayloadJsonRef.current = serialized;
    onSaveRef.current(payload);
  }, [validateSettings, buildPersistPayload]);

  const handleRequestClose = useCallback(() => {
    flushPendingSettings();
    onClose();
  }, [flushPendingSettings, onClose]);

  const settingsTabNavRef = useRef<HTMLElement | null>(null);
  const settingsTabBtnRefs = useRef<Partial<Record<SettingsSection, HTMLButtonElement | null>>>({});
  const [settingsTabPill, setSettingsTabPill] = useState<{
    top: number;
    height: number;
    ready: boolean;
  }>({ top: 0, height: 0, ready: false });

  const updateSettingsTabPill = useCallback(() => {
    const nav = settingsTabNavRef.current;
    const btn = settingsTabBtnRefs.current[activeTab];
    if (!nav || !btn) return;
    setSettingsTabPill({
      top: btn.offsetTop,
      height: btn.offsetHeight,
      ready: true,
    });
  }, [activeTab]);

  useLayoutEffect(() => {
    updateSettingsTabPill();
  }, [activeTab, profile.id, updateSettingsTabPill]);

  useEffect(() => {
    const nav = settingsTabNavRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => updateSettingsTabPill());
    ro.observe(nav);
    return () => ro.disconnect();
  }, [updateSettingsTabPill]);

  // Auto-update profile info when fields change
  const handleProfileNameChange = (newName: string) => {
    setProfileName(newName);
    if (onRename) {
      onRename(newName, profileDescription);
    }
  };

  const handleProfileDescriptionChange = (newDescription: string) => {
    setProfileDescription(newDescription);
    if (onRename) {
      onRename(profileName, newDescription);
    }
  };

  const handleProfileIconFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setIconPickError(null);
      const input = e.target;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      if (file.size > PROFILE_CUSTOM_ICON_MAX_FILE_BYTES) {
        setIconPickError("Image must be about 1.5 MB or smaller.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        const safe = safeIconSrc(result);
        if (!safe) {
          setIconPickError("Use PNG, JPEG, WebP, GIF, or BMP.");
          return;
        }
        setProfileIcon(safe);
      };
      reader.onerror = () => {
        setIconPickError("Could not read that file.");
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const handleDeleteConfirm = () => {
    flushPendingSettings();
    onDelete?.();
    setShowDeleteConfirm(false);
    onClose();
  };

  // Handle individual app volume change
  const handleAppVolumeChange = (appId: string, volume: number) => {
    if (!applyProfileVolumesOnLaunch) return;
    setAppVolumes(prev => ({
      ...prev,
      [appId]: volume
    }));
  };

  const handleAppMuteToggle = (appId: string) => {
    if (!applyProfileVolumesOnLaunch) return;
    setAppVolumes((prev) => {
      const fromState = prev[appId];
      const baseApp = getAllApps().find((a) => (a.instanceId || a.name) === appId);
      const fallback = baseApp?.volume ?? 50;
      const cur = fromState !== undefined ? fromState : fallback;
      const next = cur === 0 ? 50 : 0;
      return { ...prev, [appId]: next };
    });
  };

  // Helper function to get schedule summary for header
  const getScheduleSummary = () => {
    if (scheduleData.type === 'daily' && scheduleData.dailyTime) {
      return 'Daily scheduled';
    } else if (scheduleData.type === 'weekly' && scheduleData.weeklySchedule) {
      const enabledDays = Object.values(scheduleData.weeklySchedule).filter(day => day.enabled);
      if (enabledDays.length > 0) {
        return `${enabledDays.length} days scheduled`;
      }
    }
    
    // Check legacy format
    if (profile.autoSwitchTime) {
      return 'Daily scheduled';
    }
    
    return null;
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-4">
            {/* Profile Information & Actions - Combined */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-flow-accent-blue/15 border border-flow-accent-blue/30 rounded-lg flex items-center justify-center">
                  <User className="w-4 h-4 text-flow-accent-blue" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Profile Information</h3>
                  <p className="text-xs text-flow-text-muted">
                    Update name, icon, type, description, and manage profile
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                  <div className="min-w-0 sm:flex-[2]">
                    <label className="block text-xs font-medium text-flow-text-secondary mb-1">
                      Profile Name
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => handleProfileNameChange(e.target.value)}
                      className="w-full px-3 py-2 bg-flow-bg-secondary border border-flow-border rounded-lg text-flow-text-primary placeholder:text-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue transition-colors text-sm"
                      placeholder="Enter profile name"
                    />
                  </div>
                  <div className="min-w-0 sm:flex-[1]">
                    <label className="block text-xs font-medium text-flow-text-secondary mb-1">
                      Profile type
                    </label>
                    <select
                      value={profileKind}
                      onChange={(e) =>
                        setProfileKind(normalizeProfileKind(e.target.value))
                      }
                      className={flowDropdownNativeSelectClass}
                    >
                      {FLOW_PROFILE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {FLOW_PROFILE_KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-flow-text-secondary mb-1">Description</label>
                  <textarea
                    value={profileDescription}
                    onChange={(e) => handleProfileDescriptionChange(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-flow-bg-secondary border border-flow-border rounded-lg text-flow-text-primary placeholder:text-flow-text-muted focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 focus:border-flow-accent-blue transition-colors resize-none text-sm"
                    placeholder="Describe what this profile is for"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-flow-text-secondary mb-1">
                    Profile icon
                  </label>
                  <p className="mb-2 text-[11px] leading-snug text-flow-text-muted">
                    Preset icons below, or pick an image from your computer (PNG, JPEG, WebP, GIF, or BMP, about 1.5 MB max). Independent of profile type.
                  </p>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                      ref={profileCustomIconInputRef}
                      id={profileCustomIconInputId}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp"
                      className="sr-only"
                      onChange={handleProfileIconFileChange}
                    />
                    <button
                      type="button"
                      onClick={() => profileCustomIconInputRef.current?.click()}
                      className="inline-flex items-center gap-2 rounded-lg border border-flow-border bg-flow-bg-secondary px-3 py-2 text-xs font-medium text-flow-text-secondary transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/50"
                    >
                      <Image className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                      Choose from computer
                    </button>
                    {safeIconSrc(profileIcon) ? (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileIcon("work");
                          setIconPickError(null);
                        }}
                        className="inline-flex items-center rounded-lg border border-flow-border/80 bg-transparent px-3 py-2 text-xs font-medium text-flow-text-muted transition-colors hover:border-flow-border hover:text-flow-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/50"
                      >
                        Clear custom image
                      </button>
                    ) : null}
                  </div>
                  {iconPickError ? (
                    <p className="mb-2 text-[11px] text-rose-300" role="alert">
                      {iconPickError}
                    </p>
                  ) : null}
                  <div
                    className="grid grid-cols-6 gap-2 sm:grid-cols-7"
                    role="listbox"
                    aria-label="Profile icon presets"
                  >
                    {FLOW_PROFILE_VISUAL_ICON_IDS.map((id) => {
                      const selected =
                        !safeIconSrc(profileIcon) &&
                        normalizeProfileVisualIcon(profileIcon) === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          aria-label={FLOW_PROFILE_VISUAL_ICON_LABELS[id]}
                          onClick={() => {
                            setProfileIcon(id);
                            setIconPickError(null);
                          }}
                          className={`rounded-lg p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/55 ${
                            selected
                              ? "ring-2 ring-flow-accent-blue ring-offset-2 ring-offset-flow-surface"
                              : "ring-1 ring-transparent hover:ring-flow-border"
                          }`}
                        >
                          <ProfileIconFrame
                            icon={id}
                            className="mx-auto scale-90"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {importProfileInputId ? (
                    <label
                      htmlFor={importProfileInputId}
                      className="flex min-w-[6.5rem] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-flow-border bg-flow-bg-secondary px-3 py-2 text-sm text-flow-text-secondary transition-all hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary"
                    >
                      <Upload className="h-3.5 w-3.5 shrink-0" />
                      Import
                    </label>
                  ) : null}
                  {onExport && (
                    <button
                      type="button"
                      onClick={onExport}
                      className="flex min-w-[6.5rem] flex-1 items-center justify-center gap-2 rounded-lg border border-flow-border bg-flow-bg-secondary px-3 py-2 text-sm text-flow-text-secondary transition-all hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      Export
                    </button>
                  )}
                  {onDuplicate && (
                    <button
                      type="button"
                      onClick={onDuplicate}
                      className="flex min-w-[6.5rem] flex-1 items-center justify-center gap-2 rounded-lg border border-flow-border bg-flow-bg-secondary px-3 py-2 text-sm text-flow-text-secondary transition-all hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary"
                    >
                      <Copy className="h-3.5 w-3.5 shrink-0" />
                      Duplicate
                    </button>
                  )}

                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex min-w-[6.5rem] flex-1 items-center justify-center gap-2 rounded-lg border border-flow-accent-red/30 bg-flow-accent-red/10 px-3 py-2 text-sm text-flow-accent-red transition-all hover:bg-flow-accent-red/20"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'audio':
        if (getAllApps().length === 0) {
          return (
            <div className="rounded-xl border border-flow-border bg-flow-surface p-6 text-center text-sm text-flow-text-muted">
              No apps in this profile yet. Add apps from the Apps view, then set volume or mute per app here.
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-flow-accent-blue/15 border border-flow-accent-blue/30 rounded-lg flex items-center justify-center shrink-0">
                    <Volume2 className="w-4 h-4 text-flow-accent-blue" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-flow-text-primary">App audio</h3>
                    <p className="text-xs text-flow-text-muted">
                      Use each slider for level in this profile (0% is muted). The speaker button mutes or restores quickly.
                    </p>
                  </div>
                </div>
                <span className="text-xs text-flow-text-muted bg-flow-bg-secondary px-2 py-1 rounded border border-flow-border shrink-0">
                  {getAllApps().length} apps
                </span>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs font-medium text-flow-text-secondary">
                    When this profile launches
                  </div>
                  <FlowTooltip label="Choose whether FlowSwitch should change Windows session volumes for these apps on launch.">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md p-1 text-flow-text-muted hover:text-flow-text-primary hover:bg-flow-surface-elevated transition-colors"
                      aria-label="Help: launch volume behavior"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                  </FlowTooltip>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled
                    onClick={() => setApplyProfileVolumesOnLaunch(true)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      applyProfileVolumesOnLaunch
                        ? "border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue"
                        : "border-flow-border bg-flow-bg-secondary text-flow-text-secondary hover:bg-flow-surface-elevated hover:border-flow-border-accent"
                    }`}
                  >
                    <Volume2 className="w-4 h-4 shrink-0" />
                    <div className="text-left min-w-0 flex-1">
                      <div className="font-medium text-sm flex items-center gap-2">
                        <span>Apply volumes</span>
                        <span className="text-[11px] font-medium rounded-md border border-flow-border px-1.5 py-0.5 bg-flow-surface">
                          Coming soon
                        </span>
                      </div>
                      <div className="text-xs opacity-80">Set apps to these levels on launch</div>
                    </div>
                    <FlowTooltip label="When enabled, FlowSwitch may apply the per-app levels you set below during profile launch (when launch-time volume control is available).">
                      <span
                        className={`inline-flex items-center justify-center rounded-md p-1 transition-colors ${
                          applyProfileVolumesOnLaunch
                            ? "text-flow-accent-blue/90 hover:text-flow-accent-blue"
                            : "text-flow-text-muted hover:text-flow-text-primary"
                        }`}
                        aria-label="Help: apply volumes"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </span>
                    </FlowTooltip>
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyProfileVolumesOnLaunch(false)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-all ${
                      !applyProfileVolumesOnLaunch
                        ? "border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue"
                        : "border-flow-border bg-flow-bg-secondary text-flow-text-secondary hover:bg-flow-surface-elevated hover:border-flow-border-accent"
                    }`}
                  >
                    <Ban className="w-4 h-4 shrink-0" />
                    <div className="text-left min-w-0 flex-1">
                      <div className="font-medium text-sm">Don’t change volumes</div>
                      <div className="text-xs opacity-80">Leave Windows session volumes alone</div>
                    </div>
                    <FlowTooltip label="When disabled, FlowSwitch will not adjust Windows session volumes for these apps on launch. Your saved levels remain stored for later.">
                      <span
                        className={`inline-flex items-center justify-center rounded-md p-1 transition-colors ${
                          !applyProfileVolumesOnLaunch
                            ? "text-flow-accent-blue/90 hover:text-flow-accent-blue"
                            : "text-flow-text-muted hover:text-flow-text-primary"
                        }`}
                        aria-label="Help: don't change volumes"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </span>
                    </FlowTooltip>
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[min(24rem,55vh)] overflow-y-auto scrollbar-elegant pr-1">
                {getAllApps().map((app) => {
                  const appId = app.instanceId || app.name;
                  const currentVolume =
                    appVolumes[appId] !== undefined ? appVolumes[appId] : (app.volume ?? 50);
                  const isMuted = currentVolume === 0;
                  const volumesDisabled = !applyProfileVolumesOnLaunch;
                  const iconSrc = safeIconSrc(app.iconPath ?? undefined);

                  return (
                    <div
                      key={appId}
                      className={`flex flex-col gap-3 p-3 rounded-lg border border-flow-border bg-flow-bg-secondary transition-colors sm:flex-row sm:items-center sm:gap-4 ${
                        volumesDisabled ? "opacity-55" : "hover:bg-flow-surface"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {iconSrc ? (
                          <img
                            src={iconSrc}
                            alt={app.name}
                            className="h-5 w-5 rounded object-contain shrink-0"
                            draggable={false}
                          />
                        ) : (
                          app.icon && <app.icon className="w-4 h-4 text-flow-text-secondary shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm text-flow-text-primary truncate">{app.name}</div>
                          <div className="text-xs text-flow-text-muted">{app.location}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 min-w-0 sm:flex-1 sm:max-w-md sm:ml-auto">
                        <FlowTooltip
                          label={
                            volumesDisabled
                              ? "Enable “Apply volumes” to edit per-app levels."
                              : (isMuted ? "Unmute (restore to 50%)" : "Mute this app")
                          }
                        >
                          <button
                            type="button"
                            onClick={() => handleAppMuteToggle(appId)}
                            disabled={volumesDisabled}
                            className={`shrink-0 rounded-lg p-2 transition-colors disabled:cursor-not-allowed ${
                              isMuted
                                ? "bg-flow-accent-red/15 text-flow-accent-red"
                                : "bg-flow-surface-elevated text-flow-text-secondary hover:text-flow-text-primary"
                            }`}
                            aria-label={isMuted ? "Unmute app" : "Mute app"}
                          >
                            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                          </button>
                        </FlowTooltip>
                        <div className="flex flex-1 min-w-[10rem] items-center gap-2">
                          <Slider
                            value={[currentVolume]}
                            onValueChange={(value) => handleAppVolumeChange(appId, value[0])}
                            max={100}
                            step={1}
                            disabled={volumesDisabled}
                            className="flex-1 w-full"
                          />
                        </div>
                        <span className="text-xs font-medium text-flow-text-primary tabular-nums min-w-[3.25rem] text-right shrink-0">
                          {isMuted ? "Muted" : `${currentVolume}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'behavior':
        return (
          <div className="space-y-4">
            {/* Pre-launch app behavior */}
            <div className="rounded-xl border border-flow-border bg-flow-surface p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-flow-accent-blue/30 bg-flow-accent-blue/15">
                  <Monitor className="h-4 w-4 text-flow-accent-blue" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Pre-launch app behavior</h3>
                  <p className="text-xs text-flow-text-muted">
                    Windows · visible windows only · never FlowSwitch or protected shells. File Explorer is captured when folder paths are detected (tabs → profile content).
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="mb-1 text-sm font-medium text-flow-text-primary">Apps in this profile</h4>
                  <p className="mb-2 text-[11px] leading-snug text-flow-text-muted">
                    Row = behavior for already-running slots. Arrow ={" "}
                    <span className="font-medium text-flow-text-secondary">specific slots only</span> (optional;
                    default = every slot).
                  </p>
                  <div className="space-y-1 rounded-xl border border-flow-border bg-flow-surface p-1">
                    {(
                      [
                        {
                          id: "reuse" as const,
                          label: "Reuse open windows",
                          desc: "Keep existing windows; FlowSwitch will place or reuse them when possible (default).",
                          icon: Play,
                        },
                        {
                          id: "close_for_fresh_launch" as const,
                          label: "Close before launch",
                          desc: "End running instances first so each slot starts from a clean process where possible.",
                          icon: RefreshCw,
                        },
                        {
                          id: "minimize_then_launch" as const,
                          label: "Minimize first",
                          desc: "Minimize existing windows for those apps, then launch — frees the screen without killing processes.",
                          icon: Minimize2,
                        },
                      ] as const
                    ).map(({ id, label, desc, icon: Icon }) => {
                      const selected = preLaunchInProfileBehavior === id;
                      const isOpen = preLaunchInScopeAccordionId === id;
                      const panelId = `prelaunch-in-panel-${id}`;
                      const inProfileLimited = preLaunchInProfileTargetKeys.length > 0;
                      return (
                        <div
                          key={id}
                          className={`overflow-hidden rounded-lg border transition-colors ${
                            selected
                              ? "border-flow-accent-blue/90 bg-flow-accent-blue/10"
                              : "border-flow-border/70 bg-flow-bg-secondary"
                          }`}
                        >
                          <div className="flex min-h-[3.25rem]">
                            <button
                              type="button"
                              onClick={() => {
                                const switching = preLaunchInProfileBehavior !== id;
                                setPreLaunchInProfileBehavior(id);
                                if (switching) setPreLaunchInScopeAccordionId(null);
                              }}
                              aria-pressed={selected}
                              className={`flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition-colors ${
                                selected
                                  ? "text-flow-accent-blue"
                                  : "text-flow-text-secondary hover:bg-flow-surface-elevated/80"
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium">{label}</div>
                                <div className="text-xs opacity-80">{desc}</div>
                              </div>
                            </button>
                            <button
                              type="button"
                              title={`Specific slots only — optional list for “${label}”`}
                              aria-label={`Open specific-slot list for ${label}. Default is all slots.`}
                              aria-expanded={isOpen}
                              aria-controls={panelId}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (preLaunchInScopeAccordionId === id) {
                                  setPreLaunchInScopeAccordionId(null);
                                } else {
                                  setPreLaunchInProfileBehavior(id);
                                  setPreLaunchInScopeAccordionId(id);
                                }
                              }}
                              className="flex w-11 shrink-0 items-center justify-center border-l border-flow-border/60 bg-flow-bg-secondary/50 text-flow-text-muted transition-colors hover:bg-flow-surface-elevated hover:text-flow-text-primary"
                            >
                              <ChevronRight
                                className={`h-4 w-4 transition-transform duration-200 ease-out ${
                                  isOpen ? "rotate-90" : ""
                                }`}
                                aria-hidden
                              />
                            </button>
                          </div>
                          {isOpen ? (
                            <div
                              id={panelId}
                              role="region"
                              aria-labelledby={`prelaunch-in-scope-label-${id}`}
                              className="space-y-2 border-t border-flow-border/80 bg-flow-bg-secondary/70 px-3 py-2.5"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div id={`prelaunch-in-scope-label-${id}`}>
                                <div className="text-xs font-semibold text-flow-text-primary">
                                  Specific slots only
                                </div>
                                <p className="mt-0.5 text-[10px] leading-snug text-flow-text-muted">
                                  Optional. Unchecked = all slots. Checked = this row’s rule applies only to those
                                  slots.
                                </p>
                              </div>
                              <p
                                role="status"
                                className={`text-[10px] leading-snug ${inProfileLimited ? "font-medium text-flow-accent-blue" : "text-flow-text-muted"}`}
                              >
                                {inProfileLimited
                                  ? "Narrowed: checked slots only — not all slots."
                                  : "All slots (default)."}
                              </p>
                              <div className="max-h-52 space-y-1.5 overflow-y-auto scrollbar-elegant pr-1 pt-0.5">
                                {getAllApps().length === 0 ? (
                                  <p className="text-xs text-flow-text-muted">
                                    Add apps to this profile to choose specific slots.
                                  </p>
                                ) : (
                                  getAllApps().map((app) => {
                                    const key = profileAppPlacementKey(app);
                                    const rowId = String(app.instanceId || app.name);
                                    const checked = preLaunchInProfileTargetKeys.includes(key);
                                    const iconSrc = safeIconSrc(app.iconPath ?? undefined);
                                    return (
                                      <label
                                        key={rowId}
                                        className="flex cursor-pointer items-center gap-2 rounded-md border border-flow-border/60 bg-flow-surface/60 px-2 py-1.5 hover:bg-flow-surface"
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5 shrink-0 rounded border-flow-border"
                                          checked={checked}
                                          onChange={() => {
                                            setPreLaunchInProfileTargetKeys((prev) =>
                                              prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                                            );
                                          }}
                                        />
                                        {iconSrc ? (
                                          <img
                                            src={iconSrc}
                                            alt=""
                                            className="h-8 w-8 shrink-0 rounded object-contain"
                                            draggable={false}
                                          />
                                        ) : app.icon ? (
                                          <app.icon className="h-7 w-7 shrink-0 text-flow-text-secondary" />
                                        ) : (
                                          <div
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-flow-border/60 bg-flow-bg-secondary text-[10px] font-medium text-flow-text-muted"
                                            aria-hidden
                                          >
                                            {String(app.name || "?").slice(0, 1).toUpperCase()}
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-xs font-medium text-flow-text-primary">
                                            {app.name}
                                          </div>
                                          <div className="mt-0.5 truncate text-[10px] text-flow-text-muted">
                                            {app.location}
                                          </div>
                                        </div>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h4 className="mb-1 text-sm font-medium text-flow-text-primary">Apps not in this profile</h4>
                  <p className="mb-2 text-[11px] leading-snug text-flow-text-muted">
                    Other visible apps. Row = what happens to them. Arrow ={" "}
                    <span className="font-medium text-flow-text-secondary">specific apps only</span> for Minimize/Close
                    (optional; empty list = all other apps).
                  </p>
                  <div className="space-y-1 rounded-xl border border-flow-border bg-flow-surface p-1">
                    {(
                      [
                        {
                          id: "keep" as const,
                          label: "Leave them alone",
                          desc: "Do not minimize or close other apps (default).",
                          icon: Play,
                        },
                        {
                          id: "minimize" as const,
                          label: "Minimize",
                          desc: "Minimize their main windows before this profile’s apps take focus.",
                          icon: Minimize2,
                        },
                        {
                          id: "close" as const,
                          label: "Close",
                          desc: "Force-close other apps — destructive; use when you want a clean desk.",
                          icon: X,
                        },
                      ] as const
                    ).map(({ id, label, desc, icon: Icon }) => {
                      const selected = preLaunchOutsideProfileBehavior === id;
                      const isOpen = preLaunchOutsideScopeAccordionId === id;
                      const panelId = `prelaunch-out-panel-${id}`;
                      const outsideLimited = preLaunchOutsideTargetNames.length > 0;
                      return (
                        <div
                          key={id}
                          className={`overflow-hidden rounded-lg border transition-colors ${
                            selected
                              ? "border-flow-accent-blue/90 bg-flow-accent-blue/10"
                              : "border-flow-border/70 bg-flow-bg-secondary"
                          }`}
                        >
                          <div className="flex min-h-[3.25rem]">
                            <button
                              type="button"
                              onClick={() => {
                                const switching = preLaunchOutsideProfileBehavior !== id;
                                setPreLaunchOutsideProfileBehavior(id);
                                if (switching) setPreLaunchOutsideScopeAccordionId(null);
                                if (id === "keep") setPreLaunchOutsideTargetNames([]);
                              }}
                              aria-pressed={selected}
                              className={`flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition-colors ${
                                selected
                                  ? "text-flow-accent-blue"
                                  : "text-flow-text-secondary hover:bg-flow-surface-elevated/80"
                              }`}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium">{label}</div>
                                <div className="text-xs opacity-80">{desc}</div>
                              </div>
                            </button>
                            <button
                              type="button"
                              title={
                                id === "keep"
                                  ? "Notes for this option"
                                  : `Specific apps only — optional list for “${label}”`
                              }
                              aria-label={
                                id === "keep"
                                  ? `Notes for ${label}`
                                  : `Open specific-app list for ${label}. Empty list = all other apps.`
                              }
                              aria-expanded={isOpen}
                              aria-controls={panelId}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (preLaunchOutsideScopeAccordionId === id) {
                                  setPreLaunchOutsideScopeAccordionId(null);
                                } else {
                                  setPreLaunchOutsideProfileBehavior(id);
                                  if (id === "keep") setPreLaunchOutsideTargetNames([]);
                                  setPreLaunchOutsideScopeAccordionId(id);
                                }
                              }}
                              className="flex w-11 shrink-0 items-center justify-center border-l border-flow-border/60 bg-flow-bg-secondary/50 text-flow-text-muted transition-colors hover:bg-flow-surface-elevated hover:text-flow-text-primary"
                            >
                              <ChevronRight
                                className={`h-4 w-4 transition-transform duration-200 ease-out ${
                                  isOpen ? "rotate-90" : ""
                                }`}
                                aria-hidden
                              />
                            </button>
                          </div>
                          {isOpen && id === "keep" ? (
                            <div
                              id={panelId}
                              role="region"
                              className="border-t border-flow-border/80 bg-flow-bg-secondary/70 px-3 py-2.5"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-[10px] leading-snug text-flow-text-muted">
                                Nothing else changes. To target only some apps, use{" "}
                                <span className="font-medium text-flow-text-secondary">Minimize</span> or{" "}
                                <span className="font-medium text-flow-text-secondary">Close</span> and the arrow
                                there.
                              </p>
                            </div>
                          ) : null}
                          {isOpen && (id === "minimize" || id === "close") ? (
                            <div
                              id={panelId}
                              role="region"
                              aria-labelledby={`prelaunch-out-scope-label-${id}`}
                              className="space-y-2 border-t border-flow-border/80 bg-flow-bg-secondary/70 px-3 py-2.5"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div id={`prelaunch-out-scope-label-${id}`}>
                                <div className="text-xs font-semibold text-flow-text-primary">
                                  Specific apps only
                                </div>
                                <p className="mt-0.5 text-[10px] leading-snug text-flow-text-muted">
                                  Optional. Empty = all other visible apps. Add names = only those apps.
                                </p>
                              </div>
                              <p
                                role="status"
                                className={`text-[10px] leading-snug ${outsideLimited ? "font-medium text-flow-accent-blue" : "text-flow-text-muted"}`}
                              >
                                {outsideLimited
                                  ? "Narrowed: list only — not all other apps."
                                  : "All other apps (default)."}
                              </p>
                              <AppSearchControl
                                restrictedApps={preLaunchOutsideTargetNames}
                                onUpdateRestrictedApps={setPreLaunchOutsideTargetNames}
                                placeholder={
                                  id === "close"
                                    ? "Search to add apps to force-close…"
                                    : "Search to add apps to minimize…"
                                }
                                excludeFromSuggestions={Array.from(
                                  new Set(getAllApps().map((a) => a.name).filter(Boolean)),
                                )}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Launch Order Card */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-flow-accent-green/15 border border-flow-accent-green/30 rounded-lg flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-flow-accent-green" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Launch Order</h3>
                  <p className="text-xs text-flow-text-muted">Sequential launch order and per-app delays</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  {[
                    { id: 'all-at-once', label: 'All at once', desc: 'Launch all apps simultaneously', icon: Zap, comingSoon: true },
                    { id: 'sequential', label: 'Sequential', desc: 'Launch apps one by one', icon: ArrowRight }
                  ].map(({ id, label, desc, icon: Icon, comingSoon }) => {
                    const disabled = comingSoon === true;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setLaunchOrder(id as any)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all disabled:opacity-55 disabled:cursor-not-allowed ${
                          launchOrder === id
                            ? 'border-flow-accent-blue bg-flow-accent-blue/10 text-flow-accent-blue'
                            : 'border-flow-border bg-flow-bg-secondary text-flow-text-secondary hover:bg-flow-surface-elevated'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <div className="text-left flex-1 min-w-0">
                          <div className="font-medium text-sm flex items-center gap-2">
                            <span className="truncate">{label}</span>
                            {comingSoon ? (
                              <span className="text-[11px] font-medium rounded-md border border-flow-border px-1.5 py-0.5 bg-flow-surface">
                                Coming soon
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs opacity-75">{desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {launchOrder === 'sequential' && (
                  <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <h5 className="text-flow-text-primary font-medium text-sm">App order</h5>
                        <p className="text-flow-text-muted text-xs">Set order + delay for each app</p>
                      </div>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-elegant pr-1">
                      {appLaunchOrder
                        .map((id) => {
                          const row = getAllApps().find((a) => String(a.instanceId || a.name) === id);
                          return row ? { id, app: row } : null;
                        })
                        .filter(Boolean)
                        .map((row, idx) => {
                          const r = row as { id: string; app: any };
                          const iconSrc = safeIconSrc(r.app.iconPath ?? undefined);
                          const delayValue = Number(appLaunchDelays[r.app.name] || 0);
                          return (
                            <div key={r.id} className="flex items-center gap-2 rounded-lg border border-flow-border bg-flow-surface p-2">
                              {iconSrc ? (
                                <img src={iconSrc} alt={r.app.name} className="h-5 w-5 rounded object-contain shrink-0" draggable={false} />
                              ) : (
                                r.app.icon && <r.app.icon className="h-4 w-4 text-flow-text-secondary shrink-0" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-flow-text-primary truncate">{r.app.name}</div>
                                <div className="text-xs text-flow-text-muted truncate">{r.app.location}</div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <FlowTooltip label="Delay before launching this app (seconds)">
                                  <div className="flex items-center gap-2 rounded-md border border-flow-border bg-flow-bg-secondary px-2 py-1">
                                    <span className="text-[11px] text-flow-text-muted">Delay</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="60"
                                      value={Number.isFinite(delayValue) ? delayValue : 0}
                                      onChange={(e) => {
                                        const v = Math.max(0, Math.min(60, parseInt(e.target.value, 10) || 0));
                                        setAppLaunchDelays((prev) => ({ ...prev, [r.app.name]: v }));
                                      }}
                                      className="w-14 bg-transparent text-flow-text-primary text-xs focus:outline-none text-right tabular-nums"
                                      aria-label={`Launch delay for ${r.app.name}`}
                                    />
                                    <span className="text-[11px] text-flow-text-muted">s</span>
                                  </div>
                                </FlowTooltip>

                                <button
                                  type="button"
                                  className="rounded-md p-1 text-flow-text-muted hover:text-flow-text-primary hover:bg-flow-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  disabled={idx === 0}
                                  aria-label="Move up"
                                  onClick={() => {
                                    setAppLaunchOrder((prev) => {
                                      const next = [...prev];
                                      if (idx <= 0) return next;
                                      const tmp = next[idx - 1];
                                      next[idx - 1] = next[idx];
                                      next[idx] = tmp;
                                      return next;
                                    });
                                  }}
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-md p-1 text-flow-text-muted hover:text-flow-text-primary hover:bg-flow-surface-elevated disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  disabled={idx === appLaunchOrder.length - 1}
                                  aria-label="Move down"
                                  onClick={() => {
                                    setAppLaunchOrder((prev) => {
                                      const next = [...prev];
                                      if (idx >= next.length - 1) return next;
                                      const tmp = next[idx + 1];
                                      next[idx + 1] = next[idx];
                                      next[idx] = tmp;
                                      return next;
                                    });
                                  }}
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'automation':
        return (
          <div className="space-y-4">
            {/* Automation Settings Card */}
            <div className="bg-flow-surface border border-flow-border rounded-xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-flow-accent-purple/15 border border-flow-accent-purple/30 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-flow-accent-purple" />
                </div>
                <div>
                  <h3 className="font-medium text-flow-text-primary">Automation</h3>
                  <p className="text-xs text-flow-text-muted">Auto-launch, scheduling, and shortcuts</p>
                </div>
              </div>
              
              <div className="space-y-4">
                {/* Hotkey */}
                <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-flow-text-secondary">Hotkey</div>
                      <div className="text-xs text-flow-text-muted">Launch this profile instantly</div>
                    </div>
                    <div className="text-xs text-flow-text-muted">
                      {hotkey ? `Active: ${hotkey}` : "Off"}
                    </div>
                  </div>
                  <div className="mt-3">
                    <HotkeyRecorderField value={hotkey} onChange={setHotkey} />
                  </div>
                </div>

                {/* Schedule */}
                <div className="bg-flow-bg-secondary border border-flow-border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-flow-text-secondary">Schedule</div>
                      <div className="text-xs text-flow-text-muted">Ask before launching at the scheduled time</div>
                    </div>
                    <Switch
                      checked={scheduleEnabled}
                      onCheckedChange={setScheduleEnabled}
                    />
                  </div>
                  {scheduleEnabled ? (
                    <div className="mt-3">
                      <ScheduleControl value={scheduleData} onChange={setScheduleData} />
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-flow-text-muted">
                      Turn on to pick times for this profile.
                    </div>
                  )}
                </div>

                {/* Launch on boot (coming soon) */}
                <div className="flex items-center justify-between p-3 bg-flow-bg-secondary border border-flow-border rounded-lg opacity-55">
                  <div>
                    <label className="text-sm font-medium text-flow-text-secondary flex items-center gap-2">
                      Launch on system boot
                      <span className="text-[11px] font-medium rounded-md border border-flow-border px-1.5 py-0.5 bg-flow-surface">
                        Coming soon
                      </span>
                    </label>
                    <p className="text-xs text-flow-text-muted">Start this profile when Windows starts</p>
                  </div>
                  <Switch checked={autoLaunchOnBoot} onCheckedChange={setAutoLaunchOnBoot} disabled />
                </div>

              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="flow-modal-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={handleRequestClose}
    >
      <div
        className="flow-modal-panel-enter relative flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-flow-border bg-flow-surface-elevated shadow-flow-shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button 
          type="button"
          onClick={handleRequestClose}
          className="absolute top-3 right-3 z-50 rounded-lg border border-flow-border bg-flow-bg-secondary/90 p-2 text-flow-text-secondary backdrop-blur transition-colors duration-150 hover:bg-flow-surface hover:text-flow-text-primary active:scale-[0.97]"
          aria-label="Close settings"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Compact Profile Header */}
        <div className="border-b border-flow-border px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-flow-accent-blue/15 border border-flow-accent-blue/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Settings className="w-5 h-5 text-flow-accent-blue" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 id="profile-settings-title" className="text-lg font-semibold text-flow-text-primary truncate">
                  {profile.name}
                </h1>
                <span className="text-xs text-flow-text-muted px-2 py-0.5 bg-flow-surface rounded border border-flow-border flex-shrink-0">
                  Settings
                </span>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-flow-text-secondary truncate flex-shrink-0">{profile.description}</p>
                
                {profile.autoLaunchOnBoot && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-green/20 text-flow-accent-green">
                    <Zap className="w-2.5 h-2.5" />
                    Boot
                  </span>
                )}
                {getScheduleSummary() && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-purple/20 text-flow-accent-purple">
                    <Clock className="w-2.5 h-2.5" />
                    {getScheduleSummary()}
                  </span>
                )}
                {profile.hotkey && (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-blue/20 text-flow-accent-blue">
                    {profile.hotkey}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Fixed Height with Flex */}
        <div className="flex flex-1 min-h-0">
          {/* Compact Sidebar - Fixed Width */}
          <div className="w-56 bg-flow-bg-secondary border-r border-flow-border flex flex-col flex-shrink-0">
            <div className="scrollbar-elegant flex-1 overflow-y-auto p-3">
              <nav ref={settingsTabNavRef} className="relative z-0 space-y-1">
                {settingsTabPill.ready ? (
                  <div
                    aria-hidden
                    className="flow-settings-tab-pill pointer-events-none absolute left-0 right-0 z-0 rounded-lg border border-flow-accent-blue/30 bg-flow-accent-blue/15"
                    style={{ top: settingsTabPill.top, height: settingsTabPill.height }}
                  />
                ) : null}
                {settingsTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const showPill = settingsTabPill.ready;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      ref={(el) => {
                        settingsTabBtnRefs.current[tab.id] = el;
                      }}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative z-10 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-200 ${
                        isActive
                          ? showPill
                            ? "border border-transparent text-flow-accent-blue"
                            : "border border-flow-accent-blue/30 bg-flow-accent-blue/15 text-flow-accent-blue"
                          : "border border-transparent text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? "text-flow-accent-blue" : "text-flow-text-muted"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-medium ${
                            isActive ? "text-flow-accent-blue" : "text-flow-text-secondary"
                          }`}
                        >
                          {tab.label}
                        </div>
                        <div className="truncate text-xs text-flow-text-muted">{tab.description}</div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content Area - Fixed Height with Scroll */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Scrollable Content */}
            <div className="scrollbar-elegant flex-1 overflow-y-auto p-4 pb-6">
              {renderTabContent()}
            </div>

            {/* Conflicts Warning - Fixed at Bottom of Content */}
            {settingsConflicts.length > 0 && (
              <div className="mx-4 mb-4 flex-shrink-0 rounded-lg border border-flow-accent-red/30 bg-flow-accent-red/10 p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-flow-accent-red flex-shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-flow-accent-red font-medium text-sm">Configuration Conflicts</h5>
                    <ul className="text-flow-accent-red text-xs mt-1 space-y-1">
                      {settingsConflicts.map((conflict, index) => (
                        <li key={index}>• {conflict}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmation
          isOpen={showDeleteConfirm}
          profileName={profile.name}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteConfirm}
        />
      </div>
    </div>
  );
}

export function ProfileSettings(props: ProfileSettingsProps) {
  if (!props.isOpen || !props.profile) {
    return null;
  }
  return <ProfileSettingsInner {...props} profile={props.profile} />;
}