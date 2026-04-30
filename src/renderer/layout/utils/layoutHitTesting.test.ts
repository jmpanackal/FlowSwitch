import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveDropTargetFromEventStack,
  resolveHoverTargetsFromEventStack,
  type LayoutHitTestNode,
} from "./layoutHitTesting";

class MockNode implements LayoutHitTestNode {
  private attrs: Record<string, string | null>;
  private closeMap: Map<string, LayoutHitTestNode | null>;

  constructor(
    attrs: Record<string, string | null> = {},
    closeMap: Record<string, LayoutHitTestNode | null> = {},
  ) {
    this.attrs = attrs;
    this.closeMap = new Map(Object.entries(closeMap));
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  closest(selector: string): LayoutHitTestNode | null {
    return this.closeMap.get(selector) ?? null;
  }
}

describe("layout hit testing", () => {
  it("ignores dragged tile wrappers for hover and drop target resolution", () => {
    const sourceMonitor = new MockNode(
      { "data-monitor-id": "monitor-source", "data-drop-target": "monitor", "data-target-id": "monitor-source" },
    );
    const targetMonitor = new MockNode(
      { "data-monitor-id": "monitor-target", "data-drop-target": "monitor", "data-target-id": "monitor-target" },
    );
    const draggedTile = new MockNode(
      {},
      {
        '[data-layout-hit-test-ignore="true"]': sourceMonitor,
        ".monitor-container": sourceMonitor,
        '[data-drop-target]': sourceMonitor,
      },
    );
    const targetContent = new MockNode(
      {},
      {
        ".monitor-container": targetMonitor,
        '[data-drop-target]': targetMonitor,
      },
    );

    const hover = resolveHoverTargetsFromEventStack([draggedTile, targetContent]);
    const drop = resolveDropTargetFromEventStack([draggedTile, targetContent]);

    assert.equal(hover.monitorId, "monitor-target");
    assert.equal(drop?.targetType, "monitor");
    assert.equal(drop?.targetId, "monitor-target");
  });
});
