# Launch Panel Execution Engine Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a state-driven “execution engine” launch panel: pinned dominant current action, queued/upcoming, capped completed history, step-based progress + ETA, smart decisions, failure taxonomy, cancel summary, and details drill-down.

**Architecture:** Extend main-process launch status publishing with a stable-ID `actions[]` timeline (Actions + Substeps + timestamps + decisions). Renderer consumes the timeline to render a pinned current card and two scrollable lists, with motion + stability rules and summary mode after completion/cancel.

**Tech Stack:** Electron (main/preload), React 18 + TypeScript (renderer), Tailwind CSS, Lucide icons, Node’s built-in test runner (`npm run test`).

---

## File/Module Map (what changes where)

**Modify (main):**
- `src/main/services/profile-launch-runner.js`: emit structured `actions[]` timeline + stable IDs + timestamps + decisions + failureKind.
- `src/main/services/launch-status-store.js`: accept and clone the new `actions` fields safely (and preserve old fields).
- `src/main/main.js` (or wherever status is exposed to renderer): ensure new fields are included in the status IPC response used by the renderer poller (no contract drops).

**Modify (preload + types):**
- `src/preload.js`: if there is an IPC contract map/validator, extend it for the new fields.
- `src/types/preload.d.ts`: extend TS types for launch status polling result payloads.

**Modify (renderer):**
- `src/renderer/layout/hooks/useLaunchFeedback.ts`: extend `LaunchProgressSnapshot` type to include `actions*` timeline + failureKind + details-mode flags if needed.
- `src/renderer/layout/components/ProfileLaunchProgressPanel.tsx`: rewrite UI to new pinned current/upcoming/completed layout and add summary/details modes + cancel aftermath.

**Create (renderer utils + tests):**
- `src/renderer/layout/utils/launchTimeline.ts`: pure helpers (derive current/upcoming/completed, progress, ETA confidence, jitter-safe rendering inputs).
- `src/renderer/layout/utils/launchTimeline.test.ts`: unit tests for progress/ETA/confidence + ordering rules.

**Optional integration (monitor layout highlight):**
- Modify the monitor layout component where app tiles render (likely under `src/renderer/layout/...`) to accept a short-lived “highlight app id/handle” signal from the launch panel.
  - If integration surface is not clean, create an event bridge module instead of tight coupling.

---

## Task 1: Add renderer-side timeline utilities (TDD)

**Files:**
- Create: `src/renderer/layout/utils/launchTimeline.js`
- Create: `src/renderer/layout/utils/launchTimeline.test.js`
- Modify: `package.json` (include renderer JS test in `npm run test`)

- [ ] **Step 1: Write failing tests for progress + ETA confidence**

```js
// src/renderer/layout/utils/launchTimeline.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeProgress, computeEta, deriveBuckets } = require("./launchTimeline.js");

const baseAction = (overrides) => ({
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

test("computeEta returns estimating when insufficient samples", () => {
  const eta = computeEta({
    nowMs: 10_000,
    actions: [baseAction({ id: "a1", state: "completed", startedAtMs: 1000, endedAtMs: 2000 })],
    progress: { completed: 1, total: 4 },
  });
  assert.equal(eta.kind, "estimating");
});

test("computeEta returns low/high confidence buckets", () => {
  const etaLow = computeEta({
    nowMs: 10_000,
    actions: [
      baseAction({ id: "a1", state: "completed", startedAtMs: 1000, endedAtMs: 2500 }), // 1.5s
      baseAction({ id: "a2", state: "completed", startedAtMs: 3000, endedAtMs: 4500 }), // 1.5s
    ],
    progress: { completed: 2, total: 5 },
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
    progress: { completed: 4, total: 8 },
  });
  assert.equal(etaHigh.kind, "estimate");
  assert.equal(etaHigh.confidence, "high");
});

test("deriveBuckets pins a single active action and caps completed by default", () => {
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test`  
Expected: FAIL because `launchTimeline` exports don’t exist yet.

- [ ] **Step 3: Implement minimal utilities**

```js
// src/renderer/layout/utils/launchTimeline.js
// Implement as JS-with-JSDoc so Node’s built-in test runner can execute it without a TS loader.
// Exports should be CJS (`module.exports`) to keep tests simple, and Vite can still import it.
//
// See the implementation committed to the worktree for full source. The required exports are:
// - computeProgress({ actions, actionsCompleted, actionsTotal })
// - computeEta({ nowMs, actions, progress })
// - deriveBuckets({ actions, activeActionId, completedCap })
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test`  
Expected: PASS for the new unit tests.

---

## Task 2: Extend `LaunchProgressSnapshot` types in renderer and preload

**Files:**
- Modify: `src/renderer/layout/hooks/useLaunchFeedback.ts`
- Modify: `src/types/preload.d.ts`
- Modify: `src/preload.js` (only if contract mapping/validation exists)

- [ ] **Step 1: Add the new `actions` timeline fields to `LaunchProgressSnapshot`**

