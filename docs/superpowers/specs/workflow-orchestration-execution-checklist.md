# FlowSwitch Workflow Orchestration - Execution Checklist

Last updated: 2026-04-17  
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

Progress note (2026-04-16, tie-break and fallback hardening):
- Added deterministic candidate sorting contract in `window-ready-gate` (score, area, title length, handle).
- Added handle-first placement fallback in post-modal resume to iterate ranked candidate handles when primary handle placement fails.
- Added deterministic tie-break regression coverage in `src/main/utils/window-ready-gate.test.js`.

Progress note (2026-04-16, ghost-window rejection hardening):
- Added minimized-window (`IsIconic`) detection to main-process visible-window enumeration and candidate scoring.
- Rejected minimized/iconic rows from ready-gate blocker/main-candidate heuristics and timeout interactive blocker fallback.
- Filtered minimized/iconic rows from post-modal fallback candidate collection and slow-launch stabilization candidates.
- Added regression coverage to confirm minimized ghost rows are ignored by `waitForMainWindowReadyOrBlocker`.

Progress note (2026-04-16, post-modal handle authority + stability hardening):
- Fixed post-modal flow to carry the actual placed handle (including fallback-selected handles) into verification, maximized stabilization, and final resolved result.
- Tightened slow-launch stabilization contract to require repeated same-handle verification before reporting success.
- For maximized stabilization, switched target checks to placement rects (`visibleRect`/`outerRect`) before fallbacking to raw window rect.

Progress note (2026-04-16, latest-run diagnostics artifact):
- Added deterministic latest-run diagnostics sink: each profile launch run now resets `%APPDATA%/FlowSwitch/logs/launch-latest.jsonl` and appends run events there.
- Included the active `latestRunLogFile` path in launch-profile diagnostics start metadata for traceability.

Progress note (2026-04-16, post-modal winner re-election hardening):
- Added a post-modal maximized winner re-election pass that re-scans merged candidates and re-targets to the current top candidate before declaring success.
- Success now requires stable top-candidate verification (`onTarget` + meaningful bounds) across repeated settle polls.
- Added explicit diagnostics events for winner re-election verification outcomes.

Progress note (2026-04-16, stricter maximized main-window eligibility):
- Tightened maximized "meaningful bounds" thresholds used by stabilization and post-modal settle verification to reject medium-sized launcher/modal surfaces.
- Tightened ready-gate maximized candidate eligibility with ratio + area constraints so undersized windows are not promoted to main-placement candidates.
- Added regression coverage for rejecting undersized maximized candidates in `src/main/utils/window-ready-gate.test.js`.

Progress note (2026-04-16, maximized owned-window exclusion):
- Added maximized-path candidate exclusion for owned/top-most windows in ready-gate main-candidate eligibility.
- Applied the same maximized owned/top-most exclusion in post-modal fallback candidate collection and slow-launch stabilization candidate filtering.
- Added regression coverage for rejecting owned top-level maximized candidates in `src/main/utils/window-ready-gate.test.js`.

Progress note (2026-04-16, blocker-handle quarantine in post-modal resume):
- `waitForMainWindowReadyOrBlocker` now returns blocker handle sets for both immediate modal-block and timeout-interactive blocker outcomes.
- Post-modal resume now carries forward blocker handles and excludes them from candidate collection, initial ready-handle selection, and fallback placement attempts.
- Added/updated test expectations for blocker handle propagation to guard the quarantine contract.

Progress note (2026-04-16, blocked-era candidate quarantine):
- During post-modal resume, candidates observed while confirmation blocking is still active are now quarantined from subsequent winner selection.
- Resume gate now rejects any "ready" handle that is already in the blocked-era quarantine set and continues polling for a post-confirmation candidate epoch.
- Added diagnostics signal `blocked-era-candidates-quarantined` to audit when pre-confirmation candidates are being excluded.

