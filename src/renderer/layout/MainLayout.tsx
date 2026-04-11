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
} from "lucide-react";
import { DragState, DragSourceType } from "./types/dragTypes";
import { safeIconSrc } from "../utils/safeIconSrc";
import type { FlowProfile } from "../../types/flow-profile";
import { toSerializableProfiles } from "../../types/flow-profile";
import { useProfilesPersistence } from "./hooks/useProfilesPersistence";
import { useLaunchFeedback } from "./hooks/useLaunchFeedback";
import {
  restoreDocumentTextSelection,
  suspendDocumentTextSelection,
} from "./utils/documentTextSelection";

interface SelectedApp {
  type: "app" | "browser";
  source: "monitor" | "minimized";
  monitorId?: string;
  appIndex?: number;
  data: any;
}

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
  const [isEditMode, setIsEditMode] = useState(false);
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
    useState<SelectedApp | null>(null);
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

  useEffect(() => {
    const handleNativeDragStart = (event: Event) => {
      const custom = event as CustomEvent<any>;
      const detail = custom.detail;
      const nativeDragData = detail?.dragData ?? detail;
      const startPos = detail?.startPos ?? null;

      if (!nativeDragData) return;
      if (!isEditMode) {
        setIsEditMode(true);
      }

      // Only enable the overlay/zone highlighting for app drags.
      if (nativeDragData.type !== "app") return;

      const initialPos = startPos ?? { x: 0, y: 0 };
      setDragState({
        isDragging: true,
        dragData: nativeDragData,
        startPosition: initialPos,
        currentPosition: initialPos,
        sourceType: "monitor",
        sourceId: String(nativeDragData.monitorId || nativeDragData.sourceMonitorId || ""),
        dragPreview: null,
      });
    };

    const handleNativeDragEnd = () => {
      // Only clear if we were in a native-drag-driven state (no mouse listeners).
      if (!dragStateRef.current.isDragging) return;
      if (!dragStateRef.current.dragData) return;
      if (dragStateRef.current.dragData.type !== "app") return;

      setDragState({
        isDragging: false,
        dragData: null,
        startPosition: { x: 0, y: 0 },
        currentPosition: { x: 0, y: 0 },
        sourceType: null,
        sourceId: null,
        dragPreview: null,
      });
    };

    const handleDragOver = (e: DragEvent) => {
      if (!dragStateRef.current.isDragging) return;
      if (!dragStateRef.current.dragData) return;
      if (dragStateRef.current.dragData.type !== "app") return;

      // Keep drop targets active and update overlay/zone position.
      e.preventDefault();
      setDragState((prev) => ({
        ...prev,
        currentPosition: { x: e.clientX, y: e.clientY },
      }));
    };

    document.addEventListener("flowswitch:dragstart", handleNativeDragStart as EventListener);
    document.addEventListener("flowswitch:dragend", handleNativeDragEnd as EventListener);
    document.addEventListener("dragover", handleDragOver);

    return () => {
      document.removeEventListener("flowswitch:dragstart", handleNativeDragStart as EventListener);
      document.removeEventListener("flowswitch:dragend", handleNativeDragEnd as EventListener);
      document.removeEventListener("dragover", handleDragOver);
    };
  }, [isEditMode]);

  const currentProfile = profiles.find(
    (p) => p.id === selectedProfile,
  ) || null;
  const profileForSettings = profiles.find(
    (p) => p.id === selectedProfileForSettings,
  ) || null;

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

  // CUSTOM DRAG SYSTEM HANDLERS
  const handleCustomDragStart = useCallback(
    (
      data: any,
      sourceType: DragSourceType,
      sourceId: string,
      startPos: { x: number; y: number },
      preview?: React.ReactNode,
    ) => {
      console.log("🎯 CUSTOM DRAG START:", {
        data,
        sourceType,
        sourceId,
        startPos,
      });

      if (!isEditMode) {
        setIsEditMode(true);
      }

      setDragState({
        isDragging: true,
        dragData: data,
        startPosition: startPos,
        currentPosition: startPos,
        sourceType,
        sourceId,
        dragPreview: preview || null,
      });

      // Add global mouse event listeners
      document.addEventListener(
        "mousemove",
        handleGlobalMouseMove,
      );
      document.addEventListener("mouseup", handleGlobalMouseUp);
      suspendDocumentTextSelection();
      document.body.style.cursor = "grabbing";
    },
    [isEditMode],
  );

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;

    setDragState((prev) => ({
      ...prev,
      currentPosition: { x: e.clientX, y: e.clientY },
    }));
  }, []);

  const handleGlobalMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;

      console.log("🎯 CUSTOM DRAG END:", {
        x: e.clientX,
        y: e.clientY,
      });

      // Check what element we're dropping on
      const elementBelow = document.elementFromPoint(
        e.clientX,
        e.clientY,
      );
      const dropTarget = elementBelow?.closest(
        "[data-drop-target]",
      );

      if (
        dropTarget &&
        dragStateRef.current.dragData &&
        currentProfile
      ) {
        const targetType = dropTarget.getAttribute(
          "data-drop-target",
        );
        const targetId =
          dropTarget.getAttribute("data-target-id");

        console.log("🎯 DROP TARGET FOUND:", {
          targetType,
          targetId,
          dragData: dragStateRef.current.dragData,
        });

        handleCustomDrop(
          dragStateRef.current.dragData,
          targetType,
          targetId,
          { x: e.clientX, y: e.clientY },
        );
      }

      // Clean up drag state
      setDragState({
        isDragging: false,
        dragData: null,
        startPosition: { x: 0, y: 0 },
        currentPosition: { x: 0, y: 0 },
        sourceType: null,
        sourceId: null,
        dragPreview: null,
      });

      document.removeEventListener(
        "mousemove",
        handleGlobalMouseMove,
      );
      document.removeEventListener(
        "mouseup",
        handleGlobalMouseUp,
      );
      restoreDocumentTextSelection();
      document.body.style.cursor = "";
    },
    [currentProfile],
  );

  const handleCustomDrop = useCallback(
    (
      dragData: any,
      targetType: string | null,
      targetId: string | null,
      dropPosition: { x: number; y: number },
    ) => {
      if (!currentProfile || !dragData || !targetType) {
        console.log("❌ DROP FAILED: Missing data", {
          currentProfile: !!currentProfile,
          dragData,
          targetType,
        });
        return;
      }

      console.log("🎯 PROCESSING DROP:", {
        dragData,
        targetType,
        targetId,
        dropPosition,
      });

      if (targetType === "monitor" && targetId) {
        handleDropOnMonitor(dragData, targetId, dropPosition);
      } else if (targetType === "minimized") {
        handleDropOnMinimized(dragData);
      }
    },
    [currentProfile],
  );

  const handleDropOnMonitor = useCallback(
    (
      dragData: any,
      targetMonitorId: string,
      dropPosition: { x: number; y: number },
    ) => {
      if (!currentProfile) return;

      // Check if we're dropping onto an existing app tile
      const elementBelow = document.elementFromPoint(
        dropPosition.x,
        dropPosition.y,
      );
      const appTile = elementBelow?.closest(
        '[data-unified-window="true"][data-item-type="app"]',
      );

      if (
        appTile &&
        (dragData.type === "file" ||
          dragData.type === "content") &&
        dragData.source === "sidebar"
      ) {
        // Handle content association with existing app
        const appMonitorId = appTile.getAttribute(
          "data-monitor-id",
        );
        const appIndex = parseInt(
          appTile.getAttribute("data-item-index") || "0",
        );

        if (appMonitorId === targetMonitorId) {
          console.log(
            "🎯 ASSOCIATING CONTENT WITH EXISTING APP:",
            {
              content: dragData.name,
              monitorId: appMonitorId,
              appIndex,
            },
          );

          // FIXED: Check if this is a link being dropped on a browser app
          const monitor = currentProfile.monitors.find(m => m.id === appMonitorId);
          const targetApp = monitor?.apps[appIndex];
          
          const isLink = dragData.contentType === "link" || (dragData.type === "content" && dragData.url);
          const isBrowserApp = targetApp && (
            targetApp.name?.toLowerCase().includes("chrome") ||
            targetApp.name?.toLowerCase().includes("browser") ||
            targetApp.name?.toLowerCase().includes("firefox") ||
            targetApp.name?.toLowerCase().includes("safari") ||
            targetApp.name?.toLowerCase().includes("edge")
          );

          if (isLink && isBrowserApp) {
            // Add as browser tab instead of associated file
            console.log("🌐 ADDING LINK AS BROWSER TAB TO EXISTING BROWSER:", {
              linkName: dragData.name,
              linkUrl: dragData.url,
              browserApp: targetApp.name,
              instanceId: targetApp.instanceId
            });

            const newTab = {
              id: `content-tab-${Date.now()}`,
              name: dragData.name,
              url: dragData.url,
              browser: targetApp.name,
              newWindow: false,
              monitorId: appMonitorId,
              isActive: true,
              appInstanceId: targetApp.instanceId, // Associate with specific app instance
            };

            addBrowserTab(currentProfile.id, newTab);
          } else if (dragData.type === "content") {
            // Associate content with existing app as file
            const contentData = {
              id: `content-${Date.now()}`,
              name: dragData.name,
              url: dragData.url,
              path: dragData.path,
              type: dragData.fileType || dragData.contentType,
              associatedApp: dragData.defaultApp,
              useDefaultApp: dragData.useDefaultApp || false,
            };

            associateFileWithApp(
              currentProfile.id,
              appMonitorId,
              appIndex,
              contentData,
            );
          } else {
            // Legacy file association
            associateFileWithApp(
              currentProfile.id,
              appMonitorId,
              appIndex,
              {
                id: `file-${Date.now()}`,
                name: dragData.name,
                path: dragData.path,
                type: dragData.fileType,
                associatedApp: dragData.associatedApp,
                useDefaultApp: dragData.useDefaultApp || false,
              },
            );
          }
          return;
        }
      }

      // Calculate relative position on the monitor for normal drops
      const monitorElement = document.querySelector(
        `[data-monitor-id="${targetMonitorId}"]`,
      );
      if (!monitorElement) return;

      const rect = monitorElement.getBoundingClientRect();
      const relativeX =
        ((dropPosition.x - rect.left) / rect.width) * 100;
      const relativeY =
        ((dropPosition.y - rect.top) / rect.height) * 100;
      const rawPosition = {
        x: Math.max(0, Math.min(100, relativeX)),
        y: Math.max(0, Math.min(100, relativeY)),
      };

      const targetMonitor = currentProfile.monitors?.find((m: any) => m.id === targetMonitorId);
      const isPortrait = targetMonitor?.orientation === "portrait";
      const sourceMonitorId = dragData.sourceMonitorId || dragData.monitorId || null;
      const isIncomingApp =
        dragData.type === "app" &&
        (dragData.source === "sidebar" ||
          dragData.source === "minimized" ||
          (dragData.source === "monitor" && sourceMonitorId && sourceMonitorId !== targetMonitorId));
      const prospectiveAppCount = (targetMonitor?.apps?.length || 0) + (isIncomingApp ? 1 : 0);

      const getDropZones = (count: number) => {
        if (isPortrait) {
          if (count <= 1) return [{ position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }];
          if (count === 2) return [
            { position: { x: 50, y: 25 }, size: { width: 100, height: 50 } },
            { position: { x: 50, y: 75 }, size: { width: 100, height: 50 } },
          ];
          if (count === 3) return [
            { position: { x: 50, y: 16.67 }, size: { width: 100, height: 33.33 } },
            { position: { x: 50, y: 50 }, size: { width: 100, height: 33.33 } },
            { position: { x: 50, y: 83.33 }, size: { width: 100, height: 33.33 } },
          ];
          return [
            { position: { x: 50, y: 12.5 }, size: { width: 100, height: 25 } },
            { position: { x: 50, y: 37.5 }, size: { width: 100, height: 25 } },
            { position: { x: 50, y: 62.5 }, size: { width: 100, height: 25 } },
            { position: { x: 50, y: 87.5 }, size: { width: 100, height: 25 } },
          ];
        }

        if (count <= 1) return [{ position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }];
        if (count === 2) return [
          { position: { x: 25, y: 50 }, size: { width: 50, height: 100 } },
          { position: { x: 75, y: 50 }, size: { width: 50, height: 100 } },
        ];
        if (count === 3) return [
          { position: { x: 16.67, y: 50 }, size: { width: 33.33, height: 100 } },
          { position: { x: 50, y: 50 }, size: { width: 33.33, height: 100 } },
          { position: { x: 83.33, y: 50 }, size: { width: 33.33, height: 100 } },
        ];
        return [
          { position: { x: 25, y: 25 }, size: { width: 50, height: 50 } },
          { position: { x: 75, y: 25 }, size: { width: 50, height: 50 } },
          { position: { x: 25, y: 75 }, size: { width: 50, height: 50 } },
          { position: { x: 75, y: 75 }, size: { width: 50, height: 50 } },
        ];
      };

      const zones = getDropZones(prospectiveAppCount);
      let activeZone = zones[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const zone of zones) {
        const distance = Math.sqrt(
          Math.pow(rawPosition.x - zone.position.x, 2) +
          Math.pow(rawPosition.y - zone.position.y, 2),
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          activeZone = zone;
        }
      }

      const position = {
        x: activeZone.position.x,
        y: activeZone.position.y,
      };
      const snappedSize = {
        width: activeZone.size.width,
        height: activeZone.size.height,
      };

      console.log("🎯 DROP ON MONITOR:", {
        targetMonitorId,
        position,
        dragData,
      });

      if (dragData.source === "sidebar") {
        // FIXED: All sidebar content (files, links, etc.) creates app instances
        if (
          dragData.type === "content" ||
          dragData.type === "file"
        ) {
          console.log(
            "🚀 CREATING NEW APP INSTANCE FOR CONTENT/FILE:",
            dragData,
          );

          if (
            dragData.contentType === "link" ||
            (dragData.type === "content" && dragData.url)
          ) {
            // Create browser app instance with link as tab
            const newApp: any = {
              name: dragData.defaultApp,
              icon: getBrowserIcon(dragData.defaultApp),
              color: getBrowserColor(dragData.defaultApp),
              position,
              size: { width: 60, height: 60 },
              volume: 50,
              launchBehavior: "new" as const,
              runAsAdmin: false,
              forceCloseOnExit: false,
              smartSave: false,
              monitorId: targetMonitorId,
              associatedFiles: [],
            };

            // Add app to monitor
            addApp(currentProfile.id, targetMonitorId, newApp);

            // Add browser tab with instance association
            const newTab = {
              name: dragData.name,
              url: dragData.url,
              browser: dragData.defaultApp,
              newWindow: false,
              monitorId: targetMonitorId,
              isActive: true,
              appInstanceId: newApp.instanceId, // NEW: Associate with specific app instance
              id: `content-tab-${Date.now()}`,
            };

            addBrowserTab(currentProfile.id, newTab);
          } else {
            // Create app instance with file content
            const newApp: any = {
              name:
                dragData.defaultApp ||
                dragData.associatedApp ||
                "File Viewer",
              icon: getAppIcon(
                dragData.defaultApp ||
                  dragData.associatedApp ||
                  "File Viewer",
              ),
              color: getAppColor(
                dragData.defaultApp ||
                  dragData.associatedApp ||
                  "File Viewer",
              ),
              position,
              size: { width: 60, height: 60 },
              volume: 50,
              launchBehavior: "new" as const,
              runAsAdmin: false,
              forceCloseOnExit: false,
              smartSave: false,
              monitorId: targetMonitorId,
              associatedFiles: [
                {
                  id: `content-file-${Date.now()}`,
                  name: dragData.name,
                  path: dragData.path,
                  type: dragData.fileType || dragData.type,
                  associatedApp:
                    dragData.defaultApp ||
                    dragData.associatedApp ||
                    "File Viewer",
                  useDefaultApp: true,
                },
              ],
            };

            addApp(currentProfile.id, targetMonitorId, newApp);
          }
        } else {
          // Add new app to monitor
          const newApp: any = {
            name: dragData.name,
            icon: dragData.icon,
            iconPath: dragData.iconPath ?? null,
            executablePath: dragData.executablePath ?? null,
            shortcutPath: dragData.shortcutPath ?? null,
            launchUrl: dragData.launchUrl ?? null,
            color: dragData.color,
            position,
            size: snappedSize,
            volume: 50,
            launchBehavior: "new" as const,
            runAsAdmin: false,
            forceCloseOnExit: false,
            smartSave: false,
            monitorId: targetMonitorId,
            associatedFiles: [], // Initialize empty file list
          };

          addApp(currentProfile.id, targetMonitorId, newApp);
        }
      } else if (
        dragData.source === "monitor" &&
        dragData.sourceMonitorId !== targetMonitorId
      ) {
        // Move app between monitors (only apps, no files)
        moveAppBetweenMonitors(
          currentProfile.id,
          dragData.sourceMonitorId,
          dragData.appIndex,
          targetMonitorId,
          position,
          snappedSize,
        );
      } else if (dragData.source === "minimized") {
        // Move app from minimized to monitor (only apps, no files)
        moveMinimizedAppToMonitor(
          currentProfile.id,
          dragData.appIndex,
          targetMonitorId,
          position,
          snappedSize,
        );
      }
    },
    [currentProfile],
  );

  const handleDropOnMinimized = useCallback(
    (dragData: any) => {
      if (!currentProfile) return;

      console.log("🎯 DROP ON MINIMIZED:", dragData);

      if (dragData.source === "monitor") {
        // Move app from monitor to minimized (only apps, no files)
        moveAppToMinimized(
          currentProfile.id,
          dragData.sourceMonitorId,
          dragData.appIndex,
        );
      } else if (dragData.source === "sidebar") {
        // FIXED: All sidebar content creates minimized app instances
        if (
          dragData.type === "content" ||
          dragData.type === "file"
        ) {
          console.log(
            "🚀 CREATING MINIMIZED APP INSTANCE FOR CONTENT/FILE:",
            dragData,
          );

          const newApp: any = {
            name:
              dragData.defaultApp ||
              dragData.associatedApp ||
              "File Viewer",
            icon: getAppIcon(
              dragData.defaultApp ||
                dragData.associatedApp ||
                "File Viewer",
            ),
            color: getAppColor(
              dragData.defaultApp ||
                dragData.associatedApp ||
                "File Viewer",
            ),
            volume: 50,
            launchBehavior: "minimize" as const,
            targetMonitor:
              currentProfile.monitors.find((m) => m.primary)
                ?.id || "monitor-1",
            associatedFiles:
              dragData.contentType === "file" ||
              dragData.type === "file"
                ? [
                    {
                      id: `content-file-${Date.now()}`,
                      name: dragData.name,
                      path: dragData.path,
                      type: dragData.fileType || dragData.type,
                      associatedApp:
                        dragData.defaultApp ||
                        dragData.associatedApp ||
                        "File Viewer",
                      useDefaultApp: true,
                    },
                  ]
                : [],
          };

          addAppToMinimized(currentProfile.id, newApp);

          // If it's a link, also add browser tab with instance association
          if (
            dragData.contentType === "link" ||
            (dragData.type === "content" && dragData.url)
          ) {
            const newTab = {
              name: dragData.name,
              url: dragData.url,
              browser: dragData.defaultApp,
              newWindow: false,
              monitorId: newApp.targetMonitor,
              isActive: true,
              appInstanceId: newApp.instanceId, // NEW: Associate with specific app instance
              id: `content-tab-${Date.now()}`,
            };

            addBrowserTab(currentProfile.id, newTab);
          }
        } else {
          // Add new app to minimized
          const newApp: any = {
            name: dragData.name,
            icon: dragData.icon,
            iconPath: dragData.iconPath ?? null,
            executablePath: dragData.executablePath ?? null,
            shortcutPath: dragData.shortcutPath ?? null,
            launchUrl: dragData.launchUrl ?? null,
            color: dragData.color,
            volume: 50,
            launchBehavior: "minimize" as const,
            targetMonitor:
              currentProfile.monitors.find((m) => m.primary)
                ?.id || "monitor-1",
          };

          addAppToMinimized(currentProfile.id, newApp);
        }
      }
    },
    [currentProfile],
  );

  // Helper functions for app icons and colors
  const getBrowserIcon = (browserName: string) => {
    // Return appropriate icon component based on browser name
    return require("lucide-react").Globe; // Fallback
  };

  const getBrowserColor = (browserName: string) => {
    const colorMap = {
      Chrome: "#4285F4",
      Firefox: "#FF7139",
      Safari: "#006CFF",
      Edge: "#0078D4",
    };
    return (
      colorMap[browserName as keyof typeof colorMap] ||
      "#4285F4"
    );
  };

  const getAppIcon = (appName: string) => {
    // Return appropriate icon component based on app name
    return require("lucide-react").Monitor; // Fallback
  };

  const getAppColor = (appName: string) => {
    const colorMap = {
      "Adobe Acrobat": "#DC143C",
      "Microsoft Word": "#2B579A",
      "Microsoft Excel": "#217346",
      "Microsoft PowerPoint": "#D24726",
      "Visual Studio Code": "#007ACC",
      Notepad: "#0078D4",
      "File Explorer": "#FFB900",
      "VLC Media Player": "#FF8800",
      "Windows Media Player": "#0078D4",
      WinRAR: "#FF6B35",
      "7-Zip": "#0078D4",
    };
    return (
      colorMap[appName as keyof typeof colorMap] || "#4285F4"
    );
  };

  const handleLaunch = async () => {
    if (!currentProfile?.id || !window.electron?.launchProfile) return;

    if (launchFeedbackTimeoutRef.current) {
      window.clearTimeout(launchFeedbackTimeoutRef.current);
      launchFeedbackTimeoutRef.current = null;
    }

    setIsLaunching(true);
    setLaunchFeedback({
      status: "in-progress",
      message: "Launching profile...",
    });

    try {
      if (window.electron?.saveProfiles) {
        const serializableProfiles = toSerializableProfiles(
          profiles,
        );
        const saveResult = await window.electron.saveProfiles(
          serializableProfiles,
        );
        if (!saveResult?.ok) {
          setLaunchFeedback({
            status: "error",
            message: "Could not save profile changes before launch.",
          });
          setIsLaunching(false);
          launchFeedbackTimeoutRef.current = window.setTimeout(() => {
            setLaunchFeedback({
              status: "idle",
              message: "",
            });
            launchFeedbackTimeoutRef.current = null;
          }, 7000);
          return;
        }
      }

      const launchResult = await window.electron.launchProfile(
        currentProfile.id,
      );
      const launchedApps = Number(launchResult?.launchedAppCount || 0);
      const launchedTabs = Number(launchResult?.launchedTabCount || 0);
      const failedCount = Array.isArray(launchResult?.failedApps)
        ? launchResult.failedApps.length
        : 0;
      const skippedCount = Array.isArray(launchResult?.skippedApps)
        ? launchResult.skippedApps.length
        : 0;

      if (launchResult?.ok) {
        const summaryParts = [
          `${launchedApps} app${launchedApps === 1 ? "" : "s"}`,
          `${launchedTabs} tab${launchedTabs === 1 ? "" : "s"}`,
        ];
        if (failedCount > 0) summaryParts.push(`${failedCount} failed`);
        if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
        setLaunchFeedback({
          status: "success",
          message: `Launch complete: ${summaryParts.join(", ")}.`,
        });
      } else {
        const errorMessage = launchResult?.error
          || "Could not launch this profile. Check app executable paths in app details.";
        setLaunchFeedback({
          status: "error",
          message: errorMessage,
        });
        console.error(
          "Profile launch completed with errors:",
          launchResult?.error || launchResult?.failedApps || [],
        );
      }
    } catch (error) {
      console.error("Failed to launch profile:", error);
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : "Launch failed unexpectedly. Please try again.";
      setLaunchFeedback({
        status: "error",
        message: errorMessage,
      });
    } finally {
      setIsLaunching(false);
      launchFeedbackTimeoutRef.current = window.setTimeout(() => {
        setLaunchFeedback({
          status: "idle",
          message: "",
        });
        launchFeedbackTimeoutRef.current = null;
      }, 7000);
    }
  };

  const handleDragStart = () => {
    if (!isEditMode) {
      setIsEditMode(true);
    }
  };

  const updateProfile = (profileId: string, updates: any) => {
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === profileId
          ? { ...profile, ...updates }
          : profile,
      ),
    );
  };

  const updateApp = (
    profileId: string,
    monitorId: string,
    appIndex: number,
    updates: any,
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        return {
          ...profile,
          monitors: profile.monitors.map((monitor) => {
            if (monitor.id !== monitorId) return monitor;

            return {
              ...monitor,
              apps: monitor.apps.map((app: any, index: number) =>
                index === appIndex
                  ? { ...app, ...updates }
                  : app,
              ),
            };
          }),
        };
      }),
    );
  };

  // CRITICAL: Clean displacement function with better error handling
  const updateAppsWithDisplacement = (
    profileId: string,
    monitorId: string,
    draggedAppIndex: number,
    draggedAppUpdates: any,
    conflictingAppIndex: number,
    conflictingAppUpdates: any,
  ) => {
    console.log("🔄 DISPLACEMENT:", {
      monitor: monitorId,
      dragged: `[${draggedAppIndex}] -> ${draggedAppUpdates.position ? `(${draggedAppUpdates.position.x}, ${draggedAppUpdates.position.y})` : "no position"}`,
      conflicting: `[${conflictingAppIndex}] -> ${conflictingAppUpdates.position ? `(${conflictingAppUpdates.position.x}, ${conflictingAppUpdates.position.y})` : "no position"}`,
    });

    // CRITICAL: Validate parameters
    if (
      typeof draggedAppIndex !== "number" ||
      typeof conflictingAppIndex !== "number"
    ) {
      console.error(
        "❌ DISPLACEMENT FAILED: Invalid app indices",
      );
      return;
    }

    if (
      !draggedAppUpdates?.position ||
      !conflictingAppUpdates?.position
    ) {
      console.error(
        "❌ DISPLACEMENT FAILED: Missing position data",
      );
      return;
    }

    try {
      setProfiles((prev) =>
        prev.map((profile) => {
          if (profile.id !== profileId) return profile;

          return {
            ...profile,
            monitors: profile.monitors.map((monitor) => {
              if (monitor.id !== monitorId) return monitor;

              const updatedApps = monitor.apps.map(
                (app: any, index: number) => {
                  if (index === draggedAppIndex) {
                    const updated = {
                      ...app,
                      ...draggedAppUpdates,
                    };
                    console.log(
                      `✅ DRAGGED: ${app.name} -> zone at (${updated.position.x}, ${updated.position.y})`,
                    );
                    return updated;
                  }
                  if (index === conflictingAppIndex) {
                    const updated = {
                      ...app,
                      ...conflictingAppUpdates,
                    };
                    console.log(
                      `✅ DISPLACED: ${app.name} -> zone at (${updated.position.x}, ${updated.position.y})`,
                    );
                    return updated;
                  }
                  return app;
                },
              );

              return { ...monitor, apps: updatedApps };
            }),
          };
        }),
      );

      console.log("✅ DISPLACEMENT SUCCESSFUL!");
    } catch (error) {
      console.error("❌ DISPLACEMENT ERROR:", error);
    }
  };

  // NEW: Associate file with existing app
  const associateFileWithApp = (
    profileId: string,
    monitorId: string,
    appIndex: number,
    fileData: any,
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        return {
          ...profile,
          monitors: profile.monitors.map((monitor) => {
            if (monitor.id !== monitorId) return monitor;

            return {
              ...monitor,
              apps: monitor.apps.map((app: any, index: number) => {
                if (index === appIndex) {
                  const currentFiles =
                    app.associatedFiles || [];
                  return {
                    ...app,
                    associatedFiles: [
                      ...currentFiles,
                      fileData,
                    ],
                  };
                }
                return app;
              }),
            };
          }),
          fileCount: (profile.fileCount || 0) + 1,
        };
      }),
    );
  };

  const addApp = (
    profileId: string,
    monitorId: string,
    newApp: any,
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        // NEW: Generate unique instance ID for each app
        const appWithInstanceId = {
          ...newApp,
          monitorId,
          associatedFiles: newApp.associatedFiles || [],
          instanceId:
            newApp.instanceId ||
            `${newApp.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };

        console.log("➕ ADDING APP WITH INSTANCE ID:", {
          name: appWithInstanceId.name,
          instanceId: appWithInstanceId.instanceId,
          monitorId,
        });

        return {
          ...profile,
          monitors: profile.monitors.map((monitor) => {
            if (monitor.id !== monitorId) return monitor;

            return {
              ...monitor,
              apps: [...monitor.apps, appWithInstanceId],
            };
          }),
          appCount: profile.appCount + 1,
        };
      }),
    );
  };

  const addAppToMinimized = (
    profileId: string,
    newApp: any,
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        // Find primary monitor, fallback to first monitor
        const primaryMonitor =
          profile.monitors.find((m) => m.primary) ||
          profile.monitors[0];

        // NEW: Generate unique instance ID for minimized apps too
        const appWithInstanceId = {
          ...newApp,
          targetMonitor:
            newApp.targetMonitor ||
            primaryMonitor?.id ||
            "monitor-1",
          instanceId:
            newApp.instanceId ||
            `${newApp.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };

        console.log(
          "📦 ADDING TO MINIMIZED WITH INSTANCE ID:",
          {
            app: appWithInstanceId.name,
            instanceId: appWithInstanceId.instanceId,
            targetMonitor: appWithInstanceId.targetMonitor,
          },
        );

        return {
          ...profile,
          minimizedApps: [
            ...(profile.minimizedApps || []),
            appWithInstanceId,
          ],
          appCount: profile.appCount + 1,
        };
      }),
    );
  };

  const removeApp = (
    profileId: string,
    monitorId: string,
    appIndex: number,
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        return {
          ...profile,
          monitors: profile.monitors.map((monitor) => {
            if (monitor.id !== monitorId) return monitor;

            return {
              ...monitor,
              apps: monitor.apps.filter(
                (_: any, index: number) => index !== appIndex,
              ),
            };
          }),
          appCount: Math.max(0, profile.appCount - 1),
        };
      }),
    );
  };

  // Remove app from minimized apps section
  const removeMinimizedApp = (
    profileId: string,
    appIndex: number,
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        console.log("🗑️ REMOVING MINIMIZED APP:", {
          appIndex,
          appName:
            profile.minimizedApps?.[appIndex]?.name ||
            "Unknown",
        });

        return {
          ...profile,
          minimizedApps: (profile.minimizedApps || []).filter(
            (_, index) => index !== appIndex,
          ),
          appCount: Math.max(0, profile.appCount - 1),
        };
      }),
    );
  };

  // Move app from monitor to minimized apps
  const moveAppToMinimized = (
    profileId: string,
    monitorId: string,
    appIndex: number,
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        const monitor = profile.monitors.find(
          (m) => m.id === monitorId,
        );
        if (!monitor || !monitor.apps[appIndex]) return profile;

        const appToMove = monitor.apps[appIndex];

        // Check if this is a browser app
        const isBrowser =
          appToMove.name.toLowerCase().includes("chrome") ||
          appToMove.name.toLowerCase().includes("browser") ||
          appToMove.name.toLowerCase().includes("firefox") ||
          appToMove.name.toLowerCase().includes("safari") ||
          appToMove.name.toLowerCase().includes("edge");

        // Collect associated browser tabs if this is a browser
        let associatedTabs: {
          name: string;
          url: string;
          isActive: boolean;
        }[] = [];
        let updatedBrowserTabs = profile.browserTabs || [];

        if (isBrowser) {
          // NEW: Find tabs associated with this SPECIFIC browser instance
          const relatedTabs = updatedBrowserTabs.filter(
            (tab) =>
              tab.monitorId === monitorId &&
              tab.browser === appToMove.name &&
              tab.appInstanceId === appToMove.instanceId, // Match specific instance
          );

          // Convert to minimized app format
          associatedTabs = relatedTabs.map((tab) => ({
            name: tab.name,
            url: tab.url,
            isActive: tab.isActive || false,
          }));

          // Remove these tabs from the main browserTabs array since they're now part of minimized app
          updatedBrowserTabs = updatedBrowserTabs.filter(
            (tab) =>
              !(
                tab.monitorId === monitorId &&
                tab.browser === appToMove.name &&
                tab.appInstanceId === appToMove.instanceId
              ),
          );

          console.log(
            "🌐 MOVING BROWSER TABS TO MINIMIZED (INSTANCE-SPECIFIC):",
            {
              browser: appToMove.name,
              instanceId: appToMove.instanceId,
              tabCount: associatedTabs.length,
              tabs: associatedTabs.map((t) => t.name),
            },
          );
        }

        // IMPORTANT: Remember the source monitor, not the primary monitor
        const minimizedApp: any = {
          name: appToMove.name,
          icon: appToMove.icon,
          iconPath: (appToMove as any).iconPath ?? null,
          executablePath: (appToMove as any).executablePath ?? null,
          shortcutPath: (appToMove as any).shortcutPath ?? null,
          launchUrl: (appToMove as any).launchUrl ?? null,
          color: appToMove.color,
          volume: appToMove.volume || 0,
          launchBehavior: "minimize" as const,
          targetMonitor: monitorId, // Remember the actual source monitor
          sourcePosition: appToMove.position, // Remember the original position
          sourceSize: appToMove.size, // Remember the original size
          browserTabs:
            associatedTabs.length > 0
              ? associatedTabs
              : undefined,
          associatedFiles: appToMove.associatedFiles || [],
          instanceId: appToMove.instanceId, // CRITICAL: Preserve instance ID for proper content association
        };

        console.log("📦 MOVING TO MINIMIZED:", {
          app: appToMove.name,
          from: monitorId,
          to: "minimized",
          targetMonitor: minimizedApp.targetMonitor,
          rememberedPosition: minimizedApp.sourcePosition,
          browserTabs: associatedTabs.length,
        });

        return {
          ...profile,
          browserTabs: updatedBrowserTabs,
          tabCount: updatedBrowserTabs.length,
          // Remove from monitor
          monitors: profile.monitors.map((monitor) => {
            if (monitor.id !== monitorId) return monitor;

            return {
              ...monitor,
              apps: monitor.apps.filter(
                (_: any, index: number) => index !== appIndex,
              ),
            };
          }),
          // Add to minimized apps with source monitor memory
          minimizedApps: [
            ...(profile.minimizedApps || []),
            minimizedApp,
          ],
        };
      }),
    );

    // Update selected app if it was the one being moved
    if (
      selectedApp &&
      selectedApp.source === "monitor" &&
      selectedApp.monitorId === monitorId &&
      selectedApp.appIndex === appIndex
    ) {
      const updatedProfile = profiles.find(
        (p) => p.id === profileId,
      );
      if (updatedProfile) {
        const newMinimizedAppIndex = (
          updatedProfile.minimizedApps || []
        ).length;

        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                source: "minimized",
                monitorId: undefined,
                appIndex: newMinimizedAppIndex,
              }
            : null,
        );
      }
    }
  };

  // NEW: Move app between monitors
  const moveAppBetweenMonitors = (
    profileId: string,
    sourceMonitorId: string,
    appIndex: number,
    targetMonitorId: string,
    newPosition?: { x: number; y: number },
    newSize?: { width: number; height: number },
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        const sourceMonitor = profile.monitors.find(
          (m) => m.id === sourceMonitorId,
        );
        if (!sourceMonitor || !sourceMonitor.apps[appIndex])
          return profile;

        const appToMove = sourceMonitor.apps[appIndex];

        console.log("🔄 MOVING BETWEEN MONITORS:", {
          app: appToMove.name,
          from: sourceMonitorId,
          to: targetMonitorId,
          newPosition,
          newSize,
        });

        // Check if this is a browser app
        const isBrowser =
          appToMove.name.toLowerCase().includes("chrome") ||
          appToMove.name.toLowerCase().includes("browser") ||
          appToMove.name.toLowerCase().includes("firefox") ||
          appToMove.name.toLowerCase().includes("safari") ||
          appToMove.name.toLowerCase().includes("edge");

        // Create app object for target monitor
        const movedApp = {
          ...appToMove,
          monitorId: targetMonitorId,
          position: newPosition || { x: 50, y: 50 }, // Default center position
          size: newSize || appToMove.size, // Keep original size unless specified
          instanceId: appToMove.instanceId, // NEW: Preserve instance ID when moving
        };

        // Update browser tabs if this is a browser app
        let updatedBrowserTabs = profile.browserTabs || [];
        if (isBrowser) {
          updatedBrowserTabs = updatedBrowserTabs.map((tab) => {
            // NEW: Match by instance ID for precise tab association
            if (
              tab.monitorId === sourceMonitorId &&
              tab.browser === appToMove.name &&
              tab.appInstanceId === appToMove.instanceId
            ) {
              console.log(
                "🌐 UPDATING BROWSER TAB MONITOR (INSTANCE-SPECIFIC):",
                {
                  tab: tab.name,
                  instanceId: appToMove.instanceId,
                  from: sourceMonitorId,
                  to: targetMonitorId,
                },
              );
              return { ...tab, monitorId: targetMonitorId };
            }
            return tab;
          });
        }

        return {
          ...profile,
          browserTabs: updatedBrowserTabs,
          monitors: profile.monitors.map((monitor) => {
            if (monitor.id === sourceMonitorId) {
              // Remove from source monitor
              return {
                ...monitor,
                apps: monitor.apps.filter(
                  (_: any, index: number) => index !== appIndex,
                ),
              };
            } else if (monitor.id === targetMonitorId) {
              // Add to target monitor
              return {
                ...monitor,
                apps: [...monitor.apps, movedApp],
              };
            }
            return monitor;
          }),
        };
      }),
    );
  };

  // NEW: Move app from minimized to specific monitor
  const moveMinimizedAppToMonitor = (
    profileId: string,
    appIndex: number,
    targetMonitorId?: string,
    newPosition?: { x: number; y: number },
    newSize?: { width: number; height: number },
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        const minimizedApp = profile.minimizedApps?.[appIndex];
        if (!minimizedApp) return profile;

        // Use remembered target monitor if no specific target is provided
        const finalTargetMonitorId =
          targetMonitorId ||
          minimizedApp.targetMonitor ||
          "monitor-1";

        console.log("📦 MOVING FROM MINIMIZED TO MONITOR:", {
          app: minimizedApp.name,
          from: "minimized",
          to: finalTargetMonitorId,
          rememberedMonitor: minimizedApp.targetMonitor,
          rememberedPosition: minimizedApp.sourcePosition,
          rememberedSize: minimizedApp.sourceSize,
          browserTabs: minimizedApp.browserTabs?.length || 0,
        });

        // Handle browser tabs restoration
        let updatedBrowserTabs = profile.browserTabs || [];
        if (
          minimizedApp.browserTabs &&
          minimizedApp.browserTabs.length > 0
        ) {
          // Convert minimized app tabs back to main browserTabs format with instance ID
          const restoredTabs = minimizedApp.browserTabs.map(
            (tab: any, tabIndex: number) => ({
              name: tab.name,
              url: tab.url,
              browser: minimizedApp.name,
              newWindow: false,
              monitorId: finalTargetMonitorId,
              isActive: tab.isActive,
              appInstanceId: minimizedApp.instanceId, // NEW: Associate with specific app instance
              id: `restored-${appIndex}-${tabIndex}-${Date.now()}`,
            }),
          );

          updatedBrowserTabs = [
            ...updatedBrowserTabs,
            ...restoredTabs,
          ];

          console.log(
            "🌐 RESTORING BROWSER TABS (INSTANCE-SPECIFIC):",
            {
              browser: minimizedApp.name,
              instanceId: minimizedApp.instanceId,
              tabCount: restoredTabs.length,
              tabs: restoredTabs.map((t: any) => t.name),
            },
          );
        }

        // Create app object for target monitor, using remembered position/size if available
        const newApp: any = {
          name: minimizedApp.name,
          icon: minimizedApp.icon,
          iconPath: (minimizedApp as any).iconPath ?? null,
          executablePath: (minimizedApp as any).executablePath ?? null,
          shortcutPath: (minimizedApp as any).shortcutPath ?? null,
          launchUrl: (minimizedApp as any).launchUrl ?? null,
          color: minimizedApp.color,
          position: newPosition ||
            minimizedApp.sourcePosition || { x: 50, y: 50 },
          size: newSize ||
            minimizedApp.sourceSize || {
              width: 60,
              height: 60,
            },
          volume: minimizedApp.volume || 50,
          launchBehavior: "new" as const,
          runAsAdmin: false,
          forceCloseOnExit: false,
          smartSave: false,
          monitorId: finalTargetMonitorId,
          associatedFiles: minimizedApp.associatedFiles || [],
          instanceId: minimizedApp.instanceId, // NEW: Preserve instance ID when restoring
        };

        return {
          ...profile,
          browserTabs: updatedBrowserTabs,
          tabCount: updatedBrowserTabs.length,
          // Remove from minimized apps
          minimizedApps: (profile.minimizedApps || []).filter(
            (_, index) => index !== appIndex,
          ),
          // Add to target monitor
          monitors: profile.monitors.map((monitor) => {
            if (monitor.id === finalTargetMonitorId) {
              return {
                ...monitor,
                apps: [...monitor.apps, newApp],
              };
            }
            return monitor;
          }),
        };
      }),
    );

    // Update selected app if it was the one being moved
    if (
      selectedApp &&
      selectedApp.source === "minimized" &&
      selectedApp.appIndex === appIndex
    ) {
      const updatedProfile = profiles.find(
        (p) => p.id === profileId,
      );
      if (updatedProfile) {
        const targetMonitor = updatedProfile.monitors.find(
          (m) =>
            m.id ===
            (targetMonitorId ||
              (updatedProfile.minimizedApps?.[appIndex]?.targetMonitor) ||
              "monitor-1"),
        );
        const newAppIndex = targetMonitor
          ? targetMonitor.apps.length
          : 0;

        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                source: "monitor",
                monitorId:
                  targetMonitorId ||
                  (updatedProfile.minimizedApps?.[appIndex]?.targetMonitor) ||
                  "monitor-1",
                appIndex: newAppIndex,
              }
            : null,
        );
      }
    }
  };

  const updateMonitorLayout = (
    profileId: string,
    monitorId: string,
    layout: string | null,
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        return {
          ...profile,
          monitors: profile.monitors.map((monitor) => {
            if (monitor.id !== monitorId) return monitor;

            return {
              ...monitor,
              predefinedLayout: layout,
            };
          }),
        };
      }),
    );
  };

  const updateMonitorPositions = (
    profileId: string,
    positions: Array<{ id: string; layoutPosition: { x: number; y: number } }>,
  ) => {
    const positionMap = new Map(
      positions.map((position) => [position.id, position.layoutPosition]),
    );

    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        return {
          ...profile,
          monitors: profile.monitors.map((monitor) => {
            const nextPosition = positionMap.get(monitor.id);
            if (!nextPosition) return monitor;
            return {
              ...monitor,
              layoutPosition: nextPosition,
            };
          }),
        };
      }),
    );
  };

  const updateBrowserTabs = (
    profileId: string,
    tabs: any[],
  ) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        return {
          ...profile,
          browserTabs: tabs,
          tabCount: tabs.length,
        };
      }),
    );

    // Update selected app if it's a browser app that was affected
    if (
      selectedApp &&
      selectedApp.data &&
      selectedApp.source === "monitor" &&
      selectedApp.monitorId
    ) {
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

      if (isBrowser) {
        // NEW: Use instance ID for precise matching
        const relatedTabs = tabs.filter(
          (tab) =>
            tab.monitorId === selectedApp.monitorId &&
            tab.browser === selectedApp.data.name &&
            tab.appInstanceId === selectedApp.data.instanceId,
        );

        setSelectedApp((prev) =>
          prev
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  browserTabs: relatedTabs.map((tab) => ({
                    name: tab.name,
                    url: tab.url,
                    isActive: tab.isActive || false,
                  })),
                },
              }
            : null,
        );
      }
    }
  };

  const addBrowserTab = (profileId: string, tab: any) => {
    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== profileId) return profile;

        const newTabs = [...(profile.browserTabs || []), tab];

        return {
          ...profile,
          browserTabs: newTabs,
          tabCount: newTabs.length,
        };
      }),
    );

    // Update selected app if it's the browser that got the new tab
    if (
      selectedApp &&
      selectedApp.data &&
      selectedApp.source === "monitor" &&
      selectedApp.monitorId === tab.monitorId
    ) {
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

      // NEW: Match both browser name AND instance ID
      if (
        isBrowser &&
        selectedApp.data.name === tab.browser &&
        selectedApp.data.instanceId === tab.appInstanceId
      ) {
        const updatedProfile = profiles.find(
          (p) => p.id === profileId,
        );
        if (updatedProfile) {
          const relatedTabs = [
            ...(updatedProfile.browserTabs || []),
            tab,
          ].filter(
            (t) =>
              t.monitorId === selectedApp.monitorId &&
              t.browser === selectedApp.data.name &&
              t.appInstanceId === selectedApp.data.instanceId,
          );

          setSelectedApp((prev) =>
            prev
              ? {
                  ...prev,
                  data: {
                    ...prev.data,
                    browserTabs: relatedTabs.map((t) => ({
                      name: t.name,
                      url: t.url,
                      isActive: t.isActive || false,
                    })),
                  },
                }
              : null,
          );
        }
      }
    }
  };

  const handleAutoSnapApps = useCallback(
    (
      monitorId: string,
      appUpdates: {
        appIndex: number;
        position: { x: number; y: number };
        size: { width: number; height: number };
      }[],
    ) => {
      if (!currentProfile) return;

      console.log("🎯 AUTO-SNAP APPS BATCH UPDATE:", {
        monitorId,
        updatesCount: appUpdates.length,
      });

      setProfiles((prev) =>
        prev.map((profile) => {
          if (profile.id !== currentProfile.id) return profile;

          return {
            ...profile,
            monitors: profile.monitors.map((monitor) => {
              if (monitor.id !== monitorId) return monitor;

              const updatedApps = monitor.apps.map(
                (app: any, index: number) => {
                  const update = appUpdates.find(
                    (u) => u.appIndex === index,
                  );
                  if (update) {
                    console.log(
                      `🎯 AUTO-SNAP: ${app.name} -> zone at (${update.position.x}, ${update.position.y})`,
                    );
                    return {
                      ...app,
                      position: update.position,
                      size: update.size,
                    };
                  }
                  return app;
                },
              );

              return { ...monitor, apps: updatedApps };
            }),
          };
        }),
      );

      console.log("✅ AUTO-SNAP BATCH UPDATE COMPLETE");
    },
    [currentProfile],
  );

  const duplicateProfile = (profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const newProfile = {
      ...profile,
      id: `${profile.id}-copy-${Date.now()}`,
      name: `${profile.name} Copy`,
      description: `Copy of ${profile.description}`,
      onStartup: false,
      autoLaunchOnBoot: false,
    };

    setProfiles((prev) => [...prev, newProfile]);
  };

  const deleteProfile = (profileId: string) => {
    if (profiles.length <= 1) return;

    setProfiles((prev) =>
      prev.filter((p) => p.id !== profileId),
    );

    if (selectedProfile === profileId) {
      setSelectedProfile(
        profiles.find((p) => p.id !== profileId)?.id ||
          profiles[0].id,
      );
    }
  };

  const renameProfile = (
    profileId: string,
    newName: string,
    newDescription: string,
  ) => {
    updateProfile(profileId, {
      name: newName,
      description: newDescription,
    });
  };

  const setOnStartupProfile = (profileId: string) => {
    setProfiles((prev) =>
      prev.map((profile) => ({
        ...profile,
        onStartup: profile.id === profileId,
      })),
    );
  };

  const exportProfile = (profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const dataStr = JSON.stringify(profile, null, 2);
    const dataUri =
      "data:application/json;charset=utf-8," +
      encodeURIComponent(dataStr);

    const exportFileDefaultName = `${profile.name.toLowerCase().replace(/\s+/g, "-")}-profile.json`;

    const linkElement = document.createElement("a");
    linkElement.setAttribute("href", dataUri);
    linkElement.setAttribute("download", exportFileDefaultName);
    linkElement.click();
  };

  const importProfile = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedProfile = JSON.parse(
          e.target?.result as string,
        );
        importedProfile.id = `imported-${Date.now()}`;
        importedProfile.onStartup = false;
        importedProfile.autoLaunchOnBoot = false;
        setProfiles((prev) => [...prev, importedProfile]);
      } catch (error) {
        console.error("Failed to import profile:", error);
      }
    };
    reader.readAsText(file);
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
                  </div>
                  {launchFeedback.status !== "idle" && (
                    <div
                      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                        launchFeedback.status === "success"
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                          : launchFeedback.status === "error"
                            ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                            : "border-flow-border-accent bg-flow-surface-elevated text-flow-text-secondary"
                      }`}
                    >
                      {launchFeedback.status === "success" ? (
                        <Check className="w-3.5 h-3.5" />
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