# FlowSwitch Unified Backlog (Canonical)

Last updated: 2026-05-05  
Owner: active implementation branch owner

**Release note (marketing):** `package.json` / `website/` prepared for **0.1.3** (`chore/release-0-1-3-website`). Live GitHub downloads require pushing annotated tag **`v0.1.3`** after merge and waiting for the release workflow to attach `FlowSwitch-0.1.3-win-x64-*.exe` assets matching `website/latest.json`.

## Purpose

This is the single up-to-date backlog snapshot for active work.

It consolidates:
- `docs/superpowers/feature-braindump.md`
- `docs/superpowers/specs/workflow-orchestration-rewrite-plan.md`
- `docs/superpowers/specs/workflow-orchestration-execution-checklist.md`
- `docs/superpowers/specs/2026-05-03-ui-ux-evaluation-report.md` (shell accessibility, chrome version, renderer hygiene; agent-browser + heuristic pass)

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
   - Current: launch sidebar is implemented; launch tab/sidebar reasserts during active runs; main-window pin preference is wired at launch start; cancel path reports failed cancel attempts in UI; completion is truthful (verify/stabilize must pass, or generic constrained-placement acceptance with explicit warning); executable launches use exe-directory `cwd`; fatal post-launch error dialogs fail the app; timeline labels and inspector warning for constrained verify step; post-run “Launch summary” shows session outcome chip beside the section title (not bundled with the app counter), launched profile name with elapsed time on a full-width row, and per-app status (quiet OK checkmark vs warn/error/stopped pills, substeps and in-row notes for non-OK, optional “Reused existing window” when applicable); **post-run summary lists each associated file/folder with icons** (via `contentItems` through `launchProgressFromStatus`); **apps with associated content show a `sub-content` substep** (“Opening content” / “Opened content”) and Explorer multi-folder runs use an **`opening-content` row step** during post-verify tab automation; launch inspector uses the launched profile (not canvas selection) and launch-status polling keys off the active launch profile id during runs; one-line cancel context when the run was cancelled; in-run “Run overview” counts (apps/tabs/failed/skipped/awaiting confirmation); human-readable per-action states in details; terminal icons in completed list match outcome (success/warning/failed/skipped).
   - Remaining: optional completion feedback tweaks from user testing (e.g. audio cue, taskbar progress) and any copy tuning after real profile runs; optional return of rich per-app hover detail in the post-run summary if dogfood shows a gap.

2. Critical layout-editor responsiveness and shell trust (`mostly_done`)
   - Current: drag freeze is mostly fixed; minimized-target-on-secondary-monitor bug is fixed.
   - Remaining: first-launch blur root cause and fix (not reproducible yet).

3. App discovery completeness and hygiene (`in_progress` — `feature/app-discovery-hygiene`)
   - Improve coverage for missing apps.
   - Filter non-app/system-noise entries.
   - Clarify launchable vs listed entries.
   - Add manual executable path support and test-launch flow.
   - Harden icon/path handling for non-system drives.
   - **Latest (branch):** Apps sidebar add pill → pick `.exe` → persists `userCatalogExePaths` and merges into catalog (`installed-apps:add-user-exe`); Steam library `common` roots merged into optional deep exe scan; stricter catalog filters (VC++ redistributable titles, Java/AMD/Intel installer noise, Package Cache VC paths), inbox shortcut allow-list extended (Codex, Cursor, Windsurf), WindowsApps shim **display-name** fallbacks when WinRT/manifest names are missing, optional exe scan uses `%ProgramFiles%` / `%ProgramFiles(x86)%` and `FLOWSWITCH_EXE_SCAN_EXTRA_ROOTS`; shell icon script tweaks; matrix doc updated. **Content / layout:** “Add to monitor” from the content ⋯ menu resolves catalog icons at placement time (`getInstalledAppsCatalog` + ref) so tiles match drag-drop; content library gains `FlowSnackbar` provider usage and `AVAILABLE_APPS` moved to `availableAppsForOpensWith` for Fast Refresh hygiene.

4. Safe launch guardrails for large profiles (`not_started`)
   - Soft threshold warnings and hard constraints.
   - Launch-time risk/duration messaging.
   - Optional sequencing for dependency-sensitive launches.

5. Shell accessibility — profile library keyboard parity (`done` — `feature/profile-library-keyboard-parity`)
   - **Evidence:** `docs/superpowers/specs/2026-05-03-ui-ux-evaluation-report.md` (C1); `ProfileCard` uses `div` + `onClick` without `tabIndex` — cards not in tab order; no Enter/Space semantics.
   - **Done when:** Profile rows are operable with keyboard only (prefer `<button type="button">` for card surface, preserve settings `stopPropagation`), with concise per-profile accessible naming.
   - **Latest:** `ProfileCard` uses a transparent full-card `button` (tab + Enter/Space) with `aria-labelledby` on the profile title and `aria-current` when active; inner settings / “Set hotkey” controls use `pointer-events-auto` so they are not nested inside that button.

6. About dialog / chrome version source of truth (`done` — `fix/about-version-source-of-truth`)
   - **Evidence:** report M1; `AppChromeModals.tsx` hardcodes `APP_VERSION` out of sync with `package.json` (e.g. 0.1.0 vs shipped 0.1.3).
   - **Done when:** About (and any chrome copy) reads version from the same build-time or package source as release artifacts.
   - **Latest:** Renderer `APP_VERSION` comes from root `package.json` via Vite `define` (`__FLOWSWITCH_APP_VERSION__` → `src/renderer/appVersion.ts`); About modal imports that constant.

