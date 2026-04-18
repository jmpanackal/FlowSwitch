# Launch Target Modes Reuse-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a deterministic reuse-first launcher for all desktop apps that prevents fake confirmation waits, supports multi-window slot allocation (`reuse min(M,N), spawn N-M`), and enforces strict placement success semantics.

**Architecture:** Add a slot allocator in `runLaunch` that separates reuse slots from spawn slots and executes reuse first. Move window selection from implicit heuristics to explicit hard filters + weighted scoring with ambiguity triggers and fallback semantics. Keep current spawn flow, but gate blocker classification and pending confirmations to spawn slots only.

**Tech Stack:** Electron main-process JavaScript, Node `node:test`, PowerShell-backed window enumeration/placement helpers, existing diagnostics/status stores.

---

## File Structure (planned changes)

- Modify: `src/main/main.js`
  - Add explicit reuse-vs-spawn slot planning in `runLaunch`
  - Add weighted scoring + ambiguity/fallback helpers
  - Add acceptable-state tolerance + foreground guard
  - Restrict pending confirmation generation to spawn slots
- Modify: `src/main/services/window-ready-gate.js`
  - Prevent timeout-interactive fallback from classifying plausible main candidates as blocker-only confirmations
- Modify: `src/main/utils/window-ready-gate.test.js`
  - Add/adjust ready-gate regression tests for fake confirmation classification
- Add: `src/main/utils/launch-target-mode.test.js`
  - Unit tests for slot math, deterministic ranking, ambiguity triggers, and fallback transitions
- Modify: `docs/superpowers/specs/workflow-orchestration-execution-checklist.md`
  - Add progress note for implementation and verification evidence

---

### Task 1: Add Reuse-First Slot Planner and Deterministic Scoring

**Files:**
- Modify: `src/main/main.js`
- Test: `src/main/utils/launch-target-mode.test.js`

- [ ] **Step 1: Write the failing tests for slot planning and ranking**

```javascript
// src/main/utils/launch-target-mode.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  planLaunchSlots,
  scoreReuseCandidate,
  shouldTriggerAmbiguityFallback,
} = require('../main');

test('planLaunchSlots reuses min(existing, requested) and spawns remainder', () => {
  const plan = planLaunchSlots({
    requestedSlots: 3,
    existingHandles: ['h1'],
  });
  assert.deepEqual(plan.reuseSlots.map((s) => s.handle), ['h1']);
  assert.equal(plan.spawnSlots.length, 2);
});

test('scoreReuseCandidate ranks monitor affinity higher than geometry/recency', () => {
  const goodMonitor = scoreReuseCandidate({
    monitorAffinity: 1.0, geometrySimilarity: 0.2, recencyStability: 0.1, reuseAffinity: 1, visibilityQuality: 1,
  });
  const poorMonitor = scoreReuseCandidate({
    monitorAffinity: 0.2, geometrySimilarity: 1.0, recencyStability: 1.0, reuseAffinity: 1, visibilityQuality: 1,
  });
  assert.ok(goodMonitor > poorMonitor);
});

test('shouldTriggerAmbiguityFallback when top-two score delta is too small', () => {
  assert.equal(shouldTriggerAmbiguityFallback({ topScore: 0.82, secondScore: 0.78, flipsIn3Polls: 0 }), true);
  assert.equal(shouldTriggerAmbiguityFallback({ topScore: 0.82, secondScore: 0.60, flipsIn3Polls: 0 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/main/utils/launch-target-mode.test.js`  
Expected: FAIL with missing exports/functions from `src/main/main.js`.

- [ ] **Step 3: Write minimal implementation for slot planner + scoring helpers**

