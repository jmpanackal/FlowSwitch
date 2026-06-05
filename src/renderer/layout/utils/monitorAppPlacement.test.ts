import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveMonitorAppPlacement,
  resolveSnapZoneMonitorAppPlacement,
} from "./monitorAppPlacement";

describe("monitorAppPlacement", () => {
  it("places a lone app in the full-monitor snap zone", () => {
    const resolved = resolveSnapZoneMonitorAppPlacement({
      monitor: { orientation: "landscape", apps: [] },
    });
    assert.deepEqual(resolved.position, { x: 50, y: 50 });
    assert.deepEqual(resolved.size, { width: 100, height: 100 });
  });

  it("uses half-monitor snap zones when restoring onto a busy monitor", () => {
    const resolved = resolveSnapZoneMonitorAppPlacement({
      monitor: {
        orientation: "landscape",
        apps: [{ position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }],
      },
    });
    assert.equal(resolved.mergeIntoAppIndex, undefined);
    assert.deepEqual(resolved.size, { width: 50, height: 100 });
    assert.notDeepEqual(resolved.position, { x: 50, y: 50 });
  });

  it("stacks on the front app when every snap zone is occupied", () => {
    const monitorApps = [
      { position: { x: 25, y: 50 }, size: { width: 50, height: 100 } },
      { position: { x: 75, y: 50 }, size: { width: 50, height: 100 } },
    ];
    const resolved = resolveSnapZoneMonitorAppPlacement({
      monitor: { orientation: "landscape", apps: monitorApps },
      hintPosition: { x: 50, y: 50 },
    });
    assert.equal(typeof resolved.mergeIntoAppIndex, "number");
    assert.deepEqual(resolved.size, { width: 50, height: 100 });
    assert.deepEqual(resolved.position, monitorApps[resolved.mergeIntoAppIndex!]!.position);
  });

  it("ignores tiny remembered minimized sizes in favor of snap zones", () => {
    const resolved = resolveMonitorAppPlacement({
      monitor: {
        orientation: "landscape",
        apps: [{ position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }],
      },
      requestedPosition: { x: 0, y: 0 },
      requestedSize: { width: 12, height: 12 },
    });
    assert.ok(resolved.size.width >= 50);
    assert.ok(resolved.size.height >= 50);
  });

  it("keeps explicit drag-drop geometry", () => {
    const resolved = resolveMonitorAppPlacement({
      monitor: { orientation: "landscape", apps: [] },
      requestedPosition: { x: 75, y: 50 },
      requestedSize: { width: 50, height: 100 },
      preferRequestedPosition: true,
    });
    assert.deepEqual(resolved.position, { x: 75, y: 50 });
    assert.deepEqual(resolved.size, { width: 50, height: 100 });
  });
});
