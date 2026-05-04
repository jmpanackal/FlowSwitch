import { useState, useEffect, useRef } from "react";

export type AppLaunchRowProgress = {
  key: string;
  name: string;
  step:
    | "pending"
    | "launching"
    | "placing"
    | "verifying"
    | "opening-content"
    | "awaiting-confirmation"
    | "done"
    | "failed"
    | "skipped";
  /** Raster data URL from main (profile snapshot at launch); validated in mapper. */
  iconDataUrl?: string | null;
  /** Where this item is targeting (e.g. "Primary Display", "Display 2", "Minimized row"). */
  location?: string | null;
  /** Small outcome tags (e.g. "Placed", "Confirmation"); "New"/"Reused" may be hidden in the launch panel when redundant. */
  outcomes?: string[] | null;
};

/** Aligns with `launchTimeline.js` JSDoc. */
export type LaunchActionState =
  | "queued"
  | "running"
  | "completed"
  | "warning"
  | "failed"
  | "skipped";

export type LaunchActionSubstepState =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type LaunchActionSubstep = {
  id: string;
  label: string;
  state: LaunchActionSubstepState;
  startedAtMs?: number | null;
  endedAtMs?: number | null;
};

export type LaunchAction = {
  id: string;
  kind: "app" | "tab" | "system";
  title: string;
  /** Target display or zone (e.g. monitor name, "Minimized row", "Browser"). */
  targetLocation?: string | null;
  state: LaunchActionState;
  iconDataUrl?: string | null;
  pills?: string[] | null;
  smartDecisions?: string[] | null;
  contentItems?: Array<{
    name: string;
    type?: "file" | "folder" | "link" | string | null;
    path?: string | null;
  }> | null;
  /** Tab actions only: canonical URL for grouping tabs with the owning browser app in the UI. */
  browserTabUrl?: string | null;
  /** When set, app timeline includes a `sub-content` substep (parallel with launch vs after verify). */
  contentSubstepMode?: "post-verify" | "parallel-launch" | null;
  /** Main-only hint: post-verify content automation failed (maps to failed `sub-content`). */
  contentOpenFailed?: boolean | null;
  errorMessage?: string | null;
  failureKind?: "launch" | "placement" | "verification" | null;
  startedAtMs?: number | null;
  endedAtMs?: number | null;
  substeps?: LaunchActionSubstep[] | null;
};

/** Counts mirrored from main `launch-status-store` while a run is active (for UI progress). */
export type LaunchProgressSnapshot = {
  launchedAppCount: number;
  launchedTabCount: number;
  failedAppCount: number;
  skippedAppCount: number;
  requestedAppCount: number;
  unresolvedPendingConfirmationCount: number;
  requestedBrowserTabCount: number;
  activePhase: "launching" | "placing" | "tabs" | null;
  activeAppName: string | null;
  appLaunchProgress: AppLaunchRowProgress[];
  /** Latest `state` from main status store (e.g. complete, failed, cancelled). */
  runState?: string | null;
  /** Timeline / execution engine (optional until main publishes them). */
  activeActionId?: string | null;
  actionsTotal?: number | null;
  actionsCompleted?: number | null;
  actions?: LaunchAction[] | null;
  startedAtMs?: number | null;
  updatedAtMs?: number | null;
  /** Mirrors main launch-status-store run id for this snapshot (cancel / poll staleness). */
  runId?: string | null;
};

export type LaunchFeedbackState = {
  status: "idle" | "in-progress" | "success" | "warning" | "error";
  message: string;
  /** Present during an active launch poll cycle; cleared when idle or run ends. */
  progress: LaunchProgressSnapshot | null;
};

export function useLaunchFeedback() {
  const [launchFeedback, setLaunchFeedback] = useState<LaunchFeedbackState>({
    status: "idle",
    message: "",
    progress: null,
  });
  const launchFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (launchFeedbackTimeoutRef.current) {
        window.clearTimeout(launchFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  return {
    launchFeedback,
    setLaunchFeedback,
    launchFeedbackTimeoutRef,
  };
}
