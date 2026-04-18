import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { DragState } from "../types/dragTypes";

/**
 * Bridges native HTML5 / custom `flowswitch:*` drag events into the layout drag state machine
 * so monitor-native app drags participate in the same overlay as in-editor drags.
 */
export function useNativeAppDragBridge(options: {
  dragStateRef: MutableRefObject<DragState>;
  setDragState: Dispatch<SetStateAction<DragState>>;
  setIsEditMode: Dispatch<SetStateAction<boolean>>;
  isEditMode: boolean;
}) {
  const { dragStateRef, setDragState, setIsEditMode, isEditMode } = options;

  useEffect(() => {
    const handleNativeDragStart = (event: Event) => {
      const custom = event as CustomEvent<unknown>;
      const detail = custom.detail as Record<string, unknown> | undefined;
      const nativeDragData = (detail?.dragData ?? detail) as DragState["dragData"];
      const startPos = (detail?.startPos ?? null) as { x: number; y: number } | null;

      if (!nativeDragData) return;
      if (!isEditMode) {
        setIsEditMode(true);
      }

      const data = nativeDragData as {
        type?: string;
        monitorId?: string;
        sourceMonitorId?: string;
      };
      if (data.type !== "app") return;

      const initialPos = startPos ?? { x: 0, y: 0 };
      setDragState({
        isDragging: true,
        dragData: nativeDragData,
        startPosition: initialPos,
        currentPosition: initialPos,
        sourceType: "monitor",
        sourceId: String(data.monitorId || data.sourceMonitorId || ""),
        dragPreview: null,
      });
    };

    const handleNativeDragEnd = () => {
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
  }, [isEditMode, dragStateRef, setDragState, setIsEditMode]);
}
