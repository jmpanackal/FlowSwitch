import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { FlowProfile } from "../../../types/flow-profile";
import type { DragState, DragSourceType } from "../types/dragTypes";
import {
  getAppColor,
  getAppIcon,
  getBrowserColor,
  getBrowserIcon,
} from "../utils/layoutDropPresentation";
import {
  findAppIndexForIconStackMergeHover,
  findClosestSnapZone,
  frontIndexInStack,
  indicesOccupyingZone,
} from "../utils/monitorLayoutStacking";
import { countStackUnits, getSnapZonesForMonitor } from "../utils/monitorSnapZones";
import {
  restoreDocumentTextSelection,
  suspendDocumentTextSelection,
} from "../utils/documentTextSelection";

export type ProfileLayoutDragActions = {
  associateFileWithApp: (
    profileId: string,
    monitorId: string,
    appIndex: number,
    fileData: unknown,
  ) => void;
  addApp: (
    profileId: string,
    monitorId: string,
    newApp: unknown,
    mergeIntoAppIndex?: number,
  ) => void;
  addAppToMinimized: (profileId: string, newApp: unknown) => void;
  moveAppBetweenMonitors: (
    profileId: string,
    sourceMonitorId: string,
    appIndex: number,
    targetMonitorId: string,
    position: { x: number; y: number },
    size: { width: number; height: number },
    mergeIntoAppIndex?: number,
    stackSourceIndices?: number[],
  ) => void;
  moveMinimizedAppToMonitor: (
    profileId: string,
    appIndex: number,
    targetMonitorId: string,
    position: { x: number; y: number },
    size: { width: number; height: number },
    mergeIntoAppIndex?: number,
  ) => void;
  moveAppToMinimized: (
    profileId: string,
    sourceMonitorId: string,
    appIndex: number,
  ) => void;
  addBrowserTab: (profileId: string, tab: unknown) => void;
};

type UseLayoutCustomDragOptions = {
  dragStateRef: MutableRefObject<DragState>;
  setDragState: Dispatch<SetStateAction<DragState>>;
  setIsEditMode: Dispatch<SetStateAction<boolean>>;
  isEditModeRef: MutableRefObject<boolean>;
  currentProfileRef: MutableRefObject<FlowProfile | null>;
  profileDragActionsRef: MutableRefObject<ProfileLayoutDragActions | null>;
};

/**
 * In-editor custom drag/drop: global mouse listeners, monitor/minimized targets, and profile
 * mutations. `currentProfileRef` and `profileDragActionsRef` must be updated each render after
 * their sources are defined so handlers always see the latest profile and actions.
 */