Progress note (2026-04-16, post-confirmation root-process restriction + explicit dismissal-wait):
- Identified root cause of persistent Steam ghost-window failure: post-confirmation resume was scanning candidates using the expanded process-hint set (e.g. `['steam', 'steamwebhelper']`), which allowed companion-process windows (CEF helpers, overlay/friends/splash) of roughly target size to pass meaningful-bounds checks and be reported as the stabilized main window - the visible "ghost".
- Initial attempt restricted resume scans to root hint only; this overcorrected and broke Steam entirely because Steam's real main client window is hosted in `steamwebhelper.exe`, not `steam.exe`, so the root hint couldn't see the blocker chooser OR the eventual main window. Symptom: "Waiting for 1 confirmation (Steam)" stays indefinitely even after user confirms, because post-modal-resume times out with `main-window-timeout` after 118s.
- Final fix separates "where to enumerate" from "which candidates are eligible":
  - Enumeration: `resumePlacementAfterConfirmationModal` uses expanded hints (`processHintLc` + companion hints) for `collectResumeCandidates`, `waitForMainWindowReadyOrBlocker`, and `stabilizePlacementForSlowLaunch` - required to see the real main window when it lives in a companion process.
  - Eligibility: every candidate observed during the blocker-visible phase is added to a `blockedHandleSet` (quarantine). This set is passed through to `waitForMainWindowReadyOrBlocker` (new `excludeHandles` parameter) and `stabilizePlacementForSlowLaunch` (existing `excludedWindowHandles` parameter). Pre-dismissal auxiliary windows (overlay/friends/splash/chooser) cannot win selection, regardless of process ownership.
- `awaitBlockerDismissal()` pre-phase: actively polls (expanded hints, includeBlocked=true) waiting for any quarantined blocker handle to become non-visible-and-enabled. Every candidate seen during this wait is added to quarantine. Once no blocker is visible, a final snapshot quarantines everything currently visible - so only windows that appear AFTER dismissal can be selected.
- Mandatory 1500ms settle delay after dismissal gives the host app time to destroy pre-confirmation windows and spawn its real main window before winner selection runs.
- `window-ready-gate.js` gained a new `excludeHandles` parameter that filters rows at merge time; excluded handles cannot be ready-candidates or blocker-candidates. Added regression test `waitForMainWindowReadyOrBlocker filters out quarantined handles via excludeHandles`.
- New diagnostics signals: `blocker-dismissed-quarantine-snapshot`, `initial-snapshot-quarantine`, `ready-handle-quarantined`, `confirmation-dismissal-timeout`, `blocked-era-candidates-quarantined`.
- Verified: `npm run lint` clean (0 errors), all 26 tests pass, typecheck baseline drops 31 -> 18 (13 resolved, 0 new).

Progress note (2026-04-16, tool-window blocker exclusion):
- Bug: After Steam confirmation was successfully dismissed (quarantine snapshot fired correctly), the resume gate would stall indefinitely showing "Waiting for 1 confirmation (Steam)" because Steam emits small `tool: true` SDL_app notification/toast windows (e.g. 496x123, "Steam is updating content...") shortly after the main chooser closes. `isLikelyModalBlockerWindow` was incorrectly flagging these as confirmation modals since it did not exclude tool windows - only main-candidate checks did.
- Fix: `isLikelyModalBlockerWindow` now returns `false` immediately for any row with `tool: true`. Tool windows are never interactive modals - they are transient toasts/tooltips/balloons that do not require user action and must not stall the resume gate.
- Regression test: `waitForMainWindowReadyOrBlocker does not treat tool windows as confirmation blockers` - covers the exact Steam scenario where a tool-class notification window appears alongside the real main window post-confirmation; gate now correctly resolves ready on the main window.
- Verified: `npm run lint` clean (0 errors), all 27 tests pass.