Ensure the renderer snapshot type includes:
- `activeActionId?: string | null`
- `actionsTotal?: number | null`
- `actionsCompleted?: number | null`
- `actions?: LaunchAction[] | null`

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`  
Expected: PASS.

---

## Task 3: Upgrade main-process launch status store to support `actions[]`

**Files:**
- Modify: `src/main/services/launch-status-store.js`
- Modify: `src/main/services/launch-status-store.test.js`

- [ ] **Step 1: Write failing store test for actions cloning and ID stability**

Add a test that publishes a status payload containing `actions` and asserts:
- `getStatus()` returns a deep-cloned `actions` array
- `publishStatus()` preserves unknown/optional fields safely

- [ ] **Step 2: Run tests**

Run: `npm run test`  
Expected: FAIL until clone logic is added.

- [ ] **Step 3: Implement cloning/normalization for `actions`**

Add:
- allowed `state` normalization
- safe string trimming
- max-length caps for arrays and strings (consistent with existing clone patterns)
- timestamps validated as finite numbers

- [ ] **Step 4: Run tests**

Run: `npm run test`  
Expected: PASS.

---

## Task 4: Emit structured `actions[]` timeline from `profile-launch-runner`

**Files:**
- Modify: `src/main/services/profile-launch-runner.js`
- Modify: `src/main/services/profile-launch-runner.test.js` (add targeted tests)

- [ ] **Step 1: Define stable Action IDs and Substep IDs**

Rules:
- IDs stable for full run.
- Suggested IDs:
  - App action: `app:<appLaunchProgress[row].key>` (already stable per run)
  - Delay action: `delay:<appKey>` (or `delay:<index>` if keyed by index)
  - Tab action: `tab:<normalizedUrl>` or `tab:<hostname>:<index>` with dedupe
  - System action: `sys:<slug>` per operation (e.g. pre-launch policies)

- [ ] **Step 2: Build `actions[]` upfront**

Construct ordered `actions` list at run start:
- Optional `system` actions (pre-launch close/minimize policies)
- For each app:
  - optional delay action if `appLaunchDelays[appName] > 0`
  - app action with substeps: Launching → Positioning → Verifying → Waiting for confirmation (conditional)
- Tabs:
  - either a grouped “Restore tabs” action with substeps for each tab, or per-tab actions

Also set:
- `actionsTotal`
- `actionsCompleted` (updated as actions finish)
- `activeActionId` (updated as the current focus action changes)

- [ ] **Step 3: Publish timestamps + smart decisions**

When reuse detected:
- set pills includes `Reused`
- add `smartDecisions` like “Reusing existing window”

When snap/placement mode known:
- add decision strings like “Snapping to left half” (based on bounds/placement decision; map from placement bounds)

When delay applied:
- create delay action and decision “Waiting 3s delay”

- [ ] **Step 4: Failure taxonomy**

Set `failureKind` based on failure location:
- launch failures → `launch`
- placement not applied → `placement`
- verification not verified → `verification`

Also attach `errorMessage`.

- [ ] **Step 5: Run tests**

Run: `npm run test`  
Expected: PASS.

---

## Task 5: Rewrite `ProfileLaunchProgressPanel` to use timeline UI

**Files:**
- Modify: `src/renderer/layout/components/ProfileLaunchProgressPanel.tsx`
- Modify: `src/renderer/layout/hooks/useProfileLaunch.ts` (only if needed for retry / summary actions)

- [ ] **Step 1: Add new layout structure**

Implement:
- Pinned Current Step card (dominant)
- Upcoming list (scrollable)
- Completed list capped to N=5 with “View all”

- [ ] **Step 2: Implement state-driven visuals**

For each action state:
- queued (dim + gray dot)
- running (highlight + indeterminate pulse inside current action)
- completed (green check + fade)
- warning (amber pill + decisions)
- failed (red + error + retry)

Substeps:
- show within current action (expanded)
- collapse on completion

- [ ] **Step 3: Global progress + ETA**

Use `launchTimeline` utils:
- progress bar updates on completed actions
- ETA shows “Estimating…” or “~Xs remaining” with confidence styling

- [ ] **Step 4: Completion transition**

When run hits terminal state:
- fill progress to 100%
- wait 300–500ms
- animate to summary mode

- [ ] **Step 5: Summary + View Details drill-down**

Summary shows totals and actions.
“View Details” toggles back to full timeline view preserving final states.

- [ ] **Step 6: Cancel aftermath**

On cancel:
- show Cancelled summary
- keep “Open All Apps” available (re-run)

- [ ] **Step 7: Jitter protection**

Ensure:
- fixed line-heights for substep label area
- reserved space for smart decisions
- localized collapse in Completed section

- [ ] **Step 8: Run lint + typecheck**

Run: `npm run lint`  
Expected: PASS.  

Run: `npm run typecheck`  
Expected: PASS.

---

## Task 6: Monitor layout highlight integration (subtle pulse)

**Files:**
- Modify: monitor layout component (discover actual file during implementation)
- Modify: `ProfileLaunchProgressPanel.tsx` to emit “highlight action completed” signal

- [ ] **Step 1: Add a transient highlight state keyed by app instanceId**

When an app placement action completes, set highlight on the corresponding app tile for ~800–1200ms.

- [ ] **Step 2: Ensure no focus theft and respects reduced motion**

- [ ] **Step 3: Manual verify in dev**

Run: `npm run dev` and launch a profile; observe highlight after placements.

---

## Task 7: Verification & QA

- [ ] **Step 1: Run tests**

Run: `npm run test`  
Expected: PASS.

- [ ] **Step 2: Run baseline typecheck**

Run: `npm run typecheck`  
Expected: PASS.

- [ ] **Step 3: Manual QA checklist**

- Launch app (`npm run dev`) with no runtime errors
- Launch a profile with:
  - at least 3 apps, including one already running (reuse warning)
  - at least one tab URL
  - at least one app with delay configured
- Verify:
  - Current card stays pinned and dominant
  - Upcoming and completed scroll behavior works; completed capped to 5 with View all
  - Smart decisions are visible and expandable
  - Completion transitions smoothly to summary (no jump)
  - Cancel transitions to Cancelled summary with completed vs remaining counts
  - Failure (if induced) shows failureKind messaging + retry