export function useLayoutCustomDrag({
  dragStateRef,
  setDragState,
  setIsEditMode,
  isEditModeRef,
  currentProfileRef,
  profileDragActionsRef,
}: UseLayoutCustomDragOptions) {
  const handleDropOnMonitor = useCallback(
    (
      dragData: any,
      targetMonitorId: string,
      dropPosition: { x: number; y: number },
    ) => {
      const currentProfile = currentProfileRef.current;
      const actions = profileDragActionsRef.current;
      if (!currentProfile || !actions) return;

      const {
        associateFileWithApp,
        addApp,
        addBrowserTab,
        moveAppBetweenMonitors,
        moveMinimizedAppToMonitor,
      } = actions;

      const elementBelow = document.elementFromPoint(
        dropPosition.x,
        dropPosition.y,
      );
      const appTile = elementBelow?.closest(
        '[data-unified-window="true"][data-item-type="app"]',
      );

      if (
        appTile
        && (dragData.type === "file" || dragData.type === "content")
        && dragData.source === "sidebar"
      ) {
        const appMonitorId = appTile.getAttribute(
          "data-monitor-id",
        );
        const appIndex = parseInt(
          appTile.getAttribute("data-item-index") || "0",
          10,
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

          const monitor = currentProfile.monitors.find((m) => m.id === appMonitorId);
          const targetApp = monitor?.apps[appIndex];

          const isLink = dragData.contentType === "link" || (dragData.type === "content" && dragData.url);
          const isBrowserApp = targetApp && (
            targetApp.name?.toLowerCase().includes("chrome")
            || targetApp.name?.toLowerCase().includes("browser")
            || targetApp.name?.toLowerCase().includes("firefox")
            || targetApp.name?.toLowerCase().includes("safari")
            || targetApp.name?.toLowerCase().includes("edge")
          );

          if (isLink && isBrowserApp) {
            console.log("🌐 ADDING LINK AS BROWSER TAB TO EXISTING BROWSER:", {
              linkName: dragData.name,
              linkUrl: dragData.url,
              browserApp: targetApp.name,
              instanceId: targetApp.instanceId,
            });

            const newTab = {
              id: `content-tab-${Date.now()}`,
              name: dragData.name,
              url: dragData.url,
              browser: targetApp.name,
              newWindow: false,
              monitorId: appMonitorId,
              isActive: true,
              appInstanceId: targetApp.instanceId,
            };

            addBrowserTab(currentProfile.id, newTab);
          } else if (dragData.type === "content") {
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

      const monitorElement = document.querySelector(
        `[data-monitor-id="${targetMonitorId}"].monitor-container`,
      );
      if (!monitorElement) return;

      const rect = monitorElement.getBoundingClientRect();
      const relativeX = ((dropPosition.x - rect.left) / rect.width) * 100;
      const relativeY = ((dropPosition.y - rect.top) / rect.height) * 100;
      const rawPosition = {
        x: Math.max(0, Math.min(100, relativeX)),
        y: Math.max(0, Math.min(100, relativeY)),
      };

      const targetMonitor = currentProfile.monitors?.find((m: any) => m.id === targetMonitorId);
      if (!targetMonitor) return;

      const sourceMonitorId = dragData.sourceMonitorId || dragData.monitorId || null;
      const isIncomingApp = dragData.type === "app"
        && (dragData.source === "sidebar"
          || dragData.source === "minimized"
          || (dragData.source === "monitor" && sourceMonitorId && sourceMonitorId !== targetMonitorId));
      // Count **units** (stacked apps = 1 slot) so the dynamic grid reflects
      // the post-drop layout. An incoming stack still lands as a single unit
      // (it will occupy one zone), so the addend is 1 regardless of size.
      const currentUnitCount = countStackUnits(targetMonitor.apps || []);
      const prospectiveAppCount =
        currentUnitCount + (isIncomingApp ? 1 : 0);

      const zones = getSnapZonesForMonitor(targetMonitor, prospectiveAppCount);
      const activeZone =
        findClosestSnapZone(zones, rawPosition) ?? zones[0] ?? {
          id: "full",
          position: { x: 50, y: 50 },
          size: { width: 100, height: 100 },
        };

      const appsTarget = targetMonitor.apps || [];
      const selfSameMonitor =
        dragData.type === "app"
        && dragData.source === "monitor"
        && sourceMonitorId === targetMonitorId
        && typeof dragData.appIndex === "number";
      const excludeAppIndex = selfSameMonitor
        ? (dragData.appIndex as number)
        : undefined;

      // Prefer icon-ellipse merge hit (most precise visual target). Fall back
      // to zone-level occupancy: if the active snap zone already has an app,
      // stack on the front-most occupant. This mirrors the within-monitor
      // "drop on occupied zone = stack" rule so all drag paths agree.
      const iconMergeHit = findAppIndexForIconStackMergeHover(appsTarget, rawPosition, {
        excludeAppIndex,
      });
      let mergeIntoAppIndex: number | undefined =
        typeof iconMergeHit === "number" && appsTarget[iconMergeHit]
          ? iconMergeHit
          : undefined;
      if (mergeIntoAppIndex === undefined) {
        const occupants = indicesOccupyingZone(
          appsTarget,
          zones,
          activeZone,
          excludeAppIndex,
        );
        if (occupants.length > 0) {
          mergeIntoAppIndex = frontIndexInStack(occupants);
        }
      }

      let position = {
        x: activeZone.position.x,
        y: activeZone.position.y,
      };
      let snappedSize = {
        width: activeZone.size.width,
        height: activeZone.size.height,
      };
      if (mergeIntoAppIndex !== undefined) {
        const anchorApp = appsTarget[mergeIntoAppIndex]!;
        position = { x: anchorApp.position.x, y: anchorApp.position.y };
        snappedSize = { width: anchorApp.size.width, height: anchorApp.size.height };
      }

      if (dragData.source === "sidebar") {
        if (dragData.type === "content" || dragData.type === "file") {
          console.log(
            "🚀 CREATING NEW APP INSTANCE FOR CONTENT/FILE:",
            dragData,
          );

          if (
            dragData.contentType === "link"
            || (dragData.type === "content" && dragData.url)
          ) {
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

            addApp(currentProfile.id, targetMonitorId, newApp, mergeIntoAppIndex);

            const newTab = {
              name: dragData.name,
              url: dragData.url,
              browser: dragData.defaultApp,
              newWindow: false,
              monitorId: targetMonitorId,
              isActive: true,
              appInstanceId: newApp.instanceId,
              id: `content-tab-${Date.now()}`,
            };

            addBrowserTab(currentProfile.id, newTab);
          } else {
            const newApp: any = {
              name:
                dragData.defaultApp
                || dragData.associatedApp
                || "File Viewer",
              icon: getAppIcon(
                dragData.defaultApp
                  || dragData.associatedApp
                  || "File Viewer",
              ),
              color: getAppColor(
                dragData.defaultApp
                  || dragData.associatedApp
                  || "File Viewer",
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
                    dragData.defaultApp
                    || dragData.associatedApp
                    || "File Viewer",
                  useDefaultApp: true,
                },
              ],
            };

            addApp(currentProfile.id, targetMonitorId, newApp, mergeIntoAppIndex);
          }
        } else {
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
            associatedFiles: [],
          };

          addApp(
            currentProfile.id,
            targetMonitorId,
            newApp,
            mergeIntoAppIndex,
          );
        }
      } else if (
        dragData.source === "monitor"
        && dragData.sourceMonitorId !== targetMonitorId
      ) {
        moveAppBetweenMonitors(
          currentProfile.id,
          dragData.sourceMonitorId,
          dragData.appIndex,
          targetMonitorId,
          position,
          snappedSize,
          mergeIntoAppIndex,
          Array.isArray(dragData.stackMemberIndices) && dragData.stackMemberIndices.length > 1
            ? dragData.stackMemberIndices
            : undefined,
        );
      } else if (dragData.source === "minimized") {
        moveMinimizedAppToMonitor(
          currentProfile.id,
          dragData.appIndex,
          targetMonitorId,
          position,
          snappedSize,
          mergeIntoAppIndex,
        );
      }
    },
    [currentProfileRef, profileDragActionsRef],
  );

  const handleDropOnMinimized = useCallback(
    (dragData: any) => {
      const currentProfile = currentProfileRef.current;
      const actions = profileDragActionsRef.current;
      if (!currentProfile || !actions) return;

      const {
        addAppToMinimized,
        addBrowserTab,
        moveAppToMinimized,
      } = actions;

      console.log("🎯 DROP ON MINIMIZED:", dragData);

      if (dragData.source === "monitor") {
        moveAppToMinimized(
          currentProfile.id,
          dragData.sourceMonitorId,
          dragData.appIndex,
        );
      } else if (dragData.source === "sidebar") {
        if (dragData.type === "content" || dragData.type === "file") {
          console.log(
            "🚀 CREATING MINIMIZED APP INSTANCE FOR CONTENT/FILE:",
            dragData,
          );

          const newApp: any = {
            name:
              dragData.defaultApp
              || dragData.associatedApp
              || "File Viewer",
            icon: getAppIcon(
              dragData.defaultApp
                || dragData.associatedApp
                || "File Viewer",
            ),
            color: getAppColor(
              dragData.defaultApp
                || dragData.associatedApp
                || "File Viewer",
            ),
            volume: 50,
            launchBehavior: "minimize" as const,
            targetMonitor:
              currentProfile.monitors.find((m) => m.primary)
                ?.id || "monitor-1",
            associatedFiles:
              dragData.contentType === "file" || dragData.type === "file"
                ? [
                    {
                      id: `content-file-${Date.now()}`,
                      name: dragData.name,
                      path: dragData.path,
                      type: dragData.fileType || dragData.type,
                      associatedApp:
                        dragData.defaultApp
                        || dragData.associatedApp
                        || "File Viewer",
                      useDefaultApp: true,
                    },
                  ]
                : [],
          };

          addAppToMinimized(currentProfile.id, newApp);

          if (
            dragData.contentType === "link"
            || (dragData.type === "content" && dragData.url)
          ) {
            const newTab = {
              name: dragData.name,
              url: dragData.url,
              browser: dragData.defaultApp,
              newWindow: false,
              monitorId: newApp.targetMonitor,
              isActive: true,
              appInstanceId: newApp.instanceId,
              id: `content-tab-${Date.now()}`,
            };

            addBrowserTab(currentProfile.id, newTab);
          }
        } else {
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
    [currentProfileRef, profileDragActionsRef],
  );

  const handleCustomDrop = useCallback(
    (
      dragData: any,
      targetType: string | null,
      targetId: string | null,
      dropPosition: { x: number; y: number },
    ) => {
      const currentProfile = currentProfileRef.current;
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
    [currentProfileRef, handleDropOnMonitor, handleDropOnMinimized],
  );

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;

    setDragState((prev) => ({
      ...prev,
      currentPosition: { x: e.clientX, y: e.clientY },
    }));
  }, [dragStateRef, setDragState]);

  const handleGlobalMouseUp = useCallback(
    (e: MouseEvent) => {
      const hadActiveLayoutDrag = dragStateRef.current.isDragging;
      const currentProfile = currentProfileRef.current;

      if (hadActiveLayoutDrag) {
        const elementBelow = document.elementFromPoint(
          e.clientX,
          e.clientY,
        );
        const dropTarget = elementBelow?.closest(
          "[data-drop-target]",
        );

        if (
          dropTarget
          && dragStateRef.current.dragData
          && currentProfile
        ) {
          const targetType = dropTarget.getAttribute(
            "data-drop-target",
          );
          const targetId = dropTarget.getAttribute("data-target-id");

          handleCustomDrop(
            dragStateRef.current.dragData,
            targetType,
            targetId,
            { x: e.clientX, y: e.clientY },
          );
        }

        setDragState({
          isDragging: false,
          dragData: null,
          startPosition: { x: 0, y: 0 },
          currentPosition: { x: 0, y: 0 },
          sourceType: null,
          sourceId: null,
          dragPreview: null,
        });

        queueMicrotask(() => {
          document.dispatchEvent(
            new CustomEvent("flowswitch:clear-monitor-layout-local-drag"),
          );
        });
      }

      // `flowswitch:dragend` may clear layout drag before this `mouseup` runs; still
      // detach so we never leave orphaned document listeners.
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
    [
      currentProfileRef,
      dragStateRef,
      handleCustomDrop,
      handleGlobalMouseMove,
      setDragState,
    ],
  );

  const handleCustomDragStart = useCallback(
    (
      data: any,
      sourceType: DragSourceType,
      sourceId: string,
      startPos: { x: number; y: number },
      preview?: ReactNode,
    ) => {
      console.log("🎯 CUSTOM DRAG START:", {
        data,
        sourceType,
        sourceId,
        startPos,
      });

      if (!isEditModeRef.current) {
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

      document.addEventListener(
        "mousemove",
        handleGlobalMouseMove,
      );
      document.addEventListener("mouseup", handleGlobalMouseUp);
      suspendDocumentTextSelection();
      document.body.style.cursor = "grabbing";
    },
    [
      handleGlobalMouseMove,
      handleGlobalMouseUp,
      isEditModeRef,
      setDragState,
      setIsEditMode,
    ],
  );

  return { handleCustomDragStart };
}
