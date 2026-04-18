import {
  useRef,
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { FlowProfile } from "../../../types/flow-profile";
import { toSerializableProfiles } from "../../../types/flow-profile";
import type { LaunchFeedbackState } from "./useLaunchFeedback";

type UseProfileLaunchOptions = {
  profiles: FlowProfile[];
  selectedProfileId: string;
  setIsLaunching: Dispatch<SetStateAction<boolean>>;
  setLaunchFeedback: Dispatch<SetStateAction<LaunchFeedbackState>>;
  launchFeedbackTimeoutRef: MutableRefObject<number | null>;
  /** Called when a launch finishes successfully, with wall-clock seconds for this run. */
  onLaunchCompletedDuration?: (
    profileId: string,
    durationSeconds: number,
  ) => void;
};

export function useProfileLaunch({
  profiles,
  selectedProfileId,
  setIsLaunching,
  setLaunchFeedback,
  launchFeedbackTimeoutRef,
  onLaunchCompletedDuration,
}: UseProfileLaunchOptions) {
  const launchStatusPollRef = useRef<number | null>(null);
  const launchStatusPollTokenRef = useRef(0);
  const activeLaunchRunRef = useRef<{ profileId: string; runId: string } | null>(null);
  const launchWallClockStartMsRef = useRef<number | null>(null);

  const emitLaunchDurationIfSuccess = useCallback(
    (profileId: string) => {
      const start = launchWallClockStartMsRef.current;
      launchWallClockStartMsRef.current = null;
      if (start == null || !onLaunchCompletedDuration) return;
      const seconds = Math.max(
        1,
        Math.round((Date.now() - start) / 1000),
      );
      onLaunchCompletedDuration(profileId, seconds);
    },
    [onLaunchCompletedDuration],
  );

  const stopLaunchStatusPolling = useCallback(() => {
    launchStatusPollTokenRef.current += 1;
    if (launchStatusPollRef.current) {
      window.clearInterval(launchStatusPollRef.current);
      launchStatusPollRef.current = null;
    }
  }, []);

  const isCurrentLaunchContext = useCallback(
    (profileId: string, runId: string, pollToken: number) => (
      launchStatusPollTokenRef.current === pollToken
      && activeLaunchRunRef.current?.profileId === profileId
      && activeLaunchRunRef.current?.runId === runId
    ),
    [],
  );

  useEffect(() => () => {
    stopLaunchStatusPolling();
  }, [stopLaunchStatusPolling]);

  const handleCancelLaunch = useCallback(async () => {
    const ctx = activeLaunchRunRef.current;
    if (!ctx?.profileId || !ctx?.runId || !window.electron?.cancelProfileLaunch) return;
    await window.electron.cancelProfileLaunch(ctx.profileId, ctx.runId);
  }, []);

  const handleLaunch = useCallback(() => {
    const currentProfile = profiles.find((p) => p.id === selectedProfileId) || null;
    if (!currentProfile?.id || !window.electron?.launchProfile) return;
    const launchProfileId = currentProfile.id;
    void (async () => {
      stopLaunchStatusPolling();
      activeLaunchRunRef.current = null;

      if (launchFeedbackTimeoutRef.current) {
        window.clearTimeout(launchFeedbackTimeoutRef.current);
        launchFeedbackTimeoutRef.current = null;
      }

      launchWallClockStartMsRef.current = Date.now();
      setIsLaunching(true);
      setLaunchFeedback({
        status: "in-progress",
        message: "Launching profile...",
      });

      let persistLaunchFeedback = false;
      let deferSpinnerOff = false;
      const scheduleIdleReset = () => {
        if (launchFeedbackTimeoutRef.current) {
          window.clearTimeout(launchFeedbackTimeoutRef.current);
        }
        launchFeedbackTimeoutRef.current = window.setTimeout(() => {
          setLaunchFeedback({
            status: "idle",
            message: "",
          });
          launchFeedbackTimeoutRef.current = null;
        }, 7000);
      };
      try {
        if (window.electron?.saveProfiles) {
          const serializableProfiles = toSerializableProfiles(
            profiles,
          );
          const saveResult = await window.electron.saveProfiles(
            serializableProfiles,
          );
          if (!saveResult?.ok) {
            launchWallClockStartMsRef.current = null;
            setLaunchFeedback({
              status: "error",
              message: "Could not save profile changes before launch.",
            });
            setIsLaunching(false);
            launchFeedbackTimeoutRef.current = window.setTimeout(() => {
              setLaunchFeedback({
                status: "idle",
                message: "",
              });
              launchFeedbackTimeoutRef.current = null;
            }, 7000);
            return;
          }
        }

        const launchResult = await window.electron.launchProfile(
          launchProfileId,
          { fireAndForget: true },
        );

        if (!launchResult?.ok) {
          launchWallClockStartMsRef.current = null;
          activeLaunchRunRef.current = null;
          const errorMessage = launchResult?.error
            || "Could not launch this profile. Check app executable paths in app details.";
          setLaunchFeedback({
            status: "error",
            message: errorMessage,
          });
          console.error(
            "Profile launch completed with errors:",
            launchResult?.error || launchResult?.failedApps || [],
          );
          return;
        }

        const launchRunId = String(launchResult?.runId || "").trim();
        if (!launchResult?.started || !launchRunId) {
          launchWallClockStartMsRef.current = null;
          activeLaunchRunRef.current = null;
          setLaunchFeedback({
            status: "error",
            message: "Launch did not start. Try again.",
          });
          return;
        }

        activeLaunchRunRef.current = {
          profileId: launchProfileId,
          runId: launchRunId,
        };
        persistLaunchFeedback = true;
        deferSpinnerOff = true;

        const pollToken = launchStatusPollTokenRef.current;
        launchStatusPollRef.current = window.setInterval(async () => {
          if (!isCurrentLaunchContext(launchProfileId, launchRunId, pollToken)) return;
          try {
            const statusResult = await window.electron.getLaunchProfileStatus(launchProfileId);
            if (!isCurrentLaunchContext(launchProfileId, launchRunId, pollToken)) return;
            const status = statusResult?.status;
            if (!statusResult?.ok || !status) return;
            if (String(status.runId || "").trim() !== launchRunId) return;

            const st = String(status.state || "").toLowerCase();
            const launchedApps = Number(status.launchedAppCount || 0);
            const launchedTabs = Number(status.launchedTabCount || 0);
            const failedCount = Number(status.failedAppCount || 0);
            const skippedCount = Number(status.skippedAppCount || 0);
            const summaryParts = [
              `${launchedApps} app${launchedApps === 1 ? "" : "s"}`,
              `${launchedTabs} tab${launchedTabs === 1 ? "" : "s"}`,
            ];
            if (failedCount > 0) summaryParts.push(`${failedCount} failed`);
            if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);
            const summaryText = summaryParts.join(", ");

            if (st === "cancelled") {
              stopLaunchStatusPolling();
              launchWallClockStartMsRef.current = null;
              activeLaunchRunRef.current = null;
              setIsLaunching(false);
              setLaunchFeedback({
                status: "warning",
                message: "Launch cancelled.",
              });
              scheduleIdleReset();
              return;
            }

            if (st === "failed") {
              stopLaunchStatusPolling();
              launchWallClockStartMsRef.current = null;
              activeLaunchRunRef.current = null;
              setIsLaunching(false);
              setLaunchFeedback({
                status: "error",
                message: `Launch finished with failures (${summaryText}).`,
              });
              scheduleIdleReset();
              return;
            }

            if (st === "complete") {
              stopLaunchStatusPolling();
              activeLaunchRunRef.current = null;
              setIsLaunching(false);
              emitLaunchDurationIfSuccess(launchProfileId);
              setLaunchFeedback({
                status: "success",
                message: `Launch complete: ${summaryText}.`,
              });
              scheduleIdleReset();
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
                const namesList = pollingPendingNames.length > 0
                  ? ` (${pollingPendingNames.join(", ")}${unresolvedCount > pollingPendingNames.length ? ", ..." : ""})`
                  : "";
                setLaunchFeedback({
                  status: "warning",
                  message: `Launch in progress: ${summaryText}. Waiting for ${unresolvedCount} confirmation${unresolvedCount === 1 ? "" : "s"}${namesList}.`,
                });
                return;
              }
              stopLaunchStatusPolling();
              activeLaunchRunRef.current = null;
              setIsLaunching(false);
              emitLaunchDurationIfSuccess(launchProfileId);
              setLaunchFeedback({
                status: "success",
                message: `Launch complete: ${summaryText}.`,
              });
              scheduleIdleReset();
              return;
            }

            // Main-process steady state while apps launch; LaunchControl shows progress — no redundant feedback updates.
            if (st === "in-progress") {
              return;
            }

          } catch {
            // Keep UI resilient; next poll tick can recover.
          }
        }, 1300);
      } catch (error) {
        launchWallClockStartMsRef.current = null;
        activeLaunchRunRef.current = null;
        console.error("Failed to launch profile:", error);
        const errorMessage =
          error instanceof Error && error.message
            ? error.message
            : "Launch failed unexpectedly. Please try again.";
        setLaunchFeedback({
          status: "error",
          message: errorMessage,
        });
      } finally {
        if (!deferSpinnerOff) {
          setIsLaunching(false);
        }
        if (!persistLaunchFeedback) {
          activeLaunchRunRef.current = null;
          if (!deferSpinnerOff) {
            launchFeedbackTimeoutRef.current = window.setTimeout(() => {
              setLaunchFeedback({
                status: "idle",
                message: "",
              });
              launchFeedbackTimeoutRef.current = null;
            }, 7000);
          }
        }
      }
    })();
  }, [
    profiles,
    selectedProfileId,
    setIsLaunching,
    setLaunchFeedback,
    launchFeedbackTimeoutRef,
    stopLaunchStatusPolling,
    isCurrentLaunchContext,
    emitLaunchDurationIfSuccess,
  ]);

  return {
    handleLaunch,
    handleCancelLaunch,
  };
}