Progress note (2026-04-16, post-dismissal over-quarantine rollback):
- New failure evidence (`launch-latest.jsonl`): confirmation dismissal was correctly detected (`blocker-dismissed-quarantine-snapshot`) but post-modal resume still timed out with `blocked: false` and `main-window-timeout`, leaving "Waiting for 1 confirmation (Steam)" stuck.
- Root cause: dismissal-phase logic quarantined every window visible on the first poll after chooser close. In Steam runs this can include the real main window handle, which then gets excluded by `excludeHandles` from ready-gate and stabilization forever.
- Fix in `resumePlacementAfterConfirmationModal`: removed the "quarantine everything currently visible at dismissal" snapshot; quarantine now only accumulates rows observed while the blocker is still visible. Also separated blocker-visibility detection (`blockerPresenceHandleSet`) from candidate quarantine (`blockedHandleSet`) so dismissal detection is based on known blocker handles only.
- Diagnostics updated: dismissal now emits `blocker-dismissed` or `blocker-not-visible-at-resume-start` (instead of `blocker-dismissed-quarantine-snapshot` / `initial-snapshot-quarantine`) while retaining `quarantinedDuringWait` and `blockedHandleCount` counters.
- Verified: `npm run lint` clean (0 errors), all 27 tests pass, typecheck baseline unchanged and passing (18 current vs 31 baseline).

Progress note (2026-04-16, fullscreen-spawn cross-monitor re-anchor):
- New user-observed pattern: ghost-window failures cluster when an app relaunches in fullscreen/maximized state on its previous monitor and FlowSwitch immediately attempts to place it to a different target monitor.
- Root cause hypothesis in placement primitive: for maximized targets we were not consistently forcing a restore before cross-monitor move, so some apps kept compositor/fullscreen state from prior monitor and ignored first relocation while maximized.
- Fix in both placement primitives (`moveWindowToBounds` -> `Apply-Placement`, and `moveSpecificWindowHandleToBounds`): for `windowState == SW_MAXIMIZE` now enforce a restore-first path (`SW_RESTORE` + short settle), then apply `SetWindowPos`, then maximize; additionally run one explicit re-anchor pass (`restore -> SetWindowPos -> maximize`) for maximized state to handle apps that ignore the first move when respawning fullscreen.
- This hardening applies to both initial placement and post-confirmation resume, so it covers Notion/Steam cases where a prior fullscreen monitor is different from the target monitor.
- Verified: `npm run lint` (0 errors), `npm run test` (27/27 pass), `npm run typecheck` (baseline pass; current 18 vs baseline 31).

Progress note (2026-04-16, already-running app confirmation bypass + feature braindump doc):
- New reports: (1) gaming profile can show false confirmation for Chrome, and (2) OBS "already running, open another instance?" confirmation can confuse pending-confirmation flow because a real main OBS window is already present before launch.
- Fix in `runLaunch` (`src/main/main.js`): collect pre-launch windows for all apps (not only duplicate launches) and add `findStableExistingMainWindowHandle()` gated by pre-launch handles. When ready-gate reports a confirmation blocker, the launcher now checks whether a stable, placeable pre-existing main window is already visible (stable across two polls, same scoring/meaningful-size constraints). If found, it bypasses pending confirmation and places that window directly (`confirmation-blocker-bypassed-existing-main-window`).
- This keeps true confirmation flows (e.g. Steam chooser with no pre-existing main handle) intact while preventing false/irrelevant confirmation waits for already-running instances.
- Added `docs/superpowers/feature-braindump.md` as a persistent idea capture file for random feature notes and later analysis.

Progress note (2026-04-16, launch target mode stepping-stone - default warm attach before cold start):
- User signal: for already-running apps (OBS, Chrome) current behavior still leans cold-start and can trigger false confirmation/pending states or unwanted relaunch prompts.
- Implemented first practical slice of section 4.1 target modes in `runLaunch`:
  - Always capture pre-launch windows (all apps, not only duplicate launches).
  - Before launching a process, attempt to find a stable, placeable pre-existing main window handle across process hints.
  - If found, use `launch-target-mode: reuse-existing-window-detected` path and skip process launch/reopen entirely, then continue normal placement/stabilization on that handle.
  - If no reusable handle is found, continue existing cold-start flow unchanged.
