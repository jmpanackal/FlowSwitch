import { useState, useEffect, useRef } from "react";

export type LaunchFeedbackState = {
  status: "idle" | "in-progress" | "success" | "warning" | "error";
  message: string;
};

export function useLaunchFeedback() {
  const [launchFeedback, setLaunchFeedback] = useState<LaunchFeedbackState>({
    status: "idle",
    message: "",
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