#### P1 - Next

1. Layout preview runtime status semantics (`not_started`)
2. Reapply layout without relaunch (`not_started`)
3. Faster profile access/switching + hotkeys (`not_started`)
4. Layout editor ergonomics and history (`not_started`)
5. Responsive behavior for smaller window sizes (`mostly_done` for inspector chrome)
   - **Done on branch `fix/content-launch-followups` (2026-05-01):** associated-content **+ Add** menu stays within the narrow inspector (full-width grid row + width cap); removed dead **`pt-12`** top padding on app/content inspect roots (Launch tab unchanged).
6. Catalog curation quick commands (`not_started`)
7. Edit/view affordance + first-run guidance (`not_started`)

8. Renderer hygiene — remove `MainLayout` debug logging (`done` — `chore/mainlayout-remove-debug-logs`)
   - **Evidence:** report M5; 10+ `console.log` in `src/renderer/layout/MainLayout.tsx` (profile switch, drag callbacks).
   - **Done when:** No stray `console.log` in production renderer paths (dev-only logger or delete).
   - **Latest:** All `console.log` calls removed from `MainLayout.tsx` (app select/update/delete/move, profile switch, cross-monitor callbacks); no dev-only logger added — delete-only per scope.

9. Shell landmarks + accessible name audit (`mostly_done` — `chore/mainlayout-remove-debug-logs`)
   - **Evidence:** report M2; AX snapshots show a root `generic` whose name concatenates entire sidebar text; add `<main>` / `nav`, explicit card/region labels; validate with NVDA.
   - **Done when:** Screen reader rotor/navigation does not announce one blob for the whole library; spot-check with NVDA on Profiles / Apps / Content.
   - **Latest:** Root shell `aria-label="FlowSwitch"`; title strip `<header aria-label="Menu and window controls">`; library column `<nav aria-label="Library">` (replaces `flow-shell-nav` div); center column `role="region"` + `aria-label="Profile workspace"`; monitor surface `<main aria-label="Monitor layout">`; fixed inspector `<aside aria-label="Inspector">`. **Remaining:** NVDA rotor spot-check on Profiles / Apps / Content.

10. Library tab strip pointer hit-testing (`not_started`)
    - **Evidence:** report M3; CDP `click` on tab ref failed while `tab.click()` succeeded — verify no overlay intercepts real pointer events on Profiles/Apps/Content tabs.

11. Apps / Content sidebar SR verbosity + row semantics (`not_started`)
    - **Evidence:** report m2, m4; long `aria-label` on Info help buttons; mixed folder/file row exposure in AX tree.
    - **Done when:** Short `aria-label` or `aria-describedby` for help controls; consistent row button/heading pattern for content entries.

12. Optional keyboard skip affordance (`not_started`)
    - **Evidence:** report m5; skip-to-main style pattern for heavy sidebar + canvas layouts.

13. QA harness note — agent-browser snapshots (`not_started` / process)
    - **Evidence:** report M4; `snapshot -i` omits portaled `menuitem`s — document in test playbook: use full `snapshot` for menus/modals.

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

- **Latest (2026-05-04, `fix/audacity-confirmation-resume`):** Audacity confirmation-flow hardening landed on the active fix branch: post-dismiss candidate scans now log accepted/rejected windows with reasons, narrow/portrait `wxWindowNR` companion panes are rejected before placement, and the resume path escalates to launched-PID main-window placement when lightweight process-name enumeration never surfaces the true main window.

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
6. **UI/UX evaluation follow-ups:** **P0 §5–6**, **P1 §8**, and **P1 §9** (landmarks + shell labels in `MainLayout`) are done or mostly done pending NVDA; next batch **P1 §10–11** (tab hit-testing, SR row semantics) with the next renderer PR or `fix/*` as appropriate.

## Recently Landed / Verified Status

- Orchestration Phase 2: `processHintsVersion` emitted on profile launch diagnostics `start` and on `companion-hints-discovered` (`PROCESS_HINTS_VERSION` in `process-hints.js`); execution checklist §C process-hint versioning marked `done` (2026-05-03).
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
- Profile library keyboard parity landed (2026-05-04): `ProfileCard` primary selection is a focusable control with proper naming; nested actions remain separate buttons with `stopPropagation`.
- `MainLayout` renderer hygiene (2026-05-04): stray `console.log` removed from production paths (`chore/mainlayout-remove-debug-logs`).
- Shell landmarks (2026-05-04): named root/header/nav/region/main/aside wrappers in `MainLayout` to reduce AX “whole sidebar as one name” noise (M2 follow-up).
- Layout capture / GitHub #51 (partial, `feature/explorer-windows-profile`): Explorer windows with resolvable `file://` folder URLs get `explorer.exe` plus `associatedFiles` on the captured tile; paths dedupe into profile Content rows. Tab coverage depends on what `Shell.Application.Windows()` exposes on the OS build; launch restore uses the existing `profile-launch-gather` Explorer argv path. **Launch fix (2026-05-05):** sequential Explorer tiles exclude HWNDs already placed earlier in the same run (`placedHandlesInRun` → window-ready-gate `excludeHandles`, reuse candidate filter, `moveWindowToBounds` exclusions, post-modal resume quarantine merge) so the second launch cannot reposition the first window into the second slot when the shell reuses or delays new top-level HWNDs.
