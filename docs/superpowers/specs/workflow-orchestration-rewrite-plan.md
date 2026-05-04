# FlowSwitch Workflow Orchestration - Comprehensive Design Spec

Last updated: 2026-04-16  
Branch: `feature/workflow-orchestration-rewrite`  
Primary strategy: **Approach B (Full Modular Rewrite in-place around current production flow)**  
Fallback strategy: **Approach C (Hybrid strangler around stable paths)**

---

## 1) Product Vision

FlowSwitch is a **deterministic Windows workflow orchestrator**, not only an app launcher.

It must reliably:

- Launch apps/content from profile intent.
- Discover the real user-facing windows.
- Classify startup windows (main/modals/loading/splash/tool).
- Place and verify final visible windows against profile layout.
- Continue gracefully when user interaction is required.
- Report truthful launch state to the UI and diagnostics.

Core principle:

> Optimize for final visible outcome, not just requested actions.

---

## 2) Scope and Non-Goals

### In scope

- Windows desktop app/process/window launch orchestration.
- Multi-monitor and DPI-aware placement verification.
- Modal-aware deferred placement with live UI status.
- Automation pipeline for deterministic reproduction (`launch-profile.jsonl` + all-monitor screenshots).
- Installed-app catalog fidelity: show normal user-launchable desktop apps and hide non-app overlays/noise.

### Out of scope (for this phase)

- Full virtual desktop binding feature.
- Cross-platform parity (macOS/Linux).
- Pixel-perfect parity with every proprietary app-specific compositor quirk.

---

## 3) Current System Baseline (What Exists Now)

### Existing strong components

- Sequential launch execution with robust diagnostics in `src/main/main.js`.
- Window readiness gate extracted to `src/main/services/window-ready-gate.js`.
- Placement verification/stabilization passes (normal + maximized).
- Post-settle audit + screenshot automation.
- Pending confirmation data returned in launch result.
- Live status endpoint `launch-profile-status` and renderer polling support.

### Current risk pockets

- Some chooser windows (Steam variants) inconsistently classified.
- Post-confirmation main window may appear under helper process and miss strong placement.
- UI/state can become stale if pending resolution updates are delayed/failing.

---

## 4) Full Behavior Matrix and Handling Strategy

This matrix is the contract for orchestration behavior.  
Design rule: if a case is not explicitly recognized, it must fall into `unknown_*` classification and be handled by safe fallback (never silent success).

### 4.1 Launch Target Modes

- **Cold start**: no running process; full launch, discovery, classify, place, verify.
- **Warm attach**: process/window exists; skip process launch, re-target best candidate.
- **Reuse existing**: explicit profile policy to re-use if present.
- **Force new instance**: explicit profile policy or app capability supports multi-instance.
- **Mixed-mode app**: single-instance app with helper/child process windows.
- **URL/deep-link launch**: no direct executable path required.
- **File-open launch**: app opened through file association with possible process indirection.

### 4.2 Process Model Cases

- Single process / single window
- Single process / multi-window
- Multi-process / single visible window
- Multi-process / multi-visible windows
- Launcher process exits, child persists
- Background helper hosts visible main window
- PID reuse and delayed process creation

Handling:

- Build process-hint set: base + companion + token-based hints.
- Score windows by role and confidence, not by process name alone.
- Maintain handle lineage when process ownership changes.

### 4.3 Window Discovery and Ownership

- Handle creation latency (slow startup)
- Handle churn/recreation
- Hidden-to-visible transition
- Cloaked/uncloaked transition
- Owner/owned window chains
- Detached modal with no owner handle
- Windows with empty title and interactive content

Handling:

- Multi-pass discovery with dedupe by handle.
- Ownership graph per app launch item.
- Candidate snapshots on each major state transition.

### 4.4 Window Role Classification (Complete)

- `main`
- `modal_confirmation`
- `modal_loading`
- `splash`
- `tool_helper`
- `background_tray`
- `unknown_interactive`
- `unknown_noninteractive`

Classifier signals:

- class name, title/title-length, owner handle, topmost, tool style, area ratio, monitor overlap, state expectation, process lineage.

Classifier output contract:

- `role`
- `confidence` (0.0 to 1.0)
- `evidence` (key signals used)
- `fallbackPolicy` (what to do if confidence below threshold)

### 4.5 Content and Intent Injection

- CLI args
- Files
- URLs
- Deep links
- Multi-tab restore
- Delayed secondary actions (only after ready/verified state)