- Maintained fallback behavior for `bounds-unavailable`: still launches without placement instead of aborting.
- Updated braindump structure to pure quick-capture inbox bullets (no formal template required); formalization now happens during review into `Reviewed / Formalized`.

Progress note (2026-04-16, reuse-existing detection broadened for minimized/previous-monitor windows):
- New run evidence: OBS still entered `confirmation-modal-awaiting-user` despite existing-window bypass work, indicating warm-attach candidate detection was too strict.
- Root cause in `findStableExistingMainWindowHandle()`: pre-existing windows were rejected if minimized and if they did not already satisfy target meaningful-size constraints. That blocks valid reuse cases where an already-running app is minimized or restored on a previous monitor/size (exactly the scenario before placement correction should run).
- Fix: broadened reuse candidate eligibility to allow minimized pre-existing handles, removed detection-time meaningful-size requirement, and kept only safety guards (not cloaked/hung/tool, enabled, no owner/topMost, minimum dimensions). Placement/stabilization remains responsible for restore/move/resize.
- Added diagnostics for target-mode decisioning: `launch-target-mode` with `prelaunch-window-snapshot` (count + sample) to make false negative reuse detection easier to audit in logs.
- Verification: `npm run lint` (0 errors), `npm run test` (27/27 pass), `npm run typecheck` (baseline pass, current 18 vs baseline 31).

Progress note (2026-04-17, Task 5 launch-status reason code propagation):
- Updated launch profile status payload wiring in `src/main/main.js` so slot reason codes surface in user-facing paths (not diagnostics-only): `reused_existing_window`, `spawned_new_window`, and `fallback_to_spawn`.
- `runLaunch` now keeps explicit `launchStatusMode` and `launchStatusReasonCode` state per launch item, maps spawn-after-reuse-attempt to `fallback_to_spawn`, and carries these values into pending confirmation and failed-app payload entries.
- Updated `src/main/utils/launch-status-store.js` cloning so structured pending-confirmation fields `mode` and `reasonCode` are preserved in status store payloads; pending-confirmation `reason` remains plain human text.
- Verification commands run for this slice: `npm run lint` (0 errors, warnings only), `npm run test` (40/40 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13).

Progress note (2026-04-17, chromium delayed-maximize thrash reduction + normal precision tightening):
- New run evidence: Chrome false confirmation regression was resolved, but Edge still showed visible resize churn after landing in correct initial spot; Anki remained slightly off target despite passing normal placement verification.
- Fixed a missed guard in `src/main/main.js` so delayed-maximize Chromium launches no longer execute normal-state `placement-verification` passes that can trigger extra corrective resize cycles.
- Added delayed-maximize pre-check (`already-maximized-like`) and skip path (`skip-maximize-reapply-already-maximized-like`) to avoid unnecessary maximize reapply plus maximized stabilization when the window is already on target monitor and near monitor-filling dimensions.
- Tightened normal-state verification tolerance for non-Chromium apps from `8px` to `5px` (`getVerificationTolerancePx`) to improve final placement precision for apps like Anki without changing Chromium-specific tolerance.
- Verification commands run for this slice: `npm run test` (40/40 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, chromium skip-maximize containment hardening):
- New run evidence + screenshot: Chrome could span monitors 1/2 while still taking `skip-maximize-reapply-already-maximized-like`, because skip gating used center-on-target + coarse size ratios and did not require monitor-bound containment.
- Fixed delayed-maximize skip gating in `src/main/main.js` by adding explicit target-monitor containment checks (with bounded frame slack) before allowing the skip path.
- Resulting behavior: cross-monitor windows are no longer treated as "already maximized-like"; they proceed through maximize reapply/stabilization path instead of exiting early.
- Verification commands run for this slice: `npm run test` (40/40 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, OBS fake-confirmation blocker classifier hardening):
- New run evidence: OBS path emitted `modal-window-blocking-placement` and `confirmation-modal-awaiting-user` with a plain `Qt*` window row in maximized flow, producing a false pending-confirmation state.
- Root cause in `src/main/services/window-ready-gate.js`: interactive chooser blocker heuristic treated almost any titled undersized maximized-window candidate as blocker (`titleLength > 0` signal), and timeout fallback used a broad generic interactive-row filter.
- Fixes:
  - Added explicit confirmation-title patterns and removed generic `titleLength > 0` as sufficient blocker signal.
  - Tightened chooser-interactive signal to require stronger modal indicators (`hasOwner`, `topMost`, modal class, chooser-like class, or confirmation title cues).
  - Tightened timeout fallback blocker classification to reuse `isLikelyModalBlockerWindow(...)` instead of broad row shape filters.
