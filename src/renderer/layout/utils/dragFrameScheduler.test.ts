import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDragFrameScheduler } from "./dragFrameScheduler";

describe("createDragFrameScheduler", () => {
  it("coalesces multiple drag samples into the latest animation frame value", () => {
    const delivered: number[] = [];
    const frames: Array<() => void> = [];
    let frameRequests = 0;

    const scheduler = createDragFrameScheduler<number>(
      (value) => delivered.push(value),
      {
        requestFrame: (callback) => {
          frameRequests += 1;
          frames.push(callback);
          return frameRequests;
        },
        cancelFrame: () => {},
      },
    );

    scheduler.schedule(1);
    scheduler.schedule(2);
    scheduler.schedule(3);

    assert.equal(frameRequests, 1);
    assert.deepEqual(delivered, []);

    frames[0]!();

    assert.deepEqual(delivered, [3]);
  });

  it("flushes the latest queued sample synchronously and cancels the pending frame", () => {
    const delivered: string[] = [];
    const cancelled: number[] = [];

    const scheduler = createDragFrameScheduler<string>(
      (value) => delivered.push(value),
      {
        requestFrame: () => 42,
        cancelFrame: (id) => cancelled.push(id),
      },
    );

    scheduler.schedule("early");
    scheduler.schedule("release");
    scheduler.flush();

    assert.deepEqual(cancelled, [42]);
    assert.deepEqual(delivered, ["release"]);
  });
});
