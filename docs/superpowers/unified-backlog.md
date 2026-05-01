# FlowSwitch Unified Backlog (Canonical)

Last updated: 2026-04-30  
Owner: active implementation branch owner

## Purpose

This is the single up-to-date backlog snapshot for active work.

It consolidates:
- `docs/superpowers/feature-braindump.md`
- `docs/superpowers/specs/workflow-orchestration-rewrite-plan.md`
- `docs/superpowers/specs/workflow-orchestration-execution-checklist.md`

Status legend:
- `not_started`
- `in_progress`
- `blocked`
- `mostly_done`
- `done`

## Sync Rules (Mandatory)

1. When implementation status changes, update this file in the same session.
2. After commits, sync this file and the source docs before handoff.
3. Keep priorities ordered by user impact and reliability risk.
4. If this file conflicts with source specs, update both and resolve drift immediately.

## Current Snapshot

### A) Product Backlog (from feature braindump)

#### P0 - Now

1. Launch visibility and control (`mostly_done`)
   - Current: launch sidebar is implemented; launch tab/sidebar reasserts during active runs; main-window pin preference is wired at launch start; cancel path reports failed cancel attempts in UI; completion is truthful (verify/stabilize must pass, or generic constrained-placement acceptance with explicit warning); executable launches use exe-directory `cwd`; fatal post-launch error dialogs fail the app; timeline labels and inspector warning for constrained verify step; post-run “Launch summary” shows session outcome chip beside the section title (not bundled with the app counter), launched profile name with elapsed time on a full-width row, and per-app status (quiet OK checkmark vs warn/error/stopped pills, substeps and in-row notes for non-OK, optional “Reused existing window” when applicable); launch inspector uses the launched profile (not canvas selection) and launch-status polling keys off the active launch profile id during runs; one-line cancel context when the run was cancelled; in-run “Run overview” counts (apps/tabs/failed/skipped/awaiting confirmation); human-readable per-action states in details; terminal icons in completed list match outcome (success/warning/failed/skipped).
   - Remaining: optional completion feedback tweaks from user testing (e.g. audio cue, taskbar progress) and any copy tuning after real profile runs; optional return of rich per-app hover detail in the post-run summary if dogfood shows a gap.

2. Critical layout-editor responsiveness and shell trust (`mostly_done`)
   - Current: drag freeze is mostly fixed; minimized-target-on-secondary-monitor bug is fixed.
   - Remaining: first-launch blur root cause and fix (not reproducible yet).

3. App discovery completeness and hygiene (`not_started`)
   - Improve coverage for missing apps.
   - Filter non-app/system-noise entries.
   - Clarify launchable vs listed entries.
   - Add manual executable path support and test-launch flow.
   - Harden icon/path handling for non-system drives.

4. Safe launch guardrails for large profiles (`not_started`)
   - Soft threshold warnings and hard constraints.
   - Launch-time risk/duration messaging.
   - Optional sequencing for dependency-sensitive launches.

#### P1 - Next

1. Layout preview runtime status semantics (`not_started`)
2. Reapply layout without relaunch (`not_started`)
3. Faster profile access/switching + hotkeys (`not_started`)
4. Layout editor ergonomics and history (`not_started`)
5. Responsive behavior for smaller window sizes (`not_started`)
6. Catalog curation quick commands (`not_started`)
7. Edit/view affordance + first-run guidance (`not_started`)

### B) Workflow Orchestration Rewrite Backlog (from spec + execution checklist)

Current focus phase: `Phase 2 - Reliability Hardening`

#### P0 - Critical Path

1. Launcher-child indirection and handle lineage hardening (`in_progress`)
2. Post-confirmation candidate tie-break contract (`in_progress`)
3. Handle-first post-confirmation fallback path (`in_progress`)
4. Deterministic weighted scoring with reason tracing (`not_started`)
5. Confidence threshold enforcement + `unknown_*` fallback contract (`not_started`)
6. Run-budget terminal semantics and authoritative timeout event (`not_started`)
7. Candidate-set trigger coverage validation (`not_started`)
8. Manual out-of-order confirmation validation pass (`in_progress`)

#### P1 - Reliability Expansion

1. Status-store degraded mode path (`not_started`)
2. Per-app-class retry budget overrides + resolved policy diagnostics (`not_started`)
3. Global tracker abstraction + coexistence guardrails (`not_started`)
4. Tracker-vs-polling parity reporting and cutover validation (`not_started`)
5. Confidence histogram pipeline + threshold-review triggers (`not_started`)

## Immediate Next Execution Queue

1. Optional polish on launch visibility/control (audio, taskbar progress, dogfood copy); treat P0 launch track as criteria-met unless new gaps appear.
2. Run targeted first-launch blur investigation matrix (DPI, scale, zoom, first-run state capture), then fix or classify.
3. Start app-discovery trust pass (manual exe + launchability classification + non-system-drive icon/path robustness).
4. Start large-profile guardrails (thresholds, warnings, sequencing policy).
5. Continue orchestration P0 in-progress tasks to done before opening new P1 items.

## Recently Landed / Verified Status

- Drag freeze: mostly fixed.
- Secondary-monitor minimized target bug: fixed.
- Launch progress UX: partially implemented through launch sidebar.
- Launch visibility hardening pass landed: active-run launch panel persistence, main-window pin preference wiring, and cancel-failure feedback.
- Launch completion truth fix landed: app run now fails when placement verification/stabilization does not pass, and confirmation substep copy only says confirmed when confirmation actually occurred.
- OBS-specific launch hardening landed: executable launches now use executable-directory `cwd`, and OBS fatal error dialogs are treated as launch failures instead of successful main windows.
- Generic recoverability hardening landed: if an app lands on target monitor but enforces non-trivial window-size constraints, FlowSwitch now records constrained placement (warning) instead of failing the full launch.
- Launch timeline and inspector copy landed: phase-accurate substep labels, single constrained user message, warning treatment on verifying placement when constrained.
- Launch inspector completion polish landed: session outcome aligned with run, per-app badges and detail rows in the post-run list, run overview strip during active launches, readable action states, per-outcome icons in the completed list.
- Launch summary + profile fidelity merge landed (main): header hierarchy (outcome by title, counter separate), launched-profile inspector binding and poll id during active launch, quiet OK vs pill states, “Reused existing window” smart-decision copy (backward-compatible with legacy “Reusing” text).
- Canonical backlog process landed: `unified-backlog.md`, `AGENTS.md` post-commit sync rule, removal of superseded standalone launch plan docs under `docs/superpowers/plans/`.
- First-launch blur: not fixed, low reproducibility.
