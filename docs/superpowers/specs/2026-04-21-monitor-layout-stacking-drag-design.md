# Monitor Layout: Stacking, Dragging, and App Layout Management

Date: 2026-04-21  
Status: Draft — design spec for implementation  
Scope: Profile **monitor layout preview** in edit mode: multiple apps sharing the same snap zone (“stack”), visual clarity, drag-and-drop semantics, optional follow-up persistence and launch alignment.

## 1) Problem Statement

Today, each monitor holds a flat list of apps (`monitor.apps[]`) with percent-based `position` and `size`. Snap zones come from `getSnapZones()` (predefined layout slots or dynamic layouts derived from app count). Occupancy is inferred by matching app geometry to a zone (`isItemInZone` with tolerance).

When **two** apps target the same zone, the editor partly handles this via displacement: dragging into an occupied zone can move the dragged app into the zone and **push one** conflicting app to another free zone (`onUpdateAppsWithDisplacement`), if a free zone exists.

When **more than two** apps share the same geometry, or there is **no** displacement target, or overlaps come from **capture/import**, apps **draw on top of each other** at identical bounds. The preview then fails to communicate:

- how many apps occupy the spot,
- which apps,
- front-to-back order,
- affordances to separate, reorder, or move stacks vs single apps.

This document defines a **phased** approach: geometry-derived “stacks” first, optional explicit persistence later, and interaction rules (including swap vs stack) aligned with the product’s custom drag system.

## 2) Goals and Non-Goals

### Goals

1. **Legible settled state** for any zone with 2+ co-located apps (count, identity, order).
2. **Predictable editing**: drag one app out of a stack; drag an entire stack as a unit; choose **swap** vs **add to stack** when dropping on an occupied zone.
3. **Small zones**: safe fallbacks when ring/center targets are too small to hit reliably.
4. **Accessibility path**: menus or inspector actions that mirror DnD (not DnD-only).
5. **Single source of truth** for “who is in this zone” derived from the same membership rules the editor already uses, until a schema migration is justified.

### Non-Goals (initial phases)

- Resizing zone dividers vs app-drag disambiguation is only **referenced**; full layout-resize spec stays separate.
- Full undo/redo product-wide — if added, it should reuse a general profile-edit undo story, not a one-off toast only for layout.

## 3) Current Architecture (Relevant Surfaces)

| Area | Role |
|------|------|
| `src/renderer/layout/components/MonitorLayout.tsx` | Snap zones, `isItemInZone`, `findConflictingItem` (returns **one** conflict), local drag state, `handleItemDrag` / `handleItemDragEnd`, `onUpdateAppsWithDisplacement`, `renderSnapZones`, maps `monitor.apps` to `AppFileWindow`. |
| `src/renderer/layout/components/AppFileWindow.tsx` | Per-app chrome, drag handlers, resize/move in edit mode. |
| `src/renderer/layout/MainLayout.tsx` | Global `dragState`, `onCustomDragStart`, external snap preview via `elementsFromPoint` for sidebar/minimized/cross-monitor drags. |
| `src/renderer/layout/hooks/useMainLayoutProfileMutations.ts` | Profile mutations including displacement updates. |
| `src/types/flow-profile.ts` | `FlowProfile.monitors` is loosely typed (`any[]`); no first-class “stack” field today. |

**Implication:** “Stack” is not a persisted entity yet; it is **observable** when multiple apps share the same snap zone geometry. Implementation should start by **clustering** apps by zone membership before considering schema changes.

## 4) Concepts and Definitions

**Snap zone**  
A logical region (slot) on a monitor preview: position/size in percent space, with an `id` for predefined layouts.

**Co-located set (derived stack)**  
The set of app indices whose `position`/`size` match the **same** snap zone under `isItemInZone` (or stricter bucketing if tolerance causes false merges).

**Solo zone**  
Exactly one app in the co-located set for that zone.

**Stack zone**  
Two or more apps in the co-located set.

**Front / back**  
Ordered stacking for display and (eventually) launch. **Must be chosen explicitly** and documented; default recommendation pending verification against launch/placement order:

- **Option A (typical DOM):** higher `appIndex` = more front (later in `monitor.apps` paints above).
- **Option B:** lower `appIndex` = front.

