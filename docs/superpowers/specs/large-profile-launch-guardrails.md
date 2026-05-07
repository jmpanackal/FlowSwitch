# Large profile launch guardrails and pre-launch validation

Date: 2026-05-05  
Owner: FlowSwitch  
Branch: `feature/large-profile-launch-guardrails` (implementation)  
Status: Approved plan — **not committed** until merged with implementation PRs as needed

## Purpose

This spec consolidates:

- P0 backlog item **“Safe launch guardrails for large profiles”** (`docs/superpowers/unified-backlog.md`)
- Pre-launch validation, monitor geometry checks, and related guardrails validated in product discussion
- Locked sequencing and API decisions so implementation does not drift

Canonical backlog remains `docs/superpowers/unified-backlog.md`; update that file when this work ships.

## Goals

1. **Launch weight** — Single canonical definition of “how big is this run?” (deduped app launches, browser tabs, content units, etc.) with **constants in one module** both processes consume (see **Renderer access to weight constants** below). No hand-duplicated numeric literals in the renderer.
2. **Hard ceiling** — Main process rejects launches that exceed a **hard max** before heavy orchestration work. Response must be **structured** so the renderer shows specific copy (not a generic failure).
3. **Soft threshold** — Renderer confirms when weight is high but under the hard cap: counts, heuristic duration / risk copy, and optional summary of pre-launch policies (what will move, minimize, or close).
4. **Pre-launch validation (single pass)** — Path existence (aggregate report), URL/tab alignment with existing allow-lists, schema normalization, **import** strict validation, and icon path rules share **one validation layer** to avoid multiple edits to the same sanitization surface.
5. **Monitor geometry** — Missing display detection and resolution/DPI mismatch warnings; **best-effort launch** recomputes launch weight using **the same function** with `connectedMonitors` / excluded monitor ids (not a second ad-hoc counter).
6. **Per-app stall / timeout** — Align with workflow orchestration run-budget direction; mark items timed out and continue without wedging confirmation or placement-verify flows.

## Non-goals (explicit deferrals)

- **Per-launch modal** for “reuse existing window vs spawn new” beyond existing `preLaunchInProfileBehavior` / profile settings (high edge-case cost; revisit later).
- **Pre-spawn elevation detection** as a guarantee (Windows signals are messy); prefer clear **post-failure** copy when spawn fails with elevation-related errors.
- **Per-window “unsaved work”** detection (not reliable cross-process); only **coarse** warnings (counts / names of apps affected by pre-launch minimize/close/reuse).
- **Profile overwrite confirmation** when capturing from running — valid work, **orthogonal**; track as a separate small feature.
- Dedicated `**preview-launch-scope` IPC** in v1 (optional later for pre-click parity without starting a run).

## Locked decisions

### Structured errors without preview IPC (v1)

- **Phase 1 does not** add `preview-launch-scope`.
- When main rejects early (e.g. over hard cap), `**launch-profile` IPC** returns a structured payload, for example:
  - `ok: false`
  - `code`: stable machine string (e.g. `LAUNCH_TOO_LARGE`)
  - `message`: user-facing summary
  - `details` (optional): `{ breakdown, limits }` for rich renderer copy
- Soft threshold UI may use a **renderer-side estimate** using the **same formula and constants** as main; acceptable minor drift until preview IPC exists (formula drift only—**not** threshold literal drift).

### Renderer access to weight constants (no duplication)

- **Rule:** Thresholds and weight multipliers used for soft/hard guardrails must exist in **exactly one place** in source (single module or single exported object).
- **Rule:** The renderer must **import** that module (or a barrel that re-exports it) into the Vite bundle—**never** copy-paste the same numbers into renderer-only files.
- **Implementation note:** Today `src/main/utils/limits.js` is CommonJS and may not be directly importable from the renderer build. Prefer adding `**src/shared/launch-weight-limits.ts`** (or `.js` if both sides stay JS) that **main** `require()`s or imports and the **renderer** imports; alternatively extend `limits.js` and add a thin TypeScript **re-export** under `src/` that Vite resolves—whichever matches repo conventions after a quick build check. Document the chosen path in this spec’s revision history when implementation lands.

### One validation vertical slice

- Path + URL + schema + import + icon rules ship as **one** change set on a **single shared validation entry point** (e.g. `validateProfileForLaunch(profile, context)` — name illustrative).
- Avoid splitting into “path phase” then “import phase” if that means two passes over `profile-launch-fields.js` and related rules.

### Launch weight API shape

- `computeLaunchWeight(profile, options)` (or equivalent) accepts `**options`** from day one, including at minimum:
  - `connectedMonitors` (or equivalent snapshot) for geometry-aware counting
  - optional `**excludedMonitorIds**` or `**launchMode: 'full' | 'best_effort'**` so monitor dialog paths can recompute weight after the user chooses best-effort placement.

### Phased delivery order


