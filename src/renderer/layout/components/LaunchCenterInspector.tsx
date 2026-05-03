import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Globe,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import type { FlowProfile } from "../../../types/flow-profile";
import type {
  LaunchAction,
  LaunchActionSubstep,
  LaunchProgressSnapshot,
} from "../hooks/useLaunchFeedback";
import { safeIconSrc } from "../../utils/safeIconSrc";
import { FileIcon } from "./FileIcon";
import {
  computeEta,
  computeSubstepWeightedProgress,
  deriveBuckets,
} from "../utils/launchTimeline";

type LaunchCenterInspectorProps = {
  profile: FlowProfile;
  progress: LaunchProgressSnapshot | null;
  summaryMessage?: string;
  summaryTone?: "success" | "warning" | "error";
  isLaunching: boolean;
  onCancel: () => void;
  cancelDisabled?: boolean;
  /** True while the main process is still applying cancel for the active run. */
  cancelPending?: boolean;
};

type Row = NonNullable<LaunchProgressSnapshot["appLaunchProgress"]>[number];

const COMPLETED_CAP = 5;

function LaunchInspectorCancelButton({
  disabled,
  pending,
  onCancel,
}: {
  disabled: boolean;
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => void onCancel()}
      disabled={disabled || pending}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-100 transition-colors hover:bg-rose-500/20 disabled:pointer-events-none disabled:opacity-45"
    >
      {pending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          <span>Cancelling…</span>
        </>
      ) : (
        "Cancel"
      )}
    </button>
  );
}

const LAUNCH_LEAD_SURFACE_CLASS =
  "flex min-w-0 w-full cursor-default items-stretch rounded-lg border border-white/[0.09] bg-black/28 py-1.5 pl-2 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

/** Same chrome on every `layoutId` node so Framer doesn’t morph borders/rings between zones. */
const LAUNCH_LEAD_LAYOUT_SHELL_CLASS = `${LAUNCH_LEAD_SURFACE_CLASS} transform-gpu`;

const LAUNCH_LEAD_LAYOUT_SHELL_STYLE = { borderRadius: 10 } as const;

function isTerminalActionState(state: LaunchAction["state"]): boolean {
  return (
    state === "completed"
    || state === "warning"
    || state === "failed"
    || state === "skipped"
  );
}

function formatEta(
  eta: ReturnType<typeof computeEta>,
): string {
  if (eta.kind === "estimating") return "Estimating…";
  const sec = Math.max(1, Math.round(eta.remainingMs / 1000));
  const prefix = eta.confidence === "high" ? "" : "~";
  return `${prefix}${sec}s remaining`;
}

function actionDurationLabel(action: LaunchAction): string | null {
  const a = action.startedAtMs;
  const b = action.endedAtMs;
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const ms = Math.max(0, b - a);
  if (ms < 100) return null;
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  return `${Math.round(s)}s`;
}

/** Omit pills redundant with the smart-decision line ("New", "Reused"). */
function visibleLaunchPills(pills: string[] | null | undefined): string[] {
  return (Array.isArray(pills) ? pills : []).filter((p) => {
    const t = String(p || "").trim();
    const lc = t.toLowerCase();
    return lc !== "new" && lc !== "reused";
  });
}

function failureKindLabel(kind: LaunchAction["failureKind"]): string {
  switch (kind) {
    case "placement":
      return "Placement";
    case "verification":
      return "Verification";
    case "launch":
    default:
      return "Launch";
  }
}

function stepLabel(row: Row): string {
  const outcomes = Array.isArray(row.outcomes) ? row.outcomes : [];
  if (row.step === "launching" && outcomes.includes("Reused")) return "Using existing window";
  switch (row.step) {
    case "launching":
      return "Starting";
    case "placing":
      return "Positioning";
    case "verifying":
      return "Verifying";
    case "opening-content":
      return "Opening content";
    case "awaiting-confirmation":
      return "Confirmation";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return "Queued";
  }
}

function actionLooksLaunched(
  action: LaunchAction,
  progress: LaunchProgressSnapshot | null,
  runState: string | null | undefined,
): boolean {
  if (action.kind !== "app") return false;
  if (action.state === "completed" || action.state === "warning") return true;

  const appKey = String(action.id || "").startsWith("app:")
    ? String(action.id).slice(4)
    : "";
  const row = appKey
    ? (progress?.appLaunchProgress ?? []).find((r) => String(r.key) === appKey) ?? null
    : null;
  const step = String(row?.step || "").trim().toLowerCase();
  const outcomes = Array.isArray(row?.outcomes) ? row!.outcomes : [];
  if (
    step === "placing"
    || step === "verifying"
    || step === "opening-content"
    || step === "awaiting-confirmation"
    || step === "done"
  ) {
    return true;
  }
  if (
    outcomes.includes("New")
    || outcomes.includes("Reused")
    || outcomes.includes("Placed")
  ) {
    return true;
  }

  const subLaunch = (action.substeps ?? []).find((s) => s.id === "sub-launch");
  if (subLaunch?.state === "completed") return true;
  if (String(runState || "").trim().toLowerCase() === "cancelled" && subLaunch?.state === "running") {
    return true;
  }

  return false;
}

function stepBadgeClasses(step: Row["step"]): string {
  switch (step) {
    case "launching":
      return "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35";
    case "placing":
      return "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/35";
    case "verifying":
      return "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-400/35";
    case "opening-content":
      return "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/35";
    case "awaiting-confirmation":
      return "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/35";
    case "done":
      return "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30";
    case "failed":
      return "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/35";
    case "skipped":
      return "bg-flow-text-muted/15 text-flow-text-muted ring-1 ring-flow-border/40";
    default:
      return "bg-flow-text-muted/10 text-flow-text-muted ring-1 ring-flow-border/30";
  }
}

type SummaryOutcome = "success" | "warning" | "error" | "cancelled";

