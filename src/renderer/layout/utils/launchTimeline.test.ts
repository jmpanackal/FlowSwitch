import test from "node:test";
import assert from "node:assert/strict";
import type { LaunchAction } from "../hooks/useLaunchFeedback";
import {
  computeProgress,
  computeEta,
  computeSubstepWeightedProgress,
  deriveBuckets,
} from "./launchTimeline";

const baseAction = (overrides: Partial<LaunchAction>): LaunchAction => ({
  id: "a1",
  kind: "app",
  title: "Slack",
  state: "queued",
  startedAtMs: null,
  endedAtMs: null,
  pills: null,
  smartDecisions: null,
  errorMessage: null,
  failureKind: null,
  substeps: null,
  ...overrides,
});

test("computeProgress uses actionsCompleted/actionsTotal when present", () => {
  const p = computeProgress({
    actions: [baseAction({ state: "completed" })],
    actionsCompleted: 3,
    actionsTotal: 8,
  });
  assert.equal(p.completed, 3);
  assert.equal(p.total, 8);
  assert.equal(p.percent, 0.375);
});

test("computeProgress falls back to counting terminal states", () => {
  const p = computeProgress({
    actions: [
      baseAction({ id: "a1", state: "completed" }),
      baseAction({ id: "a2", state: "failed" }),
      baseAction({ id: "a3", state: "running" }),
      baseAction({ id: "a4", state: "queued" }),
    ],
  });
  assert.equal(p.completed, 2);
  assert.equal(p.total, 4);
});

test("computeProgress uses actionsTotal alone and derives completed from actions", () => {
  const p = computeProgress({
    actions: [
      baseAction({ id: "a1", state: "completed" }),
      baseAction({ id: "a2", state: "skipped" }),
      baseAction({ id: "a3", state: "running" }),
    ],
    actionsTotal: 10,
  });
  assert.equal(p.completed, 2);
  assert.equal(p.total, 10);
  assert.equal(p.percent, 0.2);
});

test("computeProgress uses actionsCompleted alone and derives total from actions length", () => {
  const p = computeProgress({
    actions: [
      baseAction({ id: "a1", state: "queued" }),
      baseAction({ id: "a2", state: "queued" }),
      baseAction({ id: "a3", state: "queued" }),
    ],
    actionsCompleted: 2,
  });
  assert.equal(p.completed, 2);
  assert.equal(p.total, 3);
  assert.ok(Math.abs(p.percent - 2 / 3) < 1e-9);
});

test("computeEta returns estimating when no finished action durations", () => {
  const eta = computeEta({
    nowMs: 10_000,
    actions: [
      baseAction({
        id: "a1",
        state: "running",
        startedAtMs: 1000,
        endedAtMs: null,
      }),
    ],
    progress: { completed: 0, total: 4, percent: 0 },
  });
  assert.equal(eta.kind, "estimating");
});

test("computeEta returns estimate from a single completed action sample", () => {
  const eta = computeEta({
    nowMs: 10_000,
    actions: [
      baseAction({
        id: "a1",
        state: "completed",
        startedAtMs: 1000,
        endedAtMs: 2000,
      }),
    ],
    progress: { completed: 1, total: 4, percent: 0.25 },
  });
  assert.equal(eta.kind, "estimate");
  assert.equal(eta.confidence, "low");
});

test("computeEta returns low/high confidence buckets", () => {
  const etaLow = computeEta({
    nowMs: 10_000,
    actions: [
      baseAction({ id: "a1", state: "completed", startedAtMs: 1000, endedAtMs: 2500 }),
      baseAction({ id: "a2", state: "completed", startedAtMs: 3000, endedAtMs: 4500 }),
    ],
    progress: { completed: 2, total: 5, percent: 0.4 },
  });
  assert.equal(etaLow.kind, "estimate");
  assert.equal(etaLow.confidence, "low");

  const etaHigh = computeEta({
    nowMs: 10_000,
    actions: [
      baseAction({ id: "a1", state: "completed", startedAtMs: 1000, endedAtMs: 2500 }),
      baseAction({ id: "a2", state: "completed", startedAtMs: 3000, endedAtMs: 4800 }),
      baseAction({ id: "a3", state: "completed", startedAtMs: 5000, endedAtMs: 6200 }),
      baseAction({ id: "a4", state: "completed", startedAtMs: 7000, endedAtMs: 8600 }),
    ],
    progress: { completed: 4, total: 8, percent: 0.5 },
  });
  assert.equal(etaHigh.kind, "estimate");
  assert.equal(etaHigh.confidence, "high");
});

test("deriveBuckets pins a single active action and caps completed", () => {
  const { current, upcoming, completed } = deriveBuckets({
    actions: [
      baseAction({ id: "c", state: "completed", startedAtMs: 1, endedAtMs: 2 }),
      baseAction({ id: "r", state: "running" }),
      baseAction({ id: "q1", state: "queued" }),
      baseAction({ id: "q2", state: "queued" }),
    ],
    activeActionId: "r",
    completedCap: 1,
  });
  assert.equal(current?.id, "r");
  assert.equal(upcoming.length, 2);
  assert.equal(completed.length, 1);
});

