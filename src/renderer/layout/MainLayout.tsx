import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { ProfileCard } from "./components/ProfileCard";
import { MonitorLayout } from "./components/MonitorLayout";
import { ProfileSettings } from "./components/ProfileSettings";
import { CreateProfileModal } from "./components/CreateProfileModal";
import { AppManager } from "./components/AppManager";
import { ContentManager } from "./components/ContentManager";
import { SelectedAppDetails } from "./components/SelectedAppDetails";
import {
  Play,
  Plus,
  Settings,
  Edit,
  Save,
  Clock,
  Zap,
  Upload,
  Download,
  LayoutGrid,
  Link,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  X,
  ChevronDown,
  Check,
  AlertTriangle,
} from "lucide-react";
import { DragState } from "./types/dragTypes";
import { safeIconSrc } from "../utils/safeIconSrc";
import type { FlowProfile } from "../../types/flow-profile";
import { useProfilesPersistence } from "./hooks/useProfilesPersistence";
import { useLaunchFeedback } from "./hooks/useLaunchFeedback";
import { useProfileLaunch } from "./hooks/useProfileLaunch";
import { useNativeAppDragBridge } from "./hooks/useNativeAppDragBridge";
import {
  useLayoutCustomDrag,
  type ProfileLayoutDragActions,
} from "./hooks/useLayoutCustomDrag";
import {
  restoreDocumentTextSelection,
  suspendDocumentTextSelection,
} from "./utils/documentTextSelection";
import {
  useMainLayoutProfileMutations,
  type MainLayoutSelectedApp,
} from "./hooks/useMainLayoutProfileMutations";

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
    profilesLoaded,
    profileStoreError,
    skipNextAutosaveRef,
  } = useProfilesPersistence({ setSelectedProfileId: setSelectedProfile });
  const [isLaunching, setIsLaunching] = useState(false);
  const { launchFeedback, setLaunchFeedback, launchFeedbackTimeoutRef } =
    useLaunchFeedback();
  const { handleLaunch, handleCancelLaunch } = useProfileLaunch({
    profiles,
    selectedProfileId: selectedProfile,
    setIsLaunching,
    setLaunchFeedback,
    launchFeedbackTimeoutRef,
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const isEditModeRef = useRef(false);
  const [
    selectedProfileForSettings,
    setSelectedProfileForSettings,
  ] = useState<string | null>(null);
  const [showCreateProfile, setShowCreateProfile] =
    useState(false);
  const [currentView, setCurrentView] = useState<
    "profiles" | "apps" | "content"
  >("profiles");
  const [selectedApp, setSelectedApp] =
    useState<MainLayoutSelectedApp | null>(null);

  const [rightSidebarOpen, setRightSidebarOpen] =
    useState(false);
  const [showProfileDropdown, setShowProfileDropdown] =
    useState(false);

  // Ref for the dropdown container
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useNativeAppDragBridge({
    dragStateRef,
    setDragState,
    setIsEditMode,
    isEditMode,
  });

  const currentProfile = profiles.find(
    (p) => p.id === selectedProfile,
  ) || null;
  const profileForSettings = profiles.find(
    (p) => p.id === selectedProfileForSettings,
  ) || null;

  const currentProfileRef = useRef<FlowProfile | null>(null);
  currentProfileRef.current = currentProfile;
  isEditModeRef.current = isEditMode;
  const profileDragActionsRef = useRef<ProfileLayoutDragActions | null>(null);

  const { handleCustomDragStart } = useLayoutCustomDrag({
    dragStateRef,
    setDragState,
    setIsEditMode,
    isEditModeRef,
    currentProfileRef,
    profileDragActionsRef,
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
  });

  // FIXED: Document click listener for dropdown
  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        showProfileDropdown &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowProfileDropdown(false);
      }
    };

    if (showProfileDropdown) {
      // Add listener with slight delay to avoid immediate closure
      setTimeout(() => {
        document.addEventListener("click", handleDocumentClick);
      }, 10);
    }

    return () => {
      document.removeEventListener(
        "click",
        handleDocumentClick,
      );
    };
  }, [showProfileDropdown]);

  // SELECTED APP HANDLERS
  const handleClearAppSelection = useCallback(() => {
    setSelectedApp(null);
    setRightSidebarOpen(false);
  }, []);

  const handleAppSelect = useCallback(
    (
      appData: any,
      source: "monitor" | "minimized",
      monitorId?: string,
      appIndex?: number,
    ) => {
      console.log("🎯 APP SELECTED:", {
        appName: appData.name,
        source,
        monitorId,
        appIndex,
        instanceId: appData.instanceId,
        hasInstanceId: !!appData.instanceId,
        appData: appData,
      });

      if (!currentProfile) return;

      // Determine if this is a browser app
      const isBrowser =
        appData.name?.toLowerCase().includes("chrome") ||
        appData.name?.toLowerCase().includes("browser") ||
        appData.name?.toLowerCase().includes("firefox") ||
        appData.name?.toLowerCase().includes("safari") ||
        appData.name?.toLowerCase().includes("edge");

      // Get fresh app data with current browser tabs
      const freshAppData = { ...appData };

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

          console.log(
            "🌐 BROWSER TABS FOR MONITOR APP INSTANCE:",
            {
              browser: appData.name,
              instanceId: appData.instanceId,
              monitor: monitorId,
              tabCount: freshAppData.browserTabs.length,
              tabs: freshAppData.browserTabs.map((t: any) => t.name),
            },
          );
        } else if (source === "minimized") {
          // For minimized apps, tabs are stored directly in the app data
          freshAppData.browserTabs = appData.browserTabs || [];

          console.log(
            "🌐 BROWSER TABS FOR MINIMIZED APP INSTANCE:",
            {
              browser: appData.name,
              instanceId: appData.instanceId,
              tabCount: freshAppData.browserTabs.length,
              tabs: freshAppData.browserTabs.map((t: any) => t.name),
              rawAppData: {
                name: appData.name,
                instanceId: appData.instanceId,
                browserTabs: appData.browserTabs,
              },
            },
          );
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
    [currentProfile],
  );

  // After moves/reorders, list indices change; keep selection index aligned with instanceId.
  useEffect(() => {
    if (!selectedApp || !currentProfile) return;

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

      console.log("💾 UPDATING SELECTED APP:", updates);

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

      console.log("📁 UPDATING ASSOCIATED FILES:", files);

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

    console.log("🗑️ DELETING SELECTED APP");

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

      console.log(
        "📱 MOVING SELECTED APP TO MONITOR:",
        targetMonitorId,
      );

      if (
        selectedApp.source === "minimized" &&
        selectedApp.appIndex !== undefined
      ) {
        moveMinimizedAppToMonitor(
          currentProfile.id,
          selectedApp.appIndex,
          targetMonitorId,
        );
        // Update selected app to reflect new location
        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                source: "monitor",
                monitorId: targetMonitorId,
                appIndex: undefined, // Will need to find new index
              }
            : null,
        );
      }
    },
    [selectedApp, currentProfile],
  );

  const handleSelectedAppMoveToMinimized = useCallback(() => {
    if (!selectedApp || !currentProfile) return;

    console.log("📦 MOVING SELECTED APP TO MINIMIZED");

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

  const handleCloseSidebar = useCallback(() => {
    setRightSidebarOpen(false);
    setSelectedApp(null);
  }, []);

  // FIXED: Simplified profile switching
  const handleProfileSwitch = useCallback(
    (profileId: string) => {
      console.log("🔄 PROFILE SWITCH INITIATED:", {
        profileId,
        isEditMode,
        currentProfile: selectedProfile,
      });

      if (isEditMode) {
        console.log(
          "🚫 PROFILE SWITCHING BLOCKED - Edit mode is active",
        );
        return;
      }

      if (profileId === selectedProfile) {
        console.log("⚠️ PROFILE ALREADY SELECTED:", profileId);
        setShowProfileDropdown(false);
        return;
      }

      console.log("✅ SWITCHING PROFILE:", profileId);

      // Update selected profile immediately
      setSelectedProfile(profileId);

      // Clear any selected app when switching profiles
      setSelectedApp(null);
      setRightSidebarOpen(false);

      // Close dropdown
      setShowProfileDropdown(false);
      console.log("🎉 PROFILE SWITCH COMPLETED:", profileId);
    },
    [isEditMode, selectedProfile],
  );

  // Handle dropdown toggle
  const handleDropdownToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isEditMode) {
        console.log(
          "🚫 DROPDOWN TOGGLE BLOCKED - Edit mode is active",
        );
        return;
      }

      console.log("🔽 DROPDOWN TOGGLE:", !showProfileDropdown);
      setShowProfileDropdown(!showProfileDropdown);
    },
    [isEditMode, showProfileDropdown],
  );

  const handleDragStart = () => {
    if (!isEditMode) {
      setIsEditMode(true);
    }
  };

  return (
    <div className="h-screen overflow-hidden flow-shell-canvas">
      {profileStoreError ? (
        <div
          className="shrink-0 px-4 py-2 bg-amber-950/80 border-b border-amber-700/60 text-amber-100 text-xs"
          role="alert"
        >
          <strong className="font-semibold">Profiles could not be loaded.</strong>
          {" "}
          {profileStoreError.message}
          {" "}
          Autosave is disabled until you restart the app after the issue is resolved, to avoid overwriting your data.
        </div>
      ) : null}
      <div className="app-drag-region h-9 px-3 flow-shell-titlebar flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <img
            src="/flowswitch-logo.png"
            alt="FlowSwitch logo"
            className="h-8 w-8 rounded-md object-contain"
          />
        </div>
        <span className="text-[11px] text-flow-text-muted tracking-wide">
          Workspace automation
        </span>
      </div>
      <div className="flex h-[calc(100vh-2.25rem)]">
        {/* Left Sidebar - FIXED: Better height management */}
        <div className="w-[clamp(16rem,24vw,24rem)] min-w-[16rem] flow-shell-nav flex flex-col">
          {/* Header - Fixed height */}
          <div className="flex-shrink-0 p-4 border-b border-flow-border/50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-base text-flow-text-primary font-semibold tracking-tight">
                  FlowSwitch
                </h1>
                <p className="text-[11px] text-flow-text-muted mt-0.5">
                  Profiles, apps, layouts
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="file"
                  accept=".json"
                  onChange={importProfile}
                  className="hidden"
                  id="import-profile"
                />
                <label
                  htmlFor="import-profile"
                  className="inline-flex items-center justify-center p-1.5 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary rounded-lg transition-all duration-150 ease-out cursor-pointer"
                  title="Import Profile"
                  aria-label="Import profile"
                >
                  <Upload className="w-3.5 h-3.5" />
                </label>
                <button
                  onClick={() =>
                    currentProfile &&
                    exportProfile(currentProfile.id)
                  }
                  className="inline-flex items-center justify-center p-1.5 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary rounded-lg transition-all duration-150 ease-out"
                  title="Export Current Profile"
                  aria-label="Export current profile"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <span className="h-4 w-px bg-flow-border/40 mx-0.5" aria-hidden="true" />
                <button
                  className="inline-flex items-center justify-center p-1.5 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary rounded-lg transition-all duration-150 ease-out"
                  title="Open settings"
                  aria-label="Open settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* View Toggle - Compact */}
            <div className="flow-segment-track" role="tablist" aria-label="Sidebar view">
              <button
                type="button"
                role="tab"
                aria-selected={currentView === "profiles"}
                onClick={() => setCurrentView("profiles")}
                className={`flow-segment-tab px-2 py-1.5 ${
                  currentView === "profiles"
                    ? "flow-segment-tab-active"
                    : "flow-segment-tab-idle"
                }`}
              >
                Profiles
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={currentView === "apps"}
                onClick={() => setCurrentView("apps")}
                className={`flow-segment-tab flex items-center justify-center gap-1 px-2 py-1.5 ${
                  currentView === "apps"
                    ? "flow-segment-tab-active"
                    : "flow-segment-tab-idle"
                }`}
              >
                <LayoutGrid className="w-3 h-3 shrink-0" />
                Apps
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={currentView === "content"}
                onClick={() => setCurrentView("content")}
                className={`flow-segment-tab flex items-center justify-center gap-1 px-2 py-1.5 ${
                  currentView === "content"
                    ? "flow-segment-tab-active"
                    : "flow-segment-tab-idle"
                }`}
              >
                <Link className="w-3 h-3 shrink-0" />
                Content
              </button>
            </div>
          </div>

          {/* Sidebar Content - FIXED: Proper flex and overflow handling */}
          <div className="flex-1 min-h-0 flex flex-col">
            {currentView === "profiles" && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-shrink-0 p-3 border-b border-flow-border/50">
                  <div className="flex items-center justify-between">
                    <h2 className="flow-section-label">
                      Profiles
                    </h2>
                    <button
                      onClick={() => setShowCreateProfile(true)}
                      disabled={isEditMode}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all duration-150 ease-out ${
                        isEditMode
                          ? "text-flow-text-muted cursor-not-allowed opacity-50"
                          : "text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary"
                      }`}
                      title={
                        isEditMode
                          ? "Cannot create new profile while in edit mode"
                          : "Create new profile"
                      }
                    >
                      <Plus className="w-3 h-3" />
                      New
                    </button>
                  </div>

                  {isEditMode && (
                    <div className="mt-3 p-2.5 rounded-lg border border-flow-border/60 bg-flow-surface/80">
                      <div className="flex items-center gap-2 text-xs text-flow-text-secondary">
                        <Edit className="w-3 h-3 text-flow-accent-blue shrink-0" />
                        <span>
                          Profile switching disabled while
                          editing
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-elegant p-3">
                  <div className="space-y-2.5">
                    {profiles.map((profile) => (
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
                            : () =>
                                setSelectedProfileForSettings(
                                  profile.id,
                                )
                        }
                        onDuplicate={
                          isEditMode
                            ? undefined
                            : () => duplicateProfile(profile.id)
                        }
                        onDelete={
                          isEditMode
                            ? undefined
                            : () => deleteProfile(profile.id)
                        }
                        onExport={
                          isEditMode
                            ? undefined
                            : () => exportProfile(profile.id)
                        }
                        onSetOnStartup={
                          isEditMode
                            ? undefined
                            : () =>
                                setOnStartupProfile(profile.id)
                        }
                        disabled={isEditMode}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {currentView === "apps" && (
              <div className="flex-1 min-h-0">
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
                />
              </div>
            )}

            {currentView === "content" && (
              <div className="flex-1 min-h-0">
                <ContentManager
                  profiles={profiles}
                  currentProfile={currentProfile}
                  onUpdateProfile={updateProfile}
                  onDragStart={handleDragStart}
                  onCustomDragStart={handleCustomDragStart}
                  compact={true}
                />
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area with Header and Right Sidebar */}
        <div
          className={`flex-1 flex flex-col transition-[margin] duration-200 ease-out ${
            rightSidebarOpen ? "mr-[clamp(18rem,24vw,24rem)]" : "mr-0"
          }`}
        >
          {/* Header - Spans across Main Content and Right Sidebar area */}
          {currentProfile ? (
            <header className="px-4 md:px-6 xl:px-8 py-2.5 md:py-3 border-b border-flow-border/50 bg-flow-bg-secondary/80 backdrop-blur-sm relative z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Profile Switcher - Now without settings button */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={handleDropdownToggle}
                      disabled={isEditMode}
                      className={`flow-header-well flex items-center gap-2 md:gap-3 p-2 md:p-2.5 max-w-[52vw] ${
                        isEditMode
                          ? "opacity-50 cursor-not-allowed text-flow-text-muted"
                          : "flow-header-well-interactive text-flow-text-primary cursor-pointer"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <h2 className="text-base md:text-lg text-flow-text-primary font-semibold tracking-tight truncate max-w-[22rem]">
                            {currentProfile.name}
                          </h2>
                          {currentProfile.autoLaunchOnBoot && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-flow-accent-green/20 text-flow-accent-green border border-flow-accent-green/30">
                              <Zap className="w-3 h-3" />
                              Boot
                            </span>
                          )}
                          {currentProfile.autoSwitchTime && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-flow-accent-purple/20 text-flow-accent-purple border border-flow-accent-purple/30">
                              <Clock className="w-3 h-3" />
                              {currentProfile.autoSwitchTime}
                            </span>
                          )}
                          {currentProfile.hotkey && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30">
                              {currentProfile.hotkey}
                            </span>
                          )}
                        </div>
                        <p className="text-flow-text-secondary text-xs md:text-sm truncate">
                          {currentProfile.description}
                        </p>
                        <div className="flex items-center gap-2 md:gap-4 mt-1.5 flex-wrap">
                          <div className="flex items-center gap-1 text-flow-text-muted text-xs">
                            <Clock className="w-3 h-3" />
                            <span>
                              ~
                              {
                                currentProfile.estimatedStartupTime
                              }
                              s startup
                            </span>
                          </div>
                          <div className="text-flow-text-muted text-xs">
                            {currentProfile.appCount} apps •{" "}
                            {currentProfile.tabCount} tabs •{" "}
                            {currentProfile.fileCount || 0}{" "}
                            files
                          </div>
                          {currentProfile.launchOrder ===
                            "sequential" && (
                            <div className="text-flow-text-muted text-xs">
                              Sequential launch
                            </div>
                          )}
                        </div>
                      </div>
                      {!isEditMode && (
                        <ChevronDown
                          className={`w-4 h-4 text-flow-text-muted transition-transform duration-150 ease-out ${
                            showProfileDropdown
                              ? "rotate-180"
                              : ""
                          }`}
                        />
                      )}
                    </button>

                    {/* Profile Dropdown */}
                    {showProfileDropdown && !isEditMode && (
                      <div
                        className="absolute top-full left-0 mt-2 w-full min-w-[20rem] bg-flow-surface-elevated border border-flow-border/60 rounded-xl shadow-flow-shadow-lg overflow-hidden z-[60]"
                        style={{ pointerEvents: "auto" }}
                      >
                        <div className="max-h-80 overflow-y-auto scrollbar-elegant">
                          {profiles.map((profile) => (
                            <button
                              key={profile.id}
                              onClick={() => {
                                handleProfileSwitch(profile.id);
                              }}
                              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-flow-surface/80 transition-colors duration-150 border-b border-flow-border/30 last:border-b-0"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-sm font-semibold text-flow-text-primary tracking-tight">
                                    {profile.name}
                                  </h3>
                                  {profile.id ===
                                    selectedProfile && (
                                    <div className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-flow-accent-blue/20 text-flow-accent-blue border border-flow-accent-blue/30">
                                      <Check className="w-3 h-3 flex-shrink-0" />
                                      Active
                                    </div>
                                  )}
                                  {profile.autoLaunchOnBoot && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-green/20 text-flow-accent-green">
                                      <Zap className="w-2.5 h-2.5" />
                                      Boot
                                    </span>
                                  )}
                                  {profile.autoSwitchTime && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-purple/20 text-flow-accent-purple">
                                      <Clock className="w-2.5 h-2.5" />
                                      {profile.autoSwitchTime}
                                    </span>
                                  )}
                                  {profile.hotkey && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-flow-accent-blue/20 text-flow-accent-blue">
                                      {profile.hotkey}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-flow-text-secondary mb-2 truncate">
                                  {profile.description}
                                </p>
                                <div className="flex items-center gap-3 text-xs text-flow-text-muted">
                                  <span>
                                    {profile.appCount} apps
                                  </span>
                                  <span>
                                    {profile.tabCount} tabs
                                  </span>
                                  <span>
                                    {profile.fileCount || 0}{" "}
                                    files
                                  </span>
                                  <span>
                                    ~
                                    {
                                      profile.estimatedStartupTime
                                    }
                                    s
                                  </span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* MOVED: Action buttons with edit/save button first */}
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 md:gap-3 flex-wrap justify-end">
                    <button
                      onClick={() => setIsEditMode(!isEditMode)}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium transition-all duration-150 ease-out ${
                        isEditMode
                          ? "bg-flow-accent-blue text-flow-text-primary border border-flow-accent-blue/80 hover:bg-flow-accent-blue-hover shadow-md ring-1 ring-flow-accent-blue/25"
                          : "bg-flow-surface/90 border border-flow-border/60 text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary hover:border-flow-border-accent/50"
                      }`}
                    >
                      {isEditMode ? (
                        <Save className="w-4 h-4" />
                      ) : (
                        <Edit className="w-4 h-4" />
                      )}
                      {isEditMode
                        ? "Save Profile"
                        : "Edit Profile"}
                    </button>
                    <button
                      onClick={() =>
                        setSelectedProfileForSettings(
                          currentProfile.id,
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium transition-all duration-150 ease-out bg-flow-surface/90 border border-flow-border/60 text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary hover:border-flow-border-accent/50"
                      title="Profile Settings"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </button>
                    <button
                      onClick={handleLaunch}
                      disabled={isLaunching || isEditMode}
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/40 focus:ring-offset-2 focus:ring-offset-flow-bg-primary bg-flow-accent-blue text-flow-text-primary hover:bg-flow-accent-blue-hover active:bg-flow-accent-blue/90 disabled:opacity-50 shadow-sm"
                    >
                      {isLaunching ? (
                        <>
                          <div className="w-4 h-4 border-2 border-flow-text-primary/30 border-t-flow-text-primary rounded-full animate-spin" />
                          Launching...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Launch Profile
                        </>
                      )}
                    </button>
                    {(isLaunching
                      || launchFeedback.status === "in-progress"
                      || launchFeedback.status === "warning")
                      && window.electron?.cancelProfileLaunch ? (
                        <button
                          type="button"
                          onClick={() => void handleCancelLaunch()}
                          disabled={isEditMode}
                          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium transition-all duration-150 ease-out bg-flow-surface/90 border border-flow-border/60 text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary hover:border-flow-border-accent/50 disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                          Cancel launch
                        </button>
                      ) : null}
                  </div>
                  {launchFeedback.status !== "idle" && (
                    <div
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                        launchFeedback.status === "success"
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                          : launchFeedback.status === "warning"
                            ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                          : launchFeedback.status === "error"
                            ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                            : "border-flow-border-accent bg-flow-surface-elevated text-flow-text-secondary"
                      }`}
                    >
                      {launchFeedback.status === "success" ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : launchFeedback.status === "warning" ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : launchFeedback.status === "error" ? (
                        <X className="w-3.5 h-3.5" />
                      ) : (
                        <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                      )}
                      <span>{launchFeedback.message}</span>
                    </div>
                  )}
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
                    <p className="text-xs text-flow-text-muted leading-relaxed">
                      Create a profile from the sidebar to capture layouts and launch your workspace.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-flow-surface border border-flow-border text-flow-text-muted opacity-60 cursor-not-allowed"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Profile
                  </button>
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-flow-surface border border-flow-border text-flow-text-muted opacity-60 cursor-not-allowed"
                    title="Profile Settings"
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-flow-accent-blue text-flow-text-primary opacity-50 cursor-not-allowed"
                  >
                    <Play className="w-4 h-4" />
                    Launch Profile
                  </button>
                </div>
              </div>
            </header>
          )}

          {/* Main Content Area */}
          {currentProfile && (
            <main className="flex-1 overflow-hidden relative flow-shell-canvas">
              <div className="h-full px-4 md:px-6 xl:px-8 py-4 md:py-6">
                <MonitorLayout
                  monitors={currentProfile.monitors}
                  minimizedApps={currentProfile.minimizedApps}
                  minimizedFiles={[]} // REMOVED: No more standalone files
                  browserTabs={currentProfile.browserTabs}
                  isEditMode={isEditMode}
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
                    console.log(
                      "📱 APP.TSX - CROSS-MONITOR CALLBACK:",
                      {
                        sourceMonitorId,
                        appIndex,
                        targetMonitorId,
                        newPosition,
                        newSize,
                      },
                    );
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
                    console.log(
                      "📱 APP.TSX - MINIMIZED TO MONITOR CALLBACK:",
                      {
                        appIndex,
                        targetMonitorId,
                        newPosition,
                        newSize,
                      },
                    );
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
                  large={!rightSidebarOpen}
                />
              </div>
            </main>
          )}
        </div>

        {/* Right Sidebar - Fixed position, animated visibility */}
        {rightSidebarOpen && (
          <div
            className={`fixed right-0 top-9 w-[clamp(18rem,24vw,24rem)] h-[calc(100vh-2.25rem)] flow-shell-inspector flex flex-col z-30 transform transition-transform duration-200 ease-out ${
              rightSidebarOpen
                ? "translate-x-0"
                : "translate-x-full"
            }`}
          >
            {/* Sidebar Header - Close button only */}
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                onClick={handleCloseSidebar}
                className="inline-flex items-center justify-center p-1.5 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary rounded-lg transition-all duration-150 ease-out"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sidebar Content - Now contains app header */}
            <div className="flex-1 overflow-hidden">
              <SelectedAppDetails
                selectedApp={selectedApp}
                onClose={handleCloseSidebar}
                onUpdateApp={handleSelectedAppUpdate}
                onUpdateAssociatedFiles={
                  handleSelectedAppAssociatedFiles
                }
                onDeleteApp={handleSelectedAppDelete}
                onMoveToMonitor={handleSelectedAppMoveToMonitor}
                onMoveToMinimized={
                  handleSelectedAppMoveToMinimized
                }
                monitors={currentProfile?.monitors || []}
                browserTabs={currentProfile?.browserTabs || []}
                onUpdateBrowserTabs={(tabs) =>
                  updateBrowserTabs(
                    currentProfile?.id || "",
                    tabs,
                  )
                }
                onAddBrowserTab={(tab) =>
                  addBrowserTab(currentProfile?.id || "", tab)
                }
              />
            </div>
          </div>
        )}

        {/* Right Sidebar Toggle Button (when closed) */}
        {!rightSidebarOpen && selectedApp && (
          <button
            type="button"
            onClick={() => setRightSidebarOpen(true)}
            className="fixed right-0 bg-flow-surface/95 border border-flow-border/60 border-r-0 text-flow-text-secondary hover:bg-flow-surface-elevated hover:text-flow-text-primary rounded-l-lg transition-all duration-150 ease-out p-2 z-20 shadow-flow-shadow-md backdrop-blur-sm"
            style={{
              top: "calc(2.25rem + (100vh - 2.25rem) / 2)",
              transform: "translateY(-50%)",
            }}
            title="Open App Details"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Drag Overlay — pointer-events-none so hit-testing uses the cursor, not the preview */}
        {dragState.isDragging && dragState.dragData && (
          <div
            data-app-drag-overlay="true"
            className="fixed pointer-events-none z-[9999] select-none"
            style={{
              left: dragState.currentPosition.x + 12,
              top: dragState.currentPosition.y - 20,
            }}
          >
            <div className="relative animate-in fade-in-0 zoom-in-95 duration-200">
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
                {dragState.dragData.fileIcon && (
                  <dragState.dragData.fileIcon className="w-4.5 h-4.5 text-white drop-shadow-sm" />
                )}
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
        <ProfileSettings
          profile={profileForSettings}
          isOpen={!!selectedProfileForSettings}
          onClose={() => setSelectedProfileForSettings(null)}
          onSave={(settings) => {
            if (selectedProfileForSettings) {
              updateProfile(
                selectedProfileForSettings,
                settings,
              );
            }
          }}
          onDuplicate={() => {
            if (selectedProfileForSettings) {
              duplicateProfile(selectedProfileForSettings);
              setSelectedProfileForSettings(null);
            }
          }}
          onRename={(newName, newDescription) => {
            if (selectedProfileForSettings) {
              renameProfile(
                selectedProfileForSettings,
                newName,
                newDescription,
              );
            }
          }}
          onDelete={() => {
            if (selectedProfileForSettings) {
              deleteProfile(selectedProfileForSettings);
              setSelectedProfileForSettings(null);
            }
          }}
          allProfiles={profiles}
        />

        <CreateProfileModal
          isOpen={showCreateProfile}
          onClose={() => setShowCreateProfile(false)}
          onCreateProfile={(newProfile) => {
            setProfiles((prev) => [...prev, newProfile]);
            setShowCreateProfile(false);
          }}
        />
      </div>
    </div>
  );
}