import { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";

type LaunchControlProps = {
  isEditMode: boolean;
  isLaunching: boolean;
  onLaunch: () => void;
  /** Trimmed global shortcut — surfaced in tooltip only (keeps the button compact). */
  hotkey?: string | null;
  /** Main CTA (e.g. `Launch Work`). Defaults to "Launch profile". */
  primaryLabel?: string;
  /** Extra tooltip lines (apps, tabs, startup, monitors). */
  breakdownLines?: string[] | null;
};

const launchCardClass =
  "inline-flex min-h-[2.75rem] min-w-[12.5rem] max-w-[20rem] flex-row items-center justify-center gap-2 rounded-lg border border-flow-accent-blue/35 bg-flow-accent-blue px-4 py-2.5 text-flow-text-primary shadow-md shadow-flow-accent-blue/18 box-border transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out";

const launchCardHoverClass =
  "hover:-translate-y-0.5 hover:border-flow-accent-blue/55 hover:bg-flow-accent-blue-hover hover:shadow-lg hover:shadow-flow-accent-blue/30 active:translate-y-0 active:scale-[0.99] active:shadow-md disabled:pointer-events-none disabled:opacity-50";

function mergeLaunchTooltip(
  base: string,
  breakdownLines: string[] | null | undefined,
): string {
  const extra = breakdownLines?.filter(Boolean).join("\n");
  return extra ? `${base}\n\n${extra}` : base;
}

export function LaunchControl({
  isEditMode,
  isLaunching,
  onLaunch,
  hotkey,
  primaryLabel = "Launch profile",
  breakdownLines = null,
}: LaunchControlProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const hk = hotkey?.trim() || null;

  useEffect(() => {
    if (!isLaunching) {
      startedAtRef.current = null;
      setElapsedSec(0);
      return;
    }
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    }
    const tick = () => {
      if (startedAtRef.current === null) return;
      setElapsedSec(
        Math.floor((Date.now() - startedAtRef.current) / 1000),
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [isLaunching]);

  const tooltipLabel = useMemo(() => {
    const base = hk
      ? `Launch this profile (same as the quick-switch shortcut: ${hk}).`
      : "Launch this profile.";
    return mergeLaunchTooltip(base, breakdownLines);
  }, [hk, breakdownLines]);

  const ariaLaunchLabel = useMemo(() => {
    const parts = [primaryLabel];
    if (hk) parts.push(`Shortcut ${hk}`);
    return parts.join(". ");
  }, [primaryLabel, hk]);

  if (!isLaunching) {
    return (
      <FlowTooltip label={tooltipLabel}>
        <button
          type="button"
          onClick={onLaunch}
          disabled={isEditMode}
          aria-label={ariaLaunchLabel}
          className={`group ${launchCardClass} text-center outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flow-text-primary/35 ${
            isEditMode ? "opacity-50" : launchCardHoverClass
          }`}
        >
          <Play
            className="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:scale-105"
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="min-w-0 truncate text-left text-[15px] font-semibold leading-none tracking-tight sm:text-base">
            {primaryLabel}
          </span>
        </button>
      </FlowTooltip>
    );
  }

  const launchingShellClass =
    "inline-flex min-h-[2.5rem] min-w-[12.5rem] max-w-[20rem] flex-row items-center justify-center gap-2 rounded-lg border border-flow-accent-blue/45 bg-flow-accent-blue/90 px-4 py-2 text-flow-text-primary shadow-md shadow-flow-accent-blue/15 box-border";

  return (
    <div
      className={launchingShellClass}
      role="status"
      aria-live="polite"
      aria-label="Profile launch in progress"
    >
      <div
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-flow-text-primary/30 border-t-flow-text-primary"
        aria-hidden
      />
      <span className="text-sm font-semibold leading-none tracking-tight">
        Launching
      </span>
      <span className="tabular-nums text-sm font-normal text-flow-text-primary/80">
        ({elapsedSec}s)
      </span>
    </div>
  );
}
