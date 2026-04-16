# FlowSwitch Workflow Orchestration - Execution Checklist

Last updated: 2026-04-16  
Branch: `feature/workflow-orchestration-rewrite`  
Primary spec: `docs/superpowers/specs/workflow-orchestration-rewrite-plan.md`

## Purpose

Track implementation progress in a way that is easy to audit during active development.

Status legend:
- `not_started`
- `in_progress`
- `blocked`
- `done`

Priority legend:
- `P0` = must complete first / critical path
- `P1` = important, depends on P0 stabilization
- `P2` = valuable follow-up / polish

## Execution Rules

- No task may remain `in_progress` for more than **2 days** without either:
  - progress note update, or
  - status changed to `blocked`
- If a task remains `blocked` for **2 iterations** of attempted fixes:
  - isolate a minimal reproducible case,
  - document as known limitation or trigger redesign decision.

## Program Snapshot

- Current focus phase: **Phase 2 - Reliability Hardening**
- Current blockers:
  - Steam/launcher-child post-confirmation placement consistency
  - Tracker migration parity and cutover validation

## Milestones

| Milestone | Status | Exit Criteria |
| --- | --- | --- |
| M0 - Real-World Validation Baseline | in_progress | At least one real mixed profile (e.g., browser + IDE + chat app) launches with no manual recovery; run state is truthful end-to-end |
| M1 - Deterministic Core Stability | in_progress | 10 repeat runs; no false complete while pending exists; out-of-order confirmation passes |
| M2 - Reliability Hardening | not_started | 95%+ pass rate over 20 runs; bounded retries; tracker/poll parity and no leakage in validation set |
| M3 - Constraint Intelligence | not_started | constrained outcomes explicitly tagged and surfaced |
| M4 - UX/Control Plane | not_started | pending/failure recovery without restart |
| M5 - Power Features | not_started | feature flags and rollback path documented |

## Workstreams

### A) Run Lifecycle and Status Truth
- [x] (P0, owner: agent) Implement strict runId isolation in all status paths (`done`)  
  depends_on: none  
  done_when: status API + renderer ignore mismatched runId in all launch states
- [x] (P0, owner: agent) Enforce stale-status rejection in renderer and IPC consumers (`done`)  
  depends_on: runId isolation  
  done_when: stale updates never mutate active UI state in tests
- [x] (P0, owner: agent) Implement cancel/relaunch policy (`replace`) end-to-end (`done`)  
  depends_on: runId isolation  
  done_when: new run supersedes old run without pending-state leakage
- [ ] (P1, owner: agent) Add degraded-mode handling for status-store write failures (`not_started`)  
  depends_on: lifecycle status model  
  done_when: `statusDegraded=true` path validated with non-fatal renderer warning

Progress note (2026-04-16):
- Added run-scoped status store (`runId`) and active-run guards in main process.
- Added stale snapshot rejection in renderer polling by `runId` + poll token.
- Added replace semantics where new launch supersedes prior run and stale async writes are ignored.

### B) Classifier and Candidate Selection
- [ ] (P0, owner: agent) Extract classifier from `main.js` to dedicated module (`not_started`)  
  depends_on: none  
  done_when: classifier decisions no longer implemented inline in `main.js`
- [ ] (P0, owner: agent) Implement deterministic weighted scoring with reason tracing (`not_started`)  
  depends_on: classifier extraction  
  done_when: same input snapshot returns same top candidate and reason tags across runs
- [ ] (P0, owner: agent) Enforce confidence thresholds and unknown fallback contract (`not_started`)  
  depends_on: deterministic scoring  
  done_when: below-threshold candidates always map to `unknown_*`
- [ ] (P1, owner: agent) Ship confidence histogram pipeline (global + app-class) (`not_started`)  
  depends_on: threshold enforcement  
  done_when: per-app-class histograms generated in run artifacts
- [ ] (P1, owner: agent) Implement threshold review triggers and promotion checks (`not_started`)  
  depends_on: histogram pipeline  
  done_when: trigger conditions emit review-required events + before/after reports

### C) Process Hints and Ownership
- [ ] (P0, owner: agent) Extract process hints to `process-hints.js` (`not_started`)  
  depends_on: none  
  done_when: hint expansion logic is module-owned and testable
