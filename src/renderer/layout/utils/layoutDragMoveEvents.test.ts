import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FLOW_LAYOUT_DRAG_MOVE_EVENT,
  createLayoutDragMoveEvent,
  isLayoutDragMoveEvent,
} from "./layoutDragMoveEvents";

describe("layout drag move events", () => {
  it("carries raw viewport pointer coordinates for immediate drag followers", () => {
    const event = createLayoutDragMoveEvent({ x: 128, y: 256 });

    assert.equal(event.type, FLOW_LAYOUT_DRAG_MOVE_EVENT);
    assert.deepEqual(event.detail, { x: 128, y: 256 });
    assert.equal(isLayoutDragMoveEvent(event), true);
    assert.equal(isLayoutDragMoveEvent(new Event("other")), false);
  });

  it("rejects malformed events on the drag move channel", () => {
    const missingDetail = new Event(FLOW_LAYOUT_DRAG_MOVE_EVENT);
    const nonFiniteDetail = new Event(FLOW_LAYOUT_DRAG_MOVE_EVENT);
    Object.defineProperty(nonFiniteDetail, "detail", {
      value: { x: Number.NaN, y: 10 },
    });

    assert.equal(isLayoutDragMoveEvent(missingDetail), false);
    assert.equal(isLayoutDragMoveEvent(nonFiniteDetail), false);
  });
});