Rules:

- Per-run idempotency for URLs/files.
- Inject content only after target app reaches allowed state.
- Log each injection step with run correlation IDs.

### 4.6 Geometry and Constraint Cases

- Min size constraints
- Max size constraints
- Fixed aspect windows
- Non-resizable windows
- Borderless/custom chrome windows
- Invisible frame offsets
- Snap conflicts and app self-corrections

Handling:

- Use visible-frame verification where available.
- Constraint-aware bound negotiation before retries.
- Report constrained success (`placed_with_constraints`) when exact target impossible.

### 4.7 Monitor, DPI, and Topology

- Per-monitor DPI mismatch
- Mixed scaling monitors
- Primary monitor change
- Monitor add/remove
- Dock/undock events
- Resolution/orientation change mid-run

Handling:

- Rebuild monitor map at run start and on topology events.
- Compare in physical coordinates for Win32 verification.
- Re-run placement validation after topology mutation.

### 4.8 Window State Cases

- Minimized at detection
- Maximized at detection
- Fullscreen at detection
- Hidden state
- Offscreen state
- Restored-but-not-stable transition

Handling:

- State normalization pipeline before final placement.
- Fullscreen-exit policy only where safe and permitted.
- Offscreen recovery pass before scoring candidate as main.

### 4.9 Focus and Z-Order

- Modal steals focus
- Background app steals foreground during launch
- User manually focuses another app during run
- Z-order race between multiple apps

Handling:

- Focus is non-primary success metric.
- Bounded focus/z-order corrections (budgeted attempts).
- Respect user overrides after budget exhausted.

### 4.10 Failure and Recovery Cases

- No window discovered
- Wrong window repeatedly selected
- Placement ignored
- Self-moving window
- Hung window
- App crash/restart
- Capability denied (UWP/admin restriction)

Handling:

- Retry with bounded budgets and reasoned fallback.
- Candidate re-ranking with expanded hint set.
- Explicit terminal status per app (`failed`, `constrained`, `pending`).

### 4.11 User-Control and Session Cases

- User clicks confirmations in any order
- User does not click confirmations
- User closes modal instead of confirming
- User relaunches same profile while previous run is active
- User cancels active run
- User edits profile while run is in progress

Handling:

- Run lifecycle isolation by `runId`.
- Per-run pending confirmation lists.
- Cancel token propagation to all background resume tasks.
- New run supersedes old run for same profile by policy.

### 4.12 Security and Capability Cases

- Elevation mismatch
- UWP/system window restrictions
- Session isolation restrictions
- Foreground lock restrictions

Handling:

- Detect capability limits explicitly.
- Convert un-actionable operations into constrained outcomes (not silent pass/fail).
- Surface user-facing explanation for restricted cases.

### 4.13 Unknown / Future Cases (Catch-All)

- Any unrecognized class/process/ownership pattern must map to:
  - `unknown_interactive` or `unknown_noninteractive`
  - safe fallback path
  - explicit diagnostics event (`unknown-case-detected`)

This guarantees matrix completeness in practice, even for unseen apps.

### 4.14 Virtual Desktop and Session Cases

- Window opens on non-active virtual desktop
- Profile launched from different desktop than last saved
- Session lock/unlock during run
- RDP connect/disconnect display-context switch

Handling:

- Detect desktop/session mismatch signals where available.
- Mark as constrained if cross-desktop move is unavailable.
- Re-validate window visibility after session transitions.

### 4.15 Data Integrity and Profile Schema Cases

- Missing executable path
- Invalid launch arguments
- Invalid bounds/monitor references
- Corrupted profile payload
- Legacy profile schema migration

Handling:

- Pre-launch validation pass with explicit per-item diagnostics.
- Safe defaults and migration adapters for legacy fields.
- Reject only invalid items; continue remaining valid workflow items.

### 4.16 Concurrency and Interference Cases

- Two profile launches requested rapidly
- User manually moves/resizes windows during orchestration
- Third-party tools (FancyZones/snap assist) reflow windows during placement
- External process closes target window mid-attempt

Handling:

- Run-level lock policy with replace/cancel semantics.
- Detect user override and stop thrashing after bounded attempts.
- Classify external interference events and downgrade to constrained outcome if unresolved.

### 4.17 Performance and Throughput Cases

- Slow machine startup saturation
- Very large profiles (many apps/tabs)
- Bursty process creation causing delayed discovery
- Diagnostic volume pressure

