import { safeIconSrc } from "../../utils/safeIconSrc";
import type {
  AppLaunchRowProgress,
  LaunchAction,
  LaunchActionState,
  LaunchActionSubstep,
  LaunchActionSubstepState,
  LaunchProgressSnapshot,
} from "../hooks/useLaunchFeedback";

const APP_STEP_SET = new Set<AppLaunchRowProgress["step"]>([
  "pending",
  "launching",
  "placing",
  "verifying",
  "opening-content",
  "awaiting-confirmation",
  "done",
  "failed",
  "skipped",
]);

const MAX_TIMELINE_ACTIONS = 64;
const MAX_SUBSTEPS_PER_ACTION = 32;
const MAX_LIST_ITEMS = 24;
const MAX_LIST_STRING_LEN = 256;
const MAX_ERROR_MESSAGE_LEN = 4000;
const MAX_CONTENT_ITEMS = 32;
const MAX_CONTENT_NAME_LEN = 256;
const MAX_CONTENT_PATH_LEN = 1000;

const ACTION_STATE_SET = new Set<LaunchActionState>([
  "queued",
  "running",
  "completed",
  "warning",
  "failed",
  "skipped",
]);

const SUBSTEP_STATE_SET = new Set<LaunchActionSubstepState>([
  "queued",
  "running",
  "completed",
  "failed",
]);

function optionalFiniteMs(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeActionState(raw: unknown): LaunchActionState {
  const s = String(raw ?? "").trim().toLowerCase();
  return ACTION_STATE_SET.has(s as LaunchActionState)
    ? (s as LaunchActionState)
    : "queued";
}

function normalizeSubstepState(raw: unknown): LaunchActionSubstepState {
  const s = String(raw ?? "").trim().toLowerCase();
  return SUBSTEP_STATE_SET.has(s as LaunchActionSubstepState)
    ? (s as LaunchActionSubstepState)
    : "queued";
}

function normalizeStringList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const cap = Math.min(raw.length, MAX_LIST_ITEMS);
  for (let i = 0; i < cap; i++) {
    let s = String(raw[i] ?? "").trim();
    if (!s) continue;
    if (s.length > MAX_LIST_STRING_LEN) s = s.slice(0, MAX_LIST_STRING_LEN);
    out.push(s);
  }
  return out.length ? out : null;
}

function normalizeFailureKind(
  raw: unknown,
): LaunchAction["failureKind"] {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "launch" || s === "placement" || s === "verification") return s;
  return null;
}

function normalizeOptionalCount(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function mapLaunchActionContentItems(
  raw: unknown,
): LaunchAction["contentItems"] {
  if (!Array.isArray(raw)) return null;
  const out: NonNullable<LaunchAction["contentItems"]> = [];
  const cap = Math.min(raw.length, MAX_CONTENT_ITEMS);
  for (let i = 0; i < cap; i += 1) {
    const o = raw[i] && typeof raw[i] === "object" ? (raw[i] as Record<string, unknown>) : {};
    let name = String(o.name ?? "").trim();
    if (name.length > MAX_CONTENT_NAME_LEN) name = name.slice(0, MAX_CONTENT_NAME_LEN);
    let path = String(o.path ?? "").trim();
    if (path.length > MAX_CONTENT_PATH_LEN) path = path.slice(0, MAX_CONTENT_PATH_LEN);
    const pathOrNull = path || null;
    const typeRaw = String(o.type ?? "").trim().toLowerCase();
    const type: "folder" | "file" = typeRaw === "folder" ? "folder" : "file";
    if (!name && !pathOrNull) continue;
    out.push({
      name: name || pathOrNull || "Content item",
      type,
      path: pathOrNull,
    });
  }
  return out.length ? out : null;
}

function mapLaunchActionSubstep(
  raw: unknown,
  index: number,
): LaunchActionSubstep {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = String(o.id ?? "").trim() || `sub-${index}`;
  const label = String(o.label ?? "").trim() || "Step";
  return {
    id,
    label,
    state: normalizeSubstepState(o.state),
    startedAtMs: optionalFiniteMs(o.startedAtMs ?? o.startedAt),
    endedAtMs: optionalFiniteMs(o.endedAtMs ?? o.endedAt),
  };
}

function mapLaunchAction(raw: unknown, index: number): LaunchAction {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = String(o.id ?? "").trim() || `action-${index}`;
  const title = String(o.title ?? "").trim() || "Action";
  const kindRaw = String(o.kind ?? "app").trim().toLowerCase();
  const kind: LaunchAction["kind"] =
    kindRaw === "tab" || kindRaw === "system" ? kindRaw : "app";
  const errRaw = String(o.errorMessage ?? "").trim();
  const errorMessage = errRaw
    ? errRaw.slice(0, MAX_ERROR_MESSAGE_LEN)
    : null;
  const iconValidated = safeIconSrc(
    o.iconDataUrl != null ? String(o.iconDataUrl) : undefined,
  );
  const substepsIn = Array.isArray(o.substeps) ? o.substeps : [];
  const substeps = substepsIn
    .slice(0, MAX_SUBSTEPS_PER_ACTION)
    .map((s, j) => mapLaunchActionSubstep(s, j));
  const failureKind = normalizeFailureKind(o.failureKind);
  const locRaw = String(o.targetLocation ?? "").trim();
  const targetLocation = locRaw ? locRaw.slice(0, MAX_LIST_STRING_LEN) : null;
  const modeRaw = String(o.contentSubstepMode ?? "").trim().toLowerCase();
  const contentSubstepMode: LaunchAction["contentSubstepMode"] =
    modeRaw === "post-verify" || modeRaw === "parallel-launch" ? modeRaw : null;
  return {
    id,
    kind,
    title,
    targetLocation,
    state: normalizeActionState(o.state),
    iconDataUrl: iconValidated ?? null,
    pills: normalizeStringList(o.pills),
    smartDecisions: normalizeStringList(o.smartDecisions),
    contentItems: mapLaunchActionContentItems(o.contentItems),
    contentSubstepMode,
    contentOpenFailed: Boolean(o.contentOpenFailed),
    errorMessage,
    failureKind,
    startedAtMs: optionalFiniteMs(o.startedAtMs ?? o.startedAt),
    endedAtMs: optionalFiniteMs(o.endedAtMs ?? o.endedAt),
    substeps: substeps.length ? substeps : null,
  };
}

function mapLaunchActions(raw: unknown): LaunchAction[] | null {
  if (!Array.isArray(raw)) return null;
  const mapped = raw
    .slice(0, MAX_TIMELINE_ACTIONS)
    .map((item, i) => mapLaunchAction(item, i));
  return mapped.length ? mapped : null;
}

function normalizeActiveActionId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  return s || null;
}