| Phase     | Deliverable                                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**     | `computeLaunchWeight(profile, options)` + constants; main **hard cap**; structured `ok: false` + `code` + `details` on existing launch IPC; renderer maps codes to strings. **No preview IPC.**            |
| **2**     | Soft warning modal + heuristic duration + pre-launch policy summary (coarse); renderer uses same constants as main.                                                                                        |
| **3**     | **Single validation slice:** aggregate missing-path report (continue policy per **Phase 3: missing-path continue policy**), URL/tab rules, normalize/schema, import gate, icon path sandboxing.            |
| **4**     | Monitor presence + DPI/resolution mismatch UX; best-effort path calls `computeLaunchWeight` with reduced / remapped geometry before confirm.                                                               |
| **5**     | Per-app stall timeout / hang (orchestration-aligned; respect confirmation and placement-verify).                                                                                                           |
| **Later** | Preview IPC; duplicate-instance override modal; safeStorage fallback notice; overwrite confirmation; hotkey conflict save-blocking polish (conflicts already partially surfaced in `ProfileSettings.tsx`). |


## UX principles (validated)

- **Aggregate report before blocking** for missing paths — show the **full list** of missing or invalid targets; **continue vs block** follows the explicit **Phase 3: missing-path continue policy** (below)—do not rely on an implicit “≥1 launchable” rule without recording the chosen product rule here.
- **Never** ship a warning-only modal before **main-enforced** logic exists for the hard cap (foundation first).

### Phase 3: Missing-path continue policy (product decision — set before ship)

The spec originally allowed **continue if at least one launchable target** and **block if zero**. That is unambiguous but can yield a **mostly broken workspace** (e.g. eight apps configured, seven paths missing, one valid—launch proceeds).

**Pick one policy (or a hybrid) before Phase 3 merges** and replace this subsection with the chosen rule + constants:


| Option                   | Behavior                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Minimum count**    | Continue only if **≥ N** launchable app targets (and analogous rule for tabs/content if applicable).                                           |
| **B — Minimum fraction** | Continue only if **≥ P%** of configured launch targets have valid paths (e.g. 50%).                                                            |
| **C — Missing cap**      | Block (or extra-strong confirm) if **more than M** targets are missing, even if ≥1 remains.                                                    |
| **D — strict minimum**   | Keep **≥1** launchable but pair with a **second modal** when missing count exceeds a threshold (“Most targets are missing; continue anyway?”). |


Default recommendation if no product owner weighs in: **D** or **B** at a sensible fraction—document final choice and any copy strings in this section.

## Related code (implementation hints)

- Launch entry: `src/main/services/profile-launch-runner.js` (`launchProfileById`), gather/dedupe near `appLaunches`.
- IPC: `src/main/ipc/trusted-renderer-ipc.js` (`launch-profile`).
- Renderer launch: `src/renderer/layout/hooks/useProfileLaunch.ts`.
- URL / shortcut sanitization: `src/main/utils/profile-launch-fields.js`, `src/main/utils/limits.js`.
- Profile shape: `src/types/flow-profile.ts`.
- Hotkey conflict validation (existing): `src/renderer/layout/components/ProfileSettings.tsx` (`validateSettings`).

## Testing and QA

- Boundaries: just under soft threshold; between soft and hard; over hard max.
- Entry points: **shell Launch**, **hotkey**, and **schedule-triggered launch** — all must hit the **same** main validation and hard-cap paths (schedules are a shipped capability; do not treat schedule as optional).
- Missing paths: mixed valid/invalid; all invalid; edge case aligned with **Phase 3: missing-path continue policy** (e.g. “only one of many valid”).
- Import: malformed JSON, traversal attempts, oversized payload, bad URLs.
- Monitor: undocked layout; best-effort re-weight matches expectations.
- Timeout phase: does not break confirmation or placement-verify semantics.
- **Soft-threshold modal (manual):** user **Cancel** — no IPC launch, UI returns to idle; user **Continue** — launch proceeds; optional **re-open modal** if profile state regressed (see below).
- **Soft-threshold modal while system state changes (manual):** e.g. user opens modal, then disconnects a monitor or an app path becomes invalid before **Continue**—document expected behavior (re-validate on Continue; block with updated message; or dismiss modal—pick one and test it).

## Backlog and doc sync

When implementation status changes:

1. Update `docs/superpowers/unified-backlog.md` (P0 “Safe launch guardrails” and any touched validation bullets).
2. Update `docs/superpowers/feature-braindump.md` **Now (P0)** section if scope or status changes.

## Revision history


| Date       | Change                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-05 | Phase 3 slice: `computeLaunchWeight` / `profile-launch-weight` expose `skippedLaunchTargets` (gather `skippedApps`); large-profile soft modal surfaces non-launchable tiles; `LAUNCH_TOO_LARGE` details include the same summary. |
| 2026-05-05 | Initial spec from consolidated plan + review tightenings (structured errors, merged validation phase, weight API with monitor options, phased order).                                                                             |
| 2026-05-05 | Review pass: shared constants rule for renderer (no literal duplication); Phase 3 missing-path policy as explicit product decision table; schedule launches first-class in QA; soft-modal manual scenarios.                       |