Handling:

- Adaptive poll interval and timeout budgets by app role/history.
- Bounded logging with structured sampling for noisy loops.
- Launch queue pacing policy to avoid contention spikes.

### 4.18 Installed-App Catalog Fidelity Cases

- Overlay/helper entries appear as pseudo-apps (for example NVIDIA in-game overlay hosts).
- Useful system utilities are unintentionally excluded (for example File Explorer, Task Manager).
- Duplicate entries appear across aliases/executable variants.
- Icon source is missing or invalid for otherwise valid apps.

Handling:

- Apply explicit include/exclude policy in app discovery/catalog filtering.
- Exclude non-user-launchable overlays, capture helpers, and background host surfaces.
- Include core user-facing desktop apps even when discovered via system locations/aliases.
- Normalize duplicates to one canonical entry with stable display name and executable identity.
- Provide icon fallback so valid apps remain selectable even when icon extraction fails.

---

## 5) Target Architecture

## 5.1 Logical Module Topology

```text
main/orchestrator
  -> process-launch service
  -> window-ready-gate service
  -> placement engine
  -> stabilization engine
  -> monitor/DPI mapper
  -> launch status store + IPC surface
  -> diagnostics pipeline
```

## 5.2 Repo-Aligned Module Plan

Near-term structure under `src/main/services`:

- `window-ready-gate.js` (exists) - readiness + blocker classification.
- `launch-status-store.js` (to extract from `main.js`) - profile live status.
- `window-candidate-classifier.js` (to extract) - role classification policies.
- `placement-orchestrator.js` (to extract) - move/verify/stabilize pipeline.
- `process-hints.js` (to extract) - base+companion+token hint derivation.
- `monitor-map.js` (to extract) - monitor normalization + overlap checks.

Long-term structure (phase 3+) can map toward `core/window/placement/system/resilience` domains.

## 5.3 Engine Contracts (Implementation-Critical)

To avoid service-sprawl and ambiguous behavior, these engine-level contracts are mandatory.

### 5.3.1 Classification Engine

- Input: normalized window snapshots + run/app context.
- Output: role classification + confidence + score explanation.
- Must expose deterministic scoring so candidate selection is reproducible.

Window scoring contract:

```ts
type WindowScore = {
  score: number;
  reasons: string[];
};
```

Baseline weighted scoring (tunable, versioned policy):

- visible: +30
- not cloaked: +20
- top-level candidate: +15
- area ratio vs expected >= 0.2: +25
- title present: +10
- owned window when main expected: -20
- tool/helper style: -25
- splash/loading signature: -35

Output must include reason tags for each applied weight.

Classification confidence thresholds (default policy):

- `main`: confidence >= 0.70
- `modal_confirmation`: confidence >= 0.65
- `modal_loading`: confidence >= 0.60
- `splash`/`tool_helper`: confidence >= 0.55
- below threshold: classify as `unknown_interactive` or `unknown_noninteractive` by interaction signals

Threshold rules:

- No candidate may be treated as `main` below `main` threshold.
- For ties within 0.05 confidence, use score and recency tie-breakers; log tie resolution reason.
- Threshold values are policy-driven (see Policy Bundle in Section 6.11).

Confidence calibration requirement:

- Thresholds are defaults, not fixed truth.
- Orchestrator must collect confidence distributions for accepted/rejected candidates.
- Phase 2 requires histogram-based tuning review before threshold changes are promoted.
- Any threshold change must include before/after impact report in diagnostics summary.
- Histogram storage model:
  - persisted as JSONL/aggregated JSON under diagnostics artifacts for each run
  - aggregated views kept at two granularities: global and per-app-class (e.g., browser/qt/bootstrap/generic)
  - optional per-profile overlays may be stored for heavily tuned profiles, but default tuning source is global + app-class histograms
- Tuning review trigger policy:
  - trigger when false-main or false-modal rate exceeds 2% over trailing 100 classified candidates (per app-class)
  - trigger when unknown-classification rate increases by >= 30% week-over-week for any app-class
  - trigger when p95 confidence for accepted `main` candidates drops below 0.75 for any app-class
- Calibration acceptance targets:
  - accepted-main confidence p50 >= 0.82 and p95 >= 0.70 (per app-class)
  - rejected-main candidate confidence p95 < accepted-main candidate p50 for same app-class
  - threshold changes are promoted only if they improve target metrics without regressing false-complete SLO

### 5.3.2 Placement Engine

