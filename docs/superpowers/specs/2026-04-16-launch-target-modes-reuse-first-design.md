# Launch Target Modes: Reuse-First Design

Date: 2026-04-16  
Status: Draft approved in chat, pending final user review  
Scope: Launch target mode behavior for desktop app profile launches (reuse-first default)

## 1) Problem Statement

Current orchestration behavior still leans cold-start, which causes:

- False confirmation waits for already-running apps (Chrome/OBS scenarios).
- Unwanted relaunch prompts for single-instance apps (OBS "already running" dialog).
- Ambiguous handling when multiple profile slots exist for apps that can open multiple windows.
- Placement instability expectations mismatch (for strict success) when verify and stabilization diverge.

The design goal is to implement a deterministic, reuse-first slot allocator that:

- Reuses existing windows first by default.
- Spawns new windows only for remaining requested slots.
- Keeps strict success semantics (verify + stabilization required).
- Preserves safe fallback to cold-start behavior when reuse is not possible.

## 2) Decisions Locked in This Design

From user approvals in brainstorming:

- Default behavior: `reuse_existing` when stable existing windows are present.
- Scope: all desktop apps (not a per-app allowlist for this slice).
- Foreground policy for reused windows: always bring to front during placement (temporary default for this slice, with early path to configurability).
- Multi-window contract: if requested slots = `N` and existing windows = `M`, reuse `min(M, N)` and spawn `N-M`.
- Content-launch caveat acknowledged, but no behavior change in this slice; reevaluate when content launching ships.
- Success bar for this slice is strict:
  - no fake confirmation waits,
  - reused windows foregrounded,
  - placement verification and stabilization both pass.

## 3) Runtime Behavior Contract

For each app group in a profile launch:

1. Compute `requestedSlots` from profile launch entries for that app key.
2. Build pre-launch snapshot and discover stable existing window candidates.
3. Compute:
   - `reuseSlots = min(existingCandidates, requestedSlots)`
   - `spawnSlots = requestedSlots - reuseSlots`
4. Execute reuse slots first:
   - foreground selected handle,
   - place/verify/stabilize,
   - never emit pending-confirmation for reuse slots.
5. Execute spawn slots second:
   - launch/open target,
   - ready-gate + blocker handling,
   - place/verify/stabilize.
6. Aggregate slot states into app-level and run-level status.

A run is complete only when all slots are terminal (`resolved` or explicit `failed`).

Design interpretation: this runtime is a window-state reconciliation pass:

- desired state = profile slots + target geometry/monitor,
- observed state = current windows + process/window topology,
- actions = minimal ordered operations to converge desired <- observed.

## 4) Architecture and Component Changes

### 4.1 `LaunchTargetModeResolver` (new logical module/function)

Responsibilities:

- Determine reuse vs spawn plan for each app group.
- Produce deterministic handle-to-slot assignment for reuse path.
- Emit diagnostics describing target-mode decisions and rationale.

Inputs:

- app key and slot count,
- pre-launch window snapshot,
- companion process hints,
- placement target.

Outputs:

- `reusePlan[]` (slot -> existing handle),
- `spawnPlan[]` (slot placeholders),
- diagnostics payload.

### 4.2 `WindowSlotAllocator` (new orchestration step)

Responsibilities:

- Group launch items by app key.
- Execute slot plans in deterministic order:
  - all reuse slots, then spawn slots.
- Owns slot-level state and final aggregation.

### 4.3 `ReuseWindowPlacementPath` (refine existing flow)

Responsibilities:

- Bring reused handle to foreground.
- Run placement + strict verification + stabilization.
- Emit slot-level success/failure; never create pending confirmation state.

### 4.4 `SpawnWindowPlacementPath` (existing flow, slot-scoped)

Responsibilities:

- Process launch/open behavior.
- ready-gate/blocker handling.
- Placement + strict verify + stabilization.
- Pending-confirmation lifecycle only for spawn slots.

## 5) Slot Allocation Rules

### 5.1 Candidate Eligibility for Reuse

A reuse candidate must satisfy:

- belongs to pre-launch handle set for app group,
- not cloaked/hung/tool,
- enabled,
- not owned/top-most auxiliary modal/helper surface,
- minimum dimension thresholds for interaction.

Minimized existing windows are allowed in reuse detection and restored during reuse placement path.

### 5.2 Deterministic Ordering

Window ranking tie-break contract:

1. score
2. area
3. title length
4. handle (lexicographic)

Determinism guarantees:

- one handle is assigned to at most one slot,
- slot assignment is stable for identical snapshots,
- resolved slots never regress to waiting.

