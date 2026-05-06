/**
 * Shared typography and controls for right-hand inspectors (app + content library).
 * Keep section hierarchy: primary title → eyebrow subsection → field label.
 */

/** Large section titles (e.g. Layout, Basic Information, Monitor Assignment). */
export const inspectorSectionPrimaryTitleClass =
  "block text-sm font-medium text-flow-text-secondary";

/**
 * Inspector sidebar section label (11px uppercase, muted) — use instead of h2/h3
 * inside narrow inspectors. See SKILL-inspector-sidebar.
 */
export const inspectorSectionLabelTextClass =
  "block text-[11px] font-medium uppercase tracking-[0.06em] text-flow-text-primary/45";

/** Bottom margin for labels not wrapped in a `space-y-*` stack (e.g. Launch tab). */
export const inspectorSectionLabelClass = `${inspectorSectionLabelTextClass} mb-2`;

/** Top rule + spacing before destructive-only block. */
export const inspectorDangerZoneClass =
  "mt-4 border-t border-flow-border/50 pt-4";

/** Text link for tertiary actions (e.g. Open in Explorer) in inspectors. */
export const inspectorTextLinkClass =
  "inline-flex min-h-[28px] items-center gap-1.5 text-[12px] font-medium text-flow-accent-blue transition-colors hover:text-flow-accent-blue-hover hover:underline motion-reduce:transition-none";

/** Anchored dropdown panel under inspector triggers. */
export const inspectorMenuPanelClass =
  "absolute left-0 right-0 z-50 mt-1 max-h-[min(320px,50vh)] overflow-y-auto rounded-lg border border-flow-border/60 bg-flow-surface py-1 shadow-lg motion-reduce:transition-none";

export const inspectorMenuItemClass =
  "flex w-full items-center px-3 py-2 text-left text-[13px] font-medium text-flow-text-secondary transition-colors hover:bg-flow-surface-elevated hover:text-flow-text-primary motion-reduce:transition-none";

/** Trigger row for “Move to…” / “Add to layout…” menus (matches list row weight). */
export const inspectorMenuTriggerClass =
  "flex min-h-[36px] min-w-0 w-full items-center justify-between gap-2 rounded-lg border border-flow-border/50 bg-flow-surface px-3 py-2 text-left text-[13px] font-medium text-flow-text-secondary transition-[color,background-color,border-color] duration-200 ease-out hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary active:brightness-95 motion-reduce:transition-none motion-reduce:active:brightness-100";

/** Same weight as primary title, without `block` (toolbar / flex row labels). */
export const inspectorSectionPrimaryEmphasisClass =
  "text-sm font-medium text-flow-text-secondary";

/**
 * Small caps subsection (Move to, Add to layout, Library, Browse groupings).
 * Use `inspectorEyebrowText` when margin is controlled by the parent.
 */
export const inspectorEyebrowText =
  "block text-[11px] font-medium uppercase tracking-wide text-flow-text-muted";

export const inspectorEyebrowBlock = `${inspectorEyebrowText} mb-2`;

/** Field / control group label (Executable Path, Target Monitor). */
export const inspectorFieldLabelClass =
  "mb-2 block text-xs font-medium text-flow-text-muted";

export const inspectorHelperTextClass =
  "text-[11px] leading-snug text-flow-text-muted";

/** Native `<select>` — same family as library toolbar pills / {@link flowDropdownNativeSelectClass}. */
export const flowDropdownNativeSelectClass = "flow-dropdown-native-select";

export const inspectorPanelNativeSelectClass = flowDropdownNativeSelectClass;

/** Text/number inputs: keep denser field well (selects use pill-adjacent chrome). */
export const inspectorPanelNativeTextInputClass =
  "min-w-0 max-w-full w-full rounded-lg border border-flow-border bg-flow-bg-primary px-3 py-2 text-xs text-flow-text-primary transition-[border-color,box-shadow] duration-200 ease-out focus:border-flow-accent-blue focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50";

