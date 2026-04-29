# Launch Panel: Execution Engine Timeline UI

Date: 2026-04-28  
Owner: FlowSwitch  
Status: Draft (approved in chat, pending spec review gate)

## Goal

Rewrite the profile launch progress panel so it behaves like a **real-time execution engine** instead of a static status list.

The panel must communicate:

- **Order**: what’s running now, what’s next, what already happened
- **Progress**: step-based completion tied to real actions/substeps (not time-based animation)
- **System behavior**: “smart decisions” (reuse, snap, delays, etc.) surfaced inline
- **Outcome**: a post-run session summary with actionable follow-ups

Non-goals (for this iteration):

- Implementing true **pause** / **skip step** orchestration (UI should not expose controls that are not functional)
- Building a fully verbose diagnostics console; this is an end-user execution timeline

## Current Constraints (as-is)

Renderer currently receives `LaunchProgressSnapshot` with:

- Per-app `step`: `pending|launching|placing|verifying|awaiting-confirmation|done|failed|skipped`
- `outcomes`: a few tags (`Reused`, `New`, `Placed`, `Confirmation`)
- Coarse global counts: `launchedAppCount`, `requestedAppCount`, etc.
- No per-step timestamps, no structured “delay” actions, no structured “smart decision” feed

Therefore, an “execution engine” UI that is truthful requires a small contract upgrade from main.

## Proposed Approach (Recommended)

**Approach B: add a minimal structured action timeline to the launch status contract**, including:

- Ordered actions across apps, tabs, and system steps
- Substeps per action with states + timestamps
- Inline “smart decisions” strings
- Accurate step-based progress and credible ETA

The existing fields remain for backward compatibility during rollout.

## Action Ordering Guarantees (Presentation vs Execution)

The timeline is designed to prioritize **clarity** while still reflecting real execution.

- **Presentation order**: `actions[]` is **logically ordered** for UI presentation (the “story” of the run).
- **Execution reality**: the underlying engine *may* execute some work in parallel.
- **Concurrency rule**:
  - Exactly one action is designated as `activeActionId` at any moment for the **Current Step** focus.
  - If other actions are concurrently running, they may be represented as:
    - `state: "running"` inside Upcoming (with a small running indicator), or
    - a future enhancement that groups them under the current action.
- **Trade-off**: the timeline optimizes user comprehension over perfectly representing concurrency details.

## UX / Layout Spec

The panel reorganizes into **three sections** plus a global progress header:

1. **Global progress header** (top)
2. **Current step** (large, focused)
3. **Upcoming steps** (dimmed queue)
4. **Completed steps** (collapsed history list)

## Terminology (Consistency)

- **Action**: A top-level unit of work that meaningfully advances the launch (e.g. “Launch Slack”, “Position window”, “Open github.com”, “Wait 3s”).
- **Substep**: A smaller internal phase of an Action (e.g. “Launching”, “Positioning window”, “Verifying placement”, “Waiting for confirmation”).

UI strings may use “step” in user-facing copy, but the implementation and contracts should consistently use **Action** and **Substep**.

### Global Progress Header

Displays:

- **Progress bar** driven by *completedSteps / totalSteps*
- **Percentage**
- **Step count** label: e.g. “3 of 8 actions completed”
- **Estimated time remaining**:
  - Derived from observed step durations in the current run
  - Fallback to “Estimating…” until sufficient samples exist

Rules:

- Not time-based animation; the bar advances only when steps complete.
- Must degrade gracefully if `actions` timeline is missing (show “Connecting…” or “Preparing…”).

### Current Step (Focused)

Shows one active “engine card”:

- App icon (or globe for tabs/system) + title
- Primary verb (substep label), e.g. “Positioning window”
- Smart decision line (hierarchical; see Smart Decisions)
- Substeps list (expanded while running)
- Micro-interactions:
  - Slide-in when it becomes active
  - Subtle glow / pulse while running
  - Smooth state transitions

#### Current Step Dominance (Hard Rule)

To prevent regressions into a flat list, the current action must be visually dominant:

- The current action card is **pinned at the top** of the panel and **never scrolls out of view**.
- It is the **only expanded item by default**.
- It must be at least **1.5–2×** the height/weight of any queued or completed row (larger padding, stronger contrast, and larger typography).

### Upcoming Steps (Queue)

- Dim list of queued actions
- Gray indicator dot/line
- Next item can be slightly emphasized, but still subdued vs current

### Completed Steps (History)

Collapsed list rows showing:

- Green check icon
- Title
- Outcome pills (Reused/New/Placed/Confirmation/etc.)
- Execution time (e.g. “1.8s”)

Behavior:

- When an action completes, its expanded substeps collapse automatically.

## Scroll / Overflow Strategy (Hard Rules)

The panel must remain readable after ~10–15+ actions.

- **Pinned current**: The Current Step section is fixed/pinned and does not scroll.
- **Independent overflow**:
  - Upcoming list may scroll independently if it exceeds available space.
  - Completed list must not dominate: show only the most recent **N** completed actions by default (default **N = 5**).