- Input: selected candidate + target bounds + constraint policy.
- Output: placement result with verification deltas.
- Must separate request bounds from final visible measured bounds.

Placement verification tolerance function (default):

```ts
type RectDelta = { dx: number; dy: number; dw: number; dh: number };

function isWithinTolerance(delta: RectDelta, tolerancePx: number): boolean {
  return (
    Math.abs(delta.dx) <= tolerancePx
    && Math.abs(delta.dy) <= tolerancePx
    && Math.abs(delta.dw) <= tolerancePx
    && Math.abs(delta.dh) <= tolerancePx
  );
}
```

State policy:

- `normal`: strict dimension + position tolerance check.
- `maximized`: monitor containment is mandatory; size deltas may be accepted when constrained by platform chrome.
- `minimized`: geometry tolerance not applicable; state verification only.

Constraint override:

- If constrained by capability or min/max rules, tolerance evaluation must return `constrained_pass` with explicit reason.

### 5.3.3 Orchestration Engine

- Input: launch graph and profile intent.
- Output: per-app terminal states + run-level status.
- Owns per-app state machine transitions and cancellation boundaries.

### 5.3.4 Resilience Engine

- Input: failure/retry events from classification/placement/orchestration engines.
- Output: bounded retries or terminal fallback state.
- Must enforce timing and retry budgets (see Section 6.7).

### 5.3.5 Window Tracker Engine (Global)

- Single global tracker per app runtime, not per launch item.
- Maintains rolling window cache and emits snapshots to orchestrator.
- Reduces per-app polling duplication and improves cross-app correlation.

Core duties:

- list/snapshot windows
- detect create/destroy/state transitions
- maintain ownership graph
- expose "best-known latest state" by handle and process lineage

Emission and ownership contract:

- Tracker supports both pull snapshots and scoped subscriptions.
- Subscription API must include filters by `{ runId, appLaunchId, processHintSet }`.
- Tracker events are immutable and tagged with monotonic sequence IDs.
- Orchestrator must not consume unfiltered global streams directly for item decisions.
- If multiple runs are active, tracker output must be partitionable without cross-run leakage.

Migration/handoff contract (Phase 2 coexistence):
- During migration, per-item polling remains supported as fallback path.
- Tracker-backed snapshots are source-of-truth when available; polling snapshots are marked `legacy_poll`.
- Coexistence guardrail: item decision logic may consume **one source per decision tick** (tracker OR polling), never mixed in same tick.
- A/B parity requirement: for designated smoke runs, tracker and polling candidate sets are compared and divergence is logged before full cutover.
- Cutover criteria: tracker path reaches parity on candidate selection and no cross-run leakage events for 10 consecutive validation runs.

### 5.3.6 Platform Adapter Engine (OS Integration Layer)

All Windows API interactions must be behind a dedicated adapter boundary.

```ts
interface WindowPlatformAdapter {
  listWindows(): WindowInfo[];
  moveWindow(handle: string, rect: Rect): boolean;
  getWindowRect(handle: string): Rect | null;
  getVisibleFrameRect(handle: string): Rect | null;
  isWindowVisible(handle: string): boolean;
  bringToFront(handle: string): boolean;
}
```

No orchestration logic should directly call raw Win32/PowerShell without going through adapter facades.

---

## 6) Launch Execution Model

### 6.1 Profile-level flow

1. Load profile, validate launchability.
2. Build monitor map and launch graph.
3. Publish `in-progress` status.
4. Run per-item orchestration sequentially (current stability mode).
5. Launch tabs/content.
6. Compute pending confirmations and publish:
  - `awaiting-confirmations` or `complete/failed`.
7. Return launch summary.

### 6.2 Per-app state machine

```text
INIT
-> LAUNCHING
-> WINDOW_DISCOVERY
-> CLASSIFYING
-> WAITING_FOR_READY | WAITING_FOR_CONFIRMATION
-> PLACING
-> STABILIZING
-> VERIFIED
-> COMPLETE | FAILED | PENDING_CONFIRMATION
```

### 6.3 Confirmation modal branch

- Detect confirmation blocker.
- Center blocker on target monitor (best effort).
- Mark pending confirmation in status store.
- Continue launching next app.
- Background resume loop:
  - poll until modal resolved and main ready
  - apply placement + stabilization
  - mark pending item `resolved` or `failed`
  - publish updated profile status for renderer polling
  - re-evaluate candidates post-confirmation with expanded hints and fresh scoring (never assume original process still owns main window)

