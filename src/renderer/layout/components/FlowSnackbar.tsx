import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CircleCheck } from "lucide-react";

export type FlowSnackbarVariant = "success" | "error";

/** Renders `**phrase**` as bold for scan-friendly snackbars; other text unchanged. */
function renderFlowSnackbarMessage(text: string): ReactNode {
  const parts = text.split(/\*\*/);
  if (parts.length < 3) return text;
  return (
    <>
      {parts.map((segment, i) =>
        i % 2 === 1 ? (
          <strong
            key={i}
            className="font-semibold text-flow-text-primary"
          >
            {segment}
          </strong>
        ) : (
          <Fragment key={i}>{segment}</Fragment>
        ),
      )}
    </>
  );
}

type Snack = {
  id: string;
  message: string;
  variant: FlowSnackbarVariant;
};

type FlowSnackbarContextValue = {
  push: (
    message: string,
    opts?: { variant?: FlowSnackbarVariant; durationMs?: number },
  ) => void;
};

const FlowSnackbarContext = createContext<FlowSnackbarContextValue | null>(
  null,
);

const DEFAULT_DURATION_MS = 4200;

export function useFlowSnackbar(): FlowSnackbarContextValue {
  const ctx = useContext(FlowSnackbarContext);
  if (!ctx) {
    throw new Error("useFlowSnackbar must be used within FlowSnackbarProvider");
  }
  return ctx;
}

export function FlowSnackbarProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [snacks, setSnacks] = useState<Snack[]>([]);

  const push = useCallback(
    (
      message: string,
      opts?: { variant?: FlowSnackbarVariant; durationMs?: number },
    ) => {
      const trimmed = String(message || "").trim();
      if (!trimmed) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const variant = opts?.variant ?? "success";
      const durationMs =
        typeof opts?.durationMs === "number" && opts.durationMs > 0
          ? opts.durationMs
          : DEFAULT_DURATION_MS;
      setSnacks((prev) => [...prev, { id, message: trimmed, variant }]);
      window.setTimeout(() => {
        setSnacks((prev) => prev.filter((s) => s.id !== id));
      }, durationMs);
    },
    [],
  );

  const value = useMemo(() => ({ push }), [push]);

  const portal =
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-4 z-[240] flex flex-col items-center gap-2 px-4"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {snacks.map((s) => {
              const isError = s.variant === "error";
              return (
                <div
                  key={s.id}
                  role={isError ? "alert" : "status"}
                  className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-flow-border/70 bg-flow-surface-elevated/95 px-3.5 py-3 text-sm text-flow-text-primary shadow-flow-shadow-lg backdrop-blur-md flow-modal-panel-enter shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  {isError ? (
                    <AlertCircle
                      className="mt-0.5 h-5 w-5 shrink-0 text-rose-400"
                      aria-hidden
                    />
                  ) : (
                    <CircleCheck
                      className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0 flex-1 leading-snug">
                    {renderFlowSnackbarMessage(s.message)}
                  </span>
                </div>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <FlowSnackbarContext.Provider value={value}>
      {children}
      {portal}
    </FlowSnackbarContext.Provider>
  );
}
