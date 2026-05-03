# Capture Layout Content Design (Auto-Detect)

Date: 2026-05-03  
Status: Approved for implementation planning  
Owner branch: `fix/content-launch-followups`

## Goal

When the user creates a profile via **Capture current layout**, include captured content context:

- Browser tabs
- Explorer folders/files
- App-linked associated content where detectable

The capture flow must remain reliable: content capture is additive and must not break monitor/app layout capture.

## Scope

### In scope

- Extend capture pipeline to enrich captured windows with content metadata.
- Auto-detect capture providers at runtime (no per-browser manual toggle required in v1).
- Add overload protections for tab-heavy sessions.
- Persist captured content into profile shape already used by launch pipeline:
  - app `associatedFiles`
  - profile `browserTabs` with `appInstanceId` linkage
- Add diagnostics/warnings for partial capture and truncation.

### Out of scope

- Guarantee complete tab capture in all browser states (private mode, restricted tabs, hardened profiles).
- New extension installs or mandatory browser startup flags in v1.
- Full settings UI for provider tuning (may be added later).

## Product Decisions

1. Provider mode is **auto-detect**.
2. Browser tab caps:
   - `maxTabsPerWindow = 100`
   - `maxTabsPerCapture = 500`
3. Hard failures in content providers never fail full capture; they degrade to base layout capture with warnings.
4. Enrichment timeout budget is a hard limit: `maxContentEnrichmentMs = 4000`.

## Existing System Touchpoints

- Main capture entrypoint: `src/main/ipc/trusted-renderer-ipc.js` (`capture-running-app-layout`).
- Window enumeration: `src/main/services/windows-process-service.js`.
- Memory capture -> profile conversion: `src/renderer/layout/utils/buildNewProfile.ts`.
- Launch consumption path already supports these concepts:
  - `associatedFiles` (app-level)
  - `browserTabs` + `appInstanceId`
  - content-aware launch gather/runner.

## Architecture

### High-level flow

1. Capture base window layout (current implementation).
2. Build list of candidate windows for content enrichment.
3. Enrich per window with provider chain:
   - Explorer provider (Shell COM)
   - Browser protocol provider (if reachable)
   - Browser UIA fallback provider
4. Apply dedupe + overload caps.
5. Return `MemoryCapture` with content enrichment metadata.
6. Build profile with linked content associations.

### Provider chain and precedence

For each candidate window:

1. **Explorer provider**
   - If process/window maps to Explorer shell view, capture folder/file path(s).
2. **Browser protocol provider**
   - Try browser-family adapter protocol connection for higher-fidelity all-tab capture.
3. **Browser UIA fallback**
   - Capture active tab URL/title or limited-tab best effort if protocol unavailable.
4. **None**
   - No content captured for window; emit warning.

Provider results carry:

- `source`: `shell` | `protocol` | `uia` | `none`
- `confidence`: `high` | `medium` | `low`
- `warnings`: string[]

### Window identity and stability

Content linking keys are scoped to one capture run only and must not be reused across runs.

- Per-run ID: `captureRunId` (uuid).
- Per-window key format: `${captureRunId}:${pid}:${hwnd}`.
- Matching lifetime: valid only until the capture run finishes or times out.
- Async provider tasks that outlive the run are ignored and cannot write results.

This avoids HWND reuse bugs causing cross-window or cross-run mis-association.

## Provider Adapters

### Chromium-family shared adapter

Target browsers:

- Chrome
- Edge
- Brave
- Opera
- Vivaldi

Responsibilities:

- Detect process/window family.
- Attempt protocol discovery/connection.
- Enumerate tabs for matched window when possible.
- Return normalized tab rows `{ url, title, browser }`.

### Firefox adapter

Separate implementation due to protocol differences from Chromium.

Responsibilities:

- Attempt Firefox-compatible tab enumeration path.
- Normalize rows into shared tab model.
- Fallback to UIA when protocol path unavailable.
- Emit explicit warning when falling back from protocol to UIA:
  - `provider_unavailable` and/or `uia_partial_capture`.

V1 success target for Firefox is correctness under fallback, not parity with Chromium protocol capture rates.

### UIA fallback adapter

Used for browser windows when protocol path is unavailable or fails.

Responsibilities:

- Retrieve active URL/title with robust guardrails and short timeout.
- Avoid focus-stealing workflows in v1.
- Return low/medium-confidence result with warning if partial.

## Data Model Changes

### MemoryCapture extension (renderer type + IPC payload)

Augment `MemoryCapture` with optional fields:

- `capturedContentByWindow`: dictionary keyed by window identity (handle + pid key) containing:
  - Key is `${captureRunId}:${pid}:${hwnd}` (run-scoped).
  - `tabs?: Array<{ url: string; title?: string; browser?: string }>`
  - `files?: Array<{ path: string; name?: string }>`
  - `folders?: Array<{ path: string; name?: string }>`
  - `source`
  - `confidence`
  - `truncated?: boolean`
  - `stats?: { captured: number; skipped: number; skippedReasons: Record<string, number> }`
- `captureWarnings?: string[]`
- `contentCaptureStats?: {
    windowsConsidered: number;
    windowsEnriched: number;
    tabsCaptured: number;
    tabsSkippedTotal: number;
    tabsSkippedByWindow: Record<string, number>;
    tabsSkippedGlobal: number;
  }`

