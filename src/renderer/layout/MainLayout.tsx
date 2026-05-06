import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { LaunchControl } from "./components/LaunchControl";
import { TitleBarAppMenu } from "./components/TitleBarAppMenu";
import { TitleBarSidebarToggleIcon } from "./components/TitleBarSidebarToggleIcons";
import { AppChromeModals } from "./components/AppChromeModals";
import { ProfileHeaderSettingsButton } from "./components/ProfileHeaderSettingsButton";
import { ProfileHeaderMetaChips } from "./components/ProfileHeaderMetaChips";
import { NewProfileMenu } from "./components/NewProfileMenu";
import {
  FLOW_LIBRARY_TOOLBAR_ADD_PILL_CLASS,
  FLOW_LIBRARY_TOOLBAR_PILL_CLASS,
  FlowLibraryToolbar,
  type FlowLibraryViewMode,
} from "./components/FlowLibraryToolbar";
import { ProfileCard } from "./components/ProfileCard";
import { useFlowSnackbar } from "./components/FlowSnackbar";
import { FlowTooltip } from "./components/ui/tooltip";
import { MonitorLayout } from "./components/MonitorLayout";
import { LaunchCenterInspector } from "./components/LaunchCenterInspector";
import {
  FLOW_SHELL_INSPECTOR_MARGIN_CLASS,
  FLOW_SHELL_INSPECTOR_WIDTH_CLASS,
} from "./constants/flowShellInspector";
import {
  ProfileSettings,
  type ProfileSettingsInitialSection,
} from "./components/ProfileSettings";
import { AppManager } from "./components/AppManager";
import {
  ContentManager,
  type ContentFolder,
  type ContentItem,
} from "./components/ContentManager";
import {
  placeInstalledSidebarAppOnMinimized,
  placeInstalledSidebarAppOnMonitor,
  placeSidebarContentOnMinimized,
  placeSidebarContentOnMonitor,
  placeSidebarLibraryFolderOnMinimized,
  placeSidebarLibraryFolderOnMonitor,
} from "./utils/sidebarExplicitPlacement";
import {
  SelectedContentDetails,
  type LibrarySelection,
} from "./components/SelectedContentDetails";
import { SelectedAppDetails } from "./components/SelectedAppDetails";
import {
  Play,
  Settings,
  Edit,
  PenLine,
  LayoutGrid,
  Package,
  Users,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  X,
  Check,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { DragState } from "./types/dragTypes";
import { safeIconSrc } from "../utils/safeIconSrc";
import {
  getCatalogLaunchIdentityKey,
  type InstalledAppCatalogKeySource,
} from "../utils/installedAppCatalogKey";
import type { LaunchProgressSnapshot } from "./hooks/useLaunchFeedback";
import { progressFromLaunchStatus } from "./utils/launchProgressFromStatus";
import {
  readInstalledAppCategoryOverrides,
  persistInstalledAppCategoryOverrides,
  isAppLibraryCategory,
  resolveInstalledAppLibraryCategory,
  installedAppCategoryOverrideLookupKeys,
} from "../utils/installedAppLibraryCategory";
import type { FlowProfile, FlowProfileKind, ProfileSavePayload } from "../../types/flow-profile";
import {
  FLOW_PROFILE_KINDS,
  FLOW_PROFILE_KIND_LABELS,
  normalizeFlowProfile,
  normalizeProfileKind,
  toSerializableProfiles,
} from "../../types/flow-profile";
import {
  deleteLibraryFolder,
  deleteLibraryItem,
} from "./utils/contentLibraryMutations";
import { useProfilesPersistence } from "./hooks/useProfilesPersistence";
import { useLaunchFeedback } from "./hooks/useLaunchFeedback";
import { useProfileLaunch } from "./hooks/useProfileLaunch";
import { useNativeAppDragBridge } from "./hooks/useNativeAppDragBridge";
import {
  useLayoutCustomDrag,
  type LibraryFolderPlacementActions,
  type ProfileLayoutDragActions,
} from "./hooks/useLayoutCustomDrag";
import {
  restoreDocumentTextSelection,
  suspendDocumentTextSelection,
} from "./utils/documentTextSelection";
import {
  FLOW_LAYOUT_DRAG_MOVE_EVENT,
  isLayoutDragMoveEvent,
} from "./utils/layoutDragMoveEvents";
import {
  useMainLayoutProfileMutations,
  type MainLayoutSelectedApp,
} from "./hooks/useMainLayoutProfileMutations";
import { ProfileIconFrame } from "./utils/profileHeaderPresentation";
import { formatUnit } from "../utils/pluralize";
import {
  prefetchInstalledAppsCatalog,
  useInstalledApps,
  invalidateInstalledAppsCache,
} from "../hooks/useInstalledApps";
import type { MemoryCapture } from "./utils/buildNewProfile";
import {
  buildEmptyFlowProfile,
  buildMemoryFlowProfileFromCapture,
  fetchSystemMonitorsForProfile,
  uniqueProfileDisplayName,
  validateMemoryCapture,
} from "./utils/buildNewProfile";

/**
 * Application shell: profile grid, monitor layout editor, app/content managers, and the custom
 * cross-monitor drag system. Persistence is delegated to `useProfilesPersistence`; launch UX to `useLaunchFeedback`.
 */
export default function App() {
  const [selectedProfile, setSelectedProfile] =
    useState<string>("");
  const {
    profiles,
    setProfiles,
    contentLibrary,
    setContentLibrary,
    contentLibraryExclusions,
    setContentLibraryExclusions,
    profilesLoaded,
    profileStoreError,
    skipNextAutosaveRef,
  } = useProfilesPersistence({ setSelectedProfileId: setSelectedProfile });
  const [isLaunching, setIsLaunching] = useState(false);
  const { launchFeedback, setLaunchFeedback, launchFeedbackTimeoutRef } =
    useLaunchFeedback();
  const { push: pushSnackbar } = useFlowSnackbar();
  const [isEditMode, setIsEditMode] = useState(false);
  const isEditModeRef = useRef(false);
  const [profileSettingsIntent, setProfileSettingsIntent] = useState<{
    profileId: string;
    initialTab?: ProfileSettingsInitialSection;
  } | null>(null);
  const [isProfileCreationBusy, setIsProfileCreationBusy] = useState(false);
  const [headerNameEditOpen, setHeaderNameEditOpen] = useState(false);
  const [headerNameDraft, setHeaderNameDraft] = useState("");
  const headerNameInputRef = useRef<HTMLInputElement>(null);
  const skipNextHeaderRenameBlurCommitRef = useRef(false);
  const [profileKindMenuOpen, setProfileKindMenuOpen] = useState(false);
  const profileKindMenuRef = useRef<HTMLDivElement>(null);
  const [appChromeModal, setAppChromeModal] = useState<
    null | "preferences" | "about"
  >(null);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState("");
  /** Compact sidebar: filter profile list by `profileKind` from settings. */
  const [profileKindListFilter, setProfileKindListFilter] = useState<
    FlowProfileKind | "all"
  >("all");
  const [profilesSortId, setProfilesSortId] = useState<
    "name" | "apps" | "startup"
  >("name");
  const [profilesLibraryView, setProfilesLibraryView] =
    useState<FlowLibraryViewMode>("list");
  const [currentView, setCurrentView] = useState<
    "profiles" | "apps" | "content"
  >("profiles");
  const [selectedApp, setSelectedApp] =
    useState<MainLayoutSelectedApp | null>(null);
  const [installedAppCategoryOverrides, setInstalledAppCategoryOverrides] =
    useState<Record<string, string>>(readInstalledAppCategoryOverrides);

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] =
    useState(false);
  const [inspectorMode, setInspectorMode] = useState<"inspect" | "launch">(
    "inspect",
  );

  const [lastLaunchProgress, setLastLaunchProgress] =
    useState<LaunchProgressSnapshot | null>(null);
  const [lastLaunchDetailMessage, setLastLaunchDetailMessage] = useState<string | null>(
    null,
  );
  const [lastLaunchRunId, setLastLaunchRunId] = useState<string | null>(null);
  const [lastLaunchProfileId, setLastLaunchProfileId] = useState<string | null>(
    null,
  );
  const [launchCancelPending, setLaunchCancelPending] = useState(false);
  const expectedLaunchRunIdRef = useRef<string | null>(null);
  const expectedLaunchProfileIdRef = useRef<string | null>(null);

  const launchRunProgressRunId = lastLaunchProgress?.runId?.trim() ?? "";
  const launchRunIdsMismatched =
    Boolean(lastLaunchRunId)
    && Boolean(launchRunProgressRunId)
    && launchRunProgressRunId !== String(lastLaunchRunId || "").trim();
  const launchProgressRunState = String(lastLaunchProgress?.runState || "").trim().toLowerCase();
  const launchProgressNonTerminal =
    launchProgressRunState === "in-progress"
    || launchProgressRunState === "awaiting-confirmations";
  /** Keep polling after a mistaken "finished" IPC so awaiting-confirmations UI still updates. */
  const shouldPollLaunchStatus = Boolean(selectedProfile)
    && Boolean(window.electron?.getLaunchProfileStatus)
    && (
      isLaunching
      || (
        String(lastLaunchProfileId || "") === String(selectedProfile || "")
        && Boolean(lastLaunchRunId)
        && (launchRunIdsMismatched || launchProgressNonTerminal)
      )
    );
  const launchCancelEnabled = Boolean(
    !launchCancelPending
    && window.electron?.cancelProfileLaunch
    && lastLaunchProfileId
    && lastLaunchRunId
    && (
      isLaunching
      || (
        lastLaunchProgress
        && (!launchRunProgressRunId
          || launchRunProgressRunId === String(lastLaunchRunId || "").trim())
        && launchProgressNonTerminal
      )
    ),
  );
  const [librarySelection, setLibrarySelection] =
    useState<LibrarySelection | null>(null);
  const [openLibraryFolderId, setOpenLibraryFolderId] = useState<
    string | null
  >(null);

  // CUSTOM DRAG SYSTEM STATE
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragData: null,
    startPosition: { x: 0, y: 0 },
    currentPosition: { x: 0, y: 0 },
    sourceType: null,
    sourceId: null,
    dragPreview: null,
  });

  const dragStateRef = useRef<DragState>(dragState);
  dragStateRef.current = dragState;
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!dragState.isDragging) return;
    const moveOverlay = (position: { x: number; y: number }) => {
      const overlay = dragOverlayRef.current;
      if (!overlay) return;
      overlay.style.transform = `translate3d(${position.x + 12}px, ${position.y - 20}px, 0)`;
    };
    moveOverlay(dragStateRef.current.currentPosition);
    const onMove = (event: Event) => {
      if (!isLayoutDragMoveEvent(event)) return;
      moveOverlay(event.detail);
    };
    document.addEventListener(FLOW_LAYOUT_DRAG_MOVE_EVENT, onMove);
    return () => {
      document.removeEventListener(FLOW_LAYOUT_DRAG_MOVE_EVENT, onMove);
    };
  }, [dragState.isDragging]);

  useNativeAppDragBridge({
    dragStateRef,
    setDragState,
    setIsEditMode,
    isEditMode,
  });

  const currentProfile = profiles.find(
    (p) => p.id === selectedProfile,
  ) || null;

  /** Launch tab shows the profile that owns `lastLaunchProgress`, not the canvas selection. */
  const launchInspectorProfile = useMemo(() => {
    const launchedId = String(lastLaunchProfileId || "").trim();
    if (launchedId) {
      const match = profiles.find((p) => p.id === launchedId);
      if (match) return match;
    }
    return currentProfile;
  }, [profiles, lastLaunchProfileId, currentProfile]);

  const excludedContentIdSet = useMemo(() => {
    if (!selectedProfile) return new Set<string>();
    return new Set(contentLibraryExclusions[selectedProfile] || []);
  }, [
    selectedProfile,
    selectedProfile
      ? (contentLibraryExclusions[selectedProfile] || []).join("|")
      : "",
  ]);

  const resolvedLibrarySelection = useMemo((): LibrarySelection | null => {
    if (!librarySelection) return null;
    const items = contentLibrary.items as ContentItem[];
    const fds = contentLibrary.folders as ContentFolder[];
    if (librarySelection.kind === "item") {
      const it = items.find((i) => i.id === librarySelection.item.id);
      return it ? { kind: "item" as const, item: it } : null;
    }
    const fd = fds.find((f) => f.id === librarySelection.folder.id);
    return fd ? { kind: "folder" as const, folder: fd } : null;
  }, [librarySelection, contentLibrary.items, contentLibrary.folders]);

  /** Avoid empty inspector while library arrays briefly disagree with selection (persist/sync races). */
  const contentInspectorSelection = useMemo((): LibrarySelection | null => {
    if (!librarySelection) return null;
    if (resolvedLibrarySelection) return resolvedLibrarySelection;
    return librarySelection;
  }, [librarySelection, resolvedLibrarySelection]);

  const resolvedLibraryEntryExcluded = useMemo(() => {
    if (!selectedProfile || !contentInspectorSelection) return false;
    return (contentLibraryExclusions[selectedProfile] || []).includes(
      contentInspectorSelection.kind === "item"
        ? contentInspectorSelection.item.id
        : contentInspectorSelection.folder.id,
    );
  }, [selectedProfile, contentInspectorSelection, contentLibraryExclusions]);

  useEffect(() => {
    setSidebarSearchQuery("");
    setProfileKindListFilter("all");
  }, [currentView]);

  const { apps: installedCatalogApps } = useInstalledApps();
  const installedAppsCatalogRef = useRef<
    { name: string; iconPath: string | null; executablePath?: string | null }[] | null
  >(null);
  installedAppsCatalogRef.current = installedCatalogApps;
  const getInstalledAppsCatalog = useCallback(
    () => installedAppsCatalogRef.current ?? undefined,
    [],
  );

  const contentLibraryEntryCount = useMemo(() => {
    const items = contentLibrary.items as ContentItem[];
    const fds = contentLibrary.folders as ContentFolder[];
    return items.length + fds.length;
  }, [contentLibrary.items, contentLibrary.folders]);

  const profileKindCounts = useMemo(() => {
    const counts = Object.fromEntries(
      FLOW_PROFILE_KINDS.map((k) => [k, 0]),
    ) as Record<FlowProfileKind, number>;
    for (const p of profiles) {
      const k = normalizeProfileKind(p.profileKind);
      counts[k] += 1;
    }
    return counts;
  }, [profiles]);

  useEffect(() => {
    if (profileKindListFilter === "all") return;
    if (profileKindCounts[profileKindListFilter] === 0) {
      setProfileKindListFilter("all");
    }
  }, [profileKindCounts, profileKindListFilter]);

  /** Warm installed-apps catalog while the user is on Profiles/Content so the Apps tab opens quickly. */
  useEffect(() => {
    const run = () => {
      prefetchInstalledAppsCatalog();
    };
    const ric = window.requestIdleCallback;
    if (typeof ric === "function") {
      const id = ric(run, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = window.setTimeout(run, 1500);
    return () => window.clearTimeout(t);
  }, []);

  const filteredProfiles = useMemo(() => {
    let base = profiles;
    if (profileKindListFilter !== "all") {
      base = base.filter(
        (p) => normalizeProfileKind(p.profileKind) === profileKindListFilter,
      );
    }
    const q = sidebarSearchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) => p.name.toLowerCase().includes(q));
  }, [profiles, sidebarSearchQuery, profileKindListFilter]);

  const profileFilterChips = useMemo(
    () => [
      {
        id: "all",
        label: "All",
        count: profiles.length,
        disabled: false,
      },
      ...FLOW_PROFILE_KINDS.map((kind) => ({
        id: kind,
        label: FLOW_PROFILE_KIND_LABELS[kind],
        count: profileKindCounts[kind],
        disabled: profileKindCounts[kind] === 0,
      })),
    ],
    [profiles.length, profileKindCounts],
  );

  const onProfileFilterCoerced = useCallback(
    ({ previousId, nextId }: { previousId: string; nextId: string }) => {
      const label = (id: string) => {
        if (id === "all") return "All";
        if (id in FLOW_PROFILE_KIND_LABELS) {
          return FLOW_PROFILE_KIND_LABELS[id as FlowProfileKind];
        }
        return id;
      };
      pushSnackbar(
        `Showing ${label(nextId)} — ${label(previousId)} had nothing to list.`,
      );
    },
    [pushSnackbar],
  );

  const sortedFilteredProfiles = useMemo(() => {
    const list = [...filteredProfiles];
    if (profilesSortId === "name") {
      list.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
    } else if (profilesSortId === "apps") {
      list.sort((a, b) => (b.appCount || 0) - (a.appCount || 0));
    } else {
      list.sort(
        (a, b) =>
          (a.estimatedStartupTime || 0) - (b.estimatedStartupTime || 0),
      );
    }
    return list;
  }, [filteredProfiles, profilesSortId]);

  const profileLaunchSummaryParts = useMemo(() => {
    if (!currentProfile) return [] as string[];
    const parts: string[] = [];
    if (currentProfile.appCount > 0) {
      parts.push(formatUnit(currentProfile.appCount, "app"));
    }
    if (currentProfile.tabCount > 0) {
      parts.push(formatUnit(currentProfile.tabCount, "tab"));
    }
    if ((currentProfile.fileCount || 0) > 0) {
      parts.push(formatUnit(currentProfile.fileCount || 0, "file"));
    }
    return parts;
  }, [currentProfile]);

  const profileKindEyebrow = useMemo(() => {
    if (!currentProfile) return "";
    return FLOW_PROFILE_KIND_LABELS[
      normalizeProfileKind(currentProfile.profileKind)
    ];
  }, [currentProfile]);

  /** Profile strip: text lead + icon chips (tooltips) + optional tail; `srSummary` for `aria-describedby`. */
  const profileHeaderMeta = useMemo(() => {
    if (!currentProfile) return null;
    const p = currentProfile;
    const leadParts: string[] = [];
    if (profileLaunchSummaryParts.length > 0) {
      leadParts.push(...profileLaunchSummaryParts);
    }
    leadParts.push(`~${p.estimatedStartupTime ?? 0}s`);
    const lead = leadParts.join(" · ");

    const tailParts: string[] = [];
    if (p.autoLaunchOnBoot) tailParts.push("boot");
    if (p.autoSwitchTime?.trim()) tailParts.push(p.autoSwitchTime.trim());
    const tail = tailParts.join(" · ");

    const orderSentence =
      p.launchOrder === "sequential"
        ? "Apps launch one at a time."
        : "Apps launch all at once.";
    const outsideSentence =
      p.preLaunchOutsideProfileBehavior === "minimize"
        ? "Apps outside this profile are minimized before launch."
        : p.preLaunchOutsideProfileBehavior === "close"
          ? "Apps outside this profile are closed before launch."
          : "Apps outside this profile are left as-is before launch.";
    const insideSentence =
      p.preLaunchInProfileBehavior === "close_for_fresh_launch"
        ? "Profile apps close first for a clean relaunch."
        : p.preLaunchInProfileBehavior === "minimize_then_launch"
          ? "Profile apps minimize first, then launch."
          : "Profile apps reuse existing windows when possible.";

    const srParts = [
      `${lead.replace(/ · /g, ", ")}.`,
      orderSentence,
      outsideSentence,
      insideSentence,
    ];
    if (p.hotkey?.trim()) {
      srParts.push(
        `Quick-switch hotkey: ${p.hotkey.trim()} (shown on the Launch profile button).`,
      );
    } else {
      srParts.push(
        "No quick-switch hotkey. Add one in Profile settings, Automation.",
      );
    }
    if (p.autoLaunchOnBoot) {
      srParts.push("Runs at Windows sign-in.");
    }
    if (p.autoSwitchTime?.trim()) {
      srParts.push(`Scheduled switch: ${p.autoSwitchTime.trim()}.`);
    }
    const srSummary = srParts.join(" ");

    return {
      lead,
      tail,
      srSummary,
      launchOrder: p.launchOrder,
      outside: p.preLaunchOutsideProfileBehavior,
      inside: p.preLaunchInProfileBehavior,
    };
  }, [currentProfile, profileLaunchSummaryParts]);

  const profileLaunchBreakdownLines = useMemo(() => {
    if (!currentProfile) return null;
    const p = currentProfile;
    const lines: string[] = [];
    const lead = profileHeaderMeta?.lead?.trim();
    if (lead) lines.push(lead);
    lines.push(`Apps: ${p.appCount ?? 0}`);
    if ((p.tabCount ?? 0) > 0) {
      lines.push(`Tabs: ${p.tabCount}`);
    }
    lines.push(`Estimated startup: ~${p.estimatedStartupTime ?? 0}s`);
    if (p.monitors?.length) {
      lines.push(`Monitors: ${p.monitors.length}`);
    }
    return lines;
  }, [currentProfile, profileHeaderMeta?.lead]);

  const profileForSettings =
    profiles.find((p) => p.id === profileSettingsIntent?.profileId) || null;

  // Launch feedback is surfaced in the right-side Launch inspector.

  const currentProfileRef = useRef<FlowProfile | null>(null);
  currentProfileRef.current = currentProfile;
  isEditModeRef.current = isEditMode;
  const profileDragActionsRef = useRef<ProfileLayoutDragActions | null>(null);
  const libraryFolderPlacementRef = useRef<LibraryFolderPlacementActions | null>(
    null,
  );

  const { handleCustomDragStart } = useLayoutCustomDrag({
    dragStateRef,
    setDragState,
    setIsEditMode,
    isEditModeRef,
    currentProfileRef,
    profileDragActionsRef,
    libraryFolderPlacementRef,
    installedAppsCatalogRef,
  });

  const {
    updateProfile,
    updateApp,
    updateAppsWithDisplacement,
    associateFileWithApp,
    addApp,
    addAppToMinimized,
    removeApp,
    removeMinimizedApp,
    moveAppToMinimized,
    moveAppBetweenMonitors,
    moveMinimizedAppToMonitor,
    updateMonitorLayout,
    updateMonitorPositions,
    updateBrowserTabs,
    addBrowserTab,
    handleAutoSnapApps,
    bringStackMemberToFront,
    duplicateProfile,
    deleteProfile,
    renameProfile,
    setOnStartupProfile,
    exportProfile,
    importProfile,
  } = useMainLayoutProfileMutations({
    profiles,
    setProfiles,
    selectedProfile,
    setSelectedProfile,
    selectedApp,
    setSelectedApp,
    currentProfile,
    profileDragActionsRef,
    notifyUser: pushSnackbar,
  });

  libraryFolderPlacementRef.current = currentProfile
    ? {
        placeOnMonitor: (monitorId, folder, preferredPlacement) => {
          placeSidebarLibraryFolderOnMonitor({
            profile: currentProfile,
            monitorId,
            folder,
            folders: contentLibrary.folders as ContentFolder[],
            libraryItems: contentLibrary.items as ContentItem[],
            getInstalledAppsCatalog,
            addApp,
            preferredPlacement,
          });
        },
        placeOnMinimized: (folder) => {
          placeSidebarLibraryFolderOnMinimized({
            profile: currentProfile,
            folder,
            folders: contentLibrary.folders as ContentFolder[],
            libraryItems: contentLibrary.items as ContentItem[],
            getInstalledAppsCatalog,
            addAppToMinimized,
          });
        },
      }
    : null;

  const scheduleLaunchFeedbackClear = useCallback(() => {
    if (launchFeedbackTimeoutRef.current) {
      window.clearTimeout(launchFeedbackTimeoutRef.current);
    }
    launchFeedbackTimeoutRef.current = window.setTimeout(() => {
      setLaunchFeedback({
        status: "idle",
        message: "",
        progress: null,
      });
      launchFeedbackTimeoutRef.current = null;
    }, 7000);
  }, [launchFeedbackTimeoutRef, setLaunchFeedback]);

  const handleNewEmptyProfile = useCallback(async () => {
    if (isEditMode || isProfileCreationBusy) return;
    setIsProfileCreationBusy(true);
    try {
      const detectedMonitors = await fetchSystemMonitorsForProfile();
      const newId = `profile-${Date.now()}`;
      let createdName = "";
      setProfiles((prev) => {
        const name = uniqueProfileDisplayName("New profile", prev);
        createdName = name;
        const raw = buildEmptyFlowProfile({
          id: newId,
          name,
          detectedMonitors,
          existingProfiles: prev,
        });
        return [...prev, normalizeFlowProfile(raw)];
      });
      setSelectedProfile(newId);
      if (createdName) {
        pushSnackbar(`Created profile "${createdName}".`);
      }
    } finally {
      setIsProfileCreationBusy(false);
    }
  }, [
    isEditMode,
    isProfileCreationBusy,
    pushSnackbar,
    setProfiles,
    setSelectedProfile,
  ]);

  const handleNewFromCapturedLayout = useCallback(async () => {
    if (isEditMode || isProfileCreationBusy) return;
    if (!window.electron?.captureRunningAppLayout) {
      setLaunchFeedback({
        status: "error",
        message: "Layout capture is not available in this build.",
        progress: null,
      });
      scheduleLaunchFeedbackClear();
      return;
    }
    setIsProfileCreationBusy(true);
    try {
      let capture: MemoryCapture;
      try {
        capture = (await window.electron.captureRunningAppLayout()) as MemoryCapture;
      } catch {
        setLaunchFeedback({
          status: "error",
          message: "Failed to capture running app layout.",
          progress: null,
        });
        scheduleLaunchFeedbackClear();
        return;
      }
      const validationError = validateMemoryCapture(capture);
      if (validationError) {
        setLaunchFeedback({
          status: "error",
          message: validationError,
          progress: null,
        });
        scheduleLaunchFeedbackClear();
        return;
      }
      const newId = `memory-${Date.now()}`;
      let createdName = "";
      setProfiles((prev) => {
        const name = uniqueProfileDisplayName("New profile", prev);
        createdName = name;
        const raw = buildMemoryFlowProfileFromCapture(capture, name, newId, prev);
        return [...prev, normalizeFlowProfile(raw)];
      });
      setSelectedProfile(newId);
      if (createdName) {
        pushSnackbar(`Created profile "${createdName}" from current layout.`);
      }
    } finally {
      setIsProfileCreationBusy(false);
    }
  }, [
    isEditMode,
    isProfileCreationBusy,
    pushSnackbar,
    scheduleLaunchFeedbackClear,
    setLaunchFeedback,
    setProfiles,
    setSelectedProfile,
  ]);

  useEffect(() => {
    setHeaderNameEditOpen(false);
    setProfileKindMenuOpen(false);
  }, [selectedProfile]);

  useEffect(() => {
    if (!profileKindMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = profileKindMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setProfileKindMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileKindMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileKindMenuOpen]);

  useEffect(() => {
    if (isEditMode) setProfileKindMenuOpen(false);
  }, [isEditMode]);

  useEffect(() => {
    if (!headerNameEditOpen) return;
    const el = headerNameInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [headerNameEditOpen]);

  const commitHeaderProfileRename = useCallback(() => {
    if (skipNextHeaderRenameBlurCommitRef.current) {
      skipNextHeaderRenameBlurCommitRef.current = false;
      return;
    }
    if (!currentProfile) return;
    const next = headerNameDraft.trim();
    setHeaderNameEditOpen(false);
    if (!next || next === currentProfile.name) return;
    renameProfile(currentProfile.id, next, currentProfile.description);
  }, [currentProfile, headerNameDraft, renameProfile]);

  const buildSavePayload = useCallback((): ProfileSavePayload => ({
    profiles: toSerializableProfiles(profiles),
    contentLibrary,
    contentLibraryExclusions,
  }), [profiles, contentLibrary, contentLibraryExclusions]);

  const handlePersistContentLibrary = useCallback(
    (next: { items: ContentItem[]; folders: ContentFolder[] }) => {
      setContentLibrary({ items: next.items, folders: next.folders });
    },
    [setContentLibrary],
  );

  const handleDeleteLibraryEntry = useCallback(
    (scope: "item" | "folder", id: string) => {
      if (
        librarySelection
        && ((librarySelection.kind === "item" && librarySelection.item.id === id)
          || (librarySelection.kind === "folder" && librarySelection.folder.id === id))
      ) {
        setRightSidebarOpen(false);
        setLibrarySelection(null);
      }
      setContentLibrary((prev) => {
        const items = prev.items as ContentItem[];
        const folders = prev.folders as ContentFolder[];
        const out =
          scope === "folder"
            ? deleteLibraryFolder(folders, items, id)
            : deleteLibraryItem(items, folders, id);
        return { ...prev, items: out.items, folders: out.folders };
      });
      setContentLibraryExclusions((ex) => {
        const next: Record<string, string[]> = {};
        for (const [pid, arr] of Object.entries(ex)) {
          next[pid] = (arr || []).filter((x) => x !== id);
        }
        return next;
      });
    },
    [librarySelection],
  );

  const handleToggleContentExclusionForEntry = useCallback(
    (entryId: string) => {
      if (!selectedProfile) return;
      setContentLibraryExclusions((prev) => {
        const cur = [...(prev[selectedProfile] || [])];
        const ix = cur.indexOf(entryId);
        if (ix >= 0) cur.splice(ix, 1);
        else cur.push(entryId);
        return { ...prev, [selectedProfile]: cur };
      });
    },
    [selectedProfile],
  );

  const { handleLaunch, abortPendingLaunch } = useProfileLaunch({
    profiles,
    buildSavePayload,
    selectedProfileId: selectedProfile,
    setIsLaunching,
    setLaunchFeedback,
    launchFeedbackTimeoutRef,
    onLaunchPreparing: (profileId) => {
      expectedLaunchProfileIdRef.current = profileId;
      expectedLaunchRunIdRef.current = null;
      setLastLaunchProfileId(profileId);
      setLastLaunchRunId(null);
      setLastLaunchProgress(null);
      setLastLaunchDetailMessage(null);
    },
    onLaunchStarted: (profileId, runId) => {
      expectedLaunchProfileIdRef.current = profileId;
      expectedLaunchRunIdRef.current = runId;
      setLastLaunchProfileId(profileId);
      setLastLaunchRunId(runId);
      setLastLaunchProgress(null);
      setLastLaunchDetailMessage(null);
    },
    onLaunchCompletedDuration: (profileId, durationSeconds) => {
      updateProfile(profileId, {
        estimatedStartupTime: durationSeconds,
      });
    },
  });

  // SELECTED APP HANDLERS
  const handleClearAppSelection = useCallback(() => {
    setSelectedApp(null);
    setLibrarySelection(null);
    setOpenLibraryFolderId(null);
    setRightSidebarOpen(false);
  }, []);

  const handlePlaceContentOnMonitor = useCallback(
    (monitorId: string, item: ContentItem) => {
      if (!currentProfile) return;
      placeSidebarContentOnMonitor({
        profile: currentProfile,
        monitorId,
        item,
        getInstalledAppsCatalog,
        addApp,
        addBrowserTab,
      });
    },
    [currentProfile, getInstalledAppsCatalog, addApp, addBrowserTab],
  );

  const handlePlaceContentOnMinimized = useCallback(
    (item: ContentItem) => {
      if (!currentProfile) return;
      placeSidebarContentOnMinimized({
        profile: currentProfile,
        item,
        getInstalledAppsCatalog,
        addAppToMinimized,
        addBrowserTab,
      });
    },
    [currentProfile, getInstalledAppsCatalog, addAppToMinimized, addBrowserTab],
  );

  const handleConsumedOpenLibraryFolder = useCallback(() => {
    setOpenLibraryFolderId(null);
  }, []);

  const handleInspectLibrarySelection = useCallback(
    (payload: LibrarySelection) => {
      setLibrarySelection(payload);
      setSelectedApp(null);
      setRightSidebarOpen(true);
    },
    [],
  );

  const handleLibraryChangeDefaultApp = useCallback(
    (id: string, nextApp: string, scope: "item" | "folder") => {
      setContentLibrary((prev) => {
        if (scope === "item") {
          return {
            ...prev,
            items: (prev.items as ContentItem[]).map((it) =>
              it.id === id ? { ...it, defaultApp: nextApp } : it,
            ),
          };
        }
        return {
          ...prev,
          folders: (prev.folders as ContentFolder[]).map((f) =>
            f.id === id ? { ...f, defaultApp: nextApp } : f,
          ),
        };
      });
    },
    [setContentLibrary],
  );

  const clearInspectorSelection = useCallback(() => {
    setRightSidebarOpen(false);
    setSelectedApp(null);
    setLibrarySelection(null);
    setOpenLibraryFolderId(null);
  }, []);

  const handleLibraryPlaceOnMonitor = useCallback(
    (monitorId: string, selectionOverride?: LibrarySelection | null) => {
      const selection = selectionOverride || contentInspectorSelection;
      if (!currentProfile || !selection) return;
      if (selection.kind === "item") {
        placeSidebarContentOnMonitor({
          profile: currentProfile,
          monitorId,
          item: selection.item,
          getInstalledAppsCatalog,
          addApp,
          addBrowserTab,
        });
      } else {
        placeSidebarLibraryFolderOnMonitor({
          profile: currentProfile,
          monitorId,
          folder: selection.folder,
          folders: contentLibrary.folders as ContentFolder[],
          libraryItems: contentLibrary.items as ContentItem[],
          getInstalledAppsCatalog,
          addApp,
        });
      }
      clearInspectorSelection();
    },
    [
      currentProfile,
      contentInspectorSelection,
      contentLibrary.folders,
      contentLibrary.items,
      addApp,
      addBrowserTab,
      getInstalledAppsCatalog,
      clearInspectorSelection,
    ],
  );

  const handleLibraryPlaceOnMinimized = useCallback((selectionOverride?: LibrarySelection | null) => {
    const selection = selectionOverride || contentInspectorSelection;
    if (!currentProfile || !selection) return;
    if (selection.kind === "item") {
      placeSidebarContentOnMinimized({
        profile: currentProfile,
        item: selection.item,
        getInstalledAppsCatalog,
        addAppToMinimized,
        addBrowserTab,
      });
    } else {
      placeSidebarLibraryFolderOnMinimized({
        profile: currentProfile,
        folder: selection.folder,
        folders: contentLibrary.folders as ContentFolder[],
        libraryItems: contentLibrary.items as ContentItem[],
        getInstalledAppsCatalog,
        addAppToMinimized,
      });
    }
    clearInspectorSelection();
  }, [
    currentProfile,
    contentInspectorSelection,
    contentLibrary.folders,
    contentLibrary.items,
    addAppToMinimized,
    addBrowserTab,
    getInstalledAppsCatalog,
    clearInspectorSelection,
  ]);

  const handleAppSelect = useCallback(
    (
      appData: any,
      source: "monitor" | "minimized",
      monitorId?: string,
      appIndex?: number,
    ) => {
      if (!currentProfile) return;

      setLibrarySelection(null);
      setOpenLibraryFolderId(null);

      // Determine if this is a browser app
      const isBrowser =
        appData.name?.toLowerCase().includes("chrome") ||
        appData.name?.toLowerCase().includes("browser") ||
        appData.name?.toLowerCase().includes("firefox") ||
        appData.name?.toLowerCase().includes("safari") ||
        appData.name?.toLowerCase().includes("edge");

      // Get fresh app data with current browser tabs
      const freshAppData = { ...appData };

      if (!isBrowser) {
        freshAppData.category = resolveInstalledAppLibraryCategory(
          {
            name: freshAppData.name ?? "",
            executablePath: freshAppData.executablePath ?? null,
            shortcutPath: freshAppData.shortcutPath ?? null,
            launchUrl: freshAppData.launchUrl ?? null,
          },
          installedAppCategoryOverrides,
        );
      }

      if (isBrowser) {
        if (source === "monitor" && monitorId) {
          // For monitor apps, get browser tabs using INSTANCE ID for precise matching
          const relatedTabs = (
            currentProfile.browserTabs || []
          ).filter(
            (tab) =>
              tab.monitorId === monitorId &&
              tab.browser === appData.name &&
              tab.appInstanceId === appData.instanceId, // NEW: Match specific app instance
          );

          freshAppData.browserTabs = relatedTabs.map((tab) => ({
            name: tab.name,
            url: tab.url,
            isActive: tab.isActive || false,
          }));
        } else if (source === "minimized") {
          // For minimized apps, tabs are stored directly in the app data
          freshAppData.browserTabs = appData.browserTabs || [];
        }
      }

      setSelectedApp({
        type: isBrowser ? "browser" : "app",
        source,
        monitorId,
        appIndex,
        data: freshAppData,
      });

      // Auto-open right sidebar when app is selected
      setRightSidebarOpen(true);
    },
    [currentProfile, installedAppCategoryOverrides],
  );

  /** Installed-app row in the Apps sidebar: inspector only, not a profile layout slot. */
  const handleSidebarInstalledAppSelect = useCallback(
    (app: {
      name: string;
      iconPath: string | null;
      executablePath?: string | null;
      shortcutPath?: string | null;
      launchUrl?: string | null;
      color?: string;
      category?: string;
      catalogLaunchExeOverrideActive?: boolean;
    }) => {
      if (!currentProfile) return;
      setLibrarySelection(null);
      setOpenLibraryFolderId(null);

      const nameLc = app.name?.toLowerCase() || "";
      const isBrowser =
        nameLc.includes("chrome")
        || nameLc.includes("browser")
        || nameLc.includes("firefox")
        || nameLc.includes("safari")
        || nameLc.includes("edge");

      setSelectedApp({
        type: isBrowser ? "browser" : "app",
        source: "sidebar",
        data: {
          name: app.name,
          iconPath: app.iconPath,
          executablePath: app.executablePath ?? null,
          shortcutPath: app.shortcutPath ?? null,
          launchUrl: app.launchUrl ?? null,
          color: app.color,
          category: app.category,
          browserTabs: [],
          catalogLaunchExeOverrideActive: Boolean(app.catalogLaunchExeOverrideActive),
        },
      });
      setRightSidebarOpen(true);
    },
    [currentProfile],
  );

  const handleAfterCatalogLaunchExeChanged = useCallback(async () => {
    invalidateInstalledAppsCache();
    if (!window.electron?.getInstalledApps) return;
    const apps = await window.electron.getInstalledApps({ force: true });
    setSelectedApp((prev) => {
      if (!prev || prev.source !== "sidebar") return prev;
      const key = getCatalogLaunchIdentityKey({
        name: String(prev.data?.name ?? ""),
        shortcutPath: prev.data?.shortcutPath ?? null,
        launchUrl: prev.data?.launchUrl ?? null,
      });
      const row = apps.find((a) => getCatalogLaunchIdentityKey(a) === key);
      if (!row) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          name: row.name,
          iconPath: row.iconPath,
          executablePath: row.executablePath ?? null,
          shortcutPath: row.shortcutPath ?? null,
          launchUrl: row.launchUrl ?? null,
          catalogLaunchExeOverrideActive: Boolean(
            (row as { catalogLaunchExeOverrideActive?: boolean }).catalogLaunchExeOverrideActive,
          ),
        },
      };
    });
  }, []);

  const handleSetInstalledAppLibraryCategory = useCallback(
    (source: InstalledAppCatalogKeySource, category: string) => {
      if (!isAppLibraryCategory(category)) return;
      const variants = installedAppCategoryOverrideLookupKeys(source);
      const variantSet = new Set(variants);

      setInstalledAppCategoryOverrides((prev) => {
        const next = { ...prev };
        for (const k of variants) {
          next[k] = category;
        }
        persistInstalledAppCategoryOverrides(next);
        return next;
      });

      setSelectedApp((prev) => {
        if (!prev || prev.type !== "app") return prev;
        const prevVariants = installedAppCategoryOverrideLookupKeys({
          name: prev.data?.name ?? "",
          executablePath: prev.data?.executablePath ?? null,
          shortcutPath: prev.data?.shortcutPath ?? null,
          launchUrl: prev.data?.launchUrl ?? null,
        });
        const overlaps = prevVariants.some((k) => variantSet.has(k));
        if (!overlaps) return prev;
        return {
          ...prev,
          data: { ...prev.data, category },
        };
      });
    },
    [],
  );

  /** Apps sidebar inspector: add installed app to the active profile (same placement as list +). */
  const handleSidebarInstalledAppPlaceOnMonitor = useCallback(
    (monitorId: string) => {
      if (!currentProfile || !selectedApp || selectedApp.source !== "sidebar") return;
      const d = selectedApp.data;
      placeInstalledSidebarAppOnMonitor({
        profile: currentProfile,
        monitorId,
        app: {
          name: d.name,
          color: d.color,
          iconPath: d.iconPath ?? null,
          executablePath: d.executablePath ?? null,
        },
        addApp,
      });
      clearInspectorSelection();
    },
    [currentProfile, selectedApp, addApp, clearInspectorSelection],
  );

  const handleSidebarInstalledAppPlaceOnMinimized = useCallback(() => {
    if (!currentProfile || !selectedApp || selectedApp.source !== "sidebar") return;
    const d = selectedApp.data;
    placeInstalledSidebarAppOnMinimized({
      profile: currentProfile,
      app: {
        name: d.name,
        color: d.color,
        iconPath: d.iconPath ?? null,
        executablePath: d.executablePath ?? null,
      },
      addAppToMinimized,
    });
    clearInspectorSelection();
  }, [currentProfile, selectedApp, addAppToMinimized, clearInspectorSelection]);

  // After moves/reorders, list indices change; keep selection index aligned with instanceId.
  useEffect(() => {
    if (!selectedApp || !currentProfile) return;
    if (selectedApp.source === "sidebar") return;

    if (
      selectedApp.source === "monitor" &&
      selectedApp.monitorId &&
      (selectedApp.type === "app" || selectedApp.type === "browser")
    ) {
      const instanceId = selectedApp.data?.instanceId;
      if (instanceId == null || instanceId === "") return;

      const monitor = currentProfile.monitors.find(
        (m) => m.id === selectedApp.monitorId,
      );
      if (!monitor) return;

      const idx = monitor.apps.findIndex(
        (a: { instanceId?: string }) => a.instanceId === instanceId,
      );
      if (idx >= 0 && idx !== selectedApp.appIndex) {
        setSelectedApp((prev) => (prev ? { ...prev, appIndex: idx } : null));
      }
      return;
    }

    if (
      selectedApp.source === "minimized" &&
      (selectedApp.type === "app" || selectedApp.type === "browser")
    ) {
      const instanceId = selectedApp.data?.instanceId;
      if (instanceId == null || instanceId === "") return;

      const list = currentProfile.minimizedApps || [];
      const idx = list.findIndex(
        (a: { instanceId?: string }) => a.instanceId === instanceId,
      );
      if (idx >= 0 && idx !== selectedApp.appIndex) {
        setSelectedApp((prev) => (prev ? { ...prev, appIndex: idx } : null));
      }
    }
  }, [currentProfile, selectedApp]);

  const handleSelectedAppUpdate = useCallback(
    (updates: any) => {
      if (!selectedApp || !currentProfile) return;
      if (selectedApp.source === "sidebar") return;

      if (
        selectedApp.source === "monitor" &&
        selectedApp.monitorId &&
        selectedApp.appIndex !== undefined
      ) {
        updateApp(
          currentProfile.id,
          selectedApp.monitorId,
          selectedApp.appIndex,
          updates,
        );

        // Refresh browser tabs if this is a browser app
        const isBrowser =
          selectedApp.data.name
            ?.toLowerCase()
            .includes("chrome") ||
          selectedApp.data.name
            ?.toLowerCase()
            .includes("browser") ||
          selectedApp.data.name
            ?.toLowerCase()
            .includes("firefox") ||
          selectedApp.data.name
            ?.toLowerCase()
            .includes("safari") ||
          selectedApp.data.name?.toLowerCase().includes("edge");

        const updatedData = { ...selectedApp.data, ...updates };

        if (isBrowser) {
          // NEW: Use instance ID for precise tab matching
          const relatedTabs = (
            currentProfile.browserTabs || []
          ).filter(
            (tab) =>
              tab.monitorId === selectedApp.monitorId &&
              tab.browser === selectedApp.data.name &&
              tab.appInstanceId === selectedApp.data.instanceId,
          );

          updatedData.browserTabs = relatedTabs.map((tab) => ({
            name: tab.name,
            url: tab.url,
            isActive: tab.isActive || false,
          }));
        }

        setSelectedApp((prev) =>
          prev ? { ...prev, data: updatedData } : null,
        );
      } else if (
        selectedApp.source === "minimized" &&
        selectedApp.appIndex !== undefined
      ) {
        // Update minimized app
        setProfiles((prev) =>
          prev.map((profile) => {
            if (profile.id !== currentProfile.id)
              return profile;

            return {
              ...profile,
              minimizedApps: (profile.minimizedApps || []).map(
                (app, index) =>
                  index === selectedApp.appIndex
                    ? { ...app, ...updates }
                    : app,
              ),
            };
          }),
        );

        // Update selected app data with fresh browser tabs
        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  ...updates,
                  browserTabs: prev.data.browserTabs || [],
                },
              }
            : null,
        );
      }
    },
    [selectedApp, currentProfile],
  );

  const handleSelectedAppAssociatedFiles = useCallback(
    (files: any[]) => {
      if (!selectedApp || !currentProfile) return;
      if (selectedApp.source === "sidebar") return;

      if (
        selectedApp.source === "monitor" &&
        selectedApp.monitorId &&
        selectedApp.appIndex !== undefined
      ) {
        updateApp(
          currentProfile.id,
          selectedApp.monitorId,
          selectedApp.appIndex,
          { associatedFiles: files },
        );
        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                data: { ...prev.data, associatedFiles: files },
              }
            : null,
        );
      } else if (
        selectedApp.source === "minimized" &&
        selectedApp.appIndex !== undefined
      ) {
        setProfiles((prev) =>
          prev.map((profile) => {
            if (profile.id !== currentProfile.id)
              return profile;

            return {
              ...profile,
              minimizedApps: (profile.minimizedApps || []).map(
                (app, index) =>
                  index === selectedApp.appIndex
                    ? { ...app, associatedFiles: files }
                    : app,
              ),
            };
          }),
        );
        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                data: { ...prev.data, associatedFiles: files },
              }
            : null,
        );
      }
    },
    [selectedApp, currentProfile],
  );

  const handleSelectedAppDelete = useCallback(() => {
    if (!selectedApp || !currentProfile) return;
    if (selectedApp.source === "sidebar") return;

    if (
      selectedApp.source === "monitor" &&
      selectedApp.monitorId &&
      selectedApp.appIndex !== undefined
    ) {
      removeApp(
        currentProfile.id,
        selectedApp.monitorId,
        selectedApp.appIndex,
      );
    } else if (
      selectedApp.source === "minimized" &&
      selectedApp.appIndex !== undefined
    ) {
      removeMinimizedApp(
        currentProfile.id,
        selectedApp.appIndex,
      );
    }

    // Clear selection after deletion
    setSelectedApp(null);
    setRightSidebarOpen(false);
  }, [selectedApp, currentProfile]);

  const handleSelectedAppMoveToMonitor = useCallback(
    (targetMonitorId: string) => {
      if (!selectedApp || !currentProfile) return;
      if (selectedApp.source === "sidebar") return;

      if (
        selectedApp.source === "minimized" &&
        selectedApp.appIndex !== undefined
      ) {
        moveMinimizedAppToMonitor(
          currentProfile.id,
          selectedApp.appIndex,
          targetMonitorId,
        );
        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                source: "monitor",
                monitorId: targetMonitorId,
                appIndex: undefined,
              }
            : null,
        );
        return;
      }

      if (
        selectedApp.source === "monitor" &&
        selectedApp.monitorId &&
        selectedApp.appIndex !== undefined
      ) {
        if (selectedApp.monitorId === targetMonitorId) return;
        moveAppBetweenMonitors(
          currentProfile.id,
          selectedApp.monitorId,
          selectedApp.appIndex,
          targetMonitorId,
        );
        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                monitorId: targetMonitorId,
                appIndex: undefined,
              }
            : null,
        );
      }
    },
    [
      selectedApp,
      currentProfile,
      moveMinimizedAppToMonitor,
      moveAppBetweenMonitors,
    ],
  );

  const handleSelectedAppMoveToMinimized = useCallback(() => {
    if (!selectedApp || !currentProfile) return;
    if (selectedApp.source === "sidebar") return;

    if (
      selectedApp.source === "monitor" &&
      selectedApp.monitorId &&
      selectedApp.appIndex !== undefined
    ) {
      moveAppToMinimized(
        currentProfile.id,
        selectedApp.monitorId,
        selectedApp.appIndex,
      );
      setSelectedApp((prev) =>
        prev
          ? {
              ...prev,
              source: "minimized",
              monitorId: undefined,
              appIndex: undefined,
            }
          : null,
      );
    }
  }, [selectedApp, currentProfile]);

  /** Collapse inspector only; keep selection so reopen shows the same app/library entry. */
  const handleCloseSidebar = useCallback(() => {
    setRightSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (!isLaunching && !launchProgressNonTerminal) return;

    // Ensure launch status is visible during a run (including awaiting confirmations).
    if (!rightSidebarOpen) setRightSidebarOpen(true);
    if (inspectorMode !== "launch") {
      setInspectorMode("launch");
    }
  }, [isLaunching, launchProgressNonTerminal, rightSidebarOpen, inspectorMode]);

  useEffect(() => {
    if (!shouldPollLaunchStatus) return;

    let cancelled = false;
    let interval: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const profileIdForPoll = (() => {
          if (isLaunching) {
            const fromRef = String(expectedLaunchProfileIdRef.current || "").trim();
            if (fromRef) return fromRef;
            const fromLast = String(lastLaunchProfileId || "").trim();
            if (fromLast) return fromLast;
          }
          return String(selectedProfile || "").trim();
        })();
        if (!profileIdForPoll) return;

        const res = await window.electron.getLaunchProfileStatus(profileIdForPoll);
        if (cancelled) return;
        const status = res?.status;
        if (!res?.ok || !status) return;

        const runId = String(status.runId || "").trim();
        const expectedProfileId = String(expectedLaunchProfileIdRef.current || "").trim();
        const expectedRunId = String(expectedLaunchRunIdRef.current || "").trim();
        if (
          expectedProfileId
          && expectedProfileId === profileIdForPoll
          && expectedRunId
          && runId
          && runId !== expectedRunId
        ) {
          // Ignore stale statuses from the previous run during a new launch.
          return;
        }
        if (runId) {
          expectedLaunchProfileIdRef.current = profileIdForPoll;
          expectedLaunchRunIdRef.current = runId;
          setLastLaunchRunId(runId);
          setLastLaunchProfileId(profileIdForPoll);
        }

        const progressSnap = progressFromLaunchStatus(status);
        setLastLaunchProgress(progressSnap);

        const st = String(status.state || "").toLowerCase();
        if (st === "awaiting-confirmations") {
          const unresolved = Number(status.unresolvedPendingConfirmationCount || 0);
          if (unresolved > 0) {
            const pendingNames = Array.isArray(status.pendingConfirmations)
              ? status.pendingConfirmations
                  .filter(
                    (item) =>
                      String(item?.status || "waiting").toLowerCase() === "waiting",
                  )
                  .map((item) => String(item?.name || "").trim())
                  .filter(Boolean)
                  .slice(0, 3)
              : [];
            const namesList =
              pendingNames.length > 0
                ? ` (${pendingNames.join(", ")}${
                    unresolved > pendingNames.length ? ", ..." : ""
                  })`
                : "";
            setLastLaunchDetailMessage(
              `Waiting for ${unresolved} confirmation${unresolved === 1 ? "" : "s"}${namesList}.`,
            );
          } else {
            setLastLaunchDetailMessage(null);
          }
        } else {
          setLastLaunchDetailMessage(null);
        }
      } catch {
        // ignore
      }
    };

    void tick();
    interval = window.setInterval(() => void tick(), 1100);
    return () => {
      cancelled = true;
      if (interval != null) window.clearInterval(interval);
    };
  }, [shouldPollLaunchStatus, selectedProfile, isLaunching, lastLaunchProfileId]);

  useEffect(() => {
    const sub = window.electron?.subscribeProfileLaunchStarted?.((payload) => {
      const pid = String(payload?.profileId || "").trim();
      const rid = String(payload?.runId || "").trim();
      if (!pid || !rid) return;
      expectedLaunchProfileIdRef.current = pid;
      expectedLaunchRunIdRef.current = rid;
      setLastLaunchProfileId(pid);
      setLastLaunchRunId(rid);
    });
    return () => {
      sub?.();
    };
  }, []);

  useEffect(() => {
    if (isLaunching) return;
    if (!lastLaunchProfileId) return;
    if (!lastLaunchRunId) return;
    if (!window.electron?.getLaunchProfileStatus) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await window.electron.getLaunchProfileStatus(lastLaunchProfileId);
        if (cancelled) return;
        const status = res?.status;
        if (!res?.ok || !status) return;
        if (String(status.runId || "").trim() !== String(lastLaunchRunId || "").trim()) return;
        setLastLaunchProgress(progressFromLaunchStatus(status));
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLaunching, lastLaunchProfileId, lastLaunchRunId]);

  const handleCancelLatestLaunch = useCallback(async () => {
    if (
      lastLaunchProfileId
      && lastLaunchRunId
      && window.electron?.cancelProfileLaunch
    ) {
      setLaunchCancelPending(true);
      try {
        const result = await window.electron.cancelProfileLaunch(
          lastLaunchProfileId,
          lastLaunchRunId,
        );
        if (!result?.ok) {
          setLaunchFeedback({
            status: "error",
            message: result?.reason === "not-active"
              ? "Launch is no longer active."
              : "Could not cancel launch. Try again.",
            progress: lastLaunchProgress ?? null,
          });
          setLaunchCancelPending(false);
        }
      } catch {
        setLaunchFeedback({
          status: "error",
          message: "Could not cancel launch. Try again.",
          progress: lastLaunchProgress ?? null,
        });
        setLaunchCancelPending(false);
      }
      return;
    }
    abortPendingLaunch();
  }, [
    abortPendingLaunch,
    lastLaunchProfileId,
    lastLaunchProgress,
    lastLaunchRunId,
    setLaunchFeedback,
  ]);

  /** Keep "Cancelling…" until the run is actually idle (IPC returns before main finishes winding down). */
  useEffect(() => {
    if (!launchCancelPending) return;
    const progressRunId = lastLaunchProgress?.runId?.trim() ?? "";
    const progressMatchesRun =
      !progressRunId
      || progressRunId === String(lastLaunchRunId || "").trim();
    const progressState = String(lastLaunchProgress?.runState || "").trim().toLowerCase();
    const progressNonTerminal =
      progressState === "in-progress"
      || progressState === "awaiting-confirmations";
    const stillBusy =
      isLaunching
      || Boolean(
        lastLaunchProgress
        && progressMatchesRun
        && progressNonTerminal,
      );
    if (!stillBusy) {
      setLaunchCancelPending(false);
    }
  }, [
    isLaunching,
    launchCancelPending,
    lastLaunchProgress,
    lastLaunchRunId,
  ]);

  // FIXED: Simplified profile switching
  const handleProfileSwitch = useCallback(
    (profileId: string) => {
      if (isEditMode) {
        return;
      }

      if (profileId === selectedProfile) {
        return;
      }

      // Update selected profile immediately
      setSelectedProfile(profileId);

      // Clear any selected app when switching profiles
      setSelectedApp(null);
      setLibrarySelection(null);
      setOpenLibraryFolderId(null);
      setRightSidebarOpen(false);
    },
    [isEditMode, selectedProfile],
  );

  const handleDragStart = () => {
    if (!isEditMode) {
      setIsEditMode(true);
    }
  };

  /** Library sidebar tab strip: 0 Profiles, 1 Apps, 2 Content — drives horizontal slide (transform only). */
  const librarySidebarSlideIndex =
    currentView === "profiles" ? 0 : currentView === "apps" ? 1 : 2;

  return (
    <div
      className="flow-shell-canvas flex h-screen min-h-0 flex-col overflow-hidden"
      aria-label="FlowSwitch"
    >
      {profileStoreError ? (
        <div
          className="shrink-0 px-4 py-2 bg-amber-950/80 border-b border-amber-700/60 text-amber-100 text-xs"
          role="alert"
        >
          <strong className="font-semibold">Profiles did not load.</strong>
          {" "}
          {profileStoreError.message}
          {" "}
          Autosave is off until you restart—avoids overwriting your files.
        </div>
      ) : null}
      <header
        className="app-drag-region flow-shell-titlebar flex h-9 shrink-0 select-none items-start pl-1.5 pt-1.5 pr-2 md:pl-2 md:pt-2 md:pr-3"
        aria-label="Menu and window controls"
      >
        <TitleBarAppMenu
          onAppPreferences={() => setAppChromeModal("preferences")}
          onAbout={() => setAppChromeModal("about")}
        />
        {/*
          Sidebar toggles sit after the app menu, not at the trailing edge: on Windows,
          titleBarOverlay paints system caption buttons over the top-right of this strip,
          which hid the controls when they were flex-end aligned.
        */}
        <div className="app-no-drag ml-1 flex shrink-0 items-center gap-0.5 border-l border-white/[0.08] pl-1.5 md:ml-2 md:gap-1 md:pl-2">
          <FlowTooltip
            label={leftSidebarOpen ? "Hide library sidebar" : "Show library sidebar"}
            side="bottom"
          >
            <button
              type="button"
              onClick={() => setLeftSidebarOpen((o) => !o)}
              aria-pressed={leftSidebarOpen}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-flow-text-secondary transition-[color,background-color,transform] duration-200 ease-out hover:bg-white/[0.06] hover:text-flow-text-primary active:scale-95 motion-reduce:active:scale-100 md:h-7 md:w-7 ${
                leftSidebarOpen ? "text-flow-text-primary" : ""
              }`}
              aria-label={
                leftSidebarOpen ? "Hide library sidebar" : "Show library sidebar"
              }
            >
              <TitleBarSidebarToggleIcon
                side="left"
                open={leftSidebarOpen}
                className="h-4 w-4 shrink-0"
              />
            </button>
          </FlowTooltip>
          <FlowTooltip
            label={rightSidebarOpen ? "Hide details sidebar" : "Show details sidebar"}
            side="bottom"
          >
            <button
              type="button"
              onClick={() => setRightSidebarOpen((o) => !o)}
              aria-pressed={rightSidebarOpen}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-flow-text-secondary transition-[color,background-color,transform] duration-200 ease-out hover:bg-white/[0.06] hover:text-flow-text-primary active:scale-95 motion-reduce:active:scale-100 md:h-7 md:w-7 ${
                rightSidebarOpen ? "text-flow-text-primary" : ""
              }`}
              aria-label={
                rightSidebarOpen ? "Hide details sidebar" : "Show details sidebar"
              }
            >
              <TitleBarSidebarToggleIcon
                side="right"
                open={rightSidebarOpen}
                className="h-4 w-4 shrink-0"
              />
            </button>
          </FlowTooltip>
        </div>
        <div className="min-h-0 min-w-0 flex-1" aria-hidden />
      </header>
      <input
        type="file"
        accept=".json"
        onChange={importProfile}
        className="hidden"
        id="flowswitch-import-profile"
        aria-hidden
      />
      {profilesLoaded ? (
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left sidebar: no width transition — animating width reflows the monitor preview and ResizeObserver would fire every frame (jank). */}
        <div
          className={`shrink-0 overflow-hidden transition-none ${
            leftSidebarOpen
              ? "w-[clamp(16rem,24vw,24rem)] min-w-[16rem]"
              : "w-0 min-w-0"
          }`}
        >
        <nav
          className={`flow-shell-nav flex h-full max-h-full min-h-0 min-w-[16rem] w-[clamp(16rem,24vw,24rem)] flex-col overflow-hidden transition-opacity duration-200 ${
            isEditMode ? "opacity-[0.78] saturate-[0.92]" : ""
          }`}
          aria-label="Library"
        >
          <div className="flex shrink-0 flex-col gap-2 border-b border-white/[0.06] px-3 py-2.5 md:px-4">
            <div className="flow-library-tablist" role="tablist" aria-label="Sidebar view">
              <div className="flow-library-tablist-rail gap-1">
                <div
                  className="pointer-events-none absolute bottom-0 left-0 z-10 h-0.5 w-1/3 rounded-full bg-flow-accent-blue flow-tab-slide-track"
                  aria-hidden
                  style={{
                    transform: `translate3d(calc(${librarySidebarSlideIndex} * 100%), 0, 0)`,
                  }}
                />
                <FlowTooltip
                  label={`Profiles · ${profiles.length}`}
                  side="bottom"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={currentView === "profiles"}
                    onClick={() => setCurrentView("profiles")}
                    className={`flow-library-tab flow-library-tab--icon-only ${
                      currentView === "profiles"
                        ? "flow-library-tab-active"
                        : "flow-library-tab-idle"
                    }`}
                    aria-label={`Profiles, ${profiles.length} total`}
                  >
                    <Users className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="sr-only">Profiles</span>
                  </button>
                </FlowTooltip>
                <FlowTooltip
                  label={`Apps · ${installedCatalogApps.length}`}
                  side="bottom"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={currentView === "apps"}
                    onClick={() => setCurrentView("apps")}
                    className={`flow-library-tab flow-library-tab--icon-only ${
                      currentView === "apps"
                        ? "flow-library-tab-active"
                        : "flow-library-tab-idle"
                    }`}
                    aria-label={`Installed apps, ${installedCatalogApps.length} in catalog`}
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="sr-only">Apps</span>
                  </button>
                </FlowTooltip>
                <FlowTooltip
                  label={`Content · ${contentLibraryEntryCount}`}
                  side="bottom"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={currentView === "content"}
                    onClick={() => setCurrentView("content")}
                    className={`flow-library-tab flow-library-tab--icon-only ${
                      currentView === "content"
                        ? "flow-library-tab-active"
                        : "flow-library-tab-idle"
                    }`}
                    aria-label={`Content library, ${contentLibraryEntryCount} entries`}
                  >
                    <Package className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span className="sr-only">Content</span>
                  </button>
                </FlowTooltip>
              </div>
            </div>
          </div>

          {/* List region: three panels on one row; slide via translate3d (no width animation). */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-flow-border/25 bg-flow-bg-primary/[0.06] pt-1">
            <div
              className="flow-tab-slide-track flex h-full min-h-0 w-[300%] flex-shrink-0"
              style={{
                transform: `translate3d(calc(-100% / 3 * ${librarySidebarSlideIndex}), 0, 0)`,
              }}
            >
              {/* Inert removes inactive columns from tab order (pointer-events/aria-hidden alone do not). */}
              <div
                className={`flex min-h-0 w-1/3 min-w-0 flex-shrink-0 flex-col ${
                  currentView === "profiles" ? "" : "pointer-events-none select-none"
                }`}
                aria-hidden={currentView !== "profiles"}
                {...(currentView !== "profiles" ? { inert: "" as const } : {})}
              >
                <FlowLibraryToolbar
                  toolbarEnd={
                    <NewProfileMenu
                      disabled={isEditMode}
                      busy={isProfileCreationBusy}
                      onCreateEmpty={() => void handleNewEmptyProfile()}
                      onCaptureCurrentLayout={() => void handleNewFromCapturedLayout()}
                      triggerClassName={FLOW_LIBRARY_TOOLBAR_ADD_PILL_CLASS}
                    />
                  }
                  filterChips={profileFilterChips}
                  selectedFilterId={profileKindListFilter}
                  onSelectFilter={(id) =>
                    setProfileKindListFilter(
                      id === "all" ? "all" : (id as FlowProfileKind),
                    )
                  }
                  searchValue={sidebarSearchQuery}
                  onSearchChange={setSidebarSearchQuery}
                  searchPlaceholder="Search profiles…"
                  searchAriaLabel="Search profiles"
                  sortOptions={[
                    { id: "name", label: "Name" },
                    { id: "apps", label: "Most apps" },
                    { id: "startup", label: "Startup time" },
                  ]}
                  selectedSortId={profilesSortId}
                  onSelectSort={(id) =>
                    setProfilesSortId(id as "name" | "apps" | "startup")
                  }
                  viewMode={profilesLibraryView}
                  onViewModeChange={setProfilesLibraryView}
                  showViewModes
                  onFilterCoerced={onProfileFilterCoerced}
                />

                {isEditMode ? (
                  <div className="shrink-0 border-b border-flow-border/50 px-3 pb-2 pt-1">
                    <div className="rounded-lg border border-flow-border/60 bg-flow-surface/80 p-2.5">
                      <div className="flex items-center gap-2 text-xs text-flow-text-secondary">
                        <Edit className="h-3 w-3 shrink-0 text-flow-accent-blue" />
                        <span>
                          Profile switching disabled while editing
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="scrollbar-elegant min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain py-3 pl-3 pr-0">
                  <div
                    className={`pr-2.5 ${
                      profilesLibraryView === "grid"
                        ? "grid grid-cols-2 gap-2"
                        : profilesLibraryView === "compact"
                          ? "flex min-h-0 flex-col gap-0.5"
                          : "flex min-h-0 flex-col gap-1"
                    }`}
                  >
                    {sortedFilteredProfiles.length === 0 ? (
                      <p className="py-6 text-center text-xs text-flow-text-muted">
                        {profiles.length === 0
                          ? "No profiles yet. Create one with the + button above."
                          : sidebarSearchQuery.trim()
                            ? "No profiles match this search."
                            : profileKindListFilter !== "all"
                              ? "No profiles match this filter."
                              : "Nothing to show here."}
                      </p>
                    ) : (
                      sortedFilteredProfiles.map((profile) => (
                        <ProfileCard
                          key={profile.id}
                          profile={{
                            ...profile,
                            isActive:
                              profile.id === selectedProfile,
                          }}
                          onClick={() =>
                            handleProfileSwitch(profile.id)
                          }
                          onSettings={
                            isEditMode
                              ? undefined
                              : (opts) =>
                                  setProfileSettingsIntent({
                                    profileId: profile.id,
                                    initialTab: opts?.initialTab,
                                  })
                          }
                          disabled={isEditMode}
                          density={
                            profilesLibraryView === "compact"
                              ? "compact"
                              : profilesLibraryView === "grid"
                                ? "grid"
                                : "default"
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`flex min-h-0 w-1/3 min-w-0 flex-shrink-0 flex-col ${
                  currentView === "apps" ? "" : "pointer-events-none select-none"
                }`}
                aria-hidden={currentView !== "apps"}
                {...(currentView !== "apps" ? { inert: "" as const } : {})}
              >
                <AppManager
                  profiles={profiles}
                  onUpdateProfile={updateProfile}
                  onAddApp={(monitorId, newApp) =>
                    currentProfile &&
                    addApp(currentProfile.id, monitorId, newApp)
                  }
                  onAddAppToMinimized={(newApp) =>
                    currentProfile &&
                    addAppToMinimized(currentProfile.id, newApp)
                  }
                  onDragStart={handleDragStart}
                  onCustomDragStart={handleCustomDragStart}
                  currentProfile={currentProfile}
                  compact={true}
                  sidebarSearchQuery={sidebarSearchQuery}
                  onSidebarSearchQueryChange={setSidebarSearchQuery}
                  onInspectInstalledApp={handleSidebarInstalledAppSelect}
                  installedAppCategoryOverrides={
                    installedAppCategoryOverrides
                  }
                />
              </div>

              <div
                className={`flex min-h-0 w-1/3 min-w-0 flex-shrink-0 flex-col ${
                  currentView === "content" ? "" : "pointer-events-none select-none"
                }`}
                aria-hidden={currentView !== "content"}
                {...(currentView !== "content" ? { inert: "" as const } : {})}
              >
                <ContentManager
                  profiles={profiles}
                  currentProfile={currentProfile}
                  onUpdateProfile={updateProfile}
                  onDragStart={handleDragStart}
                  onCustomDragStart={handleCustomDragStart}
                  onPlaceContentOnMonitor={handlePlaceContentOnMonitor}
                  onPlaceContentOnMinimized={handlePlaceContentOnMinimized}
                  onPlaceLibraryFolderOnMonitor={(monitorId, folder) => {
                    if (!currentProfile) return;
                    placeSidebarLibraryFolderOnMonitor({
                      profile: currentProfile,
                      monitorId,
                      folder,
                      folders: contentLibrary.folders as ContentFolder[],
                      libraryItems: contentLibrary.items as ContentItem[],
                      getInstalledAppsCatalog,
                      addApp,
                    });
                  }}
                  onPlaceLibraryFolderOnMinimized={(folder) => {
                    if (!currentProfile) return;
                    placeSidebarLibraryFolderOnMinimized({
                      profile: currentProfile,
                      folder,
                      folders: contentLibrary.folders as ContentFolder[],
                      libraryItems: contentLibrary.items as ContentItem[],
                      getInstalledAppsCatalog,
                      addAppToMinimized,
                    });
                  }}
                  onInspectLibrarySelection={handleInspectLibrarySelection}
                  openLibraryFolderId={openLibraryFolderId}
                  onConsumedOpenLibraryFolder={handleConsumedOpenLibraryFolder}
                  externalContentItems={contentLibrary.items as ContentItem[]}
                  externalContentFolders={contentLibrary.folders as ContentFolder[]}
                  excludedContentIds={Array.from(excludedContentIdSet)}
                  installedAppsCatalog={installedCatalogApps}
                  onPersistContentLibrary={handlePersistContentLibrary}
                  onDeleteLibraryEntry={handleDeleteLibraryEntry}
                  compact={true}
                  sidebarSearchQuery={sidebarSearchQuery}
                  onSidebarSearchQueryChange={setSidebarSearchQuery}
                />
              </div>
            </div>
          </div>
        </nav>
        </div>

        {/* Main Content Area with Header and Right Sidebar */}
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col bg-flow-bg-primary transition-none ${
            rightSidebarOpen ? FLOW_SHELL_INSPECTOR_MARGIN_CLASS : "mr-0"
          }`}
          role="region"
          aria-label="Profile workspace"
        >
          {/* Header - Spans across Main Content and Right Sidebar area */}
          {currentProfile ? (
            <header className="relative z-10 flex shrink-0 items-center border-b border-white/[0.06] bg-flow-bg-secondary/90 px-4 py-3 backdrop-blur-sm md:px-6 md:py-4 xl:px-8">
              <div className="flex w-full min-w-0 flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
                <div
                  className={`flex min-w-0 flex-1 items-center gap-4 md:gap-5 ${
                    isEditMode ? "opacity-50" : ""
                  }`}
                  aria-label="Active profile"
                >
                  <FlowTooltip
                    label={isEditMode ? undefined : "Change profile icon"}
                  >
                    <button
                      type="button"
                      disabled={isEditMode}
                      onClick={() => {
                        if (isEditMode) return;
                        if (headerNameEditOpen) {
                          commitHeaderProfileRename();
                        }
                        setProfileSettingsIntent({
                          profileId: currentProfile.id,
                          initialTab: "profile",
                        });
                      }}
                      aria-label="Change profile icon"
                      className={`shrink-0 rounded-2xl p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/40 ${
                        isEditMode
                          ? "cursor-default"
                          : "cursor-pointer hover:bg-white/[0.06]"
                      }`}
                    >
                      <ProfileIconFrame
                        icon={currentProfile.icon}
                        variant="hero"
                      />
                    </button>
                  </FlowTooltip>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div ref={profileKindMenuRef} className="relative self-start">
                      <FlowTooltip
                        label={isEditMode ? undefined : "Change profile type"}
                      >
                        <button
                          type="button"
                          disabled={isEditMode}
                          aria-haspopup="listbox"
                          aria-expanded={profileKindMenuOpen}
                          aria-label={`Profile type: ${profileKindEyebrow}`}
                          onClick={() => {
                            if (isEditMode) return;
                            if (headerNameEditOpen) {
                              commitHeaderProfileRename();
                            }
                            setProfileKindMenuOpen((open) => !open);
                          }}
                          className={`inline-flex max-w-full items-center gap-0.5 rounded-md px-1 py-0.5 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-flow-text-muted/70 outline-none transition-colors sm:text-[11px] ${
                            isEditMode
                              ? "cursor-default"
                              : "hover:bg-white/[0.06] hover:text-flow-text-muted focus-visible:ring-2 focus-visible:ring-flow-accent-blue/40"
                          }`}
                        >
                          <span className="min-w-0 truncate">
                            {profileKindEyebrow}
                          </span>
                          <ChevronDown
                            className={`h-3 w-3 shrink-0 opacity-70 transition-transform duration-200 ${
                              profileKindMenuOpen ? "rotate-180" : ""
                            }`}
                            aria-hidden
                          />
                        </button>
                      </FlowTooltip>
                      {profileKindMenuOpen && currentProfile ? (
                        <ul
                          role="listbox"
                          aria-label="Profile type"
                          className="absolute left-0 top-full z-[200] mt-1 min-w-[11rem] max-w-[min(100vw-2rem,16rem)] isolate rounded-lg border border-flow-border bg-flow-bg-primary py-1 shadow-2xl shadow-black/50 ring-1 ring-white/[0.06]"
                        >
                          {FLOW_PROFILE_KINDS.map((kind) => {
                            const active =
                              normalizeProfileKind(currentProfile.profileKind) ===
                              kind;
                            return (
                              <li key={kind} role="presentation">
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={active}
                                  className={`flex w-full items-center px-3 py-2 text-left text-xs font-medium transition-colors ${
                                    active
                                      ? "bg-flow-accent-blue/15 text-flow-text-primary"
                                      : "text-flow-text-secondary hover:bg-white/[0.06] hover:text-flow-text-primary"
                                  }`}
                                  onClick={() => {
                                    updateProfile(currentProfile.id, {
                                      profileKind: kind,
                                    });
                                    setProfileKindMenuOpen(false);
                                  }}
                                >
                                  {FLOW_PROFILE_KIND_LABELS[kind]}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      {headerNameEditOpen && !isEditMode ? (
                        <input
                          ref={headerNameInputRef}
                          value={headerNameDraft}
                          onChange={(e) => setHeaderNameDraft(e.target.value)}
                          onBlur={() => commitHeaderProfileRename()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              headerNameInputRef.current?.blur();
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              skipNextHeaderRenameBlurCommitRef.current = true;
                              setHeaderNameDraft(currentProfile.name);
                              setHeaderNameEditOpen(false);
                            }
                          }}
                          maxLength={120}
                          aria-label="Profile name"
                          aria-describedby="flow-profile-header-meta"
                          className="min-w-0 max-w-full rounded-md border border-flow-border/60 bg-flow-bg-primary/80 px-2 py-1 text-2xl font-extrabold tracking-tight text-flow-text-primary shadow-sm outline-none ring-flow-accent-blue/40 focus:ring-2 sm:text-3xl md:text-4xl md:py-1.5"
                        />
                      ) : (
                        <FlowTooltip
                          label={isEditMode ? undefined : "Click to rename"}
                        >
                          <button
                            type="button"
                            disabled={isEditMode}
                            onClick={() => {
                              if (isEditMode) return;
                              skipNextHeaderRenameBlurCommitRef.current = false;
                              setHeaderNameDraft(currentProfile.name);
                              setHeaderNameEditOpen(true);
                            }}
                            aria-describedby="flow-profile-header-meta"
                            className={`min-w-0 max-w-full text-left text-2xl font-extrabold tracking-tight text-flow-text-primary sm:text-3xl md:text-4xl ${
                              isEditMode
                                ? "cursor-default"
                                : "cursor-text rounded-md hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/40"
                            }`}
                          >
                            <span className="block break-words">
                              {currentProfile.name}
                            </span>
                          </button>
                        </FlowTooltip>
                      )}
                      {profileHeaderMeta ? (
                        <>
                          <span
                            id="flow-profile-header-meta"
                            className="sr-only"
                          >
                            {profileHeaderMeta.srSummary}
                          </span>
                          <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden text-xs leading-none text-flow-text-muted/70 sm:text-[13px]">
                            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                              <span className="min-w-0 truncate whitespace-nowrap">
                                {profileHeaderMeta.lead}
                              </span>
                              <span
                                className="h-3.5 w-px shrink-0 self-center bg-white/20"
                                aria-hidden
                              />
                              <ProfileHeaderMetaChips
                                launchOrder={profileHeaderMeta.launchOrder}
                                outside={profileHeaderMeta.outside}
                                inside={profileHeaderMeta.inside}
                              />
                            </div>
                            {profileHeaderMeta.tail ? (
                              <>
                                <span
                                  className="shrink-0 text-flow-text-muted/35"
                                  aria-hidden
                                >
                                  ·
                                </span>
                                <span className="max-w-[min(40%,12rem)] shrink-0 truncate whitespace-nowrap">
                                  {profileHeaderMeta.tail}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:ml-auto sm:items-end sm:gap-2.5">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <ProfileHeaderSettingsButton
                      disabled={isEditMode}
                      onOpenProfileSettings={() =>
                        setProfileSettingsIntent({
                          profileId: currentProfile.id,
                        })
                      }
                    />
                    <LaunchControl
                      isEditMode={isEditMode}
                      isLaunching={isLaunching}
                      onLaunch={handleLaunch}
                      hotkey={currentProfile.hotkey?.trim() || null}
                      primaryLabel={`Launch ${currentProfile.name}`}
                      breakdownLines={profileLaunchBreakdownLines}
                      waitingOnConfirmation={
                        Boolean(isLaunching)
                        && (lastLaunchProgress?.unresolvedPendingConfirmationCount ?? 0) > 0
                      }
                    />
                  </div>
                </div>
              </div>
            </header>
          ) : (
            <header className="px-4 md:px-6 xl:px-8 py-2.5 md:py-3 border-b border-flow-border/50 bg-flow-bg-secondary/80 backdrop-blur-sm relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flow-header-well flex flex-col gap-1 p-3 max-w-md">
                    <h2 className="text-sm font-semibold text-flow-text-primary tracking-tight">
                      No profile selected
                    </h2>
                    <p
                      id="flow-no-profile-hint"
                      className="text-xs text-flow-text-muted leading-relaxed"
                    >
                      Choose or create a profile in the library sidebar. Then you can edit layout,
                      open preferences, or launch.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <FlowTooltip label="Select a profile in the library to edit its monitor layout">
                    <span className="inline-flex">
                      <button
                        type="button"
                        disabled
                        aria-describedby="flow-no-profile-hint"
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-flow-surface border border-flow-border text-flow-text-muted opacity-60 cursor-not-allowed"
                      >
                        <PenLine className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        Edit layout
                      </button>
                    </span>
                  </FlowTooltip>
                  <FlowTooltip label="Select a profile in the library for preferences and import/export">
                    <span className="inline-flex">
                      <button
                        type="button"
                        disabled
                        aria-describedby="flow-no-profile-hint"
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-flow-surface border border-flow-border text-flow-text-muted opacity-60 cursor-not-allowed"
                      >
                        <Settings className="w-4 h-4" />
                        Preferences
                      </button>
                    </span>
                  </FlowTooltip>
                  <FlowTooltip label="Select a profile in the library to launch it">
                    <span className="inline-flex">
                      <button
                        type="button"
                        disabled
                        aria-label="Launch profile (select a profile first)"
                        aria-describedby="flow-no-profile-hint"
                        className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-flow-accent-blue text-flow-text-primary opacity-50 cursor-not-allowed"
                      >
                        <Play className="w-4 h-4" />
                        Launch profile
                      </button>
                    </span>
                  </FlowTooltip>
                </div>
              </div>
            </header>
          )}

          {/* Main Content Area */}
          {currentProfile && (
            <main
              className="relative min-h-0 min-w-0 flex-1 overflow-hidden flow-shell-canvas"
              aria-label="Monitor layout"
            >
              <div className="h-full min-w-0 px-4 pb-4 pt-0 md:px-6 md:pb-6 xl:px-8">
                <MonitorLayout
                  monitors={currentProfile.monitors}
                  minimizedApps={currentProfile.minimizedApps}
                  minimizedFiles={[]} // REMOVED: No more standalone files
                  browserTabs={currentProfile.browserTabs}
                  isEditMode={isEditMode}
                  onSetLayoutEditMode={setIsEditMode}
                  layoutToolbarConnected
                  dragState={dragState}
                  selectedApp={selectedApp}
                  onUpdateApp={(monitorId, appIndex, updates) =>
                    updateApp(
                      currentProfile.id,
                      monitorId,
                      appIndex,
                      updates,
                    )
                  }
                  onAssociateFileWithApp={(
                    monitorId,
                    appIndex,
                    fileData,
                  ) =>
                    associateFileWithApp(
                      currentProfile.id,
                      monitorId,
                      appIndex,
                      fileData,
                    )
                  }
                  onUpdateFile={() => {}} // REMOVED: No standalone file updates
                  onUpdateAppsWithDisplacement={(
                    monitorId,
                    draggedAppIndex,
                    draggedAppUpdates,
                    conflictingAppIndex,
                    conflictingAppUpdates,
                  ) =>
                    updateAppsWithDisplacement(
                      currentProfile.id,
                      monitorId,
                      draggedAppIndex,
                      draggedAppUpdates,
                      conflictingAppIndex,
                      conflictingAppUpdates,
                    )
                  }
                  onAddApp={(monitorId, newApp) =>
                    addApp(currentProfile.id, monitorId, newApp)
                  }
                  onAddFile={() => {}} // REMOVED: No standalone file additions
                  onRemoveApp={(monitorId, appIndex) =>
                    removeApp(
                      currentProfile.id,
                      monitorId,
                      appIndex,
                    )
                  }
                  onRemoveFile={() => {}} // REMOVED: No standalone file removal
                  onUpdateMonitorLayout={(monitorId, layout) =>
                    updateMonitorLayout(
                      currentProfile.id,
                      monitorId,
                      layout,
                    )
                  }
                  onUpdateMonitorPositions={(positions) =>
                    updateMonitorPositions(currentProfile.id, positions)
                  }
                  onAddAppToMinimized={(newApp) =>
                    addAppToMinimized(currentProfile.id, newApp)
                  }
                  onAddFileToMinimized={() => {}} // REMOVED: No standalone file minimizing
                  onUpdateBrowserTabs={(tabs) =>
                    updateBrowserTabs(currentProfile.id, tabs)
                  }
                  onAddBrowserTab={(tab) =>
                    addBrowserTab(currentProfile.id, tab)
                  }
                  onMoveAppToMinimized={(monitorId, appIndex) =>
                    moveAppToMinimized(
                      currentProfile.id,
                      monitorId,
                      appIndex,
                    )
                  }
                  onMoveFileToMinimized={() => {}} // REMOVED: No standalone file minimizing
                  onRemoveMinimizedApp={(appIndex) =>
                    removeMinimizedApp(
                      currentProfile.id,
                      appIndex,
                    )
                  }
                  onRemoveMinimizedFile={() => {}} // REMOVED: No standalone minimized files
                  onMoveAppBetweenMonitors={(
                    sourceMonitorId,
                    appIndex,
                    targetMonitorId,
                    newPosition,
                    newSize,
                  ) => {
                    moveAppBetweenMonitors(
                      currentProfile.id,
                      sourceMonitorId,
                      appIndex,
                      targetMonitorId,
                      newPosition,
                      newSize,
                    );
                  }}
                  onMoveFileBetweenMonitors={() => {}} // REMOVED: No standalone file cross-monitor moves
                  onMoveMinimizedAppToMonitor={(
                    appIndex,
                    targetMonitorId,
                    newPosition,
                    newSize,
                  ) => {
                    moveMinimizedAppToMonitor(
                      currentProfile.id,
                      appIndex,
                      targetMonitorId,
                      newPosition,
                      newSize,
                    );
                  }}
                  onMoveMinimizedFileToMonitor={() => {}} // REMOVED: No standalone minimized file to monitor moves
                  onCustomDragStart={handleCustomDragStart}
                  onAppSelect={handleAppSelect}
                  onClearAppSelection={handleClearAppSelection}
                  onFileSelect={() => {}} // REMOVED: No standalone file selection
                  onAutoSnapApps={handleAutoSnapApps}
                  onBringStackMemberToFront={
                    currentProfile
                      ? (monitorId, appIndex) =>
                          bringStackMemberToFront(
                            currentProfile.id,
                            monitorId,
                            appIndex,
                          )
                      : undefined
                  }
                  large
                />
              </div>
            </main>
          )}
        </div>

        {/* Right Sidebar - Fixed position, animated visibility */}
        {rightSidebarOpen && (
          <aside
            className={`fixed right-0 top-9 ${FLOW_SHELL_INSPECTOR_WIDTH_CLASS} h-[calc(100vh-2.25rem)] flow-shell-inspector flow-inspector-panel-enter flex min-w-0 max-w-full flex-col overflow-x-hidden z-30 transition-opacity duration-200 ${
              isEditMode ? "opacity-[0.82] saturate-[0.94]" : ""
            }`}
            aria-label="Inspector"
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between gap-2 border-b border-flow-border px-3 py-2">
              <div
                role="tablist"
                aria-label="Sidebar: selection details or launch progress"
                className="inline-flex max-w-full shrink-0 flex-nowrap items-stretch rounded-full border border-white/[0.12] bg-black/40 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorMode === "inspect"}
                  onClick={() => setInspectorMode("inspect")}
                  aria-label="Inspect: app or content details"
                  className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-tight whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/50 focus-visible:ring-offset-2 focus-visible:ring-offset-flow-bg-secondary ${
                    inspectorMode === "inspect"
                      ? "bg-flow-accent-blue/[0.14] text-flow-accent-blue shadow-[0_0_0_1px_rgba(56,189,248,0.75),0_0_14px_rgba(56,189,248,0.18)]"
                      : "text-flow-text-muted hover:bg-white/[0.06] hover:text-flow-text-secondary"
                  }`}
                >
                  Inspect
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inspectorMode === "launch"}
                  onClick={() => setInspectorMode("launch")}
                  aria-label="Launch: progress and log for the current run"
                  className={`relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-tight whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/50 focus-visible:ring-offset-2 focus-visible:ring-offset-flow-bg-secondary ${
                    inspectorMode === "launch"
                      ? "bg-flow-accent-blue/[0.14] text-flow-accent-blue shadow-[0_0_0_1px_rgba(56,189,248,0.75),0_0_14px_rgba(56,189,248,0.18)]"
                      : "text-flow-text-muted hover:bg-white/[0.06] hover:text-flow-text-secondary"
                  }`}
                >
                  Launch
                  {isLaunching || launchFeedback.status !== "idle" || lastLaunchProgress ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-flow-accent-blue"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </div>

              <button
                type="button"
                onClick={handleCloseSidebar}
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-flow-text-secondary transition-[color,background-color,transform] duration-200 ease-out hover:bg-flow-surface hover:text-flow-text-primary active:scale-95 motion-reduce:active:scale-100"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sidebar Content - Now contains app header */}
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              {inspectorMode === "launch" ? (
                launchInspectorProfile ? (
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pl-3 pr-0 pb-3 pt-3 sm:pl-4">
                    <LaunchCenterInspector
                      profile={launchInspectorProfile}
                      progress={lastLaunchProgress}
                      summaryMessage={
                        (((lastLaunchProgress?.unresolvedPendingConfirmationCount ?? 0) > 0
                          ? ""
                          : lastLaunchDetailMessage)
                          || (launchFeedback.status !== "idle" && launchFeedback.status !== "in-progress"
                            ? launchFeedback.message
                            : "")
                          || "")
                          .trim() || undefined
                      }
                      summaryTone={
                        lastLaunchDetailMessage?.trim()
                          ? "warning"
                          : launchFeedback.status === "success"
                            ? "success"
                            : launchFeedback.status === "warning"
                              ? "warning"
                              : launchFeedback.status === "error"
                                ? "error"
                                : undefined
                      }
                      isLaunching={isLaunching}
                      onCancel={handleCancelLatestLaunch}
                      cancelDisabled={!launchCancelEnabled}
                      cancelPending={launchCancelPending}
                    />
                  </div>
                ) : (
                  <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 text-sm text-flow-text-muted">
                    Select a profile to view launch status.
                  </div>
                )
              ) : librarySelection && contentInspectorSelection && currentProfile ? (
                <SelectedContentDetails
                  selection={contentInspectorSelection}
                  libraryItems={contentLibrary.items as ContentItem[]}
                  libraryFolders={contentLibrary.folders as ContentFolder[]}
                  opensWithApps={installedCatalogApps.map((a) => String(a?.name || "").trim()).filter(Boolean)}
                  onChangeDefaultApp={handleLibraryChangeDefaultApp}
                  excludedFromActiveProfile={resolvedLibraryEntryExcluded}
                  onToggleExcludeFromActiveProfile={() => {
                    if (!contentInspectorSelection) return;
                    handleToggleContentExclusionForEntry(
                      contentInspectorSelection.kind === "item"
                        ? contentInspectorSelection.item.id
                        : contentInspectorSelection.folder.id,
                    );
                  }}
                  onDeleteFromLibrary={() => {
                    if (!contentInspectorSelection) return;
                    handleDeleteLibraryEntry(
                      contentInspectorSelection.kind === "item" ? "item" : "folder",
                      contentInspectorSelection.kind === "item"
                        ? contentInspectorSelection.item.id
                        : contentInspectorSelection.folder.id,
                    );
                  }}
                  onPlaceOnMonitor={handleLibraryPlaceOnMonitor}
                  onPlaceOnMinimized={handleLibraryPlaceOnMinimized}
                  monitors={currentProfile.monitors || []}
                />
              ) : selectedApp ? (
                <SelectedAppDetails
                  selectedApp={selectedApp}
                  onClose={handleCloseSidebar}
                  onUpdateApp={handleSelectedAppUpdate}
                  onUpdateAssociatedFiles={handleSelectedAppAssociatedFiles}
                  onDeleteApp={handleSelectedAppDelete}
                  onMoveToMonitor={handleSelectedAppMoveToMonitor}
                  onMoveToMinimized={handleSelectedAppMoveToMinimized}
                  monitors={currentProfile?.monitors || []}
                  browserTabs={currentProfile?.browserTabs || []}
                  onUpdateBrowserTabs={(tabs) =>
                    updateBrowserTabs(currentProfile?.id || "", tabs)
                  }
                  onAddBrowserTab={(tab) => addBrowserTab(currentProfile?.id || "", tab)}
                  onAddSidebarAppToMonitor={
                    selectedApp.source === "sidebar"
                      ? handleSidebarInstalledAppPlaceOnMonitor
                      : undefined
                  }
                  onAddSidebarAppToMinimized={
                    selectedApp.source === "sidebar"
                      ? handleSidebarInstalledAppPlaceOnMinimized
                      : undefined
                  }
                  onSetInstalledAppLibraryCategory={
                    handleSetInstalledAppLibraryCategory
                  }
                  onCatalogLaunchExeChanged={handleAfterCatalogLaunchExeChanged}
                />
              ) : null}
            </div>
          </aside>
        )}

        {/* Drag Overlay — pointer-events-none so hit-testing uses the cursor, not the preview */}
        {dragState.isDragging
          && dragState.dragData && (
          <div
            ref={dragOverlayRef}
            data-app-drag-overlay="true"
            className="fixed left-0 top-0 pointer-events-none z-[9999] select-none"
            style={{
              transform: `translate3d(${dragState.currentPosition.x + 12}px, ${dragState.currentPosition.y - 20}px, 0)`,
              willChange: "transform",
            }}
          >
            <div className="relative">
              {/* Item icon */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center border border-white/30 shadow-lg backdrop-blur-sm"
                style={{
                  backgroundColor: `${dragState.dragData.color || dragState.dragData.fileColor || "#4A5568"}80`,
                }}
              >
                {(() => {
                  const dragIconSrc = safeIconSrc(dragState.dragData.iconPath);
                  if (dragIconSrc) {
                    return (
                      <img
                        src={dragIconSrc}
                        alt={dragState.dragData.name || "App"}
                        className="w-4.5 h-4.5 object-contain rounded drop-shadow-sm"
                        draggable={false}
                      />
                    );
                  }
                  if (dragState.dragData.icon) {
                    return <dragState.dragData.icon className="w-4.5 h-4.5 text-white drop-shadow-sm" />;
                  }
                  return null;
                })()}
                {dragState.dragData.fileIcon ? (
                  <span className="absolute -bottom-1 -left-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/70 bg-flow-bg-secondary">
                    <dragState.dragData.fileIcon className="h-2.5 w-2.5 text-flow-text-primary" />
                  </span>
                ) : null}
              </div>

              {/* Direction indicator */}
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-flow-accent-blue border-2 border-white rounded-full flex items-center justify-center shadow-sm">
                <ArrowRight className="w-2 h-2 text-white" />
              </div>

              {/* Subtle glow */}
              <div className="absolute inset-0 bg-flow-accent-blue/20 rounded-lg blur-lg scale-125 -z-10" />
            </div>
          </div>
        )}

        {/* Modals */}
        {profileSettingsIntent && profileForSettings ? (
          <ProfileSettings
            key={profileSettingsIntent.profileId}
            profile={profileForSettings}
            isOpen
            initialSection={profileSettingsIntent.initialTab}
            onClose={() => setProfileSettingsIntent(null)}
            onSave={(settings) => {
              updateProfile(profileSettingsIntent.profileId, settings);
            }}
            onDuplicate={() => {
              duplicateProfile(profileSettingsIntent.profileId);
              setProfileSettingsIntent(null);
            }}
            onExport={() => exportProfile(profileSettingsIntent.profileId)}
            onRename={(newName, newDescription) => {
              renameProfile(
                profileSettingsIntent.profileId,
                newName,
                newDescription,
              );
            }}
            onDelete={() => {
              deleteProfile(profileSettingsIntent.profileId);
              setProfileSettingsIntent(null);
            }}
            allProfiles={profiles}
            importProfileInputId="flowswitch-import-profile"
          />
        ) : null}

      </div>
      ) : (
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-flow-bg-primary px-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2
            className="h-9 w-9 shrink-0 animate-spin text-flow-accent-blue"
            strokeWidth={1.75}
            aria-hidden
          />
          <p className="text-sm text-flow-text-secondary">Loading profiles…</p>
        </div>
      )}

      <AppChromeModals
        preferencesOpen={appChromeModal === "preferences"}
        aboutOpen={appChromeModal === "about"}
        onClosePreferences={() => setAppChromeModal(null)}
        onCloseAbout={() => setAppChromeModal(null)}
      />
    </div>
  );
}