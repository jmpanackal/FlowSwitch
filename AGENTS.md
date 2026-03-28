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

## Safety Rules

- Do not use destructive git commands unless explicitly requested.
- Never force-push `main`.
- Prefer safe sync commands (`git pull --ff-only`, `git rebase origin/dev` on feature branches).

## Priority Order

When rules conflict, follow this order:

1. Preserve behavior and rollback safety.
2. Keep commits atomic and clean.
3. Keep branch naming and commit conventions consistent.
