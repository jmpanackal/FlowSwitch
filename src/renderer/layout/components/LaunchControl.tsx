import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

type LaunchControlProps = {
  isEditMode: boolean;
  isLaunching: boolean;
  onLaunch: () => void;
  onCancel: () => void;
  /** When true, show inline Cancel (requires IPC support from parent). */
  showCancel: boolean;
  /** Non-zero summary segments only (e.g. "3 apps"); joined with middots under the label. */
  profileSummaryParts?: readonly string[];
};

/** Shared chrome so idle and launching states keep the same footprint. */
const launchShellClass =
  "inline-flex min-h-[4.25rem] min-w-[14rem] max-w-[22rem] flex-col justify-center gap-2 rounded-xl border border-flow-accent-blue/35 bg-flow-accent-blue px-6 py-[10px] text-flow-text-primary shadow-md shadow-flow-accent-blue/20 box-border transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/45 focus:ring-offset-2 focus:ring-offset-flow-bg-primary";

const launchIdleInteractiveClass =
  "hover:-translate-y-0.5 hover:border-flow-accent-blue/55 hover:bg-flow-accent-blue-hover hover:shadow-lg hover:shadow-flow-accent-blue/30 active:translate-y-0 active:scale-[0.99] active:shadow-md disabled:pointer-events-none disabled:opacity-50";

export function LaunchControl({
  isEditMode,
  isLaunching,
  onLaunch,
  onCancel,
  showCancel,
  profileSummaryParts,
}: LaunchControlProps) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);

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

  const secondaryLine =
    profileSummaryParts && profileSummaryParts.length > 0
      ? profileSummaryParts.join(" · ")
      : null;

  const launchTitle =
    secondaryLine != null && profileSummaryParts?.length
      ? `Launch this profile (${profileSummaryParts.join(", ")})`
      : "Launch this profile";

  if (!isLaunching) {
    return (
      <button
        type="button"
        onClick={onLaunch}
        disabled={isEditMode}
        title={launchTitle}
        className={`group ${launchShellClass} ${launchIdleInteractiveClass}`}
      >
        <div className="flex w-full flex-col justify-center gap-2">
          <div className="flex items-center justify-center gap-1">
            <Play
              className="h-5 w-5 shrink-0 transition-transform duration-200 ease-out group-hover:scale-105"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="text-sm font-semibold leading-tight">
              Launch profile
            </span>
          </div>
          {secondaryLine ? (
            <span className="max-w-full truncate text-center text-xs font-normal leading-snug text-flow-text-primary/80">
              {secondaryLine}
            </span>
          ) : null}
        </div>
      </button>
    );
  }

  return (
    <div
      className={`${launchShellClass} border-flow-accent-blue/50`}
      role="group"
      aria-label="Profile launch"
    >
      <div className="flex w-full flex-col justify-center gap-2">
        <div className="flex items-center justify-center gap-2">
          <div
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-flow-text-primary/30 border-t-flow-text-primary"
            aria-hidden
          />
          <span className="text-sm font-semibold leading-tight">
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