/** Text/number input in a horizontal flex row (e.g. paste + button); no `w-full`. */
export const inspectorPanelNativeTextInputFlexClass =
  "min-w-0 max-w-full flex-1 rounded-lg border border-flow-border bg-flow-bg-primary px-3 py-2 text-xs text-flow-text-primary focus:border-flow-accent-blue focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50";

/** Monospace path/args field in inspectors. */
export const inspectorPanelNativeMonoInputClass =
  "min-w-0 max-w-full w-full rounded-lg border border-flow-border bg-flow-bg-primary px-3 py-2 font-mono text-xs text-flow-text-primary focus:border-flow-accent-blue focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50";

/** Row behind Launch-style toggles (border matches list buttons). */
export const inspectorPanelSwitchRowClass =
  "flex min-w-0 items-center justify-between gap-2 rounded-lg border border-flow-border/50 bg-flow-surface px-2.5 py-2";

export const inspectorPanelSwitchTitleClass =
  "text-xs font-medium text-flow-text-secondary";

/** Compact switch track; sibling must be `sr-only peer` checkbox immediately before this `div`. */
export const inspectorPanelSwitchTrackClass =
  "relative h-5 w-10 shrink-0 rounded-full bg-flow-bg-primary transition-[background-color] duration-200 ease-out peer-focus:outline-none after:pointer-events-none after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-[transform] after:duration-200 after:ease-[cubic-bezier(0.16,1,0.3,1)] after:content-[''] peer-checked:bg-flow-accent-blue peer-checked:after:translate-x-5 peer-checked:after:border-white";

/** Label wrapping the hidden checkbox + {@link inspectorPanelSwitchTrackClass}. */
export const inspectorPanelSwitchLabelClass =
  "relative inline-flex shrink-0 cursor-pointer items-center";

/** Full-width placement / list row button. */
export const inspectorPanelListButtonClass =
  "min-w-0 w-full rounded-lg border border-flow-border/50 bg-flow-surface px-3 py-2 text-left text-xs font-medium text-flow-text-secondary transition-[color,background-color,border-color] duration-200 ease-out hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary active:brightness-95 motion-reduce:active:brightness-100 [overflow-wrap:anywhere]";

/** Full-width centered row (Open in Explorer, open link). */
export const inspectorPanelCtaButtonClass =
  "inline-flex min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-flow-border/50 bg-flow-surface px-3 py-2 text-xs font-medium text-flow-text-secondary transition-[color,background-color,border-color] duration-200 ease-out hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary active:brightness-95 motion-reduce:active:brightness-100 [overflow-wrap:anywhere]";

/** Full-width centered action in a grid cell (e.g. Replace). */
export const inspectorPanelGridButtonClass =
  "flex min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-flow-border/50 bg-flow-surface px-3 py-2 text-xs font-medium text-flow-text-secondary transition-[color,background-color,border-color] duration-200 ease-out hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary active:brightness-95 motion-reduce:active:brightness-100 [overflow-wrap:anywhere]";

export const inspectorPanelGridButtonDisabledClass =
  "flex min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-flow-border/50 bg-flow-surface/60 px-3 py-2 text-xs font-medium text-flow-text-muted opacity-70 cursor-not-allowed [overflow-wrap:anywhere]";

export const inspectorPanelDangerButtonClass =
  "flex min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-flow-accent-red/35 bg-flow-accent-red/10 px-3 py-2 text-xs font-medium text-flow-accent-red transition-[color,background-color,border-color] duration-200 ease-out hover:bg-flow-accent-red/20 disabled:cursor-not-allowed disabled:opacity-50 active:brightness-95 motion-reduce:active:brightness-100 [overflow-wrap:anywhere]";

/** Secondary compact control (Open in Explorer). */
export const inspectorPanelCompactButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-flow-border/50 bg-flow-surface px-2.5 py-1.5 text-[11px] font-medium text-flow-text-secondary transition-[color,background-color,border-color] duration-200 ease-out hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary active:brightness-95 motion-reduce:active:brightness-100";

export const inspectorPanelCompactButtonDisabledClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-flow-border/40 bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-flow-text-muted opacity-60 cursor-not-allowed";
