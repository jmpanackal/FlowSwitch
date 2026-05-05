import { useEffect } from "react";

/**
 * Invokes `onClose` when Escape is pressed while `isActive` is true.
 * Uses the capture phase so nested overlays can register inner handlers first
 * (child effects run before parent effects in React).
 */
export function useEscapeToClose(isActive: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isActive, onClose]);
}
