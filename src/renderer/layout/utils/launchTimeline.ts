import type { LaunchAction } from "../hooks/useLaunchFeedback";

export type Progress = {
  completed: number;
  total: number;
  percent: number;
};

export type Eta =
  | { kind: "estimating" }
  | { kind: "estimate"; remainingMs: number; confidence: "low" | "high" };

function toNonNegativeInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function isTerminalAction(a: LaunchAction): boolean {
  return (
    a.state === "completed"
    || a.state === "warning"
    || a.state === "failed"
    || a.state === "skipped"
  );
}

export function computeProgress(input: {
  actions?: LaunchAction[] | null;
  actionsCompleted?: number | null;
  actionsTotal?: number | null;
}): Progress {
  const actions = Array.isArray(input?.actions) ? input.actions : [];
  const completedFromField = Number(input?.actionsCompleted);
  const totalFromField = Number(input?.actionsTotal);
  const terminalCount = actions.filter(isTerminalAction).length;

  const hasFiniteCompleted = Number.isFinite(completedFromField);
  const hasValidTotal =
    Number.isFinite(totalFromField) && totalFromField > 0;

  const completed = hasFiniteCompleted ? toNonNegativeInt(completedFromField) : terminalCount;
  const total = hasValidTotal
    ? Math.max(1, toNonNegativeInt(totalFromField))
    : Math.max(1, actions.length);

  const percent = Math.min(1, Math.max(0, completed / total));
  return { completed, total, percent };
}

/** Substeps (or one virtual unit per action) for granular progress / ETA. */
export function substepUnitTotal(action: LaunchAction): number {
  const n = action.substeps?.length ?? 0;
  return n > 0 ? n : 1;
}

export function completedSubstepUnits(action: LaunchAction): number {
  if (action.state === "skipped") {
    return substepUnitTotal(action);
  }
  const subs = action.substeps;
  if (!subs || subs.length === 0) {
    if (isTerminalAction(action)) return 1;
    if (action.state === "running") return 0.5;
    return 0;
  }
  let c = 0;
  for (const s of subs) {
    if (s.state === "completed" || s.state === "failed") c += 1;
    else if (s.state === "running") c += 0.5;
  }
  return c;
}

/** Progress weighted by substeps so the bar moves through launch → place → verify → confirm. */
export function computeSubstepWeightedProgress(
  actions: LaunchAction[] | null | undefined,
): Progress {
  const list = Array.isArray(actions) ? actions : [];
  const total = list.reduce((sum, a) => sum + substepUnitTotal(a), 0);
  const completed = list.reduce((sum, a) => sum + completedSubstepUnits(a), 0);
  const percent = Math.min(1, Math.max(0, completed / Math.max(1, total)));
  return { completed, total, percent };
}

export function computeEta(input: {
  nowMs: number;
  actions: LaunchAction[];
  progress: Progress;
}): Eta {
  const actions = Array.isArray(input?.actions) ? input.actions : [];
  const progress = input?.progress || { completed: 0, total: 0, percent: 0 };

  const perSubstepMsSamples: number[] = [];
  for (const a of actions) {
    if (!isTerminalAction(a)) continue;
    if (a.startedAtMs == null || a.endedAtMs == null) continue;
    const dur = Math.max(0, Number(a.endedAtMs) - Number(a.startedAtMs));
    if (!Number.isFinite(dur) || dur <= 0) continue;
    const units = Math.max(1, substepUnitTotal(a));
    perSubstepMsSamples.push(dur / units);
  }

  if (perSubstepMsSamples.length < 1) return { kind: "estimating" };

  const avgMsPerUnit =
    perSubstepMsSamples.reduce((sum, v) => sum + v, 0) / perSubstepMsSamples.length;

  const remainingUnits = Math.max(
    0,
    toNonNegativeInt(progress.total) - toNonNegativeInt(progress.completed),
  );
  const remainingMs = Math.max(0, Math.round(avgMsPerUnit * remainingUnits));

  return {
    kind: "estimate",
    remainingMs,
    confidence: perSubstepMsSamples.length >= 3 ? "high" : "low",
  };
}

export function deriveBuckets(input: {
  actions: LaunchAction[];
  activeActionId?: string | null;
  completedCap: number;
}): { current: LaunchAction | null; upcoming: LaunchAction[]; completed: LaunchAction[] } {
  const actions = Array.isArray(input?.actions) ? input.actions : [];
  const completedCap = Math.max(0, toNonNegativeInt(input?.completedCap));
  const activeActionId =
    typeof input?.activeActionId === "string" ? input.activeActionId : null;

  let current: LaunchAction | null = null;
  if (activeActionId) {
    const pinned = actions.find((a) => a.id === activeActionId);
    if (pinned && !isTerminalAction(pinned)) {
      current = pinned;
    }
  }
  if (!current) {
    current = actions.find((a) => a.state === "running") ?? null;
  }

  const completedAll = actions.filter((a) => isTerminalAction(a) && (!current || a.id !== current.id));
  const completed =
    completedCap === 0
      ? []
      : completedAll.slice(Math.max(0, completedAll.length - completedCap));

  const upcoming = actions.filter((a) => {
    if (current && a.id === current.id) return false;
    if (isTerminalAction(a)) return false;
    if (a.state === "queued") return true;
    if (a.state === "running") return true;
    return false;
  });

  return { current, upcoming, completed };
}
