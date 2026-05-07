import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { FlowProfile, ProfileSavePayload } from "../../../types/flow-profile";
import type { LaunchFeedbackState } from "./useLaunchFeedback";
import type { LargeProfileLaunchConfirmPayload } from "../components/LargeProfileLaunchConfirm";

type UseProfileLaunchOptions = {
  profiles: FlowProfile[];
  /** Full store document (profiles + global content library) for pre-launch persist. */
  buildSavePayload: () => ProfileSavePayload;
  selectedProfileId: string;
  setIsLaunching: Dispatch<SetStateAction<boolean>>;
  setLaunchFeedback: Dispatch<SetStateAction<LaunchFeedbackState>>;
  launchFeedbackTimeoutRef: MutableRefObject<number | null>;
  /**
   * When main reports launch weight at or above the soft threshold, await this before
   * calling `launchProfile`. Return false to cancel. Omit to skip the soft-warning step.
   */
  confirmLargeLaunch?: (payload: LargeProfileLaunchConfirmPayload) => Promise<boolean>;
  /** Fired when launch is committed (after save, weight check, and optional soft confirm). */
  onLaunchPreparing?: (profileId: string) => void;
  onLaunchStarted?: (profileId: string, runId: string) => void;
  /** Called when a launch finishes successfully, with wall-clock seconds for this run. */
  onLaunchCompletedDuration?: (
    profileId: string,
    durationSeconds: number,
  ) => void;
};

