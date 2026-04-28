import { useState, useEffect, useRef } from "react";

export type AppLaunchRowProgress = {
  key: string;
  name: string;
  step:
    | "pending"
    | "launching"
    | "placing"
    | "awaiting-confirmation"
    | "done"
    | "failed"
    | "skipped";
  /** Raster data URL from main (profile snapshot at launch); validated in mapper. */
  iconDataUrl?: string | null;
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