- Added regression test in `src/main/utils/window-ready-gate.test.js`: `waitForMainWindowReadyOrBlocker does not misclassify undersized plain OBS main window as confirmation blocker`.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `window-ready-gate.js` and test file (no errors).

Progress note (2026-04-17, OBS reuse-first visibility-gap fix + generic ready-handle thrash skip):
- New run evidence: OBS still showed `prelaunch-window-snapshot` with `preLaunchHandleCount: 0`, then entered confirmation path and never resolved; user also reported Notion still doing unnecessary move/thrash despite starting in correct target placement.
- Root cause: reuse-first prelaunch discovery in `src/main/main.js` used visible-window enumeration only, so already-running apps with hidden/non-visible main surfaces (common for OBS tray/minimized behavior) were excluded from prelaunch handle set and could not trigger reuse/bypass logic.
- Fixes:
  - Added `includeNonVisible` option in `getVisibleWindowInfos(...)` and wired prelaunch scans (`prelaunch-window-scan`, `existing-main-window-scan`) to include non-visible windows for reuse detection.
  - Added generic ready-handle fast-path in `runLaunch`: when detected handle is already on target monitor and within acceptable state tolerance, skip corrective move (`ready-handle-already-within-tolerance-skip-placement`) to reduce startup thrash for apps like Notion.
- Expected behavior after patch: OBS existing window can be discovered prelaunch and reused/foregrounded instead of relaunching into confirmation path; apps already in-place skip unnecessary movement.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, OBS reuse helper-window misselection fix):
- New run evidence after non-visible scan enablement: OBS reuse path selected `Qt683TrayIconMessageWindowClass` (`reuse-existing-window-detected` handle), causing a large tray/message surface (`QTrayMessageIconWindow`) to be moved while real OBS main window stayed in background.
- Root cause: reuse candidate filtering in `findStableExistingMainWindowHandle(...)` did not exclude known auxiliary/system helper classes once non-visible windows were included.
- Fix: added `isLikelyAuxiliaryWindowClass(...)` guard in `src/main/main.js` and excluded reuse candidates with auxiliary class signatures (`trayiconmessagewindow`, `screenchangeobserverwindow`, `notifyicon`, `tooltip`, `toast`) from warm-attach selection.
- Expected behavior: reuse-first should now select the real OBS main window handle (or fall back to spawn) instead of tray/helper windows; no uncloseable tray message surface should be targeted for placement.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, OBS minimized-main visibility gap follow-up):
- New run evidence still showed OBS `prelaunch-window-snapshot` containing only helper handles (`Qt683TrayIconMessageWindowClass`, `Qt683ScreenChangeObserverWindow`) with no reusable main candidate; launch then fell back to spawn and re-entered confirmation path.
- Root cause: non-visible enumeration in `getVisibleWindowInfos(...)` still dropped tiny/hidden window rects unconditionally (`width/height <= 80`) before candidate scoring; this can exclude minimized/tray-hidden real main handles needed by reuse-first.
- Fixes in `src/main/main.js`:
  - Applied small-window cutoff only for visible scans; non-visible scans now retain tiny/minimized handles.
  - Updated reuse candidate size gate to allow minimized handles through (`isMinimized` bypasses `280x140` minimum), preserving warm-attach behavior for minimized existing windows.