**Lock-in criterion:** Preview order must match **runtime placement expectations** for overlapping identical targets (see Phase 3).

## 5) Target UX

### 5.1 Settled visual (stack zone)

For `count >= 2` in edit mode (and optionally read-only preview with lighter chrome):

- **Icon fan** or **collapsed stack**: show up to N icons with horizontal offset; `+M` overflow badge when `count > N`.
- **Label**: e.g. “3 apps” or abbreviated in dense mode.
- **Tooltip or inspector**: full ordered list with **front → back** labels.
- **Dense layout**: below minimum rendered width/height, collapse to single icon + count badge; full list in tooltip.

### 5.2 Drag sources

| Source | Behavior |
|--------|----------|
| Solo app | Drag moves that app; source zone becomes empty during drag (existing patterns). |
| Single app in stack | Drag starts from **that app’s** handle in the fan (lift one). Preview updates count/order. |
| Stack body / non-handle | Drag **entire stack**: payload is ordered index list; ghost shows fan + count. |

Distinguish single vs whole stack by **hit target** (icon handle vs zone background / stack chrome), consistent with custom drag (`onCustomDragStart` / local drag).

### 5.3 Drop targets: ring vs center

When dragging over a **solo** zone that is **not** the source zone and is large enough:

- **Outer ring** (e.g. band ~20% inset from each edge): **Swap** — exchange zones between dragged payload and occupant(s), per rules in §6.
- **Center**: **Add to stack** — dragged app(s) adopt target zone **geometry** (same `position`/`size` as zone); order policy: **append to back** by default (minimize disruption to existing front app).

**Suppress the ring** when:

1. Target is already a **stack** (only “add to stack” / merge — ring semantics are ambiguous).
2. Drag **originated from the same zone** (cancel or reorder-only — no swap-to-self).
3. Zone **rendered size** is below threshold (~80×60 px or tuned): show **single target** or **post-drop / post-hover menu** (Swap | Add to stack).

**Empty zone**  
Full-zone highlight only; no split.

### 5.4 Manage stack (optional Phase 2b)

- Sheet/drawer: list apps in stack order, drag handles to **reorder** (mutate order within `monitor.apps` for those indices only).
- **Eject**: move to first empty zone or explicit zone picker; if no empty zone, blocking message + suggest drag to occupied zone after swap.

### 5.5 Accessibility

- Context menu on zone: Move to zone…, Bring to front / Send to back, Remove from stack (if applicable).
- Keyboard-first path can defer to drawer + menus if DnD alone is insufficient.

## 6) Drop Outcome Matrix (Reference)

Matrices below assume **append to back** for stack insertion. Exact **swap** behavior when stacks are on both sides is an **open decision** (§8); v1 can restrict ring swaps to **solo ↔ solo** and **solo ↔ whole stack** only.

### Solo onto solo

| Target | Outcome |
|--------|---------|
| Ring | Swap positions/zones between the two apps. |
| Center | Dragged app joins target geometry; target becomes 2-app stack; source vacated (or source restacked per rules). |

### Solo onto existing stack

| Target | Outcome |
|--------|---------|
| Center only | Append solo to stack; source vacated. |

### Single lifted app onto solo

| Target | Outcome |
|--------|---------|
| Ring | Lifted app and solo swap; solo returns into source stack at lifted index (size unchanged) if that preserves stack membership rules. |
| Center | Lifted app added to target stack; source stack shrinks; solo-if-one remains. |

### Single lifted app onto stack

| Target | Outcome |
|--------|---------|
| Center | Merge into target stack; source shrinks. |

### Whole stack onto solo

| Target | Outcome |
|--------|---------|
| Ring | Stack and solo **exchange** zone assignments (whole stack moves; solo moves to source zone). |
| Center | Solo absorbed into stack at target zone; append to back. |

### Whole stack onto stack

| Target | Outcome |
|--------|---------|
| Center | Merge: target order first (front), dragged stack appended (back). |

### Drop on source zone

Cancel: restore original order and geometry.

### Sidebar / minimized / cross-monitor drags

Reuse existing `dragState` + `externalSnapState`; extend hovered-zone UI to show ring/center when the drop would land on an **occupied solo** zone and payload is compatible.

## 7) Implementation Phases

