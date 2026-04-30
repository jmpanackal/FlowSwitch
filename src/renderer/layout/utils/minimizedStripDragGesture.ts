export const MINIMIZED_STRIP_DRAG_MOVE_THRESHOLD_PX = 6;

export function shouldStartMinimizedStripDragOnMove(distancePx: number): boolean {
  return Number.isFinite(distancePx) && distancePx >= MINIMIZED_STRIP_DRAG_MOVE_THRESHOLD_PX;
}
