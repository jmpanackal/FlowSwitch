import type { MouseEvent as ReactMouseEvent } from "react";

export const MONITOR_RESIZE_MIN_PCT = 15;
export const MONITOR_RESIZE_MAX_PCT = 90;

export type MonitorTileSize = { width: number; height: number };

/**
 * Percent-based resize for tiles inside `.monitor-container` (used by AppWindow / AppFileWindow).
 * Registers document-level mousemove/mouseup until the gesture ends.
 */
export function startMonitorPercentResize(
  e: ReactMouseEvent,
  direction: string,
  startSize: MonitorTileSize,
  onResize: (newSize: MonitorTileSize) => void,
  onEnd?: () => void,
): void {
  const startX = e.clientX;
  const startY = e.clientY;
  const base = { ...startSize };

  const handleMouseMove = (ev: MouseEvent) => {
    const deltaX = ev.clientX - startX;
    const deltaY = ev.clientY - startY;

    const parentRect = (ev.target as HTMLElement)
      .closest(".monitor-container")
      ?.getBoundingClientRect();
    if (!parentRect) return;

    const percentX = (deltaX / parentRect.width) * 100;
    const percentY = (deltaY / parentRect.height) * 100;

    const newSize = { ...base };

    if (direction.includes("right")) {
      newSize.width = Math.max(
        MONITOR_RESIZE_MIN_PCT,
        Math.min(MONITOR_RESIZE_MAX_PCT, base.width + percentX),
      );
    }
    if (direction.includes("bottom")) {
      newSize.height = Math.max(
        MONITOR_RESIZE_MIN_PCT,
        Math.min(MONITOR_RESIZE_MAX_PCT, base.height + percentY),
      );
    }

    onResize(newSize);
  };

  const handleMouseUp = () => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    onEnd?.();
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}
