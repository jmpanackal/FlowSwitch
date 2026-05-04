import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCapturedExplorerContentItems,
  type MemoryCapture,
} from "./buildNewProfile";

test("collectCapturedExplorerContentItems dedupes folder paths across monitors", () => {
  const capture: MemoryCapture = {
    capturedAt: 1,
    appCount: 2,
    monitors: [
      {
        id: "m1",
        name: "M1",
        primary: true,
        resolution: "1920x1080",
        orientation: "landscape",
        apps: [
          {
            name: "File Explorer",
            iconPath: null,
            position: { x: 50, y: 50 },
            size: { width: 40, height: 40 },
            associatedFiles: [
              { type: "folder", path: "D:\\Docs" },
              { type: "folder", path: "d:\\docs" },
            ],
          },
        ],
      },
      {
        id: "m2",
        name: "M2",
        primary: false,
        resolution: "1920x1080",
        orientation: "landscape",
        apps: [
          {
            name: "explorer",
            iconPath: null,
            position: { x: 50, y: 50 },
            size: { width: 40, height: 40 },
            associatedFiles: [{ type: "folder", path: "D:\\\\Docs" }],
          },
        ],
      },
    ],
  };
  const rows = collectCapturedExplorerContentItems(capture, "pid");
  assert.equal(rows.length, 1);
  assert.match(rows[0].id, /^pid-explorer-/);
  assert.equal(rows[0].path, "D:\\Docs");
  assert.equal(rows[0].isFolder, true);
  assert.equal(rows[0].defaultApp, "File Explorer");
});

test("collectCapturedExplorerContentItems ignores non-folder rows", () => {
  const capture: MemoryCapture = {
    capturedAt: 1,
    appCount: 1,
    monitors: [
      {
        id: "m1",
        name: "M1",
        primary: true,
        resolution: "1920x1080",
        orientation: "landscape",
        apps: [
          {
            name: "File Explorer",
            iconPath: null,
            position: { x: 50, y: 50 },
            size: { width: 40, height: 40 },
            associatedFiles: [{ type: "file", path: "C:\\\\a.txt" }],
          },
        ],
      },
    ],
  };
  assert.equal(collectCapturedExplorerContentItems(capture, "p").length, 0);
});