- [ ] (P0, owner: agent) Implement process hint versioning + diagnostics key (`not_started`)  
  depends_on: process-hints extraction  
  done_when: `processHintsVersion` emitted without `pre-module` transitional marker
- [ ] (P0, owner: agent) Harden launcher->child indirection and handle lineage (`in_progress`)  
  depends_on: process hints module  
  done_when: launcher PID replacement flows still resolve correct main candidate
- [ ] (P0, owner: agent) Implement post-confirmation candidate tie-break contract (`in_progress`)  
  depends_on: classifier scoring + lineage  
  done_when: post-confirmation candidate selection is deterministic and logged

### D) Placement, Stabilization, and Budgets
- [ ] (P0, owner: agent) Implement handle-first post-confirmation fallback path (`in_progress`)  
  depends_on: tie-break contract  
  done_when: confirmed modal flows result in verified placement or explicit constrained/failed terminal reason
- [ ] (P1, owner: agent) Add per-app-class retry budget overrides (`not_started`)  
  depends_on: base retry policy  
  done_when: class override table applies in runtime policy resolution
- [ ] (P1, owner: agent) Emit resolved retry policy per run/item (`not_started`)  
  depends_on: class budget overrides  
  done_when: diagnostics include resolved policy source and values
- [ ] (P0, owner: agent) Enforce run-budget terminal semantics and authoritative timeout event (`not_started`)  
  depends_on: lifecycle status truth  
  done_when: `run-budget-exhausted` emitted once and terminal state is deterministic

Progress note (2026-04-16, confirmation-routing hotfix):
- Tightened process hint expansion to avoid unrelated token matches (for example `OBS Studio` pulling in `code`).
- Updated ready-gate blocker logic so windows that qualify as strong main-placement candidates are not treated as hard blockers.
- Added regression tests for overlap disambiguation vs true modal blockers in `src/main/utils/window-ready-gate.test.js`.

### E) Global Tracker Migration
- [ ] (P1, owner: agent) Implement global tracker abstraction with scoped subscriptions (`not_started`)  
  depends_on: runId/appLaunchId truth  
  done_when: subscription filters work and cross-run partitioning verified
- [ ] (P1, owner: agent) Add tracker-vs-polling coexistence guardrails (`not_started`)  
  depends_on: tracker abstraction  
  done_when: one-source-per-decision-tick rule enforced
- [ ] (P1, owner: agent) Add A/B parity logging and divergence reporting (`not_started`)  
  depends_on: coexistence guardrails  
  done_when: parity reports generated for designated validation runs
- [ ] (P1, owner: agent) Complete tracker cutover validation gate (`not_started`)  
  depends_on: parity reporting  
  done_when: 10 consecutive validation runs pass with no leakage

### F) Tests and Validation
- [ ] (P0, owner: agent) Manual out-of-order confirmation validation pass (`in_progress`)
- [ ] (P0, owner: agent) Candidate set trigger coverage test (`not_started`)
- [ ] (P1, owner: agent) Tracker-vs-polling parity test (`not_started`)
- [ ] (P1, owner: agent) Status-store degraded-path test (`not_started`)
- [ ] (P1, owner: agent) Confidence trigger firing test (`not_started`)

### G) Performance Budgets
- [ ] (P1, owner: agent) Track average launch time per profile (`not_started`)  
  done_when: profile-level launch duration metric is emitted and trended
- [ ] (P1, owner: agent) Track window discovery latency (`not_started`)  
  done_when: discovery p50/p95 latency appears in diagnostics summaries
- [ ] (P1, owner: agent) Enforce no blocking loops beyond configured tick budget (`not_started`)  
  done_when: budget-overrun telemetry shows 0 overruns in validation set

### H) Product UX and Workflow Features (Non-Redundant Additions)
- [ ] (P1, owner: agent) Add post-launch FlowSwitch behavior setting: bring to front / minimize / close (`not_started`)  
  depends_on: A) run/status truth  
  done_when: user-selected post-launch behavior is applied consistently and does not interfere with run completion state
- [ ] (P1, owner: agent) Add completion confirmation channel decoupled from app foreground (desktop notification/toast) (`not_started`)  
  depends_on: post-launch behavior setting  
  done_when: completion/pending/failure notifications are visible even when launched apps are foregrounded
