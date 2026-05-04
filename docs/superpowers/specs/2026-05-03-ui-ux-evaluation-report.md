# FlowSwitch UI/UX evaluation report

**Date:** 2026-05-03  
**Scope:** Needfinding / heuristic pass over the renderer shell (library, header, monitor layout, modals).  
**Tools:** [agent-browser](https://skills.sh/vercel-labs/agent-browser/agent-browser) (Chrome DevTools Protocol + accessibility snapshots against Electron `--remote-debugging-port`), local `ui-ux-pro-max` UX guideline search (`--domain ux`), targeted source review.

---

## 1. Executive summary

FlowSwitch presents a **coherent dark productivity shell**: title bar controls, a three-mode library (**Profiles / Apps / Content**), a rich **profile header** (identity, type, meta chips, launch), and a **multi-monitor layout** surface with clear Edit/Preview framing. Visual weight correctly emphasizes **Launch** and the active profile.

The strongest gaps for the next iteration are **accessibility and semantics** (clickable `div` profile cards without keyboard parity, noisy aggregate accessible names in snapshots, very long `aria-label` strings on icon-only help buttons, installed-app rows exposed as oversized **button** names), **shipping accuracy** (About dialog version string out of sync with `package.json`), and **hygiene** (many `console.log` calls left in `MainLayout` for production renderer). Automation also showed that **CDP `click` on tab refs can fail** while programmatic `.click()` succeeds—worth validating against real z-index/hit-testing, not only agent tooling.

---

## 2. Methodology and limits

| Technique | What it covered |
|-----------|-----------------|
| `agent-browser connect` + `open http://localhost:5173/` | Live renderer inside Electron with user data. |
| `agent-browser snapshot` / `snapshot -i` | Full AX tree vs “interactive only” tree. |
| `agent-browser eval` | DOM queries (tab `aria-selected`, `onclick` on nodes, `#root` structure). |
| `agent-browser click` | CSS selector (`button[aria-label='FlowSwitch menu']`) and `@eN` refs; quoted refs for PowerShell. |
| Source read | `MainLayout.tsx`, `ProfileCard.tsx`, `AppChromeModals.tsx`, `AppManager.tsx`. |

**Not exercised in this pass (automation or risk limits):** profile **Launch** end-to-end, **drag-and-drop** between monitors/minimized strip, **capture layout** wizard, **Profile settings** multi-section modal, **New profile** capture flow, **inspector** Launch vs Inspect subtabs, **import/export**, **keyboard-only** walk, **screen reader** (NVDA/JAWS), **color contrast metering**, **resize breakpoints** across window sizes.

---

## 3. Visual hierarchy (evidence-backed)

1. **Vertical rhythm:** Title bar (drag region + menu + sidebar toggles) → primary work row (library + main) reads top-to-bottom as expected for a desktop tool.
2. **Primary action:** `Launch …` reads as the dominant CTA in the header stack (snapshot: dedicated `button` adjacent to settings).
3. **Library vs canvas:** Sidebar tabs use a clear **tablist** (`aria-label="Sidebar view"`) with sliding panels; inactive panels use `aria-hidden` and `pointer-events-none`, matching the visual “one column at a time” model.
4. **Edit vs preview:** Monitor layout exposes **radio** controls “Edit mode” / “Preview mode” (`checked` state visible in AX tree)—good explicit mode switching.
5. **Density:** Apps catalog lists many rows; search + filter chips provide scaffolding; long lists are scroll-contained (`scrollbar-elegant` region in code).

**Risk:** Header **meta chips** (`Sequential profile launch`, reuse behavior, etc.) are individual `button`s in the AX tree—visually they act like tags; ensure affordance (selected vs informational) is obvious without relying on color alone (aligns with UX guideline: do not convey information by color alone).

---

## 4. Interaction inventory

| Area | Exercised | Notes |
|------|-----------|--------|
| Profiles list | Partially | Cards visible; selection implied by header “Editing”. |
| Sidebar tabs | Yes | Programmatic tab clicks (`[role=tab]` indices 0–2). |
| Apps catalog | Yes | Large list; each row `button` + h4 + “More actions”. |
| Content library | Yes | Folders + files; instruction control present. |
| Title bar menu | Yes | `menuitem` “App preferences…”, “About FlowSwitch” in full snapshot. |
| App preferences modal | Yes | `role="dialog"` “App preferences”, switch for pin-during-launch, placeholder copy. |
| About | No (code only) | Version constant reviewed—see findings. |
| Profile settings / New profile / Launch | No | High-value follow-up. |

---

## 5. Findings (severity-ordered)

### Critical

**C1 — Profile library cards are not first-class interactive elements for keyboard users**

`ProfileCard` uses a `div` with `onClick` for the main surface (default, compact, and grid densities). There is no `tabIndex` on that surface (`null` when queried in the live DOM), so **cards are not in the tab order** and do not behave as native buttons for Enter/Space.

```218:226:e:\Coding\Projects\FlowSwitch\src\renderer\layout\components\ProfileCard.tsx
  return (
    <div className="relative">
      <div
        onClick={disabled ? undefined : onClick}
        className={`relative ${pad} rounded-xl transition-all duration-150 ease-out group border ${cardSurfaceClass(
          profile,
          disabled,
        )}`}
      >
```

**Action:** Prefer `<button type="button">` for the card surface (split inner “settings” `stopPropagation` as today), or add `role="button"`, `tabIndex={0}`, keyboard handlers, and a concise `aria-label` per profile. Matches ui-ux-pro-max: **Keyboard navigation — High**.

---

### Major

**M1 — About dialog version is stale vs shipped package**

```5:5:e:\Coding\Projects\FlowSwitch\src\renderer\layout\components\AppChromeModals.tsx
const APP_VERSION = "0.1.0";
```

`package.json` is `0.1.3` (authoritative per `AGENTS.md`). Users and support will mis-trust diagnostics.

**Action:** Single source of truth (e.g. import from generated `version` metadata or `package.json` at build time via `define` / small JSON).

**M2 — Accessibility snapshot shows a root-level `generic` whose accessible name is the concatenation of the entire sidebar**

Example pattern from agent-browser (abbreviated):  
`generic "ProfilesAppsContentAll (7)NameBrowse…" [ref=e1] clickable [onclick]`

That indicates **flattened descendant text** surfacing as one name (harmful for screen readers and noisy for automation). Likely contributors: multiple **clickable `div`s** (profile cards, layout tiles) without isolated accessible names on a common ancestor.

**Action:** Audit with NVDA; add **landmarks** (`<main>`, `nav`), ensure card surfaces have **explicit** `aria-label` / heading structure; avoid unnamed interactive containers wrapping unrelated content.

**M3 — `agent-browser click` on tab `@e8` did not switch views; programmatic `tab.click()` did**

**Action:** Treat as a **hit-testing / layer order** smoke test: verify no transparent overlay intercepts pointer events for real mice (may be tool-specific, but worth a manual click test over each tab).

**M4 — Interactive-only snapshots omit portaled menu items**

With `snapshot -i`, open **FlowSwitch menu** did not list `menuitem`s; full `snapshot` did. Test plans that only use `-i` will **false-negative** menu coverage.

**M5 — Many `console.log` statements in `MainLayout`**

Violates repo hygiene (`AGENTS.md` / git rules) and may leak layout/debug data in user consoles.

Representative locations include profile switch and drag callbacks (grep shows 10+ occurrences in `MainLayout.tsx`).

**Action:** Remove or gate behind a dev-only logger.

---

### Minor

**m1 — App preferences placeholder copy signals “unfinished”**

Honest, but user-facing: “Global options … will **expand here as the app grows**.” Consider tightening once roadmap is clear, or link to docs/issue tracker.

**m2 — Icon-only help uses the full help string as `aria-label`**

```529:536:e:\Coding\Projects\FlowSwitch\src\renderer\layout\components\AppManager.tsx
              <FlowTooltip label={APPS_SIDEBAR_HELP}>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-flow-text-muted transition-colors hover:bg-white/[0.06] hover:text-flow-text-primary"
                  aria-label={APPS_SIDEBAR_HELP}
                >
                  <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </button>
```

Works for SR, but **rotor/announcements become very long**. Prefer short `aria-label` (“How to use the apps list”) plus visible tooltip text, or `aria-describedby` pointing to visually hidden concise text.

**m3 — Installed app row `button` accessible names bundle title + category + “More actions”**

Good for discoverability in one string, but **verbose** in SR. Consider `aria-labelledby` pointing to heading + separate **visually hidden** instructions.

**m4 — Content rows: some entries expose `heading` without a single clear “row” button name in the same node**

Folders show `generic "specs"` with nested heading; files show `heading` + sibling “More actions”. Slightly inconsistent; unify row pattern for predictability.

**m5 — Skip link / deep linking**

Desktop Electron app may not need URLs, but **keyboard skip** to main canvas is still relevant for power users (ui-ux-pro-max **Skip links — Medium**).

---

## 6. Positive patterns (keep)

- **Tablist** for Profiles/Apps/Content with `aria-selected` and counts in `aria-label`.
- **Search** fields with dedicated names (`Search profiles`, `Search installed apps`, `Search content library`).
- **Modals:** `role="dialog"`, `aria-modal`, labeled titles, backdrop click to dismiss on preferences/about.
- **Monitor layout** section heading and mode radios.
- **Snackbar** portal with `aria-live="polite"` for toasts.

---

## 7. Recommended next changes (prioritized backlog)

| Priority | Item | Rationale |
|----------|------|-----------|
| P0 | Fix **ProfileCard** keyboard + semantics (C1) | WCAG-aligned operability; reduces misleading AX grouping. |
| P0 | Sync **About** version (M1) | Trust + support. |
| P1 | Remove **`console.log`** from renderer hot paths (M5) | Standards + performance noise. |
| P1 | AX audit **root naming** / landmarks for sidebar vs main (M2) | SR quality + cleaner automation. |
| P2 | Shorten **help control** labels; align Content + Apps patterns (m2, m4) | SR verbosity + consistency. |
| P2 | Manual **pointer hit-test** on library tabs after overlay audit (M3) | Real-user click reliability. |
| P3 | **Skip link** or documented keyboard path to monitor canvas (m5) | Power keyboard users. |
| P3 | Expand automated pass to **Profile settings**, **New profile**, **Launch inspector**, **drag** (methodology §2) | Regression safety for highest-risk flows. |

---

## 8. Traceability

- **agent-browser** workflow reference: [agent-browser skill (Electron)](https://skills.sh/vercel-labs/agent-browser/agent-browser) — `connect`, `snapshot`, `click`, `eval`.
- **Heuristic lens:** `ui-ux-pro-max` CSV search (keyboard navigation, focus, skip links, color-only, heading hierarchy, active state).
- **Next doc touchpoint:** Align implementation priorities with `docs/superpowers/unified-backlog.md` when picking up P0/P1 items.

---

## 9. Manual QA checklist (for the next engineering pass)

- [ ] Tab from title bar through **Profiles** list: each profile selectable with **keyboard only**.
- [ ] NVDA: navigate **Profiles / Apps / Content**; confirm no single node reads entire sidebar.
- [ ] Open **About**; version matches **installed build** / `package.json`.
- [ ] Physical mouse: click **Apps** tab repeatedly; confirm no missed clicks.
- [ ] Open **App preferences** and **Profile settings**; Esc / backdrop / Close all behave predictably.
- [ ] Optional: run `agent-browser snapshot` (not only `-i`) when validating menus and portaled UI.
