export type LayoutHitTestNode = {
  closest(selector: string): LayoutHitTestNode | null;
  getAttribute(name: string): string | null;
};

export type LayoutDropTarget = {
  targetType: string;
  targetId: string | null;
};

export type LayoutHoverTargets = {
  monitorId: string | null;
  minimizedMonitorId: string | null;
};

function isIgnoredNode(node: LayoutHitTestNode): boolean {
  return Boolean(
    node.closest('[data-app-drag-overlay="true"]')
      || node.closest('[data-layout-hit-test-ignore="true"]'),
  );
}

export function resolveDropTargetFromEventStack(
  stack: readonly LayoutHitTestNode[],
): LayoutDropTarget | null {
  for (const node of stack) {
    if (isIgnoredNode(node)) continue;
    const dropTarget = node.closest("[data-drop-target]");
    if (!dropTarget) continue;
    const targetType = dropTarget.getAttribute("data-drop-target");
    if (!targetType) continue;
    return {
      targetType,
      targetId: dropTarget.getAttribute("data-target-id"),
    };
  }
  return null;
}

export function resolveHoverTargetsFromEventStack(
  stack: readonly LayoutHitTestNode[],
): LayoutHoverTargets {
  let hoveredMinimizedMonitorId: string | null = null;

  for (const node of stack) {
    if (isIgnoredNode(node)) continue;

    const minimizedTarget = node.closest('[data-minimized-drop-target="true"]');
    if (minimizedTarget) {
      const id = minimizedTarget.getAttribute("data-target-id");
      if (id) hoveredMinimizedMonitorId = id;
    }

    const monitorContainer = node.closest(".monitor-container");
    if (monitorContainer) {
      const monitorId = monitorContainer.getAttribute("data-monitor-id");
      if (monitorId) {
        return {
          monitorId,
          minimizedMonitorId: hoveredMinimizedMonitorId,
        };
      }
    }
  }

  return {
    monitorId: null,
    minimizedMonitorId: hoveredMinimizedMonitorId,
  };
}
