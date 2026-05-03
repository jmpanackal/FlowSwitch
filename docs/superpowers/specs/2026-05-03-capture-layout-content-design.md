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
- **Reliable detection** of whether a browser will **restore the previous session on next launch** (see [Session restore vs captured tabs](#session-restore-vs-captured-browser-tabs-duplicate-risk)); v1 does not require reading per-browser prefs/registry.
- **Safari / macOS** session behavior (this spec targets Windows capture and launch).
- **Chromium-parity tab capture inside arbitrary desktop apps** (Discord, VS Code, Teams, etc.) that host **embedded webviews** but are not a matched top-level browser process: browser-family **protocol adapters do not apply**; only **UIA (or none)** may surface a URL, often incomplete—treat as best-effort / often empty.

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
   - **Windows 11 multi-tab File Explorer:** a single Explorer window can host **multiple folder tabs**. v1 **does not** require capturing every tab’s path unless Phase 2 explicitly implements multi-tab enumeration via Shell COM (or equivalent). Until then, document behavior as **best-effort active / primary location** (or clearest single path the provider returns) and emit a warning if multi-tab state is detected but not fully exported (taxonomy TBD in implementation).
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

## Session restore vs captured browser tabs (duplicate risk)

### Problem

Many browsers can **reopen tabs from the last session** on startup (wording varies: “Continue where you left off”, “Open tabs from last session”, “Restore previous session”, etc.). If the profile also stores **`browserTabs`** and the launch pipeline opens those URLs again, the user can see **duplicate tabs** or a bloated session: once from the browser’s own restore, once from FlowSwitch.

### Which browsers “do this”

**There is no stable OS-wide default** across Chrome, Edge, Brave, Opera, Vivaldi, and Firefox: behavior is **user-controlled** (settings), can differ by channel (stable vs beta), and may be overridden by enterprise policy. The capture pipeline must **not** assume a fixed default per vendor.

### Can we detect it in v1

**Not reliably from outside the browser** without one of:

- Reading browser **profile prefs / Local State** (paths and keys differ per browser and version),
- **Protocol** access that exposes startup behavior (uncommon / not guaranteed),
- A **helper extension** with permission to read settings or tabs,
- Asking the user.

Therefore **v1 auto-detect does not include guaranteed session-restore detection**. Any “skip tabs because restore is on” behavior is **best-effort at most** until a follow-up implements prefs-based or extension-based detection.

### v1 policy (avoid silent duplicates without false certainty)

1. **Always document the risk** in capture UX when **`browserTabs`** were persisted: short copy that session restore can duplicate FlowSwitch-opened tabs unless the user aligns browser settings or trims profile tabs.
2. **Optional metadata on capture** (when evidence exists, else `unknown`): persisted hints keyed by window then folded to `appInstanceId` on profile save — see [Data Model Changes](#data-model-changes) (`browserSessionRestoreHintsByWindow`, `browserSessionRestoreHints`). Values: `'unknown' | 'likely_on' | 'likely_off'`. Populate only from **explicit, low-risk signals** implemented in a later sub-phase (e.g. prefs read where agreed); never guess from window title alone.
3. **Launch-side coordination (required before relying on captured tabs)** — detailed in [Launch-side dedupe](#launch-side-dedupe-observability-race-v1-behavior) below (observability dependency, restore race, bounded snapshots, residual risk).

### Launch-side dedupe (observability, race, v1 behavior)

**Dependency:** URL dedupe at launch requires the same class of **observability** as rich tab capture: a **tab list** for the target browser instance (typically **protocol** when attached; **UIA** only where it can enumerate or infer multiple tabs). If the launch path cannot list open tabs, **dedupe is skipped** (no extra blocking); rely on user-visible warnings from capture/launch.

**Race (load-bearing):** After the browser starts, **session restore is asynchronous**. The first successful tab enumeration may run **before** restored tabs exist, so naïve “open if not seen” logic can still create **duplicates** once restore finishes.

**v1 normative behavior (best-effort, bounded time):**

1. If tab listing is **unavailable**, do not delay launch for dedupe; open profile-sourced tabs per existing launch behavior.
2. If tab listing is **available**, before opening URLs sourced from `browserTabs`:
   - Take **up to 3** successful tab-list snapshots within a **single wall-clock budget of ≤ 2000ms** after the launch pipeline considers the browser window/process ready for attach (spacing between snapshots is implementation-defined but must stay within the budget).
   - Build the set **AlreadyOpen** = **union** of normalized URLs from all snapshots in that window (union reduces false “missing” when tabs appear on snapshot 2 or 3).
   - For each profile URL to open (normalized with the **same normalizer** as capture-time dedupe), **skip opening** if it ∈ **AlreadyOpen**.
3. **No unbounded wait** or polling beyond the budget; if restore completes **after** the budget, duplicates remain possible — **residual risk**, surfaced via the same warning family as session-restore messaging.
4. If dedupe cannot run (no list capability), emit or retain a **launch summary warning** when `browserTabs` are non-empty (aligned with capture UX).

**Heavy sessions / slow hardware:** large tab counts (e.g. **50+**) on **slow disks or under load** often take **longer than 2000ms** to finish session restore. In those environments the bounded snapshot window may **routinely finish before restore completes**, so **AlreadyOpen** stays incomplete and **dedupe fails more often**—not a logic bug, but a **known v1 limitation**. Mitigations are follow-ups: **tunable budget**, **hint-driven longer wait** when `likely_on` is trustworthy, or **user setting** (“wait longer before opening profile tabs”).

**Follow-up (non-v1):** tighter coupling to `browserSessionRestoreHints` (e.g. extend budget when `likely_on`) only after hint population is trustworthy.

### Policy options (for later if detection improves)

| Option | Pros | Cons |
|--------|------|------|
| Skip persisting `browserTabs` when restore is likely | Safest against duplicates | Loses captured tab intent |
| Persist tabs but skip launch-open when restore likely | Preserves record | Still need detection |
| Suppress browser restore on launch (flags/prefs) | Single source of tabs | Fragile, browser-specific, may surprise users |
| User prompt / setting | Clear control | Extra UX |

**Recommendation for product evolution:** prefs-based or extension-assisted **detection + user-visible default** (“Open captured tabs on launch: Yes / No / Auto”) once Phase 3 stabilizes.

### Phase gate

Resolve **duplicate-tab strategy** (at minimum: **UX warning + normative launch dedupe behavior** per [Launch-side dedupe](#launch-side-dedupe-observability-race-v1-behavior)) **before or as part of Phase 3** (browser adapters), so adapter output and launch consumption stay aligned.

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

**Key convention:** `windowKey` means the run-scoped string `${captureRunId}:${pid}:${hwnd}` (same as keys of `capturedContentByWindow`).

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
- `browserSessionRestoreHintsByWindow?: Record<windowKey, 'unknown' | 'likely_on' | 'likely_off'>`  
  - `windowKey` is the same string as keys in `capturedContentByWindow` (`${captureRunId}:${pid}:${hwnd}`).  
  - Omitted entirely until a sub-phase implements evidence-backed population; otherwise treat as unknown per window.
- `captureWarnings?: string[]`
- `contentCaptureStats?: {
    windowsConsidered: number;
    windowsEnriched: number;
    tabsCaptured: number;
    tabsSkippedTotal: number;
    tabsSkippedByWindow: Record<windowKey, number>;
    tabsSkippedGlobal: number;
  }`
  - `tabsSkippedByWindow`: counts of tabs **skipped** (e.g. cap, dedupe-to-skip, provider limits) **per capture window**; keys are the same **run-scoped** `windowKey` as `capturedContentByWindow`; values are non-negative integers.

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
- Persist optional **`browserSessionRestoreHints`**: `Record<appInstanceId, 'unknown' | 'likely_on' | 'likely_off'>` on the saved profile (same persistence layer as `browserTabs`). Fold from `browserSessionRestoreHintsByWindow` when windows map to app instances: if multiple windows map to the same `appInstanceId`, merge with precedence **`likely_on` > `likely_off` > `unknown`** (conservative: any window “likely_on” makes the instance “likely_on”). Omit the field if no hints were produced.
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
- **Warning aggregation:** avoid stacking many raw technical codes in the primary snackbar. Prefer **one human-readable summary line** plus counts (e.g. “2 windows: protocol unavailable; 1: partial UIA capture”), with **optional expand/detail** (post-v1 or Phase 4 if time) for users who want the full warning list.
- **Truncation visibility:** v1 snackbar shows **counts** and cap reasons; it does **not** require listing every skipped URL in-line (noisy). **Follow-up:** optional “view skipped tabs” / export or per-window breakdown using existing stats so users can see whether an important tab fell under the global cap.

No blocking modal in v1; warnings are informational.

## Security and Safety

- Reuse existing URL/path sanitization pipeline for persisted profile payload.
- Do not trust provider raw output; normalize and validate before write.
- Keep profile payload size guardrails enforced in save sanitizers.
- **URLs vs “secrets”:** today’s pipeline (e.g. `normalizeSafeUrl` + length limits) means **http(s) allowlisting and bounded string copy**, **not** redaction of query strings. **Sensitive query parameters** (`?auth_token=`, `?session_id=`, etc.) visible in the address bar **can be persisted** if capture includes that tab. Treat as **high risk** if profiles are **shared, exported, or synced** to less-trusted storage. v1 spec expectation: document this in capture UX copy (“URLs are saved as shown”); **follow-up:** optional stripping or deny-list for known sensitive query keys, or warn when query string is non-empty and long.
- Apply the **same bounded string policy** to capture-time fields (URLs, titles) as persistence (`MAX_URL_LENGTH` and related limits in `src/main/utils/limits.js`) so enrichment does not build oversized IPC payloads before save-time sanitizers run.

## Implementation Plan (Phased)

### Phase 1: Data plumbing and caps

- Extend `MemoryCapture` contract and profile mapper.
- Add cap/dedupe utilities + stats/warnings.
- Wire renderer summary messaging.

### Phase 2: Explorer enrichment

- Implement robust Explorer content extraction via Shell COM mapping.
- Validate path filtering and association with captured app window.
- Investigate **Windows 11 Explorer multi-tab** behavior: either enumerate all tab paths when API allows, or lock v1 to **single-path best-effort** and document the warning path above.

### Phase 3: Browser auto-detect adapters

- Resolve [session restore vs captured tabs](#session-restore-vs-captured-browser-tabs-duplicate-risk) behavior (warnings, optional metadata, launch dedupe contract) alongside adapters.
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
- Browser with **session restore / continue where you left off** enabled (expect warning; bounded multi-snapshot dedupe when tab listing exists; duplicates still possible if restore completes after the **≤ 2000ms** pre-open budget — [Launch-side dedupe](#launch-side-dedupe-observability-race-v1-behavior); **also** slow-disk / 50+ tab restore — expect **more frequent** duplicates vs fast machines)
- **File Explorer** on Windows 11 with **multiple folder tabs** in one window (verify single-path vs multi-path behavior and warnings)
- **Embedded webview** host (e.g. open a web panel in a non-browser app): expect **missing or partial** URLs unless UIA surfaces something useful

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
4. Existing profile launch behavior remains compatible and stable; persisted **`browserSessionRestoreHints`** is optional and must not break older launch paths that ignore it.
5. Sanitizers continue to enforce safe, bounded persisted payloads.

## Risks and Mitigations

- **Browser internals drift** -> keep adapters isolated; fallback to UIA/none.
- **Capture latency spikes** -> strict timeout budgets + partial return.
- **Large payloads** -> cap + dedupe + save-time size guardrails; align capture-time string bounds with persistence limits to avoid oversized IPC payloads.
- **Incorrect window-tab association** -> stable identity keys, confidence metadata, warnings for ambiguous mapping.
- **Session restore duplicates profile-opened tabs** -> v1: user-visible warning + bounded multi-snapshot launch dedupe where tab listing exists ([Launch-side dedupe](#launch-side-dedupe-observability-race-v1-behavior)); residual duplicates if restore finishes after budget; follow-up: prefs/extension-based hints (`browserSessionRestoreHints*`) and stronger coordination.
- **Slow restore vs fixed 2s dedupe budget** -> on heavy tab counts or slow I/O, restore often exceeds the budget so dedupe **systematically under-helps**; same mitigations as session-restore row (tunable budget, hints, user setting)—see [Launch-side dedupe](#launch-side-dedupe-observability-race-v1-behavior) **Heavy sessions / slow hardware**.
- **Secrets in persisted URLs** -> sanitization is allowlist + length, not query redaction; UX disclosure + follow-up stripping/deny-list if sharing/sync becomes a product path.

## Follow-ups (Post-v1)

- Optional settings UI for provider preference/tuning.
- Optional advanced protocol configuration per browser.
- Optional import of tab groups/workspaces where available.
- **Session restore:** prefs/registry (where stable) or companion extension to populate `browserSessionRestoreHintsByWindow` / `browserSessionRestoreHints` and optionally skip persisting or opening `browserTabs` automatically; tune dedupe budget when `likely_on`.
- **Launch dedupe budget:** user-tunable delay/budget or adaptive wait when tab count / hints suggest long restore.
- **URL privacy:** optional strip or deny-list for sensitive query keys; stronger warnings for long opaque query strings.
- **Explorer Win11:** full multi-tab path capture when Shell COM (or successor API) supports it reliably.
- **Post-capture UX:** expandable “skipped tabs” / per-window breakdown using stats for cap truncation.