- Expected behavior: reuse detection can now see minimized OBS main handles (instead of only helper classes), enabling reuse/foreground path and avoiding duplicate-launch confirmation in more OBS states.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, maximized stabilization no-op guard for already-verified handles):
- User-observed intermittent regression: some runs left Notion visually normal but non-interactive (e.g., title-bar close affordance stuck highlighted), consistent with repeated maximize re-application against a handle already at target.
- Root cause in `stabilizePlacementForSlowLaunch(...)`: both normal and maximized branches still called `moveSpecificWindowHandleToBounds(...)` on a candidate even after that same poll had already validated `onTarget + close/meaningful` (unless it was the second stable poll), causing unnecessary corrective moves during convergence.
- Fix in `src/main/main.js`: added early `continue` in stabilization loops when a candidate is already verified for current poll (`onTarget && close` for normal, `onTarget && meaningful` for maximized), so no corrective move is issued while waiting for second stable confirmation.
- Expected behavior: reduced post-placement thrash and less risk of transient non-interactive Chromium/Electron window states caused by repeated restore/maximize cycles.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, Edge black-window reuse candidate hardening):
- New run evidence for Chrome/Anki/Edge profile: Edge reuse selected handle `8916068` with class `Chrome_WidgetWin_0` (`reuse-existing-window-detected`), then placed/maximized that non-primary surface, matching user-observed black window behavior.
- Root cause: Chromium reuse candidate selection and scoring did not explicitly exclude non-primary class `Chrome_WidgetWin_0` in warm-attach path.
- Fixes in `src/main/main.js`:
  - Added `CHROMIUM_NONPRIMARY_CLASSES = ['chrome_widgetwin_0']` with helper `isChromiumNonPrimaryWindowRow(...)`.
  - Hardened Chromium scoring with an explicit penalty for non-primary classes.
  - Added hard filter in reuse candidate collection to reject Chromium non-primary windows when app is Chromium-family.
- Expected behavior: Edge/Chrome reuse should target `Chrome_WidgetWin_1` main windows (or fall back), preventing black non-interactive surrogate windows from being selected.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, reuse-window foreground reliability enforcement):
- User-reported residual issue: reuse paths for already-running windows (notably OBS + Notion) were placement-verified but not consistently surfaced to foreground, indicating foreground promotion was opportunistic rather than enforced.
- Root cause in `runLaunch`: reused-window flow checked `alreadyForeground` for one fast-path but did not guarantee active foreground acquisition after placement/reuse completion.
- Fixes in `src/main/main.js`:
  - Added `bringWindowHandleToFront(...)` helper with Win32 foreground nudge sequence (`ShowWindowAsync`, `BringWindowToTop`, temporary TOPMOST flip, `SetForegroundWindow`) plus foreground verification and bounded retries.
  - Wired enforced foreground step immediately after `placement-final` when `launchStatusMode === 'reused_existing_window'`.
  - Added diagnostics events: `reuse-existing-foreground` with `foreground-applied` / `foreground-not-applied`.
- Expected behavior: reused windows are now deterministically brought forward after placement, reducing inconsistent "placed but still behind other windows" outcomes.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, duplicate-window slot reliability + generic late-window retry):
- New test-profile evidence:
  - Duplicate `Brave` launches (`processHintLc: brave`, count 2) reused the first newly-created window on the second slot, yielding a single window instead of two.
  - `Anki` intermittently failed primary placement with `no-window|` (`placement-not-applied`) after ready-gate timeout, indicating a late-appearing main window with no generic non-duplicate retry path.