### Phase 1 — Readability (no behavioral change required)

1. Build **zone → app indices[]** map per monitor using current snap zones + `isItemInZone`.
2. For each zone with `length > 1`, render **stack chrome** (fan, badge, labels) inside zone bounds; optional **read-only** badge outside edit mode.
3. Tooltips / inspector strings with **explicit order** naming.
4. Align **z-index / render order** with the chosen front/back convention.

**Acceptance:** With 3+ apps forced into one quadrant, user can name every app and state front/back without inspector ambiguity.

### Phase 2 — Interaction

1. Replace “first conflict only” usage with **all co-located apps** for highlighting and stack detection.
2. Implement **lift one** vs **drag whole stack** via distinct drag origins; whole-stack moves as **batch position/size** updates.
3. Implement **ring vs center** hit testing using pointer position in **percent space** relative to hovered zone; integrate with both local monitor drag and global `dragState` preview.
4. **Small zone** menu fallback.
5. Wire outcomes to mutations (`onUpdateApp`, extended batch update, `onUpdateAppsWithDisplacement` or successor for multi-app transactions).

**Acceptance:** User can split a stack, merge stacks, and swap solo against stack without geometry hacks (manual pixel offset).

### Phase 2b — Manage stack drawer

Reorder and eject without relying on DnD precision.

### Phase 3 — Persistence and launch alignment (conditional)

Trigger when geometry-derived stacks are fragile (custom layouts, drift) or launch order disagrees with preview.

- Add explicit **`stackOrder`** or **`stackId`** (or zone-centric model) with migration from flat `monitor.apps`.
- Verify `window-placement-runtime` / orchestrator behavior for **identical placement rects**; align array order or metadata so **front app in preview = foreground placement intent**.

### Phase 4 — Polish

- Undo: prefer **shared** profile edit undo; if unavailable, document limitation.
- Ensure **layout resize handles** do not compete with app drag (hide or disable resize while app drag active).
- Telemetry or debug logging (launch-latest style) optional for drag outcome diagnostics.

## 8) Open Decisions (Resolve Before or During Phase 2)

1. **Canonical front/back vs `appIndex`:** Confirm against launch pipeline; update this doc when locked.
2. **Stack ↔ stack ring swap:** Allowed, disallowed, or merge-only?
3. **Displacement when adding to stack:** Today displacement assumes a **single** conflict; stacks need rules when dropping solo onto solo with **center** intent (no displacement — merge) vs **ring** (swap). Ensure no code path assumes exactly one occupant.
4. **Non-edit preview:** Full fan vs minimal badge.

## 9) Key Engineering Notes

- **`findConflictingItem`** returns one index; stack work needs **`findAllAppsInZone(zone)`** or equivalent.
- **`getSnapZones(monitor, appCountOverride)`** already adjusts zone set for incoming cross-monitor apps; keep overrides consistent when computing membership during drags.
- **Transactions:** Merging or swapping stacks should be **one logical profile update** to avoid partial states on failure.
- **Keys:** `AppFileWindow` keys use `instanceId` when present; batch reorder must preserve React identity expectations.

## 10) Testing and QA (High Level)

- 2 apps same zone: show stack chrome; drag one out; remaining becomes solo.
- 3+ apps same zone: fan + overflow; tooltip order matches canonical rule.
- Solo → solo: ring swap vs center stack; small zone menu path.
- Whole stack → solo: ring and center paths.
- Cross-monitor drag onto occupied solo: ring/center highlights and correct final geometry.
- Source-zone cancel restores prior state.
- Regression: `onAutoSnapApps`, predefined layouts, portrait dynamic layouts.

## 11) Related References

- Prior informal spec (external): “FlowSwitch — Monitor Layout Drag & Drop” (ring/center, matrices, drawer ideas) — concepts imported here and adapted to `MonitorLayout` / `MainLayout` architecture.
- Code: `MonitorLayout.tsx` (`getSnapZones`, `handleItemDrag`, `handleItemDragEnd`, `externalSnapState` effect), `MainLayout.tsx` (`dragState`), `AppFileWindow.tsx`, profile mutations hook.

---

## Revision History

| Date | Author | Notes |
|------|--------|-------|
| 2026-04-21 | — | Initial draft from design review in chat. |
