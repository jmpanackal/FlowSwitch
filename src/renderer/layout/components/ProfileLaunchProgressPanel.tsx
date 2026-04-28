import { useEffect, useMemo, useState } from "react";
import { Globe, Loader2, type LucideIcon } from "lucide-react";
import type { FlowProfile } from "../../../types/flow-profile";
import type { LaunchProgressSnapshot } from "../hooks/useLaunchFeedback";
import { safeIconSrc } from "../../utils/safeIconSrc";

type ProfileLaunchProgressPanelProps = {
  profile: FlowProfile;
  /** Secondary line (e.g. confirmation copy). */
  detailMessage?: string;
  progress: LaunchProgressSnapshot | null;
  onCancel: () => void;
  cancelDisabled?: boolean;
};

type AppRow = NonNullable<LaunchProgressSnapshot["appLaunchProgress"]>[number];

/** Raster data URL and/or Lucide fallback — matches `MonitorLayout` app tiles. */
type AppIconVisual = {
  raster?: string;
  Lucide?: LucideIcon;
};

function collectProfileAppVisuals(
  profile: FlowProfile | null,
): Map<string, AppIconVisual> {
  const map = new Map<string, AppIconVisual>();
  if (!profile?.monitors) return map;

  const ingest = (app: {
    name?: string;
    instanceId?: string;
    icon?: unknown;
    iconPath?: string | null;
  }) => {
    const name = String(app?.name || "").trim();
    const id = String(app?.instanceId || "").trim();
    const pathStr = typeof app?.iconPath === "string" ? app.iconPath : "";
    const iconStr = typeof app?.icon === "string" ? app.icon : "";
    const raster = safeIconSrc(pathStr || undefined)
      ?? safeIconSrc(iconStr || undefined);
    const maybe = app?.icon;
    const Lucide = typeof maybe === "function" ? (maybe as LucideIcon) : undefined;
    if (!raster && !Lucide) return;
    const entry: AppIconVisual = {};
    if (raster) entry.raster = raster;
    if (Lucide) entry.Lucide = Lucide;
    if (id) map.set(id, entry);
    if (name) map.set(`name:${name.toLowerCase()}`, entry);
  };

  for (const mon of profile.monitors) {
    for (const app of mon.apps || []) ingest(app);
  }
  for (const app of profile.minimizedApps || []) ingest(app);
  return map;
}

function resolveVisualForRow(
  visuals: Map<string, AppIconVisual>,
  row: AppRow,
): AppIconVisual | null {
  const fromLaunch = safeIconSrc(row.iconDataUrl ?? undefined);
  if (fromLaunch) return { raster: fromLaunch };
  const byId = visuals.get(row.key);
  if (byId?.raster || byId?.Lucide) return byId;
  const byName = visuals.get(`name:${row.name.trim().toLowerCase()}`);
  if (byName?.raster || byName?.Lucide) return byName;
  return null;
}

function resolveVisualByAppName(
  visuals: Map<string, AppIconVisual>,
  name: string,
  rows: AppRow[],
): AppIconVisual | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const namedRow = rows.find((r) => r.name.trim().toLowerCase() === key);
  if (namedRow) {
    const fromLaunch = safeIconSrc(namedRow.iconDataUrl ?? undefined);
    if (fromLaunch) return { raster: fromLaunch };
  }
  const entry = visuals.get(`name:${key}`);
  if (entry?.raster || entry?.Lucide) return entry;
  return null;
}

