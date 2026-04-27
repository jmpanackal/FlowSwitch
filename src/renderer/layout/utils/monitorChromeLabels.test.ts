import { describe, expect, it } from "vitest";
import {
  buildMonitorDisplayLabelMap,
  monitorChromeAriaLabelFromParts,
  monitorLabelFromMap,
} from "./monitorChromeLabels";

describe("buildMonitorDisplayLabelMap", () => {
  it("labels primary as Primary and others 2, 3 in array order", () => {
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
    expect(map.get("a")?.headline).toBe("Primary");
    expect(map.get("a")?.detail).toBe("LG");
    expect(map.get("b")?.headline).toBe("2");
    expect(map.get("b")?.detail).toBe("DELL");
    expect(map.get("c")?.headline).toBe("3");
  });

  it("uses 1, 2, 3 when no display is primary", () => {
    const map = buildMonitorDisplayLabelMap([
      { id: "x", name: "A", primary: false },
      { id: "y", name: "B", primary: false },
    ]);
    expect(map.get("x")?.headline).toBe("1");
    expect(map.get("y")?.headline).toBe("2");
  });

  it("appends portrait suffix", () => {
    const map = buildMonitorDisplayLabelMap([
      { id: "p", name: "M1", primary: true, orientation: "portrait" },
    ]);
    expect(map.get("p")?.headline).toContain("Portrait");
  });
});

describe("monitorLabelFromMap", () => {
  it("falls back to monitor name when id missing from map", () => {
    const map = new Map();
    expect(monitorLabelFromMap({ id: "z", name: "Custom" }, map).headline).toBe(
      "Custom",
    );
  });
});

describe("monitorChromeAriaLabelFromParts", () => {
  it("joins headline and detail", () => {
    expect(monitorChromeAriaLabelFromParts("Primary", "LG")).toBe(
      "Primary — LG",
    );
  });
});
