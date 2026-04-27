import { describe, expect, it } from "vitest";
import {
  getMonitorChromeHeading,
  monitorChromeAriaLabel,
} from "./monitorChromeLabels";

describe("getMonitorChromeHeading", () => {
  it("uses role + system name when label is generic Monitor N", () => {
    const h = getMonitorChromeHeading({
      name: "Monitor 1",
      systemName: "LG ULTRAWIDE",
      primary: true,
      orientation: "landscape",
    });
    expect(h.headline).toContain("Primary");
    expect(h.detail).toBe("LG ULTRAWIDE");
  });

  it("keeps custom names with system name as detail", () => {
    const h = getMonitorChromeHeading({
      name: "Coding display",
      systemName: "DELL U2720Q",
      primary: false,
    });
    expect(h.headline).toBe("Coding display");
    expect(h.detail).toBe("DELL U2720Q");
  });

  it("adds portrait suffix to headline", () => {
    const h = getMonitorChromeHeading({
      name: "Side",
      orientation: "portrait",
    });
    expect(h.headline).toContain("Portrait");
  });
});

describe("monitorChromeAriaLabel", () => {
  it("joins headline and detail", () => {
    expect(
      monitorChromeAriaLabel({
        name: "Monitor 2",
        systemName: "BenQ GW2480",
        primary: false,
      }),
    ).toMatch(/Display.*BenQ GW2480/);
  });
});