- Root causes in `src/main/main.js`:
  - Reuse candidate pool for duplicates used per-launch prelaunch snapshots, allowing windows spawned earlier in the same run to become reuse candidates for subsequent duplicate slots.
  - Retry flow for `moveWindowToBounds` was duplicate-focused; non-duplicate apps could stop after the first failed placement attempt.
- Fixes:
  - Added `baselineReuseHandlesByProcessHint` to snapshot eligible reuse handles once per process hint at first encounter in a run, and used this baseline for duplicate-slot reuse eligibility (`reuseEligiblePreLaunchHandleCount` logged).
  - Added a generic late-window placement retry (`move-window-to-bounds-generic-retry`) after the primary placement attempt for any unresolved launch.
- Expected behavior:
  - Duplicate profile entries now reuse only pre-run windows and still spawn additional windows as needed for remaining slots.
  - Slow/non-deterministic window creation (e.g., Anki) gets an extra bounded placement chance before failing.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

Progress note (2026-04-17, Anki late-window handle fallback hardening):
- Follow-up run evidence: duplicate Brave slot behavior improved (second launch selected a distinct handle), but Anki still failed both PID/name placement attempts (`general-placement-attempt` and `generic-late-window-retry`) with `powershell-placement-not-applied` / `no-window|`.
- Root cause: fallback path still depended on PID/name discovery semantics; when those fail, no generic handle-based postlaunch scan existed for non-duplicate apps.
- Fix in `src/main/main.js`:
  - Added `postlaunch-candidate-scan` fallback for all unresolved launches after PID/name retries.
  - Scans current windows across active process hints, dedupes handles, ranks candidates, and attempts `moveSpecificWindowHandleToBounds(...)` on top candidates.
  - Preserves Chromium top-level preference when applicable.
- Expected behavior: when process/PID placement cannot locate a window in time (common for late-spawn Qt windows like Anki), handle-based fallback should still find and place the correct window.
- Verification commands run for this slice: `npm run test` (41/41 pass), `npm run typecheck` (baseline check passed: current 18, baseline 31, resolved 13), IDE lints on `src/main/main.js` (no errors).

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

### Progress note (2026-04-17, staged foreground escalation to reduce reused-window non-client lockups)

- Scope: `src/main/main.js` foreground reliability path for `reused_existing_window`.
- Change:
  - Updated `bringWindowHandleToFront` to use staged escalation:
    - attempt 1 uses restore/show/bring-to-top/foreground only
    - attempts 2+ add TOPMOST->NOTOPMOST nudge fallback
  - Preserves existing foreground reliability while reducing caption/control side effects observed on reused Notion windows.
- Why:
  - Latest OBS/Notion/Steam run showed Notion becoming unclickable with persistent highlighted red close control after reuse+placement.
  - Diagnostics showed clean placement/stabilization, so adjustment targeted foreground side effects rather than placement classifier paths.
- Verification:
  - `npm run test` (pass, 41/41)
  - `npm run typecheck` (pass, baseline check)
  - lints on `src/main/main.js` (no errors)

### Progress note (2026-04-17, reuse-within-tolerance skip hardening for background fullscreen windows)

- Scope: `src/main/main.js` reused-window ready-gate skip logic.
- Change:
  - For `reused_existing_window`, skip corrective placement whenever the ready handle is already on target + within tolerance, regardless of whether it is currently foreground.
  - Added distinct diagnostic reason/status for background but already-correct reused handles:
    - `reuse-existing-window-background-within-tolerance-skip-placement`
    - `reused-within-tolerance-background`
- Why:
  - Latest Notion regression reproduces specifically when Notion was already fullscreen on target before launch.
  - Prior logic only skipped when reused window was already foreground; background fullscreen windows were still force-moved, which can trigger the unclickable/non-client lockup.
- Verification:
  - `npm run test` (pass, 41/41)
  - `npm run typecheck` (pass, baseline check)
  - lints on `src/main/main.js` (no errors)

### Progress note (2026-04-17, no-touch reused-maximized path for fullscreen-stable windows)

