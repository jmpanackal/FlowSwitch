import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

type LaunchControlProps = {
  isEditMode: boolean;
  isLaunching: boolean;
  onLaunch: () => void;
  onCancel: () => void;
  /** When true, show inline Cancel (requires IPC support from parent). */
  showCancel: boolean;
};

export function LaunchControl({
  isEditMode,
  isLaunching,
  onLaunch,
  onCancel,
  showCancel,
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
      setElapsedSec((Date.now() - startedAtRef.current) / 1000);
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [isLaunching]);

  const elapsedLabel = `${elapsedSec.toFixed(1)}s`;

  if (!isLaunching) {
    return (
      <button
        type="button"
        onClick={onLaunch}
        disabled={isEditMode}
        className="inline-flex items-center justify-center gap-2 rounded-lg px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/40 focus:ring-offset-2 focus:ring-offset-flow-bg-primary bg-flow-accent-blue text-flow-text-primary hover:bg-flow-accent-blue-hover active:bg-flow-accent-blue/90 disabled:opacity-50 shadow-sm"
      >
        <Play className="w-4 h-4 shrink-0" />
        Launch Profile
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-stretch rounded-lg border border-flow-accent-blue/50 bg-flow-accent-blue text-flow-text-primary shadow-sm overflow-hidden"
      role="group"
      aria-label="Profile launch"
    >
      <div className="inline-flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium">
        <div
          className="w-4 h-4 shrink-0 border-2 border-flow-text-primary/30 border-t-flow-text-primary rounded-full animate-spin"
          aria-hidden
        />
        <span className="whitespace-nowrap">Launching</span>
        <span className="tabular-nums text-flow-text-primary/90">
          ({elapsedLabel})
        </span>
      </div>
      {showCancel ? (
        <>
          <div
            className="w-px shrink-0 bg-flow-text-primary/25 self-stretch my-2"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={isEditMode}
            className="px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-medium text-flow-text-primary hover:bg-flow-text-primary/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </>
      ) : null}
    </div>
  );
}