### Profile mapping

In `buildMemoryFlowProfileFromCapture`:

- For each mapped app instance:
  - Convert captured `files[]` and `folders[]` into app `associatedFiles[]` entries:
    - folder -> `{ type: "folder", path, name }`
    - file -> `{ type: "file", path, name }`
  - Apply associated-content caps before write:
    - `maxAssociatedContentPerWindow = 100`
    - `maxAssociatedContentPerCapture = 500`
- Populate profile `browserTabs` with `appInstanceId` linkage for mapped tabs.
- Update `tabCount` / `fileCount` derived from captured content.
- If captured content exists for an unmapped window:
  - drop that content,
  - increment mapping skip stats,
  - emit `window_mapping_failed` warning.

## Overload Control and Dedupe

### Caps

- Per window tab cap: `100`
- Global capture tab cap: `500`

### Rules

1. Normalize + dedupe URL before cap accounting.
2. Apply per-window cap first.
3. Apply global cap second.
4. Record all truncation reasons in stats/warnings.
5. Preserve deterministic ordering:
   - provider native order first
   - stable sort fallback by window + discovery order if needed.

## Failure Handling

### Non-fatal provider failures

- Any provider error produces warning metadata, not thrown capture failure.
- Base monitor/app capture always returns unless base capture itself fails.

### Timeout budgets

- Global enrichment budget (hard): `maxContentEnrichmentMs = 4000`.
- Per-provider short timeouts to avoid UI stalls.
- If budget exceeded, stop enrichment and return partial data.

### Warning taxonomy (initial)

- `provider_unavailable`
- `provider_timeout`
- `window_mapping_failed`
- `tab_cap_per_window_reached`
- `tab_cap_global_reached`
- `uia_partial_capture`

## Observability

Add structured capture diagnostics (similar to launch diagnostics style):

- Provider attempt counts/success rates.
- Source chosen per browser window.
- Tab and content captured/skipped counts.
- Timeout and fallback events.

Expose summary to renderer for user-visible notices after capture.

## UI/UX Behavior

After capture-from-layout profile creation:

- Show success snackbar with summary counts.
- If truncation/fallback occurred, include brief warning:
  - Example: `Captured 500 tabs (143 skipped due to limits).`

No blocking modal in v1; warnings are informational.

## Security and Safety

- Reuse existing URL/path sanitization pipeline for persisted profile payload.
- Do not trust provider raw output; normalize and validate before write.
- Keep profile payload size guardrails enforced in save sanitizers.

## Implementation Plan (Phased)

### Phase 1: Data plumbing and caps

- Extend `MemoryCapture` contract and profile mapper.
- Add cap/dedupe utilities + stats/warnings.
- Wire renderer summary messaging.

### Phase 2: Explorer enrichment

- Implement robust Explorer content extraction via Shell COM mapping.
- Validate path filtering and association with captured app window.

### Phase 3: Browser auto-detect adapters

- Implement Chromium-family adapter skeleton + fallback behavior.
- Implement Firefox adapter skeleton + fallback behavior.
- Add UIA fallback adapter and provider orchestration.

### Phase 4: Hardening + diagnostics

- Add timeout budgets and warning taxonomy.
- Add tests and debug logging hooks.
- Complete browser validation matrix.

## Test Strategy

### Unit tests

- Cap behavior:
  - per-window cap at 100
  - global cap at 500
- Dedupe-before-count rules.
- Provider chain fallback order.
- Mapping enrichment -> profile `associatedFiles` / `browserTabs`.

### Integration-ish tests (mocked providers)

- Partial provider failures preserve base capture.
- Timeout path returns partial content and warnings.
- Correct warning/stat payload emission.

### Manual matrix

Browsers: Chrome, Edge, Brave, Opera, Vivaldi, Firefox.

Scenarios:

- Single window (small tab count)
- Multi-window (high tab count)
- Minimized windows
- Private/incognito windows
- No protocol availability (forces UIA fallback)
- Over-limit captures (>100 per window, >500 total)

Expected behavior for private/incognito:

- No guarantee of tab visibility.
- Base layout capture still succeeds.
- If content is unavailable, emit provider warning(s) and continue without hard failure.

## Acceptance Criteria

1. Captured profile includes content links when available:
   - `browserTabs` linked with `appInstanceId`
   - app `associatedFiles` derived from captured window content
2. Capture completes successfully even when all content providers fail.
3. Caps are enforced exactly (`100` per window, `500` global) with visible warnings.
4. Existing profile launch behavior remains compatible and stable.
5. Sanitizers continue to enforce safe, bounded persisted payloads.

## Risks and Mitigations

- **Browser internals drift** -> keep adapters isolated; fallback to UIA/none.
- **Capture latency spikes** -> strict timeout budgets + partial return.
- **Large payloads** -> cap + dedupe + save-time size guardrails.
- **Incorrect window-tab association** -> stable identity keys, confidence metadata, warnings for ambiguous mapping.

## Follow-ups (Post-v1)

- Optional settings UI for provider preference/tuning.
- Optional advanced protocol configuration per browser.
- Optional import of tab groups/workspaces where available.