test("deriveBuckets falls back to first running when activeActionId is missing", () => {
  const { current } = deriveBuckets({
    actions: [
      baseAction({ id: "c", state: "completed" }),
      baseAction({ id: "r1", state: "running" }),
      baseAction({ id: "r2", state: "running" }),
    ],
    completedCap: 3,
  });
  assert.equal(current?.id, "r1");
});

test("deriveBuckets falls back to first running when activeActionId is not found", () => {
  const { current } = deriveBuckets({
    actions: [
      baseAction({ id: "c", state: "completed" }),
      baseAction({ id: "r", state: "running" }),
    ],
    activeActionId: "nonexistent",
    completedCap: 2,
  });
  assert.equal(current?.id, "r");
});

test("deriveBuckets ignores activeActionId when it points at a terminal action", () => {
  const { current, upcoming } = deriveBuckets({
    actions: [
      baseAction({ id: "done", state: "completed" }),
      baseAction({ id: "r1", state: "running" }),
      baseAction({ id: "r2", state: "running" }),
    ],
    activeActionId: "done",
    completedCap: 5,
  });
  assert.equal(current?.id, "r1");
  assert.ok(upcoming.some((a) => a.id === "r2"));
});

test("deriveBuckets ignores activeActionId for failed state (terminal)", () => {
  const { current } = deriveBuckets({
    actions: [
      baseAction({ id: "bad", state: "failed" }),
      baseAction({ id: "r", state: "running" }),
    ],
    activeActionId: "bad",
    completedCap: 3,
  });
  assert.equal(current?.id, "r");
});

test("deriveBuckets with completedCap 0 returns empty completed list", () => {
  const { completed } = deriveBuckets({
    actions: [
      baseAction({ id: "c1", state: "completed" }),
      baseAction({ id: "r", state: "running" }),
    ],
    activeActionId: "r",
    completedCap: 0,
  });
  assert.deepEqual(completed, []);
});

test("deriveBuckets places warning failed and skipped in completed bucket", () => {
  const { completed, current } = deriveBuckets({
    actions: [
      baseAction({ id: "w", state: "warning" }),
      baseAction({ id: "f", state: "failed" }),
      baseAction({ id: "s", state: "skipped" }),
      baseAction({ id: "r", state: "running" }),
    ],
    activeActionId: "r",
    completedCap: 10,
  });
  assert.equal(current?.id, "r");
  const completedIds = completed.map((a) => a.id).sort();
  assert.deepEqual(completedIds, ["f", "s", "w"]);
});

test("computeEta ignores non-finite and non-positive durations from timestamps", () => {
  const eta = computeEta({
    nowMs: 10_000,
    actions: [
      baseAction({ id: "a1", state: "completed", startedAtMs: 1000, endedAtMs: 2500 }),
      baseAction({ id: "a2", state: "completed", startedAtMs: 3000, endedAtMs: 4500 }),
      baseAction({
        id: "badNaN",
        state: "completed",
        startedAtMs: Number.NaN,
        endedAtMs: Number.NaN,
      }),
      baseAction({
        id: "badOrder",
        state: "completed",
        startedAtMs: 9000,
        endedAtMs: 1000,
      }),
    ],
    progress: { completed: 2, total: 5, percent: 0.4 },
  });
  assert.equal(eta.kind, "estimate");
  assert.equal(eta.remainingMs, 4500);
  assert.equal(eta.confidence, "low");
});

test("computeSubstepWeightedProgress advances per substep not only per action", () => {
  const subs = (launching: boolean) => [
    { id: "s1", label: "L", state: launching ? ("running" as const) : ("completed" as const) },
    { id: "s2", label: "P", state: "queued" as const },
    { id: "s3", label: "V", state: "queued" as const },
    { id: "s4", label: "C", state: "queued" as const },
  ];
  const running = computeSubstepWeightedProgress([
    baseAction({ id: "a1", state: "running", substeps: subs(true) }),
    baseAction({ id: "a2", state: "queued", substeps: subs(false).map((s) => ({ ...s, state: "queued" as const })) }),
  ]);
  assert.equal(running.total, 8);
  assert.equal(running.completed, 0.5);
  assert.ok(Math.abs(running.percent - 0.5 / 8) < 1e-9);

  const oneDone = computeSubstepWeightedProgress([
    baseAction({ id: "a1", state: "running", substeps: [
      { id: "s1", label: "L", state: "completed" },
      { id: "s2", label: "P", state: "running" },
      { id: "s3", label: "V", state: "queued" },
      { id: "s4", label: "C", state: "queued" },
    ] }),
    baseAction({ id: "a2", state: "queued", substeps: subs(false).map((s) => ({ ...s, state: "queued" as const })) }),
  ]);
  assert.equal(oneDone.completed, 1.5);
  assert.ok(Math.abs(oneDone.percent - 1.5 / 8) < 1e-9);
});
