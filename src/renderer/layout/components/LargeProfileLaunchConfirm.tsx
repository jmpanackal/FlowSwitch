import { AlertTriangle } from "lucide-react";
import { useEscapeToClose } from "../hooks/useEscapeToClose";

export type LargeProfileLaunchConfirmPayload = {
  profileName: string;
  totalUnits: number;
  appCount: number;
  tabCount: number;
  softWarn: number;
  hardMax: number;
  /** Apps gather marks as non-launchable (missing target, restricted, …). */
  skippedLaunchCount?: number;
  skippedLaunchSample?: { name: string; reason: string }[];
  /** From weight preflight: app tiles on layout + minimized row (after monitor exclusions). */
  preflightLayoutAppSlots?: number;
  /** From weight preflight: skipped rows with reason `missing-launch-target`. */
  preflightMissingLaunchTargets?: number;
};

type LargeProfileLaunchConfirmProps = LargeProfileLaunchConfirmPayload & {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function summarizeSkipReason(reason: string): string {
  const r = String(reason || '').trim().toLowerCase();
  if (r === 'missing-launch-target') return 'no executable, shortcut, or URL';
  if (r === 'disallowed-executable-path') return 'executable not allowed';
  if (r === 'restricted') return 'restricted for this profile';
  if (r === 'missing-name') return 'unnamed tile';
  if (r === 'missing-path') return 'missing path';
  return r.replace(/-/g, ' ') || 'unknown';
}

export function LargeProfileLaunchConfirm({
  isOpen,
  profileName,
  totalUnits,
  appCount,
  tabCount,
  softWarn,
  hardMax,
  skippedLaunchCount = 0,
  skippedLaunchSample = [],
  preflightLayoutAppSlots,
  preflightMissingLaunchTargets,
  onCancel,
  onConfirm,
}: LargeProfileLaunchConfirmProps) {
  useEscapeToClose(isOpen, onCancel);

  if (!isOpen) return null;

  const appLabel = `${appCount} app${appCount === 1 ? "" : "s"}`;
  const tabLabel = `${tabCount} browser tab${tabCount === 1 ? "" : "s"}`;

  return (
    <div
      className="flow-modal-backdrop-enter fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="large-launch-title"
        aria-describedby="large-launch-desc"
        className="flow-modal-nested-panel-enter w-full max-w-md rounded-xl border border-flow-border bg-flow-surface-elevated p-5 shadow-flow-shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/15">
            <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="large-launch-title" className="text-lg font-semibold text-flow-text-primary">
              Large profile launch
            </h3>
            <div
              id="large-launch-desc"
              className="mt-2 space-y-3 text-sm leading-relaxed text-flow-text-secondary"
            >
              <p>
                Launching{" "}
                <span className="font-medium text-flow-text-primary">{profileName}</span>
                {" "}
                will open approximately{" "}
                <span className="font-medium text-flow-text-primary">{totalUnits}</span>
                {" "}
                items ({appLabel}, {tabLabel}). This may take multiple minutes.
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-flow-text-secondary">
                <li>Apps open one at a time, in list order.</li>
                <li>Existing windows for profile apps will be reused where possible.</li>
                <li>Apps outside this profile won&apos;t be affected.</li>
              </ul>
              {typeof preflightLayoutAppSlots === "number"
                && preflightLayoutAppSlots > 0
                && typeof preflightMissingLaunchTargets === "number"
                && preflightMissingLaunchTargets > 0 ? (
                <p className="text-xs leading-snug text-flow-text-muted">
                  Layout has{" "}
                  <span className="font-medium text-flow-text-secondary">{preflightLayoutAppSlots}</span>
                  {" "}
                  app tile{preflightLayoutAppSlots === 1 ? "" : "s"};{" "}
                  <span className="font-medium text-flow-text-secondary">{preflightMissingLaunchTargets}</span>
                  {" "}
                  {preflightMissingLaunchTargets === 1 ? "has" : "have"} no executable, shortcut, or URL.
                </p>
              ) : null}
              {skippedLaunchCount > 0 ? (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-flow-text-secondary">
                  <p className="font-medium text-flow-text-primary">
                    {skippedLaunchCount} app tile{skippedLaunchCount === 1 ? "" : "s"} won&apos;t launch
                  </p>
                  <p className="mt-1 text-xs leading-snug text-flow-text-muted">
                    Resolve paths in Inspect → Overview before launch, or remove the tiles.
                  </p>
                  {skippedLaunchSample.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-flow-text-muted">
                      {skippedLaunchSample.map((row, i) => (
                        <li key={`${row.name}-${row.reason}-${i}`}>
                          <span className="text-flow-text-secondary">{row.name}</span>
                          {' — '}
                          {summarizeSkipReason(row.reason)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {skippedLaunchCount > skippedLaunchSample.length ? (
                    <p className="mt-1.5 text-xs text-flow-text-muted">
                      And {skippedLaunchCount - skippedLaunchSample.length} more not shown.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-snug text-flow-text-muted">
              Recommended: under {softWarn} items. Maximum: {hardMax}.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-flow-border bg-flow-surface px-3 py-2 text-sm font-medium text-flow-text-secondary transition-colors hover:bg-flow-surface-elevated hover:text-flow-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg border border-flow-accent-blue/40 bg-flow-accent-blue/15 px-3 py-2 text-sm font-medium text-flow-accent-blue transition-colors hover:bg-flow-accent-blue/25"
          >
            Launch anyway
          </button>
        </div>
      </div>
    </div>
  );
}
