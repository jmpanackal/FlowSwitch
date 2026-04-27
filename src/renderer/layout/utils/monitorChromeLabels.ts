/** Matches default OS-style names that users rarely memorize. */
const GENERIC_MONITOR_NAME = /^monitor\s*\d+$/i;
const GENERIC_DISPLAY_NAME = /^display\s*\d*$/i;

export type MonitorChromeLabelInput = {
  name: string;
  systemName?: string | null;
  primary?: boolean;
  orientation?: "landscape" | "portrait";
};

/**
 * Headline + optional detail for monitor cards (preview + edit chrome).
 * Prefers real display names when the stored label is generic.
 */
export function getMonitorChromeHeading(
  monitor: MonitorChromeLabelInput,
): { headline: string; detail?: string } {
  const name = monitor.name?.trim() || "Display";
  const sys = monitor.systemName?.trim() || "";
  const portrait = monitor.orientation === "portrait";
  const oriSuffix = portrait ? " · Portrait" : "";

  const generic =
    GENERIC_MONITOR_NAME.test(name) || GENERIC_DISPLAY_NAME.test(name);

  if (sys && generic) {
    const role = monitor.primary ? "Primary display" : "Display";
    return { headline: `${role}${oriSuffix}`, detail: sys };
  }

  if (sys && sys !== name) {
    return { headline: `${name}${oriSuffix}`, detail: sys };
  }

  return { headline: `${name}${oriSuffix}` };
}

export function monitorChromeAriaLabel(monitor: MonitorChromeLabelInput): string {
  const { headline, detail } = getMonitorChromeHeading(monitor);
  return detail ? `${headline} — ${detail}` : headline;
}
