export const FLOW_LAYOUT_DRAG_MOVE_EVENT = "flowswitch:layout-drag-move";

export type LayoutDragMovePosition = {
  x: number;
  y: number;
};

export function createLayoutDragMoveEvent(position: LayoutDragMovePosition) {
  if (typeof CustomEvent === "function") {
    return new CustomEvent<LayoutDragMovePosition>(FLOW_LAYOUT_DRAG_MOVE_EVENT, {
      detail: position,
    });
  }

  const event = new Event(FLOW_LAYOUT_DRAG_MOVE_EVENT) as CustomEvent<LayoutDragMovePosition>;
  Object.defineProperty(event, "detail", {
    value: position,
    enumerable: true,
  });
  return event;
}

export function isLayoutDragMoveEvent(
  event: Event,
): event is CustomEvent<LayoutDragMovePosition> {
  if (event.type !== FLOW_LAYOUT_DRAG_MOVE_EVENT) return false;
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object") return false;
  const position = detail as Partial<LayoutDragMovePosition>;
  return (
    typeof position.x === "number" &&
    Number.isFinite(position.x) &&
    typeof position.y === "number" &&
    Number.isFinite(position.y)
  );
}
