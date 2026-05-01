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

type UseProfileLaunchOptions = {
  profiles: FlowProfile[];
  /** Full store document (profiles + global content library) for pre-launch persist. */
  buildSavePayload: () => ProfileSavePayload;
  selectedProfileId: string;
  setIsLaunching: Dispatch<SetStateAction<boolean>>;
  setLaunchFeedback: Dispatch<SetStateAction<LaunchFeedbackState>>;
  launchFeedbackTimeoutRef: MutableRefObject<number | null>;
  /** Fired as soon as the user starts a launch (before save + IPC). Use to clear stale run ids. */
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
      onLaunchPreparing?.(launchProfileId);
      setLaunchFeedback({
        status: "in-progress",
        message: "Launching profile...",
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

        const launchResult = await window.electron.launchProfile(
          launchProfileId,
          { fireAndForget: true, launchOrigin: "renderer" },
        );

        if (pendingLaunchAbortRef.current) {
          return;
        }

        if (!launchResult?.ok) {
          const errorMessage = launchResult?.error
            || "Could not launch this profile. Check app executable paths in app details.";
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
    onLaunchPreparing,
    onLaunchStarted,
  ]);

  return {
    handleLaunch,
    abortPendingLaunch,
  };
}

