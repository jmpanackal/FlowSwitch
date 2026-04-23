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
- Sync marketing `latest.json`: `npm run website:sync-latest` (optional env `FLOWSWITCH_GITHUB_REPO=owner/repo`; defaults to `jmpanackal/FlowSwitch`)
- Stage Windows `.exe` files into `website/downloads/` (optional static hosting): `npm run website:stage-downloads` (run after `dist:win`; pair with `FLOWSWITCH_DOWNLOAD_BASE_URL=./downloads/` when syncing—see `website/README.md`)

## Marketing site and versioned releases

Use this when shipping a **new app version** users download from the marketing site (`website/`) and **GitHub Releases** (CI-built installers).

### Source of truth

- Root **`package.json` → `version`** drives Electron-builder artifact names and `website/latest.json` (`releaseTag` = `v` + version, `files` = `FlowSwitch-<version>-win-x64-installer.exe` and `…-portable.exe`).
- **`npm run website:sync-latest`** regenerates **`website/latest.json`** from `package.json` (and optional `FLOWSWITCH_GITHUB_REPO` / `FLOWSWITCH_DOWNLOAD_BASE_URL`).

### Marketing HTML and `latest.json` stay in sync

- **`website/index.html`** embeds **versioned** GitHub download `href`s and copy (e.g. `v0.1.0`, `FlowSwitch-0.1.0-…`) as a **fallback** when `latest.json` is slow or fails to load. This is an intentional exception to the usual “no volatile URLs in code” rule for that static page only—**keep those literals aligned** with each release. After bumping **`package.json` `version`**, run **`website:sync-latest`**, then **search/replace** those literals in **`index.html`** (and the **`#download-error`** release link text) to the new version. **`website/changelog.html`** should gain a section for the new version when you publish it.
- Broader deploy/hosting notes: **`website/README.md`**.

### Release sequence (recommended order)

1. Bump **`package.json` `version`** (semver).
2. Run **`npm run website:sync-latest`** from repo root.
3. Update **`website/index.html`** (and changelog copy) for the new version strings / URLs as above.
4. **Lint + typecheck**, then **PR / merge to `main`** (so the default branch matches what you will tag).
5. **Tag** = **`v` + same version** as `package.json` (example: version `0.2.0` → tag `v0.2.0`):

   ```bash
   git pull --ff-only origin main
   git tag -a v0.2.0 -m "FlowSwitch 0.2.0"
   git push origin v0.2.0
   ```

6. **GitHub Actions**: workflow **`.github/workflows/release.yml`** runs on tag push (`v*`), verifies the tag matches `package.json`, runs lint/typecheck/tests, **`npm run dist:win`**, and uploads the two `.exe` assets to that release. Wait until it succeeds.
7. **Verify** on GitHub **Releases** that asset **filenames** match **`website/latest.json` → `files`**, then smoke-test downloads on the live marketing site.

**Do not** push the release tag until **`main`** (or whichever branch the workflow builds) already contains the bumped `package.json` and updated `website/` files—otherwise the workflow validates or packages the wrong version.

### Website-only changes

- If only copy, layout, or assets under **`website/`** change (no **`package.json`** version bump), merge to **`main`**; the static host (e.g. Vercel) redeploys. No new GitHub tag unless you are also shipping a new binary.

### Optional local packaging check

- **`npm run dist:win`** before tagging to confirm **`release/`** output locally. Not a substitute for CI; the official artifacts are the workflow uploads.

### Same version, replace binaries (avoid)

- Prefer a **new patch version + new tag**. Reusing a tag for different binaries is confusing; GitHub release assets are normally treated as immutable per tag.

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

