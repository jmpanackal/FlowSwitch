import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { FlowProfile, ProfileListResult } from "../types/flow-profile";
import { ProfileLaunchProgressPanel } from "./layout/components/ProfileLaunchProgressPanel";
import { TooltipProvider } from "./layout/components/ui/tooltip";
import type { LaunchFeedbackState } from "./layout/hooks/useLaunchFeedback";
import { progressFromLaunchStatus } from "./layout/utils/launchProgressFromStatus";

function profilesFromListResult(res: ProfileListResult): FlowProfile[] {
  if (Array.isArray(res)) return res;
  return Array.isArray(res.profiles) ? res.profiles : [];
}

function readOverlayParams(): { profileId: string; runId: string } {
  try {
    const u = new URL(window.location.href);
    const profileId = String(u.searchParams.get("profileId") || "").trim();
    const runId = String(u.searchParams.get("runId") || "").trim();
    return { profileId, runId };
  } catch {
    return { profileId: "", runId: "" };
  }
}

export function LaunchProgressOverlayRoot() {
  const { profileId, runId } = useMemo(() => readOverlayParams(), []);
  const [profile, setProfile] = useState<FlowProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [launchFeedback, setLaunchFeedback] = useState<LaunchFeedbackState>({
    status: "in-progress",
    message: "Starting…",
    progress: null,
  });
  const pollTokenRef = useRef(0);
  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    pollTokenRef.current += 1;
    if (pollIntervalRef.current != null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!profileId || !window.electron?.listProfiles) {
      setLoadError(!profileId ? "Missing profile." : "Unavailable.");
      return;
    }
    void (async () => {
      try {
        const res = await window.electron.listProfiles();
        const list = profilesFromListResult(res);
        const found =
          list.find((p) => String(p?.id || "").trim() === profileId) || null;
        if (!found) {
          setLoadError("Profile not found.");
          return;
        }
        setProfile(found);
      } catch {
        setLoadError("Could not load profile.");
      }
    })();
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !runId || !window.electron?.getLaunchProfileStatus) return;

    const pollToken = pollTokenRef.current;
    const tick = async () => {
      if (pollTokenRef.current !== pollToken) return;
      try {
        const statusResult = await window.electron.getLaunchProfileStatus(profileId);
        if (pollTokenRef.current !== pollToken) return;
        const status = statusResult?.status;
        if (!statusResult?.ok || !status) return;
        if (String(status.runId || "").trim() !== runId) return;

        const st = String(status.state || "").toLowerCase();
        const launchedApps = Number(status.launchedAppCount || 0);
        const launchedTabs = Number(status.launchedTabCount || 0);
        const failedCount = Number(status.failedAppCount || 0);
        const skippedCount = Number(status.skippedAppCount || 0);
        const progressSnap = progressFromLaunchStatus(status);
        const summaryParts = [
          `${launchedApps} app${launchedApps === 1 ? "" : "s"}`,
          `${launchedTabs} tab${launchedTabs === 1 ? "" : "s"}`,
        ];
        if (failedCount > 0) summaryParts.push(`${failedCount} failed`);
        if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
        const summaryText = summaryParts.join(", ");

        if (st === "cancelled" || st === "failed" || st === "complete") {
          stopPolling();
          return;
        }

        if (st === "awaiting-confirmations") {
          const unresolvedCount = Number(status.unresolvedPendingConfirmationCount || 0);
          const pollingPendingNames = Array.isArray(status.pendingConfirmations)
            ? status.pendingConfirmations
                .filter(
                  (item) => String(item?.status || "waiting").toLowerCase() !== "resolved",
                )
                .map((item) => String(item?.name || "").trim())
                .filter(Boolean)
                .slice(0, 3)
            : [];
          if (unresolvedCount > 0) {
            const namesList =
              pollingPendingNames.length > 0
                ? ` (${pollingPendingNames.join(", ")}${
                    unresolvedCount > pollingPendingNames.length ? ", ..." : ""
                  })`
                : "";
            setLaunchFeedback({
              status: "in-progress",
              message: `Waiting for ${unresolvedCount} confirmation${
                unresolvedCount === 1 ? "" : "s"
              }${namesList}. (${summaryText})`,
              progress: progressSnap,
            });
            return;
          }
          stopPolling();
          return;
        }

        if (st === "in-progress") {
          setLaunchFeedback({
            status: "in-progress",
            message: "",
            progress: progressSnap,
          });
        }
      } catch {
        // next tick
      }
    };

    void tick();
    pollIntervalRef.current = window.setInterval(() => {
      void tick();
    }, 1300);
    return () => {
      stopPolling();
    };
  }, [profileId, runId, stopPolling]);

  const handleCancelLaunch = useCallback(async () => {
    if (!profileId || !runId || !window.electron?.cancelProfileLaunch) return;
    await window.electron.cancelProfileLaunch(profileId, runId);
  }, [profileId, runId]);

  const handleCloseWindow = useCallback(() => {
    void window.electron?.closeLaunchProgressWindow?.();
  }, []);

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1020] px-6 text-center text-sm text-flow-text-secondary">
        {loadError}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1020] px-6 text-center text-sm text-flow-text-secondary">
        Loading…
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={380} skipDelayDuration={120}>
      <div className="relative box-border min-h-screen bg-[#0b1020] px-4 pb-4 pt-3">
        <div className="mb-2 flex h-8 shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={handleCloseWindow}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-flow-text-secondary outline-none transition-colors hover:bg-white/10 hover:text-flow-text-primary focus-visible:ring-2 focus-visible:ring-flow-text-primary/35"
            aria-label="Close launch progress"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <ProfileLaunchProgressPanel
          profile={profile}
          progress={launchFeedback.progress}
          detailMessage={
            launchFeedback.message?.trim() ? launchFeedback.message : undefined
          }
          onCancel={handleCancelLaunch}
          cancelDisabled={!window.electron?.cancelProfileLaunch}
        />
      </div>
    </TooltipProvider>
  );
}
