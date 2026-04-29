export type MonitorChromeLabelInput = {
  id: string;
  name: string;
  systemName?: string | null;
  primary?: boolean;
  orientation?: "landscape" | "portrait";
};

export type MonitorDisplayLabel = {
  headline: string;
  /** Optional second line (e.g. EDID / system display name). */
  detail?: string;
};

/**
 * Build stable labels: **Primary Display** for the primary display, then **Display 2**, **Display 3**…
 * for other displays in `monitors` array order. If none are marked primary, uses **Display 1**, **Display 2**…
 */
export function buildMonitorDisplayLabelMap(
  monitors: MonitorChromeLabelInput[],
): Map<string, MonitorDisplayLabel> {
  const map = new Map<string, MonitorDisplayLabel>();
  if (!monitors.length) return map;

  const hasPrimary = monitors.some((m) => m.primary);
  let next = hasPrimary ? 2 : 1;

  for (const m of monitors) {
    const sys = m.systemName?.trim() || undefined;

    if (hasPrimary && m.primary) {
      map.set(m.id, {
        headline: "Primary Display",
        detail: sys,
      });
    } else {
      const n = next;
      next += 1;
      map.set(m.id, {
        headline: `Display ${n}`,
        detail: sys,
      });
    }
  }

  return map;
}

export function monitorLabelFromMap(
  monitor: Pick<MonitorChromeLabelInput, "id" | "name">,
  map: Map<string, MonitorDisplayLabel>,
): MonitorDisplayLabel {
  return (
    map.get(monitor.id) ?? {
      headline: monitor.name?.trim() || "Display",
    }
  );
}

export function monitorChromeAriaLabelFromParts(
  headline: string,
  detail?: string,
): string {
  return detail ? `${headline} — ${detail}` : headline;
}