- [ ] (P1, owner: agent) Add pending-confirmation action controls (bring to front now + optional auto-bring-front policy) (`not_started`)  
  depends_on: A) status truth, C/D modal resolution paths  
  done_when: pending apps can be surfaced on demand and optional auto policy behaves deterministically
- [ ] (P0, owner: agent) Implement Reapply Layout for already-running apps without relaunch (`not_started`)  
  depends_on: D) placement/stabilization reliability  
  done_when: running windows can be re-detected and re-placed using existing placement engine with verification
- [ ] (P2, owner: agent) Add launch-with-files-and-tabs authoring UX (clear list of attached launch targets) (`not_started`)  
  depends_on: M5 content orchestration path  
  done_when: users can add/remove/inspect files/URLs/tabs per app and persisted payload launches correctly
- [ ] (P1, owner: agent) Add per-app status overlay in monitor preview (waiting/fail/success) (`not_started`)  
  depends_on: A) live status + runId truth  
  done_when: each app card renders truthful status state with no stale-run leakage
- [ ] (P2, owner: agent) Add per-app progress bar under app icon (retain global spinner as optional) (`not_started`)  
  depends_on: per-app status overlay  
  done_when: per-app progress state is visible and aligned with orchestration states
- [ ] (P2, owner: agent) Add confidence badges for transient/dirty app families (`not_started`)  
  depends_on: B) confidence pipeline + thresholds  
  done_when: confidence badge derives from real classifier confidence bands and updates with active run
- [ ] (P2, owner: agent) Add minimized-app launch drop zone ("drag apps here to start minimized") (`not_started`)  
  depends_on: launch behavior mapping + UI drag model  
  done_when: dropped apps are persisted with minimized intent and launch minimized reliably
- [ ] (P2, owner: agent) Improve app search UX with clear button (`not_started`)  
  done_when: clear action resets query/filter state in one click
- [ ] (P2, owner: agent) Show "New Profile" action outside Profiles tab (`not_started`)  
  done_when: new profile entry point is available in non-profiles views without context loss
- [ ] (P1, owner: agent) App catalog curation: exclude non-app overlays/noise and include normal desktop apps (`not_started`)  
  depends_on: app discovery/catalog filtering pipeline  
  done_when: non-app overlays (for example NVIDIA in-game overlay hosts) are filtered out; File Explorer and Task Manager are included; duplicate aliases are normalized; visible entries have icon fallback coverage
- [ ] (P2, owner: agent) Allow app drag from whole card, not icon-only (`not_started`)  
  done_when: drag interactions are discoverable and preserve existing placement semantics
- [ ] (P2, owner: agent) Support taskbar right-click profile switching (`not_started`)  
  depends_on: profile switch orchestration + shell menu wiring  
  done_when: taskbar menu can switch and launch/select profiles reliably
- [ ] (P2, owner: agent) Evaluate RDP login/startup automation as security-gated feature (`not_started`)  
  depends_on: security model review and credential handling policy  
  done_when: feature is either safely specified behind explicit policy/guardrails or formally marked out-of-scope

## Regression Guardrails (Must Never Regress)

- [ ] No false `complete` while unresolved pending confirmations exist.
- [ ] Placement verification always executes before terminal success for placeable windows.
- [ ] runId mismatch never updates active renderer state.
- [ ] Post-confirmation re-evaluation always runs before final terminal state for confirmation-gated apps.
- [ ] Reapply layout must use verification path; no blind "move-only" success.
- [ ] Per-app UI status overlays/progress must always map to active `runId`.

## Active Validation Artifacts

- Automation artifacts directory: `artifacts/launch-tests/`
- Primary profile under test: `profile-1775949089283`
- Current log/screenshot source: latest run folder timestamp

## Blocker Escalation

If a blocker persists for 2 implementation iterations:
1. Produce minimal repro (profile + expected vs actual behavior).
2. Mark related tasks as `blocked` with blocker reference.
3. Choose one:
   - redesign approach, or
   - document as known limitation with explicit guardrail.

## Update Protocol

For every implementation step:
1. Update relevant workstream item status.
2. Update milestone status if exit criteria changed materially.
3. Add/refresh blocker notes in Program Snapshot.
4. Keep this checklist and the primary spec aligned.
5. Add a short progress note if any task remains `in_progress`.
