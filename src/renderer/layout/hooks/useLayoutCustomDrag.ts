import {
  useCallback,
  useRef,
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
import { createDragFrameScheduler } from "../utils/dragFrameScheduler";
import { createLayoutDragMoveEvent } from "../utils/layoutDragMoveEvents";
import { resolveDropTargetFromEventStack } from "../utils/layoutHitTesting";
import type { ContentFolder } from "../components/ContentManager";
import type { InstalledApp } from "../../hooks/useInstalledApps";
import { resolveHostExecutableForCatalogLabel } from "../utils/catalogHostResolve";

/** Sidebar drag-drop for library folders (wired from MainLayout; uses global `contentLibrary`). */
export type LibraryFolderPlacementActions = {
  placeOnMonitor: (
    monitorId: string,
    folder: ContentFolder,
    preferredPlacement?: {
      position: { x: number; y: number };
      size: { width: number; height: number };
    },
  ) => void;
  placeOnMinimized: (folder: ContentFolder) => void;
};

export type ProfileLayoutDragActions = {
  updateApp: (
    profileId: string,
    monitorId: string,
    appIndex: number,
    updates: {
      position?: { x: number; y: number };
      size?: { width: number; height: number };
    },
  ) => void;
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
    targetMonitorId?: string,
  ) => void;
  updateMinimizedAppTargetMonitor: (
    profileId: string,
    appIndex: number,
    targetMonitorId: string,
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
  libraryFolderPlacementRef?: MutableRefObject<LibraryFolderPlacementActions | null>;
  installedAppsCatalogRef?: MutableRefObject<InstalledApp[] | null>;
};

function resolveInstalledCatalogIconPath(
  catalog: InstalledApp[] | null | undefined,
  appName: string,
): string | null {
  if (!catalog?.length || !appName.trim()) return null;
  const t = appName.trim();
  const tl = t.toLowerCase();
  const byExact = catalog.find((a) => a.name.trim().toLowerCase() === tl);
  if (byExact?.iconPath) return byExact.iconPath;
  const byPartial = catalog.find((a) => {
    const al = a.name.trim().toLowerCase();
    return al.includes(tl) || tl.includes(al);
  });
  return byPartial?.iconPath ?? null;
}

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
  libraryFolderPlacementRef,
  installedAppsCatalogRef,
}: UseLayoutCustomDragOptions) {
  const dragMoveFrameRef = useRef(
    createDragFrameScheduler<{ x: number; y: number }>((position) => {
      setDragState((prev) => ({
        ...prev,
        currentPosition: position,
      }));
    }),
  );

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
        updateApp,
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
      if (
        dragData.type === "app"
        && dragData.source === "monitor"
        && sourceMonitorId === targetMonitorId
      ) {
        return;
      }
      const isSidebarContentLikeDrop =
        dragData.source === "sidebar"
        && (
          dragData.type === "content"
          || dragData.type === "file"
          || dragData.type === "libraryFolder"
        );
      const isIncomingApp =
        isSidebarContentLikeDrop
        || (
          dragData.type === "app"
          && (dragData.source === "sidebar"
            || dragData.source === "minimized"
            || (dragData.source === "monitor" && sourceMonitorId && sourceMonitorId !== targetMonitorId))
        );
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
        if (dragData.type === "libraryFolder" && dragData.folder) {
          const place = libraryFolderPlacementRef?.current;
          if (
            place
            && currentProfile.monitors?.some((m: { id: string }) => m.id === targetMonitorId)
          ) {
            place.placeOnMonitor(
              targetMonitorId,
              dragData.folder as ContentFolder,
              {
                position,
                size: snappedSize,
              },
            );
          }
          return;
        }
        if (dragData.type === "content" || dragData.type === "file") {
          console.log(
            "🚀 CREATING NEW APP INSTANCE FOR CONTENT/FILE:",
            dragData,
          );

          const defaultAppLabel = (
            dragData.defaultApp
            || dragData.associatedApp
            || "File Viewer"
          );
          const catalogSnap = installedAppsCatalogRef?.current;
          const resolvedIconPath = resolveInstalledCatalogIconPath(
            catalogSnap,
            defaultAppLabel,
          );
          const hostExe = resolveHostExecutableForCatalogLabel(
            catalogSnap,
            defaultAppLabel,
          );

          if (
            dragData.contentType === "link"
            || (dragData.type === "content" && dragData.url)
          ) {
            const instanceId = `${defaultAppLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            const newApp: any = {
              instanceId,
              name: defaultAppLabel,
              icon: getBrowserIcon(defaultAppLabel),
              iconPath: resolvedIconPath,
              ...(hostExe ? { executablePath: hostExe } : {}),
              color: getBrowserColor(defaultAppLabel),
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

            addApp(currentProfile.id, targetMonitorId, newApp, mergeIntoAppIndex);

            const newTab = {
              name: dragData.name,
              url: dragData.url,
              browser: defaultAppLabel,
              newWindow: false,
              monitorId: targetMonitorId,
              isActive: true,
              appInstanceId: instanceId,
              id: `content-tab-${Date.now()}`,
            };

            addBrowserTab(currentProfile.id, newTab);
          } else {
            const newApp: any = {
              name: defaultAppLabel,
              icon: getAppIcon(defaultAppLabel),
              iconPath: resolvedIconPath,
              ...(hostExe ? { executablePath: hostExe } : {}),
              color: getAppColor(defaultAppLabel),
              position,
              size: snappedSize,
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
      } else if (
        dragData.source === "monitor"
        && dragData.sourceMonitorId === targetMonitorId
        && typeof dragData.appIndex === "number"
      ) {
        updateApp(currentProfile.id, targetMonitorId, dragData.appIndex, {
          position,
          size: snappedSize,
        });
        if (Array.isArray(dragData.stackMemberIndices)) {
          for (const idx of dragData.stackMemberIndices) {
            if (idx === dragData.appIndex) continue;
            updateApp(currentProfile.id, targetMonitorId, idx, {
              position,
              size: snappedSize,
            });
          }
        }
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
    [
      currentProfileRef,
      profileDragActionsRef,
      libraryFolderPlacementRef,
      installedAppsCatalogRef,
    ],
  );

  const handleDropOnMinimized = useCallback(
    (
      dragData: any,
      targetMonitorId: string | null,
    ) => {
      const currentProfile = currentProfileRef.current;
      const actions = profileDragActionsRef.current;
      if (!currentProfile || !actions) return;

      const {
        addAppToMinimized,
        addBrowserTab,
        moveAppToMinimized,
        updateMinimizedAppTargetMonitor,
      } = actions;

      const monitors = currentProfile.monitors || [];
      const primaryMonitorId =
        monitors.find((m) => m.primary)?.id ?? monitors[0]?.id ?? "monitor-1";
      const trimmedDropTarget = targetMonitorId?.trim() || null;
      /** Monitor id from the strip that received the drop, when `data-target-id` is valid. */
      const minimizedDropMonitorId =
        trimmedDropTarget && monitors.some((m) => m.id === trimmedDropTarget)
          ? trimmedDropTarget
          : null;

      console.log("🎯 DROP ON MINIMIZED:", dragData);

      if (dragData.source === "monitor") {
        const targetMonitor =
          minimizedDropMonitorId
          || dragData.sourceMonitorId
          || primaryMonitorId;
        moveAppToMinimized(
          currentProfile.id,
          dragData.sourceMonitorId,
          dragData.appIndex,
          targetMonitor,
        );
      } else if (
        dragData.source === "minimized" &&
        dragData.type === "app" &&
        typeof dragData.appIndex === "number"
      ) {
        const targetMonitor = minimizedDropMonitorId || primaryMonitorId;
        updateMinimizedAppTargetMonitor(
          currentProfile.id,
          dragData.appIndex,
          targetMonitor,
        );
      } else if (dragData.source === "sidebar") {
        const sidebarMinimizedMonitorId =
          minimizedDropMonitorId || primaryMonitorId;
        if (dragData.type === "libraryFolder" && dragData.folder) {
          libraryFolderPlacementRef?.current?.placeOnMinimized(
            dragData.folder as ContentFolder,
          );
          return;
        }
        if (dragData.type === "content" || dragData.type === "file") {
          console.log(
            "🚀 CREATING MINIMIZED APP INSTANCE FOR CONTENT/FILE:",
            dragData,
          );

          const defaultAppLabel = (
            dragData.defaultApp
            || dragData.associatedApp
            || "File Viewer"
          );
          const catalogSnapMin = installedAppsCatalogRef?.current;
          const resolvedIconPath = resolveInstalledCatalogIconPath(
            catalogSnapMin,
            defaultAppLabel,
          );
          const hostExeMin = resolveHostExecutableForCatalogLabel(
            catalogSnapMin,
            defaultAppLabel,
          );

          const newApp: any = {
            instanceId: `${defaultAppLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            name: defaultAppLabel,
            icon: getAppIcon(defaultAppLabel),
            iconPath: resolvedIconPath,
            ...(hostExeMin ? { executablePath: hostExeMin } : {}),
            color: getAppColor(defaultAppLabel),
            volume: 50,
            launchBehavior: "minimize" as const,
            targetMonitor: sidebarMinimizedMonitorId,
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
            targetMonitor: sidebarMinimizedMonitorId,
          };

          addAppToMinimized(currentProfile.id, newApp);
        }
      }
    },
    [
      currentProfileRef,
      profileDragActionsRef,
      libraryFolderPlacementRef,
      installedAppsCatalogRef,
    ],
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
        handleDropOnMinimized(dragData, targetId);
      }
    },
    [currentProfileRef, handleDropOnMonitor, handleDropOnMinimized],
  );

  const handleGlobalPointerOrMouseMove = useCallback((e: MouseEvent | PointerEvent) => {
    if (!dragStateRef.current.isDragging) return;
    if (e instanceof PointerEvent && !e.isPrimary) return;

    const position = { x: e.clientX, y: e.clientY };
    document.dispatchEvent(createLayoutDragMoveEvent(position));
    dragMoveFrameRef.current.schedule(position);
  }, [dragStateRef]);

  /**
   * End custom drag on mouse *or* pointer release. Sidebar rows use Pointer Events
   * with `preventDefault` on pointerdown (click-vs-drag), which suppresses the
   * compatibility mouseup sequence — pointerup still fires.
   */
  const handleGlobalDragRelease = useCallback(
    (e: MouseEvent | PointerEvent) => {
      if (e instanceof PointerEvent && !e.isPrimary) return;

      const hadActiveLayoutDrag = dragStateRef.current.isDragging;
      const currentProfile = currentProfileRef.current;

      if (hadActiveLayoutDrag) {
        dragMoveFrameRef.current.flush();
        const stack = document.elementsFromPoint(e.clientX, e.clientY);
        const dropTarget = resolveDropTargetFromEventStack(stack);

        if (
          dropTarget
          && dragStateRef.current.dragData
          && currentProfile
        ) {
          handleCustomDrop(
            dragStateRef.current.dragData,
            dropTarget.targetType,
            dropTarget.targetId,
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
      dragMoveFrameRef.current.cancel();

      // `flowswitch:dragend` may clear layout drag before this runs; still detach.
      document.removeEventListener(
        "mousemove",
        handleGlobalPointerOrMouseMove,
      );
      document.removeEventListener(
        "pointermove",
        handleGlobalPointerOrMouseMove,
      );
      document.removeEventListener(
        "mouseup",
        handleGlobalDragRelease,
      );
      document.removeEventListener(
        "pointerup",
        handleGlobalDragRelease,
      );
      document.removeEventListener(
        "pointercancel",
        handleGlobalDragRelease,
      );
      restoreDocumentTextSelection();
      document.body.style.cursor = "";
    },
    [
      currentProfileRef,
      dragStateRef,
      handleCustomDrop,
      handleGlobalPointerOrMouseMove,
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
      dragMoveFrameRef.current.cancel();
      document.dispatchEvent(createLayoutDragMoveEvent(startPos));

      document.addEventListener(
        "mousemove",
        handleGlobalPointerOrMouseMove,
      );
      document.addEventListener(
        "pointermove",
        handleGlobalPointerOrMouseMove,
      );
      document.addEventListener("mouseup", handleGlobalDragRelease);
      document.addEventListener("pointerup", handleGlobalDragRelease);
      document.addEventListener("pointercancel", handleGlobalDragRelease);
      suspendDocumentTextSelection();
      document.body.style.cursor = "grabbing";
    },
    [
      handleGlobalPointerOrMouseMove,
      handleGlobalDragRelease,
      isEditModeRef,
      setDragState,
      setIsEditMode,
    ],
  );

  return { handleCustomDragStart };
}
