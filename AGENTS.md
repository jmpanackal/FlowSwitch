# FlowSwitch Agent Instructions

This file is the repository-level source of truth for git workflow and change cleanliness.

## Quick Commands

- Install deps: `npm install`
- Start app (Electron + renderer): `npm run dev`
- Lint: `npm run lint`
- Typecheck (baseline-aware): `npm run typecheck`
- Typecheck (full): `npm run typecheck:full`
- Tests: `npm run test`
- Production build: `npm run build`

## Latest Launch Diagnostics Log

- Path: `%APPDATA%/FlowSwitch/logs/launch-latest.jsonl`
- Behavior: overwritten at the start of every `launchProfileById` run, then appended with that run's launch diagnostics events.
- Purpose: always provides a single latest-run artifact for debugging when terminal scrollback is incomplete.
- Optional override: set `FLOWSWITCH_LAUNCH_LOG_FILE` to a custom path if needed.

## Required Git Behavior

- Keep each commit to one logical change.
- Use commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`.
- `refactor:` commits are allowed; place them on `chore/*` unless they are required to deliver a specific `feature/*` or `fix/*`.
- Do not commit debug leftovers (`console.log`, commented-out code, unused imports).
- Run lint and typecheck before committing.

## Branch Strategy

- `main` = stable
- `dev` = integration
- `feature/*` = new features
- `fix/*` = bug fixes
- `chore/*` = tooling/maintenance
- `hotfix/*` = urgent short-lived fixes

## Branch Naming

- Format: `prefix/slug`
- Allowed prefixes: `feature`, `fix`, `chore`, `hotfix`
- Slug must be lowercase kebab-case (`a-z`, `0-9`, `-` only)
- Branch intent must match change intent (`fix/*` for bug fixes, `feature/*` for features)

## Branch Relevance Gate (Mandatory)

Before making edits or creating commits, enforce branch-scope alignment:

1. Identify the change intent (`fix`, `feature`, `chore`, `hotfix`).
2. Compare intent against current branch name and purpose.
3. If scope does not match, stop and move work to the correct branch before editing/committing.

Hard rules:

- Do not place docs/process/tooling-only changes on a `fix/*` branch unless they are required to deliver that fix.
- Do not mix unrelated concerns in the same branch (for example, runtime bugfix + QA policy docs).
- If a request contains multiple unrelated concerns, split into separate branches before first commit.
- If a mismatch is discovered after local commits, split history into scoped branches before pushing.

## Safety Rules

- Do not use destructive git commands unless explicitly requested.
- Never force-push `main`.
- Prefer safe sync commands (`git pull --ff-only`, `git rebase origin/dev` on feature branches).
- Before switching branches, push committed and in-scope local work when the branch is clean and ready to publish.
- If the branch has uncommitted WIP or mis-scoped work, switch safely first, then split/scope history before pushing.

## Branch Switch Checklist

Default (clean branch, scoped commits):

```bash
git status --short
git push
git switch <target-branch>
```

Hygiene correction (wrong branch, mixed scope, or WIP):

- Branch switching before push is allowed to avoid publishing mixed-scope history.
- After re-scoping, push only the correctly scoped branch.

## Default QA Protocol (After Every Code Change)

Use this QA stack by default:

- `@code-reviewer` for correctness/security/maintainability review
- `@reality-checker` + `@evidence-collector` for evidence-based validation
- `@api-tester` for IPC/API contract and failure-path checks
- `@performance-benchmarker` for regression/perf checks
- `@accessibility-auditor` for renderer UI accessibility checks
- `@test-results-analyzer` to summarize pass/fail risk and readiness
- If any named specialist is unavailable, perform the equivalent manual analysis and provide explicit evidence in the report.

Minimum required verification (tiered):

1. Tier 1 (always run for code changes):
   - `npm run lint` (if script exists)
   - `npm run typecheck` (baseline-aware, blocks new TS errors)
2. Tier 2 (run when touching shared types, IPC contracts, launch/capture logic, persistence, preload, or main-process behavior):
   - `npm run typecheck:full` (strict full TS audit)
   - `npm run test` (if script exists)
   - `npm run build` (always run if available)
3. Tier 3 (run when renderer/UI behavior changes or when release-risk is high):
   - Execute the Manual QA Checklist below
   - Run accessibility and performance checks (specialist agents or equivalent manual review)
4. Perform a hardened QA analysis in the final report:
   - Findings first, ordered by severity (`Critical`, `Major`, `Minor`; optional icons allowed)
   - Include residual risks and untested gaps
   - Explicit go/no-go recommendation
5. Provide a short manual checklist for user validation of changed behavior.

## Required Final Report Format

For every non-trivial code change, include:

1. Checks run (commands + pass/fail)
2. Findings (ordered by severity)
3. Residual risks and untested gaps
4. Go/No-go recommendation
5. Manual QA checklist status (completed/skipped with reason)

## Manual QA Checklist Template (Always Include)

- [ ] Launch FlowSwitch (`npm run dev`) and confirm Electron + renderer start with no runtime errors
- [ ] Installed apps flow: open app picker/list and verify entries load, including icon rendering where expected
- [ ] Layout capture flow: trigger "capture running app layout" and verify monitors/apps are populated (and minimized apps when present)
- [ ] Profile launch flow: launch a profile and verify app actions/browser-tab actions execute as expected
- [ ] Failure-path check: verify at least one error path (missing icon source, invalid app path, or malformed profile data) fails gracefully without app crash
- [ ] Regression check: verify unaffected adjacent flows (profile settings, monitor layout editing, saved state interactions) still behave correctly
- [ ] UI check (when renderer changed): keyboard navigation, focus visibility, and responsive layout at desktop and narrow width

## Workflow Orchestration Tracking (Required for Rewrite Work)

When working on workflow orchestration/reliability on `feature/workflow-orchestration-rewrite` (or follow-up branches), use these docs as the implementation source of truth:

- Design spec: `docs/superpowers/specs/workflow-orchestration-rewrite-plan.md`
- Execution tracker: `docs/superpowers/specs/workflow-orchestration-execution-checklist.md`

Required behavior for agents:

1. Before implementing, verify the target task maps to an existing section in the design spec.
2. Update the execution checklist after each meaningful implementation step:
   - task status (`not_started` / `in_progress` / `blocked` / `done`)
   - task priority (`P0` / `P1` / `P2`) and dependencies when changed
   - task-level `done_when` criteria when scope changes
   - milestone status when applicable
   - blockers snapshot when new blockers appear
3. If implementation changes behavior/contract, update the design spec and checklist in the same change set.
4. Do not mark orchestration work complete unless corresponding checklist items and acceptance criteria are updated.
5. Respect checklist execution controls:
   - no task may stay `in_progress` > 2 days without a progress note or status change to `blocked`
   - if blocked for 2 iterations, create minimal repro and either redesign or document known limitation
6. Preserve regression guardrails for orchestration work:
   - never report `complete` while unresolved confirmations exist
   - never allow stale `runId` updates to mutate active renderer state
   - ensure placement verification runs before success on placeable windows
7. Keep phase sequencing aligned with the execution checklist:
   - prioritize Phase 2 `runId`/stale-state isolation before broader reliability refactors
   - keep tracker migration/cutover work gated by parity and leakage validation

Implementation references:

- Primary execution tracker: `docs/superpowers/specs/workflow-orchestration-execution-checklist.md`
- Milestones include `M0` (real-world validation baseline) through `M5` (power features)
- Use the checklist workstreams (`A`..`G`) for progress reporting and audit readiness

## Priority Order

When rules conflict, follow this order:

1. Preserve behavior and rollback safety.
2. Keep commits atomic and clean.
3. Keep branch naming and commit conventions consistent.