- **View all**: Completed section includes “View all” / “Collapse” to expand the full completed history inside its own scroll container.
- **Single action optimization**:
  - If there is only one action total, omit the Upcoming section entirely.

## Visual State Model (Per Item)

Each action item supports **four visual states**:

1. **Queued**
   - Dim text
   - Gray indicator (dot/line)
   - No motion

2. **Running**
   - Highlighted container
   - Subtle animated pulse/progress shimmer
   - Active item glow

3. **In-progress substeps**
   - Visible only for the active/running item (and possibly expanded failures)
   - Examples: “Launching”, “Positioning window”, “Verifying placement”, “Restoring tabs”, “Waiting 3s delay”

4. **Completed**
   - Green check icon
   - Slight fade/settle animation
   - Shows duration

Accessibility:

- Respect `prefers-reduced-motion` (disable pulse/slide; keep transitions minimal).
- State is not communicated by color alone (icons + labels).
- Keyboard focus styles remain visible.

## Micro-interactions (Motion)

Required:

- **Slide-in** when an item starts (or becomes active)
- **Active glow** on the current item
- **Smooth transitions** between queued → running → completed

Constraints:

- No layout-shifting hover effects (avoid scale transforms that reflow).
- Duration targets: 150–300ms for standard transitions.

## Jitter Protection (UI Stability Rules)

Because the panel updates frequently, we must prevent “glitchy” reflow.

- **Current Step height stability**: the Current Step container height should remain stable during substep label changes.
  - Prefer reserved space for the substep label line and smart decision line.
  - Avoid expanding/collapsing content that shifts surrounding layout while running.
- **Text swap stability**: substep label changes should not shift sibling layout; prefer crossfade or fixed line-height.
- **Completed collapse containment**: completed items may collapse with animation, but must not cause abrupt reflow of the entire panel. Collapse should be localized to the Completed section.

## Smart Decisions (Visibility + Hierarchy)

Smart decisions are a key differentiator and must be noticeable.

- **First smart decision**: always visible inline on the current action card (not hidden behind an expand affordance).
- **Additional smart decisions**: expandable (“+2 more”) and/or visible on hover/focus via tooltip/popover.
- **Visual distinction**:
  - Prepend each smart decision with a small icon/prefix label (non-emoji) to increase scanability.
  - Example categories: reuse, placement, delay, safety.
  - These should not look like plain muted body text; use a subtle chip/label style or icon+text row.

Examples:

- “Reusing existing window”
- “Waiting 3s delay”
- “Snapping to left half”

## Errors, Warnings, and Edge Cases

### Warnings (e.g., reused apps)

Warnings are **non-fatal** and should feel like intelligent optimizations:

- Show amber pill (e.g. `Reused`)
- Inline smart decision copy: “Reusing existing window to avoid duplicates”

### Failures

Failure action state:

- Red icon and label
- Short inline error message
- Action button: **Retry launch**
  - In this iteration, retry triggers a full profile re-run (not per-step retry)

#### Failure Taxonomy (Required)

Not all failures are equal; the UI must distinguish failure types for actionable messaging.

Required failure types (Action-level `failureKind` or equivalent):

- **Launch failure**: app/tab did not open / executable failed
- **Placement failure**: window did not move/resize to target
- **Verification mismatch**: window moved but did not verify within tolerance

Each type must have:

- A specific short message
- A distinct label/icon (still within the same visual language)

### Awaiting confirmation

If a confirmation modal is blocking:

- Treat as a running substep “Waiting for confirmation”
- Surface a clear instruction line (e.g. “Complete the confirmation dialog to continue.”)

## Post-run Session Summary

After launch completes (success/warning/error), the panel transforms into a **Session summary**:

Summary fields:

- Total time (wall-clock)
- Apps: launched vs reused vs failed vs skipped
- Tabs opened (if tracked)
- System actions performed (from timeline “system” actions / decisions)

Actions:

- **Open All Apps**: re-run the profile launch
- **View Details**: expands a detailed timeline view inside the panel

### “View Details” Drill-down Behavior (Required)

“View Details” must:

- Expand the panel back into the full timeline view (Current/Upcoming/Completed layout).
- Preserve final states of all Actions and Substeps (no recomputation that changes ordering or labels).
- Allow inspection of:
  - Smart decisions (including expanded list)
  - Durations (Action and Substep if available)
  - Failures and warnings (including failureKind and errorMessage)

## Completion Transition (Critical UX Moment)

The moment of completion should feel intentional, not abrupt.

When the final action completes:

- Progress bar fills to 100%
- Wait **300–500ms**
- Crossfade/transform the panel into the Session Summary (no hard jump)

Optional polish:

- A subtle success check sweep / settle animation (must respect `prefers-reduced-motion`)

## Controls During Execution (This Iteration)

- **Cancel** only (fully functional)
- Pause / skip are **out of scope** and must not be presented as active controls

### Cancel Aftermath (Required)

Cancel behavior:

- Cancelling stops further actions immediately (best-effort, consistent with current “inactive run” handling).
- Panel transitions into a **Cancelled** summary state (not “Success”):
  - Shows completed vs remaining Actions
  - Clearly labeled as an incomplete run
  - “Open All Apps” remains available (re-run)