Post-confirmation tie-break policy:

- Prefer handle continuity **only** if handle still classifies as plausible main candidate.
- If a new candidate outranks continued handle by confidence delta >= 0.08, prefer new candidate.
- If confidence delta < 0.08, prefer candidate with stronger monitor overlap and recency.
- Always log tie-break rationale and candidate deltas.

### 6.4 Run Lifecycle Contract (Critical)

- Every launch creates a unique `runId`.
- All app items in a run have `appLaunchId`.
- All retries/placement passes have `attemptId`.
- Status API must return `{ profileId, runId, state, ... }`.
- Renderer must ignore status updates for stale `runId`.

### 6.5 Cancellation and Relaunch Semantics

- `cancel-run(profileId, runId)` transitions run to `cancelled` and stops all background tasks.
- Relaunch same profile creates new `runId` and auto-cancels previous active run (policy: `replace`).
- Pending confirmations from cancelled/stale runs must not affect UI state.

### 6.6 Completion Semantics

- `complete`: no unresolved pending confirmations and all mandatory items terminal.
- `awaiting-confirmations`: unresolved pending > 0.
- `failed`: one or more mandatory items terminal-failed and no pending path can recover.
- `partial`: optional items failed but mandatory items complete (future policy flag).

Run budget terminal semantics:

- If `maxRunTotalMs` is reached:
  - cancel remaining non-terminal app tasks
  - mark in-flight tasks as `timed_out`
  - set run terminal state:
    - `failed` if any mandatory item unresolved
    - `partial` if only optional items unresolved (when partial enabled)
- No new retries may begin after run budget exhaustion.

### 6.7 Timing and Retry Budget Policy (Global)

All loops must be bounded by explicit budgets.

```ts
const RetryPolicy = {
  windowDiscoveryTimeoutMs: 8000,
  readyGateTimeoutMsNormal: 9000,
  readyGateTimeoutMsMaximized: 14000,
  stabilizationWindowMs: 300,
  placementRetries: 5,
  retryDelayMs: 200,
  maxPerAppTotalMs: 30000,
  maxRunTotalMs: 180000
};
```

Policy rules:

- No unbounded polling loops.
- Every retry attempt logs remaining budget.
- Budget exhaustion always transitions to explicit terminal reason.
- Run-level budget exhaustion must emit single authoritative `run-budget-exhausted` event.

Per-app-class budget overrides:
- Budget policies are class-aware and resolved in this order:
  1. explicit app override (profile/app config)
  2. app-class default (e.g., `browser`, `jetbrains`, `electron-splash`, `qt`)
  3. global default `RetryPolicy`
- Example class adjustments:
  - `jetbrains`: discovery/ready budgets +40%
  - `electron-splash`: ready budget +25%, stabilization +20%
  - `browser`: default budgets unless constrained by observed churn profile
- Any class override must be represented in diagnostics as `resolvedRetryPolicy`.

### 6.8 Concurrency Model

- Launch orchestration: sequential (current stability policy).
- Global window tracker: asynchronous singleton loop.
- Per-app resume tasks: parallel, but isolated by `runId` and `appLaunchId`.
- Placement attempts: serialized per app item; never concurrent for same app item.
- Status publication: monotonic revision stream per run.

### 6.9 Fullscreen Handling Policy

- `skip`: do not alter fullscreen window; mark constrained.
- `exit_fullscreen`: only if policy allows and capability check passes.
- `defer`: postpone placement until fullscreen window exits.

Fullscreen policy is profile-configurable with safe default `skip`.

### 6.10 User Override Detection and Respect

- Detect user override by abrupt manual move/resize or focus changes during active retry window.
- If override confirmed, stop thrashing retries and mark item `user_override`.
- Continue run while surfacing explicit user-override state in diagnostics/status.

### 6.11 Policy Bundle and Versioning

All orchestrator behavior policies must be grouped into a versioned bundle.

```ts
type PolicyBundle = {
  bundleVersion: string; // e.g. "2026.04.14-r1"
  scoringPolicyVersion: string;
  retryPolicyVersion: string;
  constraintPolicyVersion: string;
  classificationThresholdVersion: string;
};
```

Rules:

- Every run stores active `bundleVersion`.
- Diagnostics emit bundle and sub-policy versions.
- Tuning changes must bump affected policy version(s).
- Rollback must be possible by selecting prior policy bundle.

Bundle selection and migration strategy:

- Profile stores `preferredBundleVersion` (optional).
- Run resolves bundle by policy:
  1. profile preferred bundle (if installed)
  2. current default bundle
  3. explicitly requested override (debug/automation)
- If preferred bundle is missing:
  - run uses default
  - emit `bundle-migration-fallback` warning with old/new versions
- Silent behavior drift across updates is not allowed without emitted migration diagnostics.

### 6.12 Graceful Degradation Precedence

When multiple subsystems degrade simultaneously, precedence is:

1. Maintain run lifecycle correctness (`runId`, cancellation, stale-state rejection)
2. Maintain truthful status reporting
3. Maintain safe placement attempts
4. Degrade focus/z-order and non-critical polish
5. Fail remaining optional work with explicit constrained reasons

Status-store failure policy:

- If launch status store write fails mid-run, orchestration must continue with placement/recovery logic.
- System must emit `status-store-write-failed` at `ERROR` level and switch to degraded status mode:
  - serve last known good status snapshot + `statusDegraded=true`
  - return non-fatal warning to renderer
- Run must not be marked complete until a final terminal event is persisted or an explicit degraded terminal reason is emitted.

---

## 7) Status and UI Contract

### 7.1 Status states

- `idle`
- `in-progress`
- `awaiting-confirmations`
- `complete`
- `failed`

### 7.2 IPC contract

- `launch-profile` -> one-shot run summary.
- `launch-profile-status` -> live snapshot:
  - `runId`
  - counts
  - pending confirmations list
  - unresolved count
  - last update timestamp

Required fields:

- `profileId`, `runId`, `state`
- `launchedAppCount`, `launchedTabCount`, `failedAppCount`, `skippedAppCount`
- `pendingConfirmationCount`, `unresolvedPendingConfirmationCount`
- `updatedAt`

### 7.3 UI behavior rules

- Show warning while unresolved count > 0.
- Clear warning only when unresolved count becomes 0.
- If pending transitions to failed, surface explicit warning/error details.
- Ignore stale run status updates (run mismatch).
- On relaunch, reset UI state to new run immediately.
- If state is `user_override`, show non-fatal warning and stop auto-corrections for that item.

Renderer state machine contract:

- `idle -> in-progress -> awaiting-confirmations -> complete|failed|partial`
- `in-progress -> failed` allowed
- `awaiting-confirmations -> failed` allowed
- Direct `idle -> awaiting-confirmations` is allowed on crash/reload recovery with active run.

Renderer crash/reload recovery:

- On renderer init, if active run exists in status API:
  - adopt active run state immediately
  - do not require prior local UI context
  - mark recovery event `renderer-recovered-active-run`

---

## 8) Diagnostics and Observability

Mandatory diagnostics per item:

- launch target and process hints
- readiness decision path
- blocker classification samples
- placement attempts and chosen handles
- stabilization outcome
- final state reason

Candidate set snapshot contract (versioned):

```ts
type CandidateSetSnapshot = {
  id: string;
  timestamp: number;
  version: string; // snapshot schema version
  source: "initial_scan" | "retry_scan" | "post_confirmation_rescan" | "topology_change_rescan" | "resume_scan";
  runId: string;
  appLaunchId: string;
  windows: Array<{
    handle: string;
    role: string;
    confidence: number;
    score: number;
  }>;
};
```

New candidate set creation triggers:

- first discovery pass for item (`initial_scan`)
- retry cycle begins (`retry_scan`)
- confirmation modal resolution (`post_confirmation_rescan`)
- topology/display mutation (`topology_change_rescan`)
- background resume loop pass (`resume_scan`)

Logging levels:

- `DEBUG`: per-poll/per-candidate detail (development runs only)
- `INFO`: major state transitions and final outcomes (default)
- `WARN`: constrained paths, classification uncertainty, recoverable anomalies
- `ERROR`: terminal failures and invariant violations

Logging level policy:

- Default runtime level is `INFO`.
- Automation can override level per run.
- `DEBUG` must support sampling/line caps to prevent log overload.

Diagnostic retention and rotation policy:

- Retain run artifacts for last `N=30` runs by default or `M=500MB`, whichever limit is hit first.
- Oldest artifacts are pruned first.
- Retention policy is configurable and logged at run start.
- Deletion/prune events must be logged as `artifact-pruned`.

Required correlation keys:

