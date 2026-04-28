import { safeIconSrc } from "../../utils/safeIconSrc";
import type {
  AppLaunchRowProgress,
  LaunchProgressSnapshot,
} from "../hooks/useLaunchFeedback";

const APP_STEP_SET = new Set<AppLaunchRowProgress["step"]>([
  "pending",
  "launching",
  "placing",
  "awaiting-confirmation",
  "done",
  "failed",
  "skipped",
]);

export function progressFromLaunchStatus(status: {
  launchedAppCount?: number;
  launchedTabCount?: number;
  failedAppCount?: number;
  skippedAppCount?: number;
  requestedAppCount?: number;
  unresolvedPendingConfirmationCount?: number;
  requestedBrowserTabCount?: number;
  activePhase?: string | null;
  activeAppName?: string | null;
  appLaunchProgress?: Array<{
    key?: string;
    name?: string;
    step?: string;
    iconDataUrl?: string | null;
  }>;
}): LaunchProgressSnapshot {
  const rawPhase = String(status.activePhase || "").trim().toLowerCase();
  const activePhase =
    rawPhase === "launching" || rawPhase === "placing" || rawPhase === "tabs"
      ? rawPhase
      : null;
  const activeName = String(status.activeAppName || "").trim();
  const rowsIn = Array.isArray(status.appLaunchProgress) ? status.appLaunchProgress : [];
  const appLaunchProgress: AppLaunchRowProgress[] = rowsIn.map((row, index) => {
    const stepRaw = String(row?.step || "pending").trim().toLowerCase();
    const step = APP_STEP_SET.has(stepRaw as AppLaunchRowProgress["step"])
      ? (stepRaw as AppLaunchRowProgress["step"])
      : "pending";
    const iconDataUrl = safeIconSrc(row?.iconDataUrl) ?? null;
    return {
      key: String(row?.key || "").trim() || `row-${index}`,
      name: String(row?.name || "").trim() || "App",
      step,
      iconDataUrl,
    };
  });
  return {
    launchedAppCount: Number(status.launchedAppCount || 0),
    launchedTabCount: Number(status.launchedTabCount || 0),
    failedAppCount: Number(status.failedAppCount || 0),
    skippedAppCount: Number(status.skippedAppCount || 0),
    requestedAppCount: Math.max(0, Number(status.requestedAppCount || 0)),
    unresolvedPendingConfirmationCount: Number(
      status.unresolvedPendingConfirmationCount || 0,
    ),
    requestedBrowserTabCount: Math.max(0, Number(status.requestedBrowserTabCount || 0)),
    activePhase,
    activeAppName: activeName || null,
    appLaunchProgress,
  };
}