## Data / Contract Changes

### Renderer type changes

Extend `LaunchProgressSnapshot` with an optional structured timeline:

```ts
type LaunchActionState =
  | "queued"
  | "running"
  | "completed"
  | "warning"
  | "failed"
  | "skipped";

type LaunchActionSubstepState =
  | "queued"
  | "running"
  | "completed"
  | "failed";

type LaunchActionSubstep = {
  id: string;
  label: string;
  state: LaunchActionSubstepState;
  startedAtMs?: number | null;
  endedAtMs?: number | null;
};

type LaunchAction = {
  id: string;
  kind: "app" | "tab" | "system";
  title: string;
  state: LaunchActionState;

  iconDataUrl?: string | null;
  pills?: string[] | null;           // e.g. Reused/New/Placed/Confirmation
  smartDecisions?: string[] | null;  // e.g. “reusing existing window”, “snapping left half”
  errorMessage?: string | null;
  failureKind?: "launch" | "placement" | "verification" | null;

  startedAtMs?: number | null;
  endedAtMs?: number | null;

  substeps?: LaunchActionSubstep[] | null;
};

type LaunchProgressSnapshot = {
  // existing fields remain

  // new timeline fields (optional during rollout)
  activeActionId?: string | null;
  actionsTotal?: number | null;
  actionsCompleted?: number | null;
  actions?: LaunchAction[] | null;
};
```

### Action / Substep Identity Persistence (Critical)

To ensure smooth animations and prevent React remount flicker:

- `LaunchAction.id` must remain **stable for the full duration of a run**.
- `LaunchActionSubstep.id` must remain **stable for the full duration of the parent action**.
- IDs must not be regenerated on each snapshot publish.

### Main-process status generation

Main runner should publish:

- Ordered `actions` array for the current run, including:
  - Each app launch action
  - Each browser tab open action (or grouped “restore tabs” action with substeps)
  - Explicit delay actions when profile specifies `appLaunchDelays`
  - System actions (e.g. pre-launch close/minimize policies) where relevant
- `activeActionId` for the current running action
- `actionsTotal` and `actionsCompleted`

Timestamps:

- Use `Date.now()` at state transitions.
- Duration is derived in renderer (or in main) as `endedAtMs - startedAtMs` when both exist.

Backward compatibility:

- If `actions` is missing, UI falls back to the existing per-app row list (legacy view) or a simplified engine view.

## Progress / ETA Algorithm

Progress:

- `completed = actionsCompleted` if provided, else count `actions.state in {completed, warning, failed, skipped}`.
- `total = actionsTotal` if provided, else `actions.length`.
- Percent = `completed / max(1, total)`.

ETA (best-effort):

- For completed actions, compute durations.
- Estimate remaining time as:
  - average(duration of completed actions) × remainingActionCount
  - Improve by weighting recent actions higher (optional)
- If fewer than 2 completed actions or missing timestamps, show “Estimating…”.

### ETA Confidence Signaling (User-facing)

ETA display states:

- **Estimating…**: insufficient data (e.g. <2 completed actions or missing timestamps)
- **~12s remaining**: low confidence early estimate
- **~8s remaining**: higher confidence after multiple completed actions

Optional polish:

- Subtle visual indication when confidence increases (e.g. icon/opacity shift), without distracting motion.

## Perceived Performance (Honest Responsiveness)

Some actions/substeps can be long (slow app launch, confirmation waits). To keep the UI feeling alive without faking progress:

- Show an **indeterminate activity animation** within the *current action* while a substep is running.
- Do **not** advance the global progress bar until an action/substep actually completes.

This preserves honesty while avoiding a “stuck” feeling.

## Relationship to Monitor Layout (Integration Opportunity)

When an action completes (especially placement-related actions), briefly reinforce the outcome in the monitor layout:

- Briefly highlight the corresponding window/app tile on the monitor layout (pulse/outline).
- Optionally highlight the target monitor region.

This should be subtle, time-limited, and must not steal focus.

If cross-component wiring is too invasive, the initial implementation may log an integration TODO, but the intent is to implement this linkage as part of the execution-engine feel.

## Edge / Empty States (Required)

- **No actions**: Show a “Nothing to launch” state and transition to summary (no error).
- **Single action**: Omit Upcoming section.
- **Instant completion**: If the run completes quickly, show summary directly but still use the completion transition (no abrupt jump).

## Acceptance Criteria

- Panel is organized into **Current / Upcoming / Completed** sections.
- Each item supports **queued, running, substeps in-progress, completed** visual states.
- Apps expand to show substeps while executing, collapse on completion, show **execution time**.
- Global progress shows **step count + percent + step-based bar** (not time-based).
- Estimated time remaining is shown when possible and degrades gracefully.
- Post-run transforms into **Session summary** with **Open All Apps** and **View Details**.
- Warning and failure states are clear and actionable; retry exists.
- Cancel is available during execution and works end-to-end.
- Motion respects `prefers-reduced-motion`, focus states remain visible, no color-only state encoding.