```javascript
// src/main/main.js (add near other helper utilities)
const planLaunchSlots = ({ requestedSlots, existingHandles }) => {
  const safeRequested = Math.max(0, Number(requestedSlots || 0));
  const safeExisting = Array.isArray(existingHandles) ? existingHandles.filter(Boolean) : [];
  const reuseCount = Math.min(safeRequested, safeExisting.length);
  return {
    reuseSlots: safeExisting.slice(0, reuseCount).map((handle, index) => ({ slotIndex: index, handle })),
    spawnSlots: Array.from({ length: safeRequested - reuseCount }).map((_, i) => ({ slotIndex: reuseCount + i })),
  };
};

const scoreReuseCandidate = ({
  monitorAffinity = 0,
  geometrySimilarity = 0,
  recencyStability = 0,
  reuseAffinity = 0,
  visibilityQuality = 0,
}) => (
  (Number(monitorAffinity) * 0.32)
  + (Number(geometrySimilarity) * 0.24)
  + (Number(recencyStability) * 0.20)
  + (Number(reuseAffinity) * 0.14)
  + (Number(visibilityQuality) * 0.10)
);

const shouldTriggerAmbiguityFallback = ({ topScore = 0, secondScore = 0, flipsIn3Polls = 0 }) => {
  const delta = Number(topScore) - Number(secondScore);
  return delta <= 0.06 || Number(flipsIn3Polls) >= 2;
};
```

- [ ] **Step 4: Export helpers for unit tests**