- Scope: `src/main/main.js` reused-window foreground/stabilization behavior.
- Change:
  - Added `reusedAlreadyWithinTolerance` gate (for `foreground-within-tolerance` and `reused-within-tolerance-background` statuses).
  - For this gate on maximized reused windows:
    - foreground call now uses `gentleFocusOnly` mode (restore-if-minimized + `SetForegroundWindow`, no show/bring/topmost nudge path)
    - maximized stabilization loop is skipped (`skip-maximized-stabilization-reused-within-tolerance`)
- Why:
  - Failure persisted after placement skip hardening, indicating remaining side effects were likely from post-placement foreground/stabilization on already-correct fullscreen reused windows.
  - This path enforces a strict no-touch policy when state is already converged.
- Verification:
  - `npm run test` (pass, 41/41)
  - `npm run typecheck` (pass, baseline check)
  - lints on `src/main/main.js` (no errors)

### Progress note (2026-04-17, rollback of no-touch reused-maximized experiment)

- Scope: `src/main/main.js` reused foreground/stabilization flow.
- Change:
  - Reverted `gentleFocusOnly` foreground mode in `bringWindowHandleToFront`.
  - Reverted unconditional skip for maximized stabilization on reused-within-tolerance path.
  - Kept the earlier safer fix: reused background+within-tolerance still skips corrective placement move.
- Why:
  - User-observed regression: Notion could appear not launched while run still reported 3 apps launched.
  - Latest logs showed the experimental no-touch path was active on both OBS/Notion; rollback restores prior known launch behavior while preserving placement-thrash reduction.
- Verification:
  - `npm run test` (pass, 41/41)
  - `npm run typecheck` (pass, baseline check)
  - lints on `src/main/main.js` (no errors)

### Progress note (2026-04-17, targeted skip of maximized stabilization for reused windows already within tolerance)

- Scope: `src/main/main.js` post-foreground maximized stabilization gate.
- Change:
  - Added `reusedAlreadyWithinTolerance` marker from ready-gate statuses:
    - `foreground-within-tolerance`
    - `reused-within-tolerance-background`
  - Skip `placement-stabilization-maximized` only when `reusedAlreadyWithinTolerance` is true.
  - Keep standard foreground behavior (`bringWindowHandleToFront`) and keep all other stabilization paths unchanged.
- Why:
  - Current regression reproduces even when placement move is skipped and foreground succeeds.
  - Latest logs show the remaining mutator on this path is maximized stabilization; this patch removes that mutator only for already-converged reused windows.
- Verification:
  - `npm run test` (pass, 41/41)
  - `npm run typecheck` (pass, baseline check)
  - lints on `src/main/main.js` (no errors)

### Progress note (2026-04-17, web-guided staged Win32 foreground activation order)

- Scope: `src/main/main.js` `bringWindowHandleToFront`.
- External evidence reviewed:
  - Microsoft docs and Win32 guidance: `SetForegroundWindow` is the primary activation API with restrictions.
  - Win32 references indicate `BringWindowToTop`/Z-order APIs are adjunct and can add side effects when overused.
  - Electron Windows focus bugs report mismatches between programmatic focus and effective interactivity.
- Change:
  - Reworked foreground sequence into staged modes per attempt:
    1) `focus-only` (`SetForegroundWindow`)
    2) `show-then-focus` (`SW_SHOW` + `SetForegroundWindow`)
    3) `aggressive` (`SW_SHOW` + `BringWindowToTop` + TOPMOST flip + `SetForegroundWindow`)
  - Added successful mode telemetry on `reuse-existing-foreground` result.
- Why:
  - Reduce unnecessary Z-order manipulation on first attempt for reused windows, especially where windows are already in correct maximized placement.
  - Keep reliable fallback escalation when focus-only activation is insufficient.
- Verification:
  - `npm run test` (pass, 41/41)
  - `npm run typecheck` (pass, baseline check)
  - lints on `src/main/main.js` (no errors)
