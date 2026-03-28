# FlowSwitch Agent Instructions

This file is the repository-level source of truth for git workflow and change cleanliness.

## Required Git Behavior

- Keep each commit to one logical change.
- Use commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`.
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
- Before switching branches, push local commits on the current branch (`git push`) unless explicitly told not to.

## Branch Switch Checklist

Run these before changing branches:

```bash
git status --short
git push
git checkout <target-branch>
```

Exception:

- During branch-hygiene correction (splitting unrelated local commits), branch switching is allowed before push to avoid publishing mixed-scope history.

## Default QA Protocol (After Every Code Change)

Use this QA stack by default:

- `@code-reviewer` for correctness/security/maintainability review
- `@reality-checker` + `@evidence-collector` for evidence-based validation
- `@api-tester` for IPC/API contract and failure-path checks
- `@performance-benchmarker` for regression/perf checks
- `@accessibility-auditor` for renderer UI accessibility checks
- `@test-results-analyzer` to summarize pass/fail risk and readiness

Minimum required verification:

1. Run available automated checks (prefer this order):
   - `npm run lint` (if script exists)
   - `npm run typecheck` (baseline-aware, blocks new TS errors)
   - `npm run typecheck:full` (strict full TS audit before release or when touching shared types)
   - `npm run test` (if script exists)
   - `npm run build` (always run if available)
2. Perform a hardened QA analysis in the final report:
   - Findings first, ordered by severity (`🔴`, `🟡`, `💭`)
   - Include residual risks and untested gaps
   - Explicit go/no-go recommendation
3. Provide a short manual checklist for user validation of changed behavior.

## Manual QA Checklist Template (Always Include)

- [ ] Launch FlowSwitch (`npm run dev`) and confirm Electron + renderer start with no runtime errors
- [ ] Installed apps flow: open app picker/list and verify entries load, including icon rendering where expected
- [ ] Layout capture flow: trigger "capture running app layout" and verify monitors/apps are populated (and minimized apps when present)
- [ ] Profile launch flow: launch a profile and verify app actions/browser-tab actions execute as expected
- [ ] Failure-path check: verify at least one error path (missing icon source, invalid app path, or malformed profile data) fails gracefully without app crash
- [ ] Regression check: verify unaffected adjacent flows (profile settings, monitor layout editing, saved state interactions) still behave correctly
- [ ] UI check (when renderer changed): keyboard navigation, focus visibility, and responsive layout at desktop and narrow width

## Priority Order

When rules conflict, follow this order:

1. Preserve behavior and rollback safety.
2. Keep commits atomic and clean.
3. Keep branch naming and commit conventions consistent.