### 5.4 Window Identity Model (Explicit)

For reuse selection, window identity is derived from:

- process lineage (base hint + companion hints),
- handle continuity,
- class-name family compatibility,
- monitor affinity history,
- title signature (only as weak signal; not authoritative).

Identity intent:

- "same window" means stable top-level candidate that can be deterministically selected and reconciled to target state,
- not "same process" and not "same title string".

### 5.3 Multi-Window Contract

Given requested `N`, existing `M`:

- Reuse count = `min(M, N)`
- Spawn count = `N - min(M, N)`

Examples:

- `N=1, M=2` -> reuse 1, spawn 0
- `N=3, M=1` -> reuse 1, spawn 2
- `N=2, M=0` -> reuse 0, spawn 2

## 6) Blocker and Confirmation Rules

- Reuse slots do not enter confirmation-pending state.
- Spawn slots can enter confirmation-pending state when blocker heuristics are satisfied.
- Timeout-interactive fallback must avoid classifying a plausible main candidate as a blocker-only confirmation.
- Existing-window bypass remains valid if stable reusable handle is present while a blocker-like prompt appears for spawned path.
- Timeout-interactive fallback must never classify a top candidate as blocker-only if it is eligible as main under slot constraints.

Ambiguity -> fallback triggers:

- top two candidates within score delta <= 0.06 after hard filters,
- identity instability across polls (winner flips >= 2 times in 3 polls),
- blocker/main overlap unresolved after bounded disambiguation window.

When triggered, avoid silent success; escalate slot to explicit fallback path and record reason.

## 7) Scoring Model Definition

Scoring is no longer an opaque placeholder in this design. Candidate selection uses:

1. hard filters (must-pass), then
2. weighted scoring for remaining candidates.

Hard filters (before scoring):

- top-level eligible (`!cloaked`, `!hung`, `!tool`, `enabled`),
- role-eligible for slot state (main-window eligibility),
- identity-compatible for reuse slots (candidate in pre-launch set),
- safety exclusion (owner/topMost/modal-helper disallowed for main-path selection).

Weighted score dimensions (relative importance, highest to lowest):

- monitor affinity (weight 0.32),
- geometry similarity (weight 0.24),
- recency/stability across polls (weight 0.20),
- reuse affinity (weight 0.14),
- visibility/interaction quality (weight 0.10).

Weights are initial defaults and must be emitted in diagnostics for tuning/audit.

Candidate score is explicit and additive:

- `baseVisibilityScore`: visible, enabled, not cloaked/hung/tool
- `roleEligibilityScore`: passes main-window eligibility for slot placement state
- `reuseAffinityScore`: candidate is from pre-launch handle set for reuse slots
- `monitorAffinityScore`: overlap with target monitor/expected region
- `geometrySimilarityScore`: closeness to expected dimensions (state-aware)
- `stabilityScore`: same candidate persists across consecutive polls
- `safetyPenalties`: owner/topMost/modal-like/helper indicators

Tie-break order remains:

1. total score
2. area
3. title length
4. handle (lexicographic)

Implementation note:

- score dimensions should be emitted in diagnostics for top `k` candidates to make selection auditable.

## 8) Placement and Success Semantics

### Strict Success (This Slice)

A slot is `resolved` only if all pass:

1. target monitor verification,
2. geometry tolerance verification,
3. stabilization verification for final handle.

If verification passes but stabilization fails, slot is not `resolved`.

### Acceptable State Tolerance

To avoid unnecessary repositioning, a slot may skip corrective movement if current state is already
within acceptance tolerance:

- target monitor match is true,
- position delta <= 16 px on each axis,
- size delta <= 24 px width/height for `normal`,
- for `maximized`, meaningful-bounds + monitor match are true.

When inside tolerance, emit `already-within-tolerance` and treat verification as passed.

### Foreground Rule

For reuse slots in this slice:

- reused window is brought to front before placement.

Foreground guard:

- do not force focus steal if selected reused window is already foreground and already within tolerance.

Future enhancement (not in this slice):

- configurable global/per-app foreground policy.

## 9) Failure, Retry, and Fallback Strategy (Explicit)

Failure is slot-scoped, not app-global, until aggregate finalization.

### Reuse Slot Retry Path

For a reuse slot:

1. attempt selected reuse handle,
2. if placement/verify/stabilize fails, attempt next ranked candidates (up to top 3 total attempts),
3. stop early if confidence drops below threshold or ambiguity trigger fires,
4. if reuse candidates exhausted, escalate that slot to spawn path,
5. if spawn path also fails, mark slot failed with explicit terminal reason.