- `runId`
- `appLaunchId`
- `attemptId`
- `candidateSetId` (when ranking windows)
- `processHintsVersion` (hint expansion generation)
- `statusRevision` (monotonic UI status update sequence)
- `budgetRemainingMs` (timing budget telemetry)
- `policyVersion` (scoring/retry policy revision)
- `candidateSetVersion` (candidate snapshot schema version)
- `logLevel` (event emission level)

Sequencing note:

- `process-hints.js` extraction is done; `PROCESS_HINTS_VERSION` is emitted on launch `start` and on `companion-hints-discovered` decisions (see execution checklist 2026-05-03). Bump that constant when companion-hint rules change.
- The transitional `processHintsVersion: "pre-module"` marker was never wired in code; no runtime change required beyond the versioned payload above.

Artifacts:

- JSONL event log (`launch-profile.jsonl`)
- all-monitor screenshot (`desktop-all-monitors.png`)
- automation summary JSON

---

## 9) Phased Implementation Plan

## Phase 1 - Deterministic Core (in progress)

- Modular readiness gate extraction.
- Confirmation vs loading blocker branch.
- Pending confirmation launch results.
- Live status IPC + renderer polling baseline.
- [~] Stable post-confirmation placement for helper-process windows.

Exit gate:

- Manual run proves warning persists/clears correctly across out-of-order confirmations.
- At least 10 repeat runs with no false "complete" while pending exists.
- Include at least 2 out-of-order confirmation permutations in the gate set.

## Phase 2 - Reliability Hardening

- Add runId isolation and stale status rejection in all flows (top priority in this phase).
- Extract classifier and process-hint logic from `main.js`.
- Unify candidate scoring for initial + resume paths.
- Add handle-first fallback placement pass after resume timeout.
- Add topology-change resilience checks during active run.
- Add cancel/relaunch policy enforcement path.
- Implement global window tracker abstraction and replace ad-hoc per-item polling where feasible.
- Implement deterministic weighted window scoring engine with reason tracing.
- Implement tracker-vs-polling coexistence A/B parity logging and cutover gates.
- Implement confidence histogram pipeline with app-class aggregation and tuning triggers.
- Implement per-app-class retry budget table and `resolvedRetryPolicy` diagnostics.
- Harden installed-app discovery/catalog filtering so normal apps are shown and overlay noise is excluded.

Exit gate:

- 95%+ pass rate on core deterministic suites across 20 automation runs.
- All retry loops prove bounded by configured budgets.
- Tracker cutover parity and cross-run leakage checks pass 10 consecutive validation runs.

## Phase 3 - Constraint Intelligence

- Explicit constraint engine module (resizable/min/max/aspect).
- Policy table for capability-limited app classes.
- Persistent class-policy telemetry feedback loop.
- Add fullscreen policy execution path (`skip`/`exit_fullscreen`/`defer`).

Exit gate:

- Constraint-constrained cases are explicitly tagged and user-visible.
- User override events are detected and surfaced as non-fatal constrained outcomes.

## Phase 4 - UX and Control Plane

- Rich pending confirmation UI details (per-app row status).
- Explicit user guidance actions in warning state.
- Focus/z-order final pass with safety budget.
- Explicit per-run cancel/retry controls in UI.

Exit gate:

- User can recover from pending/failure without app restart.

## Phase 5 - Power Features

- Advanced tab/file restore orchestration.
- Template/profile versioning.
- Optional desktop affinity policy.

Exit gate:

- Feature flags and rollback path documented for each power feature.

---

## 10) Test Matrix (Required)

### Core deterministic suites

- Steam chooser + click-through -> main window placed.
- OBS chooser + click-through -> main window placed.
- Mixed profile: one app confirmed, one still pending -> warning persists.
- Warning clears only after all pending resolved.
- Click order permutation test (A->B and B->A and delayed click).
- Relaunch during pending test (new run supersedes old run cleanly).
- Stale run status ignored after immediate relaunch.
- Post-confirmation re-evaluation test where main window moves to helper process ownership.
- Candidate set trigger coverage test (initial/retry/post-confirmation/topology/resume).
- Tracker-vs-polling parity run where both sources produce equivalent top candidate decisions.

### Placement suites

- 3-monitor mixed DPI.
- Quadrant snap zones with no visible gaps regressions.
- Warm-start and cold-start parity.
- Min-size constrained app placement.
- Non-resizable/borderless window fallback behavior.
- User-manual-move interference during placement.
- Fullscreen policy matrix (`skip`, `exit_fullscreen`, `defer`).
- Tolerance function boundary tests (at threshold, just above, constrained pass).

