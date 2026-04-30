import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MINIMIZED_STRIP_DRAG_MOVE_THRESHOLD_PX,
  shouldStartMinimizedStripDragOnMove,
} from "./minimizedStripDragGesture";

describe("minimized strip drag gesture", () => {
  it("does not start drag when pointer movement is below threshold", () => {
    assert.equal(
      shouldStartMinimizedStripDragOnMove(
        MINIMIZED_STRIP_DRAG_MOVE_THRESHOLD_PX - 0.01,
      ),
      false,
    );
  });

  it("starts drag when pointer movement reaches threshold", () => {
    assert.equal(
      shouldStartMinimizedStripDragOnMove(
        MINIMIZED_STRIP_DRAG_MOVE_THRESHOLD_PX,
      ),
      true,
    );
  });

  it("ignores non-finite movement values", () => {
    assert.equal(shouldStartMinimizedStripDragOnMove(Number.NaN), false);
  });
});