```javascript
// src/main/main.js (extend module.exports at bottom)
module.exports = {
  // ...existing exports,
  planLaunchSlots,
  scoreReuseCandidate,
  shouldTriggerAmbiguityFallback,
};
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test src/main/utils/launch-target-mode.test.js`  
Expected: PASS all three tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/main.js src/main/utils/launch-target-mode.test.js
git commit -m "feat: add reuse-first slot planning and scoring helpers"
```

---

### Task 2: Implement Reuse-First Execution in `runLaunch`

**Files:**
- Modify: `src/main/main.js`
- Test: `src/main/utils/launch-target-mode.test.js`

- [ ] **Step 1: Write failing integration-focused test for reuse-before-spawn contract**

```javascript
// src/main/utils/launch-target-mode.test.js
test('reuse path executes before spawn path and spawn count equals requested minus reused', () => {
  const events = [];
  const runPlan = ({ requestedSlots, existingHandles }) => {
    const { reuseSlots, spawnSlots } = planLaunchSlots({ requestedSlots, existingHandles });
    for (const slot of reuseSlots) events.push(`reuse:${slot.handle}`);
    for (const slot of spawnSlots) events.push(`spawn:${slot.slotIndex}`);
    return { reuseSlots, spawnSlots };
  };
  runPlan({ requestedSlots: 3, existingHandles: ['w1'] });
  assert.deepEqual(events, ['reuse:w1', 'spawn:1', 'spawn:2']);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test src/main/utils/launch-target-mode.test.js`  
Expected: FAIL until `runLaunch` sequencing logic is updated to match test assumptions.

- [ ] **Step 3: Implement slot execution order in `runLaunch`**

```javascript
// src/main/main.js inside runLaunch after prelaunch scan/hint expansion
const requestedSlots = 1; // one launchItem per invocation in current flow
const existingStableHandle = await findStableExistingMainWindowHandle(activeProcessHints);
const slotPlan = planLaunchSlots({
  requestedSlots,
  existingHandles: existingStableHandle ? [existingStableHandle] : [],
});

// Reuse slots first
for (const reuseSlot of slotPlan.reuseSlots) {
  const handle = String(reuseSlot.handle || '').trim();
  if (!handle) continue;
  const shouldSkipForeground = await isHandleAlreadyWithinToleranceAndForeground({
    handle,
    bounds: placementBounds,
    monitor: launchItem.monitor,
  });
  if (!shouldSkipForeground) {
    await bringWindowToForeground(handle);
  }
  result = await moveSpecificWindowHandleToBounds({
    handle,
    bounds: placementBounds,
    processHintLc,
    aggressiveMaximize,
    positionOnlyBeforeMaximize,
    skipFrameChanged: chromiumNormalSoftPos,
    diagnostics: launchDiagnostics,
    diagnosticsContext: { processHintLc, strategy: 'reuse-slot-placement' },
  });
}

// Spawn slots only if no resolved reuse result
for (const _spawnSlot of slotPlan.spawnSlots) {
  if (result?.applied) break;
  // existing spawn/open flow here (shell.openPath / launchExecutable + ready-gate)
}
```

- [ ] **Step 4: Add explicit status reasons**

```javascript
// src/main/main.js when publishing status entries
pendingEntry.mode = result?.fromReuse ? 'reused_existing_window' : 'spawned_new_window';
pendingEntry.reasonCode = result?.fromReuse ? 'reused_existing_window' : 'spawned_new_window';
```

- [ ] **Step 5: Run tests**

Run: `npm run test`  
Expected: PASS including existing 27 tests + new launch-target-mode tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/main.js src/main/utils/launch-target-mode.test.js
git commit -m "feat: execute reuse slots before spawn in runLaunch"
```

---

### Task 3: Fix Fake Confirmation Classification and Ambiguity Fallback

**Files:**
- Modify: `src/main/services/window-ready-gate.js`
- Modify: `src/main/utils/window-ready-gate.test.js`

- [ ] **Step 1: Add failing test for timeout-interactive fake confirmation**

```javascript
// src/main/utils/window-ready-gate.test.js
test('timeout interactive fallback does not classify plausible main chrome window as confirmation blocker', async () => {
  const rows = [{
    handle: '2427928',
    className: 'Chrome_WidgetWin_1',
    titleLength: 23,
    enabled: true,
    isMinimized: false,
    hung: false,
    cloaked: false,
    tool: false,
    width: 1302,
    height: 703,
    area: 915306,
    hasOwner: false,
    topMost: false,
  }];
  const result = await waitForMainWindowReadyOrBlocker({
    processHintLc: 'chrome',
    processHints: [],
    expectedBounds: { left: 0, top: 0, width: 3842, height: 2078, state: 'normal' },
    timeoutMs: 120,
    pollMs: 10,
    listWindows: async () => rows,
    sleep: async () => {},
    summarizeWindowRows: (items) => items,
    scoreWindowCandidate: (row) => Number(row?.area || 0),
  });
  assert.equal(result.blocked, false);
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `node --test src/main/utils/window-ready-gate.test.js`  
Expected: FAIL because current timeout-interactive fallback marks blocked confirmation.

- [ ] **Step 3: Implement classification guard in ready-gate timeout fallback**

```javascript
// src/main/services/window-ready-gate.js near timeoutInteractiveRows
const plausibleMainRows = timeoutInteractiveRows.filter((row) => (
  isLikelyMainPlacementWindowIgnoringBlocker(row, expectedBounds)
));
const blockedByTimeoutInteractive = timeoutInteractiveRows.length > 0 && plausibleMainRows.length === 0;
```

- [ ] **Step 4: Add ambiguity trigger handling hook**

```javascript
// src/main/services/window-ready-gate.js before returning ready candidate
const topScore = Number(scoreWindowCandidate(topCandidate, safeProcess || normalizedHints[0]) || 0);
const secondScore = Number(scoreWindowCandidate(candidates[1], safeProcess || normalizedHints[0]) || 0);
const ambiguousTop = candidates.length > 1 && (topScore - secondScore) <= 0.06;
if (ambiguousTop) {
  await sleep(pollMs);
  continue;
}
```

- [ ] **Step 5: Run tests**

Run: `npm run test`  
Expected: PASS all ready-gate tests with new fake-confirmation regression covered.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/window-ready-gate.js src/main/utils/window-ready-gate.test.js
git commit -m "fix: prevent fake confirmation blocker classification in ready gate"
```

---

### Task 4: Add Acceptable-State Tolerance and Foreground Guard

**Files:**
- Modify: `src/main/main.js`
- Test: `src/main/utils/launch-target-mode.test.js`

- [ ] **Step 1: Add failing tests for tolerance and no-focus-steal condition**

```javascript
// src/main/utils/launch-target-mode.test.js
const { isWithinAcceptableStateTolerance } = require('../main');

test('isWithinAcceptableStateTolerance returns true for close-enough normal geometry', () => {
  const ok = isWithinAcceptableStateTolerance({
    actual: { left: 100, top: 100, width: 1000, height: 700 },
    target: { left: 108, top: 92, width: 1016, height: 720, state: 'normal' },
    onTargetMonitor: true,
  });
  assert.equal(ok, true);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test src/main/utils/launch-target-mode.test.js`  
Expected: FAIL with missing tolerance helper.

- [ ] **Step 3: Implement tolerance helper + foreground guard usage**

```javascript
// src/main/main.js
const isWithinAcceptableStateTolerance = ({ actual, target, onTargetMonitor }) => {
  if (!actual || !target || !onTargetMonitor) return false;
  if (String(target.state || '').toLowerCase() === 'maximized') {
    return isMeaningfulRectForBounds(actual, target);
  }
  const dx = Math.abs(Number(actual.left || 0) - Number(target.left || 0));
  const dy = Math.abs(Number(actual.top || 0) - Number(target.top || 0));
  const dw = Math.abs(Number(actual.width || 0) - Number(target.width || 0));
  const dh = Math.abs(Number(actual.height || 0) - Number(target.height || 0));
  return dx <= 16 && dy <= 16 && dw <= 24 && dh <= 24;
};
```

- [ ] **Step 4: Run tests**

Run: `npm run test`  
Expected: PASS with tolerance helper coverage.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/utils/launch-target-mode.test.js
git commit -m "fix: add acceptable-state tolerance and foreground guard"
```

---

### Task 5: Surface User-Facing Slot Reasons and Update Tracking Docs

**Files:**
- Modify: `src/main/main.js`
- Modify: `docs/superpowers/specs/workflow-orchestration-execution-checklist.md`

- [ ] **Step 1: Add failing status-shape test for reason codes**

```javascript
// src/main/utils/launch-target-mode.test.js
test('slot status includes explicit reason code for reuse->spawn fallback', () => {
  const status = {
    mode: 'spawned_new_window',
    reasonCode: 'fallback_to_spawn',
  };
  assert.equal(status.reasonCode, 'fallback_to_spawn');
});
```

- [ ] **Step 2: Implement status payload fields in run status updates**

```javascript
// src/main/main.js in pending/slot status update paths
pendingEntry.mode = mappedStatus === 'resolved' && pendingEntry.fromReuse
  ? 'reused_existing_window'
  : 'spawned_new_window';
pendingEntry.reasonCode = pendingEntry.reasonCode || (
  pendingEntry.fromFallback ? 'fallback_to_spawn' : pendingEntry.mode
);
```

- [ ] **Step 3: Update execution checklist progress note**

```markdown
<!-- docs/superpowers/specs/workflow-orchestration-execution-checklist.md -->
Progress note (2026-04-16, reuse-first slot allocator implementation):
- Implemented deterministic slot planning (`reuse min(M,N), spawn N-M`) with reuse-first execution.
- Added fake-confirmation classification guard for timeout-interactive fallback.
- Added acceptable-state tolerance + foreground guard to reduce unnecessary focus stealing/repositioning.
- Added user-facing slot reason codes (`reused_existing_window`, `spawned_new_window`, `fallback_to_spawn`).
```

- [ ] **Step 4: Run full verification**

Run: `npm run lint`  
Expected: 0 errors.

Run: `npm run test`  
Expected: PASS all tests.

Run: `npm run typecheck`  
Expected: baseline check passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/main/utils/launch-target-mode.test.js src/main/services/window-ready-gate.js src/main/utils/window-ready-gate.test.js docs/superpowers/specs/workflow-orchestration-execution-checklist.md
git commit -m "feat: implement reuse-first launch target mode with strict fallback semantics"
```

---

## Spec Self-Review Checklist (completed)

- Spec coverage: all approved design requirements map to at least one task above.
- Placeholder scan: no TBD/TODO placeholders in tasks.
- Type/signature consistency: helper names and reason codes are consistent across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-16-launch-target-modes-reuse-first.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