function sessionSummaryOutcomeLabel(
  outcome: SummaryOutcome,
  runState: string | null | undefined,
): string {
  const rs = String(runState || "").trim().toLowerCase();
  if (rs === "cancelled" || outcome === "cancelled") {
    return "Launch cancelled. Hover app icons for per-app status.";
  }
  switch (outcome) {
    case "error":
      return "Run completed with one or more failures. Hover each app icon for the error.";
    case "warning":
      return "Run completed with warnings. Hover each app icon for details.";
    default:
      return "Run completed successfully.";
  }
}

/** Optional one-line context when the session outcome is not obvious from icons alone. */
function buildPostRunContextLine(runState: string | null | undefined): string | null {
  const rs = String(runState || "").trim().toLowerCase();
  if (rs === "cancelled") {
    return "Stopped early — re-run this profile to continue.";
  }
  return null;
}

/** Prefer the substantive warning (e.g. constrained placement) over earlier reuse/delay lines. */
function pickNonTrivialSmartDecisionLine(action: LaunchAction): string | null {
  const raw = (action.smartDecisions ?? [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  if (!raw.length) return null;
  const isTrivial = (t: string) =>
    /^(?:reusing|reused) existing window$/i.test(t)
    || /^waiting \d+s delay$/i.test(t);
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    if (!isTrivial(raw[i])) return raw[i];
  }
  return null;
}

function TerminalCompletedTrailing({ action }: { action: LaunchAction }) {
  if (action.state === "failed") {
    return (
      <X
        className="h-3.5 w-3.5 shrink-0 rounded-full bg-flow-bg-secondary p-0.5 text-rose-300 ring-1 ring-rose-400/50"
        strokeWidth={2.5}
        aria-hidden
      />
    );
  }
  if (action.state === "warning") {
    return (
      <AlertTriangle
        className="h-3.5 w-3.5 shrink-0 rounded-full bg-flow-bg-secondary p-0.5 text-amber-300 ring-1 ring-amber-400/45"
        strokeWidth={2.25}
        aria-hidden
      />
    );
  }
  if (action.state === "skipped") {
    return (
      <span
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-flow-bg-secondary text-[9px] font-bold text-flow-text-muted ring-1 ring-white/15"
        aria-hidden
      >
        —
      </span>
    );
  }
  return (
    <Check
      className="h-3.5 w-3.5 shrink-0 rounded-full bg-flow-bg-secondary p-0.5 text-emerald-300 ring-1 ring-emerald-400/50"
      strokeWidth={2.5}
      aria-hidden
    />
  );
}

type AppSummaryStatus = "ok" | "warn" | "error" | "cancelled";

function summaryOutcomeHeaderChip(outcome: SummaryOutcome): {
  label: string;
  className: string;
} {
  switch (outcome) {
    case "error":
      return {
        label: "Issues",
        className: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/35",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        className: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/35",
      };
    case "warning":
      return {
        label: "Warnings",
        className: "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/35",
      };
    default:
      return {
        label: "OK",
        className: "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/35",
      };
  }
}

function resolveAppSummaryStatus(
  action: LaunchAction,
  runState: string | null | undefined,
): AppSummaryStatus {
  if (action.state === "failed") return "error";
  if (action.state === "warning") return "warn";
  if (
    String(runState || "").trim().toLowerCase() === "cancelled"
    && !isTerminalActionState(action.state)
  ) {
    return "cancelled";
  }
  if (action.state === "skipped") return "warn";
  return "ok";
}

function appSummaryBadgeMeta(status: AppSummaryStatus): {
  label: string;
  className: string;
} {
  switch (status) {
    case "error":
      return {
        label: "Error",
        className: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/35",
      };
    case "cancelled":
      return {
        label: "Stopped",
        className: "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/35",
      };
    case "warn":
      return {
        label: "Warn",
        className: "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/35",
      };
    default:
      return {
        label: "OK",
        className: "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/35",
      };
  }
}

function appSummaryDecisionLines(action: LaunchAction): {
  reusableNote: string | null;
  contentNotes: string[];
  contentItems: NonNullable<LaunchAction["contentItems"]>;
} {
  const decisions = Array.isArray(action.smartDecisions)
    ? action.smartDecisions.map((d) => String(d || "").trim()).filter(Boolean)
    : [];
  const reused = decisions.find((d) => /^(?:reusing|reused) existing window$/i.test(d)) || null;
  const contentNotes = decisions.filter((d) => {
    const lc = d.toLowerCase();
    return lc.includes("content item")
      || lc.includes("file opened with this app")
      || lc.includes("files opened with this app")
      || lc.includes("folder opened with this app")
      || lc.includes("folders opened with this app")
      || lc.includes("files opened:")
      || lc.includes("linked to this app")
      || lc.includes("link opened with this app")
      || lc.includes("links opened with this app")
      || lc.includes("links opened:")
      || lc.startsWith("content:")
      || lc.startsWith("links:");
  });
  return {
    reusableNote: reused ? "Reused existing window" : null,
    contentNotes,
    contentItems: Array.isArray(action.contentItems) ? action.contentItems : [],
  };
}

/** Matches main-process aggregate copy from `buildInitialContentSmartDecisions`. */
function isAggregateFolderFileOpenedSummaryLine(text: string): boolean {
  const t = text.trim();
  return /^\d+\s+folders?\s+opened\s+with\s+this\s+app\.?$/i.test(t)
    || /^\d+\s+files?\s+opened\s+with\s+this\s+app\.?$/i.test(t);
}

function fileIconTypeForLaunchSummaryItem(item: {
  type?: string | null;
  path?: string | null;
  name?: string | null;
}): string {
  if (String(item?.type || "").trim().toLowerCase() === "folder") return "folder";
  const raw = String(item.path || item.name || "").trim();
  const seg = raw.replace(/\\/g, "/").split("/").pop() || "";
  const dot = seg.lastIndexOf(".");
  if (dot <= 0 || dot >= seg.length - 1) return "default";
  return seg.slice(dot + 1).toLowerCase() || "default";
}

function LaunchSummarySubstepIcon({
  substep,
  warnSubstepIds,
}: {
  substep: LaunchActionSubstep;
  warnSubstepIds?: Set<string> | null;
}) {
  if (warnSubstepIds?.has(substep.id) && substep.state === "completed") {
    return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300/95" strokeWidth={2.2} aria-hidden />;
  }
  if (substep.state === "completed") {
    return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300/95" strokeWidth={2.5} aria-hidden />;
  }
  if (substep.state === "failed") {
    return <X className="h-3.5 w-3.5 shrink-0 text-rose-300/95" strokeWidth={2.5} aria-hidden />;
  }
  if (substep.state === "running") {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-flow-accent-blue/80" aria-hidden />;
  }
  return <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-white/15" aria-hidden />;
}

function LaunchSummaryAppRow({
  action,
  progress,
  runState,
}: {
  action: LaunchAction;
  progress: LaunchProgressSnapshot | null;
  runState: string | null | undefined;
}) {
  const status = resolveAppSummaryStatus(action, runState);
  const badge = appSummaryBadgeMeta(status);
  const loc = resolveActionDisplayLocation(action, progress);
  const subs = displaySubstepsForAction(action, runState);
  const warnSubstepIds = shouldMarkVerifySubstepAsWarning(action)
    ? new Set(["sub-verify"])
    : null;
  const warningNote = status === "warn" ? pickNonTrivialSmartDecisionLine(action) : null;
  const errorNote = status === "error" ? (action.errorMessage || "").trim() : "";
  const decisionLines = appSummaryDecisionLines(action);
  const contentItems = decisionLines.contentItems;
  const structuredContent = contentItems.length > 0;
  const contentNotesForOk = structuredContent
    ? decisionLines.contentNotes.filter((n) => !isAggregateFolderFileOpenedSummaryLine(n))
    : decisionLines.contentNotes;
  const okNotes = status === "ok"
    ? [
      ...contentNotesForOk,
      ...(decisionLines.reusableNote ? [decisionLines.reusableNote] : []),
    ]
    : [];
  const okPrimary = status === "ok" ? (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center self-start text-emerald-400/95"
      title="OK"
      aria-label="OK"
    >
      <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
    </span>
  ) : (
    <span className={`inline-flex h-6 shrink-0 items-center self-start rounded-full px-2 text-[11px] font-semibold ${badge.className}`}>
      {badge.label}
    </span>
  );
  const detailBody =
    status === "ok" ? (
      okNotes.length > 0 || contentItems.length > 0 ? (
        <div className="space-y-1">
          {okNotes.length > 0 ? (
            <ul className="space-y-0.5">
              {okNotes.map((note) => (
                <li key={note} className="text-[11px] leading-snug text-flow-text-secondary break-words">
                  {note}
                </li>
              ))}
            </ul>
          ) : null}
          {contentItems.length > 0 ? (
            <ul className="space-y-0.5 rounded-lg bg-white/[0.025] px-2 py-1 ring-1 ring-white/5">
              {contentItems.map((item, index) => {
                const name = String(item?.name || item?.path || "Content item").trim();
                const key = `${String(item?.path || name)}:${index}`;
                return (
                  <li key={key} className="flex min-w-0 items-center gap-1.5 text-[11px] leading-snug text-flow-text-secondary">
                    <span className="shrink-0 leading-none" aria-hidden>
                      <FileIcon type={fileIconTypeForLaunchSummaryItem(item)} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 truncate" title={String(item?.path || name)}>
                      {name}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null
    ) : (
      <ul className="space-y-0.5">
        {subs.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5 text-[11px] text-flow-text-secondary">
            <LaunchSummarySubstepIcon substep={s} warnSubstepIds={warnSubstepIds} />
            <span className="break-words">{substepDisplayLabel(s)}</span>
          </li>
        ))}
      </ul>
    );
  const hasDetailRow = detailBody != null || warningNote != null || errorNote != null;

  return (
    <li className="grid grid-cols-[auto,1fr,auto] gap-x-2.5 gap-y-1.5 px-0 py-2.5">
      <div className={`pt-0.5 ${hasDetailRow ? "row-span-2" : ""}`}>
        <ActionIcon action={action} size="sm" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-snug text-flow-text-primary break-words">{action.title}</p>
        {loc ? (
          <p className="mt-0.5 text-[11px] leading-snug text-flow-text-muted break-words">{loc}</p>
        ) : null}
      </div>
      {okPrimary}

      {hasDetailRow ? (
        <div className="col-start-2 col-end-4 min-w-0 space-y-1">
          {detailBody}
          {warningNote ? (
            <span className="block max-w-full rounded-lg bg-white/[0.04] px-2 py-0.5 text-[11px] leading-snug text-flow-text-secondary ring-1 ring-white/10 break-words">
              {warningNote}
            </span>
          ) : null}
          {errorNote ? (
            <span className="block max-w-full rounded-lg bg-rose-500/12 px-2 py-0.5 text-[11px] leading-snug text-rose-200 ring-1 ring-rose-400/25 break-words">
              {failureKindLabel(action.failureKind)}: {errorNote}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-flow-text-muted ring-1 ring-white/10">
      {children}
    </span>
  );
}

function resolveActionDisplayLocation(
  action: LaunchAction,
  progress: LaunchProgressSnapshot | null,
): string | null {
  const fromAction = String(action.targetLocation ?? "").trim();
  if (fromAction) return fromAction;
  const id = String(action.id ?? "").trim();
  if (id.startsWith("app:")) {
    const key = id.slice(4);
    for (const row of progress?.appLaunchProgress ?? []) {
      if (String(row.key) === key) {
        const loc = String(row.location ?? "").trim();
        if (loc) return loc;
      }
    }
  }
  if (action.kind === "tab") return "Browser";
  return null;
}

function ActionPlacementSummary({
  action,
  progress,
  compact = false,
}: {
  action: LaunchAction;
  progress: LaunchProgressSnapshot | null;
  compact?: boolean;
}) {
  const loc = resolveActionDisplayLocation(action, progress);
  if (!loc) return null;
  if (compact) {
    return (
      <p className="mt-0.5 truncate text-[10px] text-flow-text-muted" title={loc}>
        {loc}
      </p>
    );
  }
  return (
    <p className="mt-1 text-[11px] leading-snug text-flow-text-secondary">
      <span className="font-semibold text-flow-text-muted">Destination: </span>
      {loc}
    </p>
  );
}

function RowIcon({ row }: { row: Row }) {
  const src = safeIconSrc(row.iconDataUrl ?? undefined);
  if (!src) {
    return (
      <div className="h-8 w-8 shrink-0 rounded-lg bg-flow-text-primary/5 ring-1 ring-flow-border/40" />
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-flow-border/40"
      draggable={false}
    />
  );
}

function stepProgress(step: Row["step"]): number {
  switch (step) {
    case "pending":
      return 0;
    case "launching":
      return 0.35;
    case "placing":
      return 0.72;
    case "verifying":
      return 0.88;
    case "opening-content":
      return 0.93;
    case "awaiting-confirmation":
      return 0.85;
    case "done":
    case "failed":
    case "skipped":
      return 1;
    default:
      return 0;
  }
}

function LaunchRow({ row }: { row: Row }) {
  const pct = Math.round(stepProgress(row.step) * 100);
  const location = String(row.location || "").trim() || null;
  return (
    <li className="relative flex min-w-0 items-center gap-2 overflow-hidden rounded-lg bg-white/3 px-2 py-1.5 ring-1 ring-white/8">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-flow-accent-blue/10"
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <RowIcon row={row} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-flow-text-primary">
              {row.name}
            </p>
            {location ? (
              <span className="shrink-0">
                <Chip>{location}</Chip>
              </span>
            ) : null}
          </div>
        </div>
        <p className="mt-0.5 text-[11px] text-flow-text-muted">
          Status:{" "}
          <span className={`max-w-[11.5rem] truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stepBadgeClasses(row.step)}`}>
            {stepLabel(row)}
          </span>
        </p>
      </div>
    </li>
  );
}

function ActionIcon({
  action,
  size = "md",
}: {
  action: LaunchAction;
  size?: "sm" | "md";
}) {
  const src = safeIconSrc(action.iconDataUrl ?? undefined);
  const sm = size === "sm";
  const globeClass = sm
    ? "h-4 w-4 shrink-0 text-sky-300"
    : "h-5 w-5 shrink-0 text-sky-300";
  const globeMuted = sm
    ? "h-4 w-4 shrink-0 text-flow-text-muted"
    : "h-9 w-9 shrink-0 text-flow-text-muted";
  const imgClass = sm
    ? "h-7 w-7 shrink-0 rounded-md object-cover ring-1 ring-white/15"
    : "h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/15";
  if (action.kind === "tab" || action.kind === "system") {
    return <Globe className={globeClass} strokeWidth={1.5} aria-hidden />;
  }
  if (src) {
    return (
      <img src={src} alt="" className={imgClass} draggable={false} />
    );
  }
  return <Globe className={globeMuted} strokeWidth={1.5} aria-hidden />;
}

function LaunchActionLeadSurface({
  action,
  progress,
  trailing,
}: {
  action: LaunchAction;
  progress: LaunchProgressSnapshot | null;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/35 ring-1 ring-white/12">
        <ActionIcon action={action} size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold leading-tight text-flow-text-primary">
          {action.title}
        </span>
        <ActionPlacementSummary action={action} progress={progress} compact />
      </div>
      {trailing}
    </div>
  );
}

function substepDisplayLabel(s: LaunchActionSubstep): string {
  if (s.id === "sub-confirm" && s.state === "completed" && s.label === "Waiting for confirmation") {
    return "Confirmed";
  }
  return s.label;
}

function shouldMarkVerifySubstepAsWarning(action: LaunchAction): boolean {
  if (action.state !== "warning") return false;
  const pills = Array.isArray(action.pills) ? action.pills : [];
  return pills.some((p) => String(p || "").trim().toLowerCase() === "constrained");
}

function humanLaunchActionState(
  state: LaunchAction["state"],
  runState: string | null | undefined,
): string {
  const rs = String(runState || "").trim().toLowerCase();
  if (rs === "cancelled" && !isTerminalActionState(state)) {
    return "Cancelled mid-run";
  }
  switch (state) {
    case "queued":
      return "Queued";
    case "running":
      return "In progress";
    case "completed":
      return "Completed";
    case "warning":
      return "Completed with a placement note";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return state;
  }
}

function actionStateLabel(
  action: LaunchAction,
  runState: string | null | undefined,
): string {
  return humanLaunchActionState(action.state, runState);
}

function displaySubstepsForAction(
  action: LaunchAction,
  runState: string | null | undefined,
): NonNullable<LaunchAction["substeps"]> {
  const subs = Array.isArray(action.substeps) ? action.substeps : [];
  if (!subs.length) return [];
  const rs = String(runState || "").trim().toLowerCase();
  if (rs !== "cancelled" || isTerminalActionState(action.state)) return subs;

  const next = subs.map((s) => ({ ...s }));
  const runningIndex = next.findIndex((s) => s.state === "running");
  if (runningIndex >= 0) {
    // Show where cancellation interrupted progress:
    // complete the in-flight launch step and fail the next pending step.
    next[runningIndex].state = "completed";
    for (let i = runningIndex + 1; i < next.length; i += 1) {
      if (next[i].state === "queued") {
        next[i].state = "failed";
        break;
      }
    }
    return next;
  }

  const firstQueued = next.findIndex((s) => s.state === "queued");
  const hadStartedWork = next.some(
    (s) => s.state === "completed" || s.state === "failed",
  );
  if (hadStartedWork && firstQueued >= 0) next[firstQueued].state = "failed";
  return next;
}

function SubstepList({
  subs,
  reducedMotion,
  warnSubstepIds = null,
}: {
  subs: NonNullable<LaunchAction["substeps"]>;
  reducedMotion: boolean;
  warnSubstepIds?: Set<string> | null;
}) {
  return (
    <ul className="mt-2 space-y-1 border-t border-white/[0.08] pt-2">
      {subs.map((s) => (
        <li key={s.id} className="flex items-center gap-2 text-[11px] text-flow-text-secondary">
          {(warnSubstepIds?.has(s.id) && s.state === "completed") ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300/95" strokeWidth={2.25} aria-hidden />
          ) : s.state === "running" && !reducedMotion ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-flow-accent-blue/80" aria-hidden />
          ) : s.state === "completed" ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300/90" strokeWidth={2.5} aria-hidden />
          ) : s.state === "failed" ? (
            <X className="h-3.5 w-3.5 shrink-0 text-rose-300/95" strokeWidth={2.5} aria-hidden />
          ) : (
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-white/15" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate">{substepDisplayLabel(s)}</span>
        </li>
      ))}
    </ul>
  );
}

function smartDecisionExtraCount(action: LaunchAction | null): number {
  const list = action?.smartDecisions;
  if (!list || list.length <= 1) return 0;
  return list.length - 1;
}

function CurrentActionExpandedBody({
  action,
  reducedMotion,
  runState,
}: {
  action: LaunchAction;
  reducedMotion: boolean;
  runState: string | null | undefined;
}) {
  const extra = smartDecisionExtraCount(action);
  const displaySubsteps = displaySubstepsForAction(action, runState);
  const warnSubstepIds = shouldMarkVerifySubstepAsWarning(action)
    ? new Set(["sub-verify"])
    : null;
  return (
    <div className="border-t border-white/[0.08] pt-2">
      <div className="min-h-[2.5rem]">
        {(() => {
          const pills = visibleLaunchPills(action.pills);
          return pills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {pills.map((p) => (
                <span
                  key={p}
                  className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-100 ring-1 ring-amber-400/25"
                >
                  {p}
                </span>
              ))}
            </div>
          ) : null;
        })()}
        {action.smartDecisions?.[0] ? (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug text-sky-100/90">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300/90" aria-hidden />
            <span className="min-w-0">{action.smartDecisions[0]}</span>
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-flow-text-muted">&nbsp;</p>
        )}
        {extra > 0 ? (
          <p className="mt-0.5 text-[10px] text-flow-text-muted">
            +
            {extra}
            {" "}
            more decisions
          </p>
        ) : null}
      </div>
      {action.state === "failed" ? (
        <p className="mt-1 text-[11px] text-rose-200">
          <span className="font-semibold">
            {failureKindLabel(action.failureKind)}
            :
          </span>
          {" "}
          {action.errorMessage || "Something went wrong."}
        </p>
      ) : null}
      {displaySubsteps.length ? (
        <SubstepList
          subs={displaySubsteps}
          reducedMotion={reducedMotion}
          warnSubstepIds={warnSubstepIds}
        />
      ) : null}
    </div>
  );
}

function ActionDetailsList({
  actions,
  reducedMotion,
  progress,
  runState,
  className = "",
}: {
  actions: LaunchAction[];
  reducedMotion: boolean;
  progress: LaunchProgressSnapshot | null;
  runState: string | null | undefined;
  className?: string;
}) {
  return (
    <ul className={`divide-y divide-white/[0.08] ${className}`.trim()}>
      {actions.map((a) => (
        <li key={a.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-start gap-2.5">
            <ActionIcon action={a} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold leading-snug text-flow-text-primary">{a.title}</p>
              <p className="text-[11px] text-flow-text-muted">
                {actionStateLabel(a, runState)}
                {actionDurationLabel(a) ? ` · ${actionDurationLabel(a)}` : ""}
              </p>
              <ActionPlacementSummary action={a} progress={progress} />
              {a.errorMessage ? (
                <p className="mt-1 text-[11px] text-rose-200">
                  {failureKindLabel(a.failureKind)}: {a.errorMessage}
                </p>
              ) : null}
              {a.smartDecisions?.length ? (
                <ul className="mt-1 space-y-0.5 text-[10px] text-flow-text-secondary">
                  {a.smartDecisions.map((d) => (
                    <li key={d} className="flex gap-1">
                      <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {displaySubstepsForAction(a, runState).length
                ? (
                  (() => {
                    const warnSubstepIds = shouldMarkVerifySubstepAsWarning(a)
                      ? new Set(["sub-verify"])
                      : null;
                    return (
                  <SubstepList
                    subs={displaySubstepsForAction(a, runState)}
                    reducedMotion={reducedMotion}
                    warnSubstepIds={warnSubstepIds}
                  />
                    );
                  })()
                )
                : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LaunchCenterInspector({
  profile,
  progress,
  summaryMessage,
  summaryTone,
  isLaunching,
  onCancel,
  cancelDisabled = false,
  cancelPending = false,
}: LaunchCenterInspectorProps) {
  const rows = useMemo(() => (progress?.appLaunchProgress ?? []).slice(), [progress]);
  const actions = progress?.actions;

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const hasTimeline = Array.isArray(actions) && actions.length > 0;

  const allActionsTerminal = useMemo(() => {
    if (!hasTimeline || !actions) return false;
    return actions.every((a) => isTerminalActionState(a.state));
  }, [actions, hasTimeline]);

  const runState = progress?.runState ?? null;
  const postRunTerminal = Boolean(
    runState && ["complete", "failed", "cancelled"].includes(runState),
  );
  const summaryReady = allActionsTerminal || runState === "cancelled";

  useEffect(() => {
    if (isLaunching) {
      setDetailsOpen(false);
      setShowAllCompleted(false);
    }
  }, [isLaunching]);

  const progressModel = useMemo(() => {
    if (!hasTimeline || !actions) return null;
    return computeSubstepWeightedProgress(actions);
  }, [actions, hasTimeline]);

  const progressLabelUnit = useMemo(() => {
    if (!actions?.length) return "steps";
    const anyMultiSubstep = actions.some((a) => (a.substeps?.length ?? 0) > 1);
    return anyMultiSubstep ? "steps" : "actions";
  }, [actions]);

  const eta = useMemo(() => {
    if (!hasTimeline || !actions || !progressModel) return { kind: "estimating" as const };
    return computeEta({ nowMs: Date.now(), actions, progress: progressModel });
  }, [actions, hasTimeline, progressModel]);

  const buckets = useMemo(() => {
    if (!hasTimeline || !actions || !progressModel) return null;
    const cap = showAllCompleted ? 999 : COMPLETED_CAP;
    return deriveBuckets({
      actions,
      activeActionId: progress?.activeActionId ?? null,
      completedCap: cap,
    });
  }, [actions, hasTimeline, progressModel, progress?.activeActionId, showAllCompleted]);

  const renderBuckets = buckets;

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const elapsedSec = useMemo(() => {
    const start = progress?.startedAtMs;
    const end = progress?.updatedAtMs ?? nowMs;
    if (!start || !Number.isFinite(start)) return null;
    return Math.max(0, Math.round((end - start) / 1000));
  }, [progress?.startedAtMs, progress?.updatedAtMs, nowMs]);

  const legacyOverallPct = useMemo(() => {
    if (!progress) return null;
    const total = progress.requestedAppCount ?? 0;
    if (total <= 0) return null;
    const r = progress.appLaunchProgress ?? [];
    if (!Array.isArray(r) || r.length === 0) return null;
    const sum = r.reduce((acc, row) => acc + stepProgress(row.step), 0);
    const avg = sum / Math.max(1, r.length);
    return Math.round(Math.min(1, Math.max(0, avg)) * 100);
  }, [progress]);

  const legacyOverallText = useMemo(() => {
    if (!progress) return null;
    const done = progress.launchedAppCount ?? 0;
    const total = progress.requestedAppCount ?? 0;
    if (!total) return null;
    return `${done} / ${total}`;
  }, [progress]);

  const showSummaryChrome = Boolean(
    hasTimeline && !isLaunching && postRunTerminal && summaryReady,
  );

  const postRunContextLine = useMemo(
    () => buildPostRunContextLine(runState),
    [runState],
  );

  const summaryOutcome = useMemo((): SummaryOutcome => {
    const rs = String(runState || "").toLowerCase();
    if (rs === "cancelled") return "cancelled";
    if (rs === "failed") return "error";
    if ((progress?.failedAppCount ?? 0) > 0) return "error";
    const hasFailedAction = actions?.some((a) => a.state === "failed");
    if (hasFailedAction) return "error";
    const hasWarnAction = actions?.some((a) => a.state === "warning");
    if (hasWarnAction || (progress?.skippedAppCount ?? 0) > 0) return "warning";
    return "success";
  }, [actions, progress?.failedAppCount, progress?.skippedAppCount, runState]);

  const summaryAppActions = useMemo(
    () => (actions ?? []).filter((a) => a.kind === "app"),
    [actions],
  );

  const completedAllList = useMemo(() => {
    if (!actions) return [];
    return actions.filter((a) => isTerminalActionState(a.state));
  }, [actions]);

  if (!hasTimeline) {
    return (
      <div className="min-h-0 min-w-0">
        {summaryMessage?.trim() ? (
          <div
            className={`mb-2 rounded-lg px-2.5 py-2 text-[11px] ring-1 ${
              summaryTone === "success"
                ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20"
                : summaryTone === "error"
                  ? "bg-rose-500/10 text-rose-200 ring-rose-400/20"
                  : "bg-amber-500/10 text-amber-200 ring-amber-400/20"
            }`}
          >
            {summaryMessage.trim()}
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-flow-text-muted">
              Launch
            </p>
            <p className="truncate text-sm font-semibold text-flow-text-primary">
              {profile.name}
            </p>
            {elapsedSec != null ? (
              <p className="mt-0.5 text-[11px] text-flow-text-muted tabular-nums">
                {isLaunching ? "Elapsed" : "Last run"}: {elapsedSec}s
              </p>
            ) : null}
          </div>
          <LaunchInspectorCancelButton
            disabled={cancelDisabled}
            pending={cancelPending}
            onCancel={onCancel}
          />
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-flow-text-secondary">
            <span>Overall</span>
            <span className="tabular-nums text-flow-text-primary/90">{legacyOverallText ?? "—"}</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-flow-text-primary/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={legacyOverallPct ?? undefined}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-flow-accent-blue to-violet-500"
              style={{ width: `${legacyOverallPct ?? 0}%` }}
            />
          </div>
          {isLaunching ? (
            <p className="mt-1.5 text-[11px] text-flow-text-muted">Preparing detailed timeline…</p>
          ) : null}
        </div>

        {rows.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {rows.map((row) => (
              <LaunchRow key={row.key} row={row} />
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (detailsOpen && hasTimeline && actions && !showSummaryChrome) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {summaryMessage?.trim() ? (
          <div
            className={`mb-2 rounded-lg px-2.5 py-2 text-[11px] ring-1 ${
              summaryTone === "success"
                ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20"
                : summaryTone === "error"
                  ? "bg-rose-500/10 text-rose-200 ring-rose-400/20"
                  : "bg-amber-500/10 text-amber-200 ring-amber-400/20"
            }`}
          >
            {summaryMessage.trim()}
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setDetailsOpen(false)}
              className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-flow-accent-blue hover:text-flow-accent-blue/90"
            >
              <ChevronRight className="h-4 w-4 rotate-180" aria-hidden />
              Back to launch view
            </button>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-flow-text-muted">
              Launch details
            </p>
            <p className="truncate text-sm font-semibold text-flow-text-primary">
              {profile.name}
            </p>
            {elapsedSec != null ? (
              <p className="mt-0.5 text-[11px] text-flow-text-muted tabular-nums">
                {isLaunching ? "Elapsed" : "Last run"}:
                {" "}
                {elapsedSec}
                s
              </p>
            ) : null}
          </div>
          <LaunchInspectorCancelButton
            disabled={cancelDisabled}
            pending={cancelPending}
            onCancel={onCancel}
          />
        </div>

        <ActionDetailsList
          actions={actions}
          reducedMotion={reducedMotion}
          progress={progress}
          runState={runState}
          className="scrollbar-elegant mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5"
        />
      </div>
    );
  }

  const pctRounded = progressModel ? Math.round(progressModel.percent * 100) : 0;
  const hiddenCompletedCount = Math.max(0, completedAllList.length - COMPLETED_CAP);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {summaryMessage?.trim() && !showSummaryChrome ? (
        <div
          className={`mb-2 rounded-lg px-2.5 py-2 text-[11px] ring-1 ${
            summaryTone === "success"
              ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20"
              : summaryTone === "error"
                ? "bg-rose-500/10 text-rose-200 ring-rose-400/20"
                : "bg-amber-500/10 text-amber-200 ring-amber-400/20"
          }`}
        >
          {summaryMessage.trim()}
        </div>
      ) : null}

      {showSummaryChrome ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-w-0 shrink-0 overflow-visible">
            <div className="border-b border-white/10 pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-flow-text-muted">
                    Launch summary
                  </p>
                  <span
                    className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold ${summaryOutcomeHeaderChip(summaryOutcome).className}`}
                    title={sessionSummaryOutcomeLabel(summaryOutcome, runState)}
                    aria-label={sessionSummaryOutcomeLabel(summaryOutcome, runState)}
                  >
                    {summaryOutcome === "error" || summaryOutcome === "cancelled" ? (
                      <X className="h-3.5 w-3.5 shrink-0" strokeWidth={2.3} aria-hidden />
                    ) : summaryOutcome === "warning" ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
                    ) : (
                      <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.3} aria-hidden />
                    )}
                    <span>{summaryOutcomeHeaderChip(summaryOutcome).label}</span>
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-xl font-semibold leading-none text-flow-text-primary">
                    {progress?.launchedAppCount ?? summaryAppActions.filter((a) => actionLooksLaunched(a, progress, runState)).length}
                    <span className="text-flow-text-secondary">/{progress?.requestedAppCount ?? summaryAppActions.length}</span>
                  </p>
                  <p className="text-[11px] font-semibold text-flow-text-muted">apps</p>
                </div>
              </div>
              <p className="mt-1.5 min-w-0 text-sm font-semibold leading-snug text-flow-text-primary">
                <span className="break-words">{profile.name}</span>
                {elapsedSec != null ? (
                  <span className="whitespace-nowrap text-flow-text-secondary/90 tabular-nums">
                    {" · "}
                    {elapsedSec}
                    s
                  </span>
                ) : null}
              </p>
            </div>
            {postRunContextLine ? (
              <p className="pb-2 pt-1 text-[11px] text-flow-text-secondary">
                {postRunContextLine}
              </p>
            ) : null}
            {summaryAppActions.length > 0 ? (
              <ul className="divide-y divide-white/10">
                {summaryAppActions.map((a) => (
                  <LaunchSummaryAppRow
                    key={a.id}
                    action={a}
                    progress={progress}
                    runState={runState}
                  />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-[12px] text-flow-text-muted">No app actions were recorded for this run.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="scrollbar-elegant flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-flow-text-muted">
                Launch
              </p>
              <p className="truncate text-sm font-semibold text-flow-text-primary">
                {profile.name}
              </p>
              {elapsedSec != null ? (
                <p className="mt-0.5 text-[11px] text-flow-text-muted tabular-nums">
                  {isLaunching ? "Elapsed" : "Last run"}: {elapsedSec}s
                </p>
              ) : null}
            </div>
            <LaunchInspectorCancelButton
              disabled={cancelDisabled}
              pending={cancelPending}
              onCancel={onCancel}
            />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-flow-text-secondary">
              <span>
                {progressModel
                  ? `${Math.floor(progressModel.completed)} of ${Math.floor(progressModel.total)} ${progressLabelUnit} completed`
                  : "Progress"}
              </span>
              <span className="tabular-nums text-flow-text-primary/90">
                {pctRounded}
                %
                {" · "}
                {formatEta(eta)}
              </span>
            </div>
              <div
                className="h-3.5 w-full overflow-hidden rounded-full bg-white/[0.14] ring-1 ring-white/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pctRounded}
              >
                <div
                  className="h-full min-h-[3px] min-w-0 rounded-full bg-gradient-to-r from-sky-500 via-flow-accent-blue to-violet-500"
                  style={{ width: `${pctRounded}%` }}
                />
              </div>
            {isLaunching
            && (
              (progress?.requestedAppCount ?? 0) > 0
              || (progress?.requestedBrowserTabCount ?? 0) > 0
              || (progress?.failedAppCount ?? 0) > 0
              || (progress?.skippedAppCount ?? 0) > 0
              || (progress?.unresolvedPendingConfirmationCount ?? 0) > 0
            ) ? (
              <p className="mt-2 text-[11px] leading-snug text-flow-text-secondary">
                <span className="font-semibold text-flow-text-muted">Run overview:</span>
                {" "}
                {(progress?.requestedAppCount ?? 0) > 0 ? (
                  <>
                    Apps
                    {" "}
                    <span className="tabular-nums text-flow-text-primary">
                      {progress?.launchedAppCount ?? 0}
                      /
                      {progress?.requestedAppCount ?? 0}
                    </span>
                  </>
                ) : null}
                {(progress?.requestedAppCount ?? 0) > 0
                && (progress?.requestedBrowserTabCount ?? 0) > 0
                  ? " · "
                  : null}
                {(progress?.requestedBrowserTabCount ?? 0) > 0 ? (
                  <>
                    Tabs
                    {" "}
                    <span className="tabular-nums text-flow-text-primary">
                      {progress?.launchedTabCount ?? 0}
                      /
                      {progress?.requestedBrowserTabCount ?? 0}
                    </span>
                  </>
                ) : null}
                {(progress?.failedAppCount ?? 0) > 0 ? (
                  <>
                    {" · "}
                    <span className="text-rose-200/95">
                      {progress?.failedAppCount}
                      {" failed"}
                    </span>
                  </>
                ) : null}
                {(progress?.skippedAppCount ?? 0) > 0 ? (
                  <>
                    {" · "}
                    <span className="text-flow-text-muted">
                      {progress?.skippedAppCount}
                      {" skipped"}
                    </span>
                  </>
                ) : null}
                {(progress?.unresolvedPendingConfirmationCount ?? 0) > 0 ? (
                  <>
                    {" · "}
                    <span className="text-amber-200/90">
                      {progress?.unresolvedPendingConfirmationCount}
                      {" awaiting confirmation"}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
            {isLaunching ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="text-[10px] font-medium text-flow-accent-blue hover:underline"
                >
                  Per-action details
                </button>
              </div>
            ) : null}
          </div>

          <>
              {renderBuckets?.current ? (
                <div
                  className={`relative isolate mt-3 rounded-xl border border-flow-accent-blue/35 bg-gradient-to-b from-flow-text-primary/[0.07] to-flow-bg-secondary/80 p-3 ring-1 ring-flow-accent-blue/20 ${
                    renderBuckets.current.state === "running"
                      ? "shadow-[0_0_24px_rgba(56,189,248,0.12)]"
                      : ""
                  }`}
                >
                  <p className="relative mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-flow-accent-blue/80">
                    Current action
                  </p>
                  <div className="rounded-[10px] p-px ring-1 ring-inset ring-flow-accent-blue/30 bg-flow-accent-blue/[0.07]">
                    <div
                      className={LAUNCH_LEAD_LAYOUT_SHELL_CLASS}
                      style={LAUNCH_LEAD_LAYOUT_SHELL_STYLE}
                    >
                      <LaunchActionLeadSurface action={renderBuckets.current} progress={progress} />
                    </div>
                  </div>
                  <div className="relative overflow-hidden">
                    <CurrentActionExpandedBody
                      action={renderBuckets.current}
                      reducedMotion={reducedMotion}
                      runState={runState}
                    />
                  </div>
                </div>
              ) : null}

              {renderBuckets && renderBuckets.upcoming.length > 0 && (actions?.length ?? 0) > 1 ? (
                <div className="mt-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-flow-text-muted">
                    Upcoming
                  </p>
                  <ul className="scrollbar-elegant max-h-[min(28vh,12rem)] space-y-1 overflow-y-auto overscroll-contain pr-0.5">
                    {renderBuckets.upcoming.map((a) => (
                      <li key={a.id} className="list-none text-flow-text-secondary">
                        <div className="rounded-[10px] p-px ring-1 ring-inset ring-transparent">
                          <div
                            className={LAUNCH_LEAD_LAYOUT_SHELL_CLASS}
                            style={LAUNCH_LEAD_LAYOUT_SHELL_STYLE}
                          >
                            <LaunchActionLeadSurface
                              action={a}
                              progress={progress}
                              trailing={
                                a.state === "running" ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 shrink-0 animate-spin text-flow-accent-blue/70"
                                    aria-hidden
                                  />
                                ) : null
                              }
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-flow-text-muted">
                    Completed
                  </p>
                  {hiddenCompletedCount > 0 && !showAllCompleted ? (
                    <button
                      type="button"
                      onClick={() => setShowAllCompleted(true)}
                      className="text-[10px] font-medium text-flow-accent-blue hover:underline"
                    >
                      View all (
                      {completedAllList.length}
                      )
                    </button>
                  ) : hiddenCompletedCount > 0 && showAllCompleted ? (
                    <button
                      type="button"
                      onClick={() => setShowAllCompleted(false)}
                      className="text-[10px] font-medium text-flow-accent-blue hover:underline"
                    >
                      Show less
                    </button>
                  ) : null}
                </div>
                <ul className="scrollbar-elegant max-h-[min(32vh,14rem)] space-y-1 overflow-y-auto overscroll-contain pr-0.5">
                  {renderBuckets?.completed.length ? (
                    renderBuckets.completed.map((a) => (
                      <li key={a.id} className="list-none space-y-1 rounded-[10px] bg-white/[0.04] p-0.5">
                        <div className="rounded-[10px] p-px ring-1 ring-inset ring-transparent">
                          <div
                            className={LAUNCH_LEAD_LAYOUT_SHELL_CLASS}
                            style={LAUNCH_LEAD_LAYOUT_SHELL_STYLE}
                          >
                            <LaunchActionLeadSurface
                              action={a}
                              progress={progress}
                              trailing={<TerminalCompletedTrailing action={a} />}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 px-0.5">
                          {visibleLaunchPills(a.pills).map((p) => (
                            <span
                              key={p}
                              className="rounded bg-white/5 px-1 py-0.5 text-[9px] text-flow-text-muted ring-1 ring-white/10"
                            >
                              {p}
                            </span>
                          ))}
                          {actionDurationLabel(a) ? (
                            <span className="text-[10px] text-flow-text-muted tabular-nums">
                              {actionDurationLabel(a)}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))
                  ) : (
                    <li className="text-[11px] text-flow-text-muted">No completed actions yet.</li>
                  )}
                </ul>
              </div>
            </>
        </div>
      )}
    </div>
  );
}
