import {
  useCallback,
  type ChangeEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { FlowProfile } from "../../../types/flow-profile";
import type { ProfileLayoutDragActions } from "./useLayoutCustomDrag";

/** Selection state for the right-hand inspector (mirrors prior MainLayout inline type). */
export type MainLayoutSelectedApp = {
  type: "app" | "browser";
  source: "monitor" | "minimized" | "sidebar";
  monitorId?: string;
  appIndex?: number;
  data: any;
};

export type UseMainLayoutProfileMutationsArgs = {
  profiles: FlowProfile[];
  setProfiles: Dispatch<SetStateAction<FlowProfile[]>>;
  selectedProfile: string;
  setSelectedProfile: Dispatch<SetStateAction<string>>;
  selectedApp: MainLayoutSelectedApp | null;
  setSelectedApp: Dispatch<SetStateAction<MainLayoutSelectedApp | null>>;
  currentProfile: FlowProfile | null;
  profileDragActionsRef: MutableRefObject<ProfileLayoutDragActions | null>;
};

export function useMainLayoutProfileMutations({
  profiles,
  setProfiles,
  selectedProfile,
  setSelectedProfile,
  selectedApp,
  setSelectedApp,
  currentProfile,
  profileDragActionsRef,
}: UseMainLayoutProfileMutationsArgs) {
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

  profileDragActionsRef.current = {
    associateFileWithApp,
    addApp,
    addAppToMinimized,
    moveAppToMinimized,
    moveAppBetweenMonitors,
    moveMinimizedAppToMonitor,
    addBrowserTab,
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
    event: ChangeEvent<HTMLInputElement>,
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
  return {
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
  };
}