function normalizeRunState(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return s || null;
}

export function progressFromLaunchStatus(status: {
  startedAt?: number | null;
  updatedAt?: number | null;
  state?: string | null;
  launchedAppCount?: number;
  launchedTabCount?: number;
  failedAppCount?: number;
  skippedAppCount?: number;
  requestedAppCount?: number;
  unresolvedPendingConfirmationCount?: number;
  requestedBrowserTabCount?: number;
  activePhase?: string | null;
  activeAppName?: string | null;
  appLaunchProgress?: Array<{
    key?: string;
    name?: string;
    step?: string;
    iconDataUrl?: string | null;
    location?: string;
    outcomes?: unknown;
  }>;
  activeActionId?: string | null;
  actionsTotal?: number | null;
  actionsCompleted?: number | null;
  actions?: unknown;
  startedAtMs?: number | null;
  updatedAtMs?: number | null;
  runId?: string | null;
}): LaunchProgressSnapshot {
  const rawPhase = String(status.activePhase || "").trim().toLowerCase();
  const activePhase =
    rawPhase === "launching" || rawPhase === "placing" || rawPhase === "tabs"
      ? rawPhase
      : null;
  const activeName = String(status.activeAppName || "").trim();
  const rowsIn = Array.isArray(status.appLaunchProgress) ? status.appLaunchProgress : [];
  const appLaunchProgress: AppLaunchRowProgress[] = rowsIn.map((row, index) => {
    const stepRaw = String(row?.step || "pending").trim().toLowerCase();
    const step = APP_STEP_SET.has(stepRaw as AppLaunchRowProgress["step"])
      ? (stepRaw as AppLaunchRowProgress["step"])
      : "pending";
    const iconDataUrl = safeIconSrc(row?.iconDataUrl) ?? null;
    const location = row?.location ? String(row.location).trim() : "";
    const outcomes = Array.isArray(row?.outcomes)
      ? row.outcomes
          .map((v) => String(v || "").trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    return {
      key: String(row?.key || "").trim() || `row-${index}`,
      name: String(row?.name || "").trim() || "App",
      step,
      iconDataUrl,
      location: location || null,
      outcomes: outcomes.length ? outcomes : null,
    };
  });

  const activeActionId =
    status.activeActionId !== undefined && status.activeActionId !== null
      ? normalizeActiveActionId(status.activeActionId)
      : null;
  const actionsTotal = normalizeOptionalCount(status.actionsTotal);
  const actionsCompleted = normalizeOptionalCount(status.actionsCompleted);
  const actions = mapLaunchActions(status.actions);
  const startedAtMs = optionalFiniteMs(status.startedAtMs ?? status.startedAt);
  const updatedAtMs = optionalFiniteMs(status.updatedAtMs ?? status.updatedAt);
  const runState = normalizeRunState(status.state);
  const runIdRaw = String(status.runId ?? "").trim();

  const snapshot: LaunchProgressSnapshot = {
    launchedAppCount: Number(status.launchedAppCount || 0),
    launchedTabCount: Number(status.launchedTabCount || 0),
    failedAppCount: Number(status.failedAppCount || 0),
    skippedAppCount: Number(status.skippedAppCount || 0),
    requestedAppCount: Math.max(0, Number(status.requestedAppCount || 0)),
    unresolvedPendingConfirmationCount: Number(
      status.unresolvedPendingConfirmationCount || 0,
    ),
    requestedBrowserTabCount: Math.max(0, Number(status.requestedBrowserTabCount || 0)),
    activePhase,
    activeAppName: activeName || null,
    appLaunchProgress,
  };

  if (runState != null) snapshot.runState = runState;
  if (activeActionId != null) snapshot.activeActionId = activeActionId;
  if (actionsTotal != null) snapshot.actionsTotal = actionsTotal;
  if (actionsCompleted != null) snapshot.actionsCompleted = actionsCompleted;
  if (actions != null) snapshot.actions = actions;
  if (startedAtMs != null) snapshot.startedAtMs = startedAtMs;
  if (updatedAtMs != null) snapshot.updatedAtMs = updatedAtMs;
  if (runIdRaw) snapshot.runId = runIdRaw;

  return snapshot;
}