### Failure-path suites

- No window discovered.
- Window discovered but placement denied.
- Hung process/window.
- Monitor topology change mid-run.
- Modal misclassification fallback test (`unknown_interactive`).
- Stale status update ignored by UI test.
- Corrupted profile item rejected while remainder launches.
- External close of target window during retry loop.
- Status-store write failure degrades gracefully with `statusDegraded=true` and non-fatal warning path.

### Security/capability suites

- Elevated app under non-elevated FlowSwitch.
- Restricted/UWP window movement attempts.
- Foreground lock restrictions during placement.
- Session lock/unlock and RDP reconnect continuity.

### Scale/performance suites

- 20+ app profile launch with bounded status latency.
- High-volume diagnostics run does not stall orchestration loop.
- Window tracker load test with high window churn and stable candidate selection.
- DEBUG-level log sampling and cap enforcement under heavy churn.
- Per-app-class retry budget override validation against slow-start app classes.
- Confidence histogram generation and review-trigger firing test on synthetic misclassification data.

---

## 11) Acceptance Criteria

All must be true:

- Pending confirmation apps never reported as fully complete until resolved.
- UI warning remains accurate and live for unresolved confirmations.
- Click-through of confirmation dialogs leads to actual post-confirmation placement attempts and deterministic final status.
- Non-modal apps retain or improve placement reliability.
- Automation artifacts are sufficient to diagnose every failed run without manual screenshot/log copy-paste.

Quantitative SLOs:

- Placement verification tolerance: <= 8 px normal-state visible bounds unless constrained.
- Launch status propagation latency to renderer: <= 1.5 s p95.
- False-complete rate while unresolved pending exists: 0%.
- Unknown-case classification rate explicitly logged: 100% of unrecognized patterns.
- Retry-loop budget overrun rate: 0% (no loop runs past configured max budget).
- Status staleness mismatch incidents (wrong runId reflected in UI): 0%.
- Tracker-vs-polling candidate divergence during migration: <= 1% over validation corpus.
- Confidence calibration review cadence: at least once per release cycle when trigger conditions are met.

---

## 12) Immediate Next Steps (Execution Queue)

1. Validate live polling in manual run:
  - Click Steam only -> warning still lists OBS.
  - Click OBS -> warning clears only when both resolved.
2. If Steam still intermittently misses blocker classification:
  - Add secondary classifier policy for bootstrap-style class windows with short titles.
3. If Steam still misses post-click placement:
  - Add explicit handle-first resume fallback before process-name placement.
4. Refactor extracted modules once behavior is stable to reduce `main.js` complexity.
5. Implement runId and stale-status rejection in status API + renderer state machine.
6. Implement cancel/relaunch control contract in backend orchestration.

---

## 13) Decision Log

- **Decision:** Keep sequential launch mode as default stability mode for now.  
  **Why:** Reduces race conditions while orchestration behavior is still being hardened.
- **Decision:** Treat confirmation blockers as pending, not failed/skipped.  
  **Why:** User action dependency is expected behavior, not an error.
- **Decision:** Introduce live status IPC instead of static one-shot message.  
  **Why:** Background resume and asynchronous resolution require continuous truth reporting.
- **Decision:** Add explicit run lifecycle IDs and stale-status rejection.  
  **Why:** Prevent cross-run state contamination and incorrect UI transitions.

---

## 14) Completeness Audit Checklist

This section is used during every doc update to prevent incomplete specs.

- Behavior matrix includes launch/content/discovery/classification/constraints/DPI/topology/security/user-control/unknown catch-all.
- Run lifecycle contract defined (runId/appLaunchId/attemptId).
- Cancellation and relaunch semantics defined.
- UI status contract includes stale-run rejection.
- Diagnostics include correlation keys for async reconstruction.
- Phase exit gates are measurable, not narrative-only.
- Acceptance criteria include quantitative SLOs.
- Window scoring algorithm is concrete and deterministic.
- Timing/retry budgets are explicitly defined.
- OS integration boundary (adapter interface) is defined.
- Concurrency model is explicit for launch/tracker/resume/status lanes.
- Fullscreen policy and user override handling are specified.
- Candidate set snapshot schema, triggers, and versioning are specified.
- Classification confidence thresholds are explicitly defined.
- Placement tolerance function is defined programmatically.
- Logging level system and overload controls are specified.
- Policy bundle/versioning structure is defined.