### Spawn Slot Retry Path

Spawn path follows existing ready-gate and placement retries, but terminal reasons must be explicit:

- `spawn-ready-timeout`
- `spawn-confirmation-timeout`
- `spawn-placement-failed`
- `spawn-stabilization-failed`

### User-Visible Semantics

- Slot terminal reason must be available to status payloads, not diagnostics only.

## 10) Diagnostics Contract

Required diagnostics events for traceability:

- `launch-target-mode`:
  - `prelaunch-window-snapshot`
  - `reuse-existing-window-detected`
  - `reuse-plan-computed`
  - `spawn-plan-computed`
- slot lifecycle:
  - `slot-reuse-start`, `slot-reuse-resolved`, `slot-reuse-failed`
  - `slot-spawn-start`, `slot-spawn-awaiting-confirmation`, `slot-spawn-resolved`, `slot-spawn-failed`
- aggregate:
  - `slot-summary` with reuse/spawn totals and unresolved counts.

Additional required diagnostics:

- top candidate score breakdown (for selected and rejected candidates),
- fallback transitions (`reuse->spawn`) with cause,
- foreground action marker for reuse slots.

## 11) User-Facing Feedback Layer (Minimum)

Add minimal user-facing transparency (without full debug UI build-out):

- per-app status reason in launch status payload:
  - `reused_existing_window`
  - `spawned_new_window`
  - `awaiting_confirmation`
  - `placement_retrying`
  - `failed_<reason>`
- if a slot converts from reuse to spawn, surface `fallback_to_spawn` reason.

This prevents "random behavior" perception and reduces support/debug ambiguity.

## 12) Performance and Budget Guardrails

To avoid regressions from deeper reconciliation:

- pre-launch snapshot budget per app group (bounded poll count/time),
- candidate scoring bounded to top window set size,
- slot retries capped (reuse alternate count + spawn retries),
- confidence/ambiguity early-stop to avoid low-value retry churn,
- stabilization duration bounded by policy.

Telemetry required:

- per-group reconciliation duration,
- candidate count distributions,
- retry/fallback counts per run.

## 13) Cross-App Edge Cases (Required in this design)

Must handle without undefined behavior:

- Chromium/Electron multi-process top-level windows,
- hidden-or-delayed main window reveal,
- launcher-child handoff where parent exits,
- child helper windows racing with main window materialization.

If confidence or identity is ambiguous, system must prefer explicit fallback over silent success.

## 14) Test Strategy

### Unit Tests

- Resolver slot math for (`N`, `M`) combinations.
- Deterministic assignment with tied scores.
- Handle dedupe across reuse slots.

### Integration-Level Launch Tests

- Chrome existing window present: no fake pending confirmation.
- OBS existing + "already running" prompt: reuse path succeeds, no stuck wait.
- Browser multi-window scenario (`N=3, M=1`): 1 reuse, 2 spawn.
- Anki normal slot: resolve only after verify + stabilization.

### Regression Tests

- Steam confirmation workflow still valid.
- Ghost-window protections unaffected.
- runId stale-state rejection still enforced.

Additions:

- Chrome fake-confirmation regression (normal-mode delayed maximize path),
- OBS already-running prompt regression (reuse slot should prevent stuck pending),
- Anki precision regression (verify + stabilization strict gate).

## 15) Rollout and Risk

### Primary Risks

- Over-reuse selecting wrong existing window in multi-window apps.
- Reuse foreground behavior potentially disruptive for some users.
- Mixed app ecosystems (single-instance + helper windows) may need app-specific tuning later.
- Foreground default may be perceived as aggressive until configuration lands.

### Mitigations

- Strict deterministic scoring and per-slot diagnostics.
- Cold-start fallback when reuse slot fails placement.
- Keep policy hooks for future per-app mode settings.
- Surface per-app status reasons to reduce black-box behavior.

## 16) Future-Facing Notes (Out of Current Slice)

- Add per-app launch mode settings (`auto`, `reuse`, `force_new`, `hybrid`).
- Add configurable foreground policy (global + per-app).
- Reevaluate reuse defaults when content-launch payloads (files/folders/tabs/urls/deeplinks) are introduced.

## 17) Priority Next Steps (Post-Spec)

1. Implement explicit score breakdown pipeline.
2. Implement identity and slot allocator wiring in launch flow.
3. Add defined reuse->spawn fallback semantics in status + diagnostics.
4. Add minimum user-facing status reasons.
5. Land foreground policy setting early (global first, per-app later).

---

This spec is intentionally scoped to the immediate reliability objective and a reusable target-mode foundation, not full policy UI/configuration.
