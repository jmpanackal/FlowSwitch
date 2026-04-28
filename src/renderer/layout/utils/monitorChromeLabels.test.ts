import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMonitorDisplayLabelMap,
  monitorChromeAriaLabelFromParts,
  monitorLabelFromMap,
} from "./monitorChromeLabels";

test("buildMonitorDisplayLabelMap labels primary as Primary and others 2, 3 in array order", () => {
  const map = buildMonitorDisplayLabelMap([
    {
      id: "a",
      name: "Monitor 1",
      primary: true,
      systemName: "LG",
    },
    {
      id: "b",
      name: "Monitor 2",
      primary: false,
      systemName: "DELL",
    },
    {
      id: "c",
      name: "Monitor 3",
      primary: false,
    },
  ]);
  assert.equal(map.get("a")?.headline, "Primary Display");
  assert.equal(map.get("a")?.detail, "LG");
  assert.equal(map.get("b")?.headline, "Display 2");
  assert.equal(map.get("b")?.detail, "DELL");
  assert.equal(map.get("c")?.headline, "Display 3");
});

test("buildMonitorDisplayLabelMap uses 1, 2, 3 when no display is primary", () => {
  const map = buildMonitorDisplayLabelMap([
    { id: "x", name: "A", primary: false },
    { id: "y", name: "B", primary: false },
  ]);
  assert.equal(map.get("x")?.headline, "Display 1");
  assert.equal(map.get("y")?.headline, "Display 2");
});

test("monitorLabelFromMap falls back to monitor name when id missing from map", () => {
  const map = new Map();
  assert.equal(
    monitorLabelFromMap({ id: "z", name: "Custom" }, map).headline,
    "Custom",
  );
});

test("monitorChromeAriaLabelFromParts joins headline and detail", () => {
  assert.equal(
    monitorChromeAriaLabelFromParts("Primary Display", "LG"),
    "Primary Display — LG",
  );
});
