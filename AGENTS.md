# FlowSwitch Agent Instructions

Repository-level source of truth for workflow, quality, and change hygiene.

## Quick Commands

- Install deps: `npm install`
- Start app: `npm run dev`
- Lint: `npm run lint`
- Typecheck (baseline-aware): `npm run typecheck`
- Typecheck (full): `npm run typecheck:full`
- Tests: `npm run test`
- Production build: `npm run build`
- Package Windows (NSIS + portable): `npm run dist:win` (output in `release/`)
- Sync marketing `latest.json`: `npm run website:sync-latest` (optional env `FLOWSWITCH_GITHUB_REPO=owner/repo`)

## Latest Launch Diagnostics Log

- Path: `%APPDATA%/FlowSwitch/logs/launch-latest.jsonl`
- Lifecycle: overwrite at `launchProfileById` start, then append events for that run.
- Purpose: always keep one latest-run debug artifact.
- Optional override: `FLOWSWITCH_LAUNCH_LOG_FILE`.

## Coding Standards (Always)

- Prefer maintainable, well-structured solutions over quick fixes.
- Never hardcode environment-specific values, secrets, paths, URLs, ports, IDs, or other volatile config.
- Use config/constants with clear names and single sources of truth.
- Do not leave debug leftovers (`console.log`, commented-out code, unused imports).

## Required Git Behavior

- Keep commits atomic (one logical change each).
- Use commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`.
- Use `refactor:` on `chore/*` unless required to deliver a `feature/*` or `fix/*`.
- Run lint and typecheck before committing.
- Do not commit unless the user explicitly asks in that request.

## Agent Handoff (Human Review First)

When finishing work (commit or not), provide:

1. Plain-language change summary (3-6 bullets).
2. Manual test checklist for the changed behavior.

## Branch Strategy and Naming

- Branches: `main` stable, `dev` integration, `feature/*`, `fix/*`, `chore/*`, `hotfix/*`.
- Naming format: `prefix/slug`; slug is lowercase kebab-case (`a-z`, `0-9`, `-`).
- Branch intent must match work intent.

## Branch Relevance Gate (Mandatory)

Before edits/commits:

1. Identify intent (`fix`, `feature`, `chore`, `hotfix`).
2. Confirm branch scope matches intent.
3. If mismatch exists, move to a correct branch first.

Hard rules:

- Do not place docs/process/tooling-only changes on `fix/*` unless required for that fix.
- Do not mix unrelated concerns on one branch.
- If request scope is mixed, split work into separate branches.

## Safety Rules

- No destructive git commands unless explicitly requested.
- Never force-push `main`.
- Prefer safe sync (`git pull --ff-only`, `git rebase origin/dev` on feature/fix branches).
- Publish only clean, correctly scoped branch history.

## Default QA Protocol (After Code Changes)

Run this stack by default: `@code-reviewer`, `@reality-checker`, `@evidence-collector`, `@api-tester`, `@performance-benchmarker`, `@accessibility-auditor`, `@test-results-analyzer`. If unavailable, perform equivalent manual analysis and include evidence.
Minimum verification tiers:

1. Tier 1 (always): `npm run lint`, `npm run typecheck`
2. Tier 2 (shared types, IPC/contracts, launch/capture, persistence, preload, main process): `npm run typecheck:full`, `npm run test`, `npm run build`
3. Tier 3 (renderer/UI or high release risk): run manual QA checklist + accessibility/performance checks

## Required Final Report Format (Non-Trivial Changes)

1. Checks run (commands + pass/fail)
2. Findings ordered by severity (`Critical`, `Major`, `Minor`)
3. Residual risks and untested gaps
4. Manual QA checklist status (completed/skipped with reason)

## Manual QA Checklist Template

- Launch app (`npm run dev`) with no runtime errors
- Installed apps flow loads correctly with expected icons
- Layout capture flow populates monitors/apps (including minimized apps when present)
- Profile launch flow executes app + browser-tab actions
- Failure path fails gracefully (missing icon source, invalid app path, malformed profile)
- Adjacent regression check (profile settings, monitor layout editing, saved state)
- UI check when renderer changed (keyboard nav, focus visibility, responsive layout)

## Workflow Orchestration Tracking (Rewrite Work)

For `feature/workflow-orchestration-rewrite` and follow-ups, use:

- Design spec: `docs/superpowers/specs/workflow-orchestration-rewrite-plan.md`
- Execution checklist: `docs/superpowers/specs/workflow-orchestration-execution-checklist.md`
Required:

1. Map implementation tasks to design spec sections before coding.
2. Update checklist after meaningful steps (status, priority/deps, `done_when`, milestones, blockers).
3. Update spec + checklist together when behavior/contracts change.
4. Do not mark complete without checklist acceptance criteria updates.
5. Enforce controls: no task `in_progress` > 2 days without note/status; blocked for 2 iterations needs repro + redesign/limitation note.
6. Preserve guardrails: no stale `runId` renderer mutation; placement verification before placeable-window success.
7. Keep phase sequencing aligned with checklist priorities.

## Priority Order (When Rules Conflict)

1. Preserve behavior and rollback safety.
2. Keep commits atomic and clean.
3. Keep branch naming and commit conventions consistent.