/** Fills a sized parent (e.g. h-14 w-14 flex center). */
function AppIconMark({
  visual,
  size,
}: {
  visual: AppIconVisual | null;
  size: "hero" | "row";
}) {
  const lucideClass = size === "hero"
    ? "h-8 w-8 text-white/90 drop-shadow-sm"
    : "h-4 w-4 text-white/90";
  const globeClass = size === "hero"
    ? "h-8 w-8 text-flow-text-muted"
    : "h-4 w-4 text-flow-text-muted";
  if (visual?.raster) {
    return (
      <img
        src={visual.raster}
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  }
  if (visual?.Lucide) {
    const Icon = visual.Lucide;
    return <Icon className={lucideClass} strokeWidth={1.5} aria-hidden />;
  }
  return <Globe className={globeClass} strokeWidth={1.5} aria-hidden />;
}

function stepBadgeClasses(step: AppRow["step"]): string {
  switch (step) {
    case "launching":
      return "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35";
    case "placing":
      return "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/35";
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

function stepLabel(step: AppRow["step"]): string {
  switch (step) {
    case "launching":
      return "Starting";
    case "placing":
      return "Positioning";
    case "awaiting-confirmation":
      return "Confirmation";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return "Waiting";
  }
}

const ACTIVE_ROW_STEPS = new Set<AppRow["step"]>([
  "launching",
  "placing",
  "awaiting-confirmation",
]);

function pickCurrentAppRow(
  progress: LaunchProgressSnapshot | null,
  rows: AppRow[],
): AppRow | null {
  if (!progress) return null;
  const activeName = progress.activeAppName?.trim().toLowerCase() || "";
  const inFlight = rows.filter((r) => ACTIVE_ROW_STEPS.has(r.step));
  if (inFlight.length > 0) {
    if (activeName) {
      const byName = inFlight.find(
        (r) => r.name.trim().toLowerCase() === activeName,
      );
      if (byName) return byName;
    }
    return inFlight[0];
  }
  if (activeName) {
    return rows.find((r) => r.name.trim().toLowerCase() === activeName) ?? null;
  }
  return null;
}

function phaseHeadline(
  progress: LaunchProgressSnapshot | null,
): { title: string; subtitle: string | null } {
  if (!progress) {
    return { title: "Preparing launch…", subtitle: null };
  }
  const name = progress.activeAppName?.trim() || null;
  const phase = progress.activePhase;
  if (phase === "tabs" && name) {
    return {
      title: name,
      subtitle: "Opening in browser",
    };
  }
  if (name && phase === "placing") {
    return { title: name, subtitle: "Positioning on layout" };
  }
  if (name && phase === "launching") {
    return { title: name, subtitle: "Starting app" };
  }
  if (name) {
    return { title: name, subtitle: null };
  }
  return { title: "Launch in progress", subtitle: null };
}

export function ProfileLaunchProgressPanel({
  profile,
  detailMessage,
  progress,
  onCancel,
  cancelDisabled = false,
}: ProfileLaunchProgressPanelProps) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const tick = () =>
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const headline = useMemo(() => phaseHeadline(progress), [progress]);

  const appVisualLookup = useMemo(
    () => collectProfileAppVisuals(profile),
    [profile],
  );

  const rows = useMemo(
    () =>
      progress?.appLaunchProgress?.length
        ? progress.appLaunchProgress
        : [],
    [progress],
  );

  const currentAppRow = useMemo(
    () => pickCurrentAppRow(progress, rows),
    [progress, rows],
  );

  const heroSlot = useMemo(() => {
    if (!progress) {
      return { mode: "spinner" as const };
    }
    if (progress.activePhase === "tabs") {
      return { mode: "tabs" as const };
    }
    let visual: AppIconVisual | null = null;
    if (currentAppRow) {
      visual = resolveVisualForRow(appVisualLookup, currentAppRow);
    }
    if (!visual && progress.activeAppName?.trim()) {
      visual = resolveVisualByAppName(
        appVisualLookup,
        progress.activeAppName.trim(),
        rows,
      );
    }
    if (visual?.raster || visual?.Lucide) {
      return { mode: "app" as const, visual };
    }
    return { mode: "spinner" as const };
  }, [progress, currentAppRow, appVisualLookup, rows]);

  const overallFraction = useMemo(() => {
    if (!progress) return null;
    const req = progress.requestedAppCount;
    if (req <= 0) return null;
    return Math.min(1, Math.max(0, progress.launchedAppCount / req));
  }, [progress]);

  const tabLine = useMemo(() => {
    if (!progress?.requestedBrowserTabCount) return null;
    const total = progress.requestedBrowserTabCount;
    const done = progress.launchedTabCount;
    return `Browser tabs: ${done} / ${total}`;
  }, [progress]);

  return (
    <div
      className="w-full min-w-[min(18rem,calc(100vw-8rem))] max-w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-flow-accent-blue/40 bg-gradient-to-b from-flow-surface-elevated via-flow-bg-secondary to-flow-bg-secondary/95 p-4 shadow-xl shadow-black/35 ring-1 ring-flow-accent-blue/15"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-progress-title"
    >
      <div className="flex items-start gap-3 border-b border-flow-border/50 pb-3">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-flow-text-primary/10 to-flow-text-primary/5 ring-2 ring-flow-accent-blue/30 shadow-md">
          {heroSlot.mode === "tabs" ? (
            <Globe className="h-8 w-8 text-sky-300" strokeWidth={1.5} />
          ) : heroSlot.mode === "app" ? (
            <AppIconMark visual={heroSlot.visual} size="hero" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-flow-accent-blue/80" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p
                id="launch-progress-title"
                className="text-[11px] font-semibold uppercase tracking-wide text-flow-accent-blue/90"
              >
                Launching workspace
              </p>
              <h2 className="truncate text-base font-semibold text-flow-text-primary">
                {profile.name}
              </h2>
              <p className="mt-0.5 truncate text-sm font-medium text-flow-text-primary">
                {headline.title}
              </p>
              {headline.subtitle ? (
                <p className="truncate text-xs text-flow-text-secondary">
                  {headline.subtitle}
                </p>
              ) : null}
              {detailMessage?.trim() ? (
                <p className="mt-1 line-clamp-2 text-xs text-amber-200/90">
                  {detailMessage.trim()}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 tabular-nums text-xs text-flow-text-muted">
              {elapsedSec}s
            </span>
          </div>
        </div>
      </div>

      {overallFraction != null ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-flow-text-secondary">
            <span>Overall apps</span>
            <span className="tabular-nums text-flow-text-primary/90">
              {progress?.launchedAppCount ?? 0}
              {" / "}
              {progress?.requestedAppCount ?? 0}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-flow-text-primary/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(overallFraction * 100)}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 via-flow-accent-blue to-violet-500 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.round(overallFraction * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-flow-text-secondary">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-80" />
          <span>Connecting to launch status…</span>
        </div>
      )}

      {tabLine ? (
        <p className="mt-2 text-[11px] text-flow-text-muted">{tabLine}</p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="mt-3 max-h-[min(14rem,40vh)] space-y-1.5 overflow-y-auto pr-0.5">
          {rows.map((row) => {
            const rowVisual = resolveVisualForRow(appVisualLookup, row);
            return (
              <li
                key={row.key}
                className="flex items-center gap-2.5 rounded-lg border border-flow-border/40 bg-flow-bg-secondary/60 px-2.5 py-2"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-flow-text-primary/5 ring-1 ring-flow-border/40">
                  <AppIconMark visual={rowVisual} size="row" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-flow-text-primary">
                    {row.name}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${stepBadgeClasses(row.step)}`}
                >
                  {stepLabel(row.step)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-flow-border/40 pt-3 text-[11px] text-flow-text-muted">
        <span className="tabular-nums">
          {progress?.failedAppCount ? `${progress.failedAppCount} failed · ` : ""}
          {progress?.skippedAppCount ? `${progress.skippedAppCount} skipped` : ""}
        </span>
        <button
          type="button"
          onClick={() => void onCancel()}
          disabled={cancelDisabled}
          className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/25 disabled:pointer-events-none disabled:opacity-45"
        >
          Cancel launch
        </button>
      </div>
    </div>
  );
}
