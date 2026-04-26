import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";

type LaunchControlProps = {
  isEditMode: boolean;
  isLaunching: boolean;
  onLaunch: () => void;
  onCancel: () => void;
  /** When true, show inline Cancel (requires IPC support from parent). */
  showCancel: boolean;
  /** Trimmed global shortcut; shown in smaller text under the label when set. */
  hotkey?: string | null;
};

const launchCardClass =
  "inline-flex min-h-[2.75rem] min-w-[12.5rem] max-w-[20rem] flex-col overflow-hidden rounded-lg border border-flow-accent-blue/35 bg-flow-accent-blue text-flow-text-primary shadow-md shadow-flow-accent-blue/18 box-border transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out";

const launchCardHoverClass =
  "hover:-translate-y-0.5 hover:border-flow-accent-blue/55 hover:bg-flow-accent-blue-hover hover:shadow-lg hover:shadow-flow-accent-blue/30 active:translate-y-0 active:scale-[0.99] active:shadow-md disabled:pointer-events-none disabled:opacity-50";

export function LaunchControl({
  isEditMode,
  isLaunching,
  onLaunch,
  onCancel,
  showCancel,
  hotkey,
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

  const launchTooltip = hk
    ? `Launch this profile (same as the quick-switch shortcut: ${hk}).`
    : "Launch this profile.";

  if (!isLaunching) {
    return (
      <FlowTooltip label={launchTooltip}>
        <button
          type="button"
          onClick={onLaunch}
          disabled={isEditMode}
          className={`group ${launchCardClass} items-center justify-center gap-y-2 border-0 px-4 py-2.5 text-center outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-flow-text-primary/35 ${
            isEditMode ? "opacity-50" : launchCardHoverClass
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Play
              className="h-4 w-4 shrink-0 transition-transform duration-200 ease-out group-hover:scale-105"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="text-[15px] font-semibold leading-none tracking-tight sm:text-base">
              Launch profile
            </span>
          </span>
          <kbd
            className={`max-w-full truncate px-1 text-center font-mono text-[8px] font-medium tabular-nums leading-tight ${
              hk
                ? "text-flow-text-primary/55"
                : "pointer-events-none select-none text-transparent"
            }`}
            aria-hidden={!hk}
          >
            {hk ?? "\u00a0"}
          </kbd>
        </button>
      </FlowTooltip>
    );
  }

  const launchingShellClass =
    "inline-flex min-h-[2.75rem] min-w-[12.5rem] max-w-[20rem] flex-col justify-center gap-1 rounded-lg border border-flow-accent-blue/50 bg-flow-accent-blue px-4 py-2 text-flow-text-primary shadow-md shadow-flow-accent-blue/18 box-border";

  return (
    <div
      className={launchingShellClass}
      role="group"
      aria-label="Profile launch"
    >
      <div className="flex w-full flex-col justify-center gap-1">
        <div className="flex items-center justify-center gap-2">
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
        {showCancel ? (
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={isEditMode}
            className="w-full rounded-lg border border-flow-text-primary/15 bg-flow-text-primary/5 py-2 text-sm font-medium text-flow-text-primary transition-colors hover:bg-flow-text-primary/10 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