export function useProfileLaunch({
  profiles,
  buildSavePayload,
  selectedProfileId,
  setIsLaunching,
  setLaunchFeedback,
  launchFeedbackTimeoutRef,
  confirmLargeLaunch,
  onLaunchPreparing,
  onLaunchStarted,
  onLaunchCompletedDuration,
}: UseProfileLaunchOptions) {
  const pendingLaunchAbortRef = useRef(false);

  const scheduleIdleReset = useCallback(() => {
    if (launchFeedbackTimeoutRef.current) {
      window.clearTimeout(launchFeedbackTimeoutRef.current);
    }
    launchFeedbackTimeoutRef.current = window.setTimeout(() => {
      setLaunchFeedback({
        status: "idle",
        message: "",
        progress: null,
      });
      launchFeedbackTimeoutRef.current = null;
    }, 7000);
  }, [launchFeedbackTimeoutRef, setLaunchFeedback]);

  useEffect(() => {
    const sub = window.electron?.subscribeProfileLaunchStarted?.(() => {
      if (launchFeedbackTimeoutRef.current) {
        window.clearTimeout(launchFeedbackTimeoutRef.current);
        launchFeedbackTimeoutRef.current = null;
      }
      setIsLaunching(true);
      setLaunchFeedback({
        status: "in-progress",
        message: "Launching profile…",
        progress: null,
      });
    });
    return () => {
      sub?.();
    };
  }, [launchFeedbackTimeoutRef, setIsLaunching, setLaunchFeedback]);

  useEffect(() => {
    const sub = window.electron?.subscribeProfileLaunchFinished?.((payload) => {
      const outcome = String(payload?.outcome || "error");
      // Orphaned finalize events (store runId no longer matches) must not clear the spinner;
      // the active run may still be awaiting confirmations or placing windows.
      if (outcome === "idle") return;

      setIsLaunching(false);

      if (
        outcome === "success"
        && onLaunchCompletedDuration
        && payload.profileId
        && payload.durationSeconds != null
      ) {
        onLaunchCompletedDuration(payload.profileId, payload.durationSeconds);
      }

      const message = String(payload?.message || "").trim();
      if (outcome === "success") {
        setLaunchFeedback({
          status: "success",
          message: message || "Launch completed.",
          progress: null,
        });
      } else if (outcome === "warning") {
        setLaunchFeedback({
          status: "warning",
          message: message || "Launch cancelled.",
          progress: null,
        });
      } else {
        setLaunchFeedback({
          status: "error",
          message: message || "Launch completed with errors.",
          progress: null,
        });
      }
      scheduleIdleReset();
    });
    return () => {
      sub?.();
    };
  }, [
    onLaunchCompletedDuration,
    scheduleIdleReset,
    setIsLaunching,
    setLaunchFeedback,
  ]);

  const abortPendingLaunch = useCallback(() => {
    pendingLaunchAbortRef.current = true;
    setIsLaunching(false);
    setLaunchFeedback({
      status: "warning",
      message: "Launch cancelled.",
      progress: null,
    });
    scheduleIdleReset();
  }, [scheduleIdleReset, setIsLaunching, setLaunchFeedback]);

  const handleLaunch = useCallback(() => {
    const currentProfile = profiles.find((p) => p.id === selectedProfileId) || null;
    if (!currentProfile?.id || !window.electron?.launchProfile) return;
    const launchProfileId = currentProfile.id;
    void (async () => {
      pendingLaunchAbortRef.current = false;
      if (launchFeedbackTimeoutRef.current) {
        window.clearTimeout(launchFeedbackTimeoutRef.current);
        launchFeedbackTimeoutRef.current = null;
      }

      setIsLaunching(true);
      setLaunchFeedback({
        status: "in-progress",
        message: "Preparing launch…",
        progress: null,
      });

      let persistLaunchFeedback = false;
      let deferSpinnerOff = false;
      try {
        if (window.electron?.saveProfiles) {
          const saveResult = await window.electron.saveProfiles(
            buildSavePayload(),
          );
          if (!saveResult?.ok) {
            setLaunchFeedback({
              status: "error",
              message: "Could not save profile changes before launch.",
              progress: null,
            });
            setIsLaunching(false);
            launchFeedbackTimeoutRef.current = window.setTimeout(() => {
              setLaunchFeedback({
                status: "idle",
                message: "",
                progress: null,
              });
              launchFeedbackTimeoutRef.current = null;
            }, 7000);
            return;
          }
        }

        if (pendingLaunchAbortRef.current) {
          return;
        }

        if (window.electron?.getProfileLaunchWeight) {
          try {
            const weightData = await window.electron.getProfileLaunchWeight(
              launchProfileId,
            );
            if (
              weightData?.ok
              && typeof weightData.totalUnits === "number"
              && weightData.limits
            ) {
              const { totalUnits, limits, breakdown } = weightData;
              const hardMax = Number(limits.hardMax);
              const softWarn = Number(limits.softWarn);
              if (Number.isFinite(hardMax) && hardMax > 0 && totalUnits > hardMax) {
                setLaunchFeedback({
                  status: "error",
                  message:
                    `This profile exceeds the launch size limit (${totalUnits} units; max ${hardMax}). `
                    + "Remove some apps or browser tabs, or split the profile.",
                  progress: null,
                });
                setIsLaunching(false);
                launchFeedbackTimeoutRef.current = window.setTimeout(() => {
                  setLaunchFeedback({
                    status: "idle",
                    message: "",
                    progress: null,
                  });
                  launchFeedbackTimeoutRef.current = null;
                }, 7000);
                return;
              }
              const apps = Number(breakdown?.dedupedAppLaunches ?? 0);
              const tabs = Number(breakdown?.dedupedBrowserTabs ?? 0);
              const skippedLaunchCount =
                typeof weightData?.skippedLaunchTargets?.count === "number"
                  ? weightData.skippedLaunchTargets.count
                  : 0;
              const skippedLaunchSample = Array.isArray(
                weightData?.skippedLaunchTargets?.sample,
              )
                ? weightData.skippedLaunchTargets.sample
                : [];
              const preflight = weightData?.preflight as
                | {
                    layoutAppSlots?: number;
                    missingLaunchTargetSkips?: number;
                    launchableAppLaunches?: number;
                  }
                | undefined;
              if (apps === 0 && tabs === 0) {
                setLaunchFeedback({
                  status: "error",
                  message:
                    "Nothing to launch: every app tile is missing a path or URL, and there are no browser tabs. "
                    + "Fix paths in Inspect → Overview or add tabs.",
                  progress: null,
                });
                setIsLaunching(false);
                scheduleIdleReset();
                return;
              }
              if (
                confirmLargeLaunch
                && Number.isFinite(softWarn)
                && softWarn > 0
                && totalUnits >= softWarn
              ) {
                const confirmed = await confirmLargeLaunch({
                  profileName: String(currentProfile.name || "").trim() || "This profile",
                  totalUnits,
                  appCount: apps,
                  tabCount: tabs,
                  softWarn,
                  hardMax,
                  skippedLaunchCount,
                  skippedLaunchSample,
                  preflightLayoutAppSlots: preflight?.layoutAppSlots,
                  preflightMissingLaunchTargets: preflight?.missingLaunchTargetSkips,
                });
                if (!confirmed) {
                  setIsLaunching(false);
                  setLaunchFeedback({
                    status: "warning",
                    message: "Launch cancelled.",
                    progress: null,
                  });
                  scheduleIdleReset();
                  return;
                }
              }
            }
          } catch (weightErr) {
            console.warn("[launch] getProfileLaunchWeight failed:", weightErr);
          }
        }

        if (pendingLaunchAbortRef.current) {
          return;
        }

        onLaunchPreparing?.(launchProfileId);
        setLaunchFeedback({
          status: "in-progress",
          message: "Launching profile…",
          progress: null,
        });

        const launchResult = await window.electron.launchProfile(
          launchProfileId,
          { fireAndForget: true, launchOrigin: "renderer" },
        );

        if (pendingLaunchAbortRef.current) {
          return;
        }

        if (!launchResult?.ok) {
          let errorMessage = launchResult?.error
            || "Could not launch this profile. Check app executable paths in app details.";
          if (
            launchResult?.code === "LAUNCH_TOO_LARGE"
            && launchResult?.details
            && typeof launchResult.details === "object"
          ) {
            const d = launchResult.details as {
              totalUnits?: number;
              limits?: { hardMax?: number };
            };
            const total = d.totalUnits;
            const max = d.limits?.hardMax;
            if (typeof total === "number" && typeof max === "number") {
              errorMessage =
                `This profile exceeds the launch size limit (${total} units; max ${max}). `
                + "Remove some apps or browser tabs, or split the profile.";
            }
          } else if (launchResult?.code === "LAUNCH_NOTHING_TO_RUN") {
            errorMessage =
              String(launchResult?.error || "").trim()
              || "Nothing to launch: fix app paths or add browser tabs.";
          }
          setLaunchFeedback({
            status: "error",
            message: errorMessage,
            progress: null,
          });
          console.error(
            "Profile launch completed with errors:",
            launchResult?.error || launchResult?.failedApps || [],
          );
          return;
        }

        const launchRunId = String(launchResult?.runId || "").trim();
        if (!launchResult?.started || !launchRunId) {
          setLaunchFeedback({
            status: "error",
            message: "Launch did not start. Try again.",
            progress: null,
          });
          return;
        }

        if (pendingLaunchAbortRef.current) {
          void window.electron?.cancelProfileLaunch?.(launchProfileId, launchRunId);
          return;
        }

        onLaunchStarted?.(launchProfileId, launchRunId);
        persistLaunchFeedback = true;
        deferSpinnerOff = true;
      } catch (error) {
        console.error("Failed to launch profile:", error);
        const errorMessage =
          error instanceof Error && error.message
            ? error.message
            : "Launch failed unexpectedly. Please try again.";
        setLaunchFeedback({
          status: "error",
          message: errorMessage,
          progress: null,
        });
      } finally {
        if (!deferSpinnerOff) {
          setIsLaunching(false);
        }
        if (!persistLaunchFeedback) {
          if (!deferSpinnerOff) {
            launchFeedbackTimeoutRef.current = window.setTimeout(() => {
              setLaunchFeedback({
                status: "idle",
                message: "",
                progress: null,
              });
              launchFeedbackTimeoutRef.current = null;
            }, 7000);
          }
        }
      }
    })();
  }, [
    profiles,
    buildSavePayload,
    selectedProfileId,
    setIsLaunching,
    setLaunchFeedback,
    launchFeedbackTimeoutRef,
    confirmLargeLaunch,
    onLaunchPreparing,
    onLaunchStarted,
    scheduleIdleReset,
  ]);

  return {
    handleLaunch,
    abortPendingLaunch,
  };
}

