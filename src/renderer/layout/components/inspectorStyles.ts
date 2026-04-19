/**
 * Shared typography and controls for right-hand inspectors (app + content library).
 * Keep section hierarchy: primary title → eyebrow subsection → field label.
 */

/** Large section titles (e.g. Layout, Basic Information, Monitor Assignment). */
export const inspectorSectionPrimaryTitleClass =
  "block text-sm font-medium text-flow-text-secondary";

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

/** Full-width placement / list row button. */
export const inspectorPanelListButtonClass =
  "w-full rounded-lg border border-flow-border/50 bg-flow-surface px-3 py-2 text-left text-xs font-medium text-flow-text-secondary transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary";

/** Full-width centered row (Open in Explorer, open link). */
export const inspectorPanelCtaButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-lg border border-flow-border/50 bg-flow-surface px-3 py-2 text-xs font-medium text-flow-text-secondary transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary";

/** Full-width centered action in a grid cell (e.g. Replace). */
export const inspectorPanelGridButtonClass =
  "flex min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-flow-border/50 bg-flow-surface px-3 py-2 text-xs font-medium text-flow-text-secondary transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary";

export const inspectorPanelGridButtonDisabledClass =
  "flex min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-flow-border/50 bg-flow-surface/60 px-3 py-2 text-xs font-medium text-flow-text-muted opacity-70 cursor-not-allowed";

export const inspectorPanelDangerButtonClass =
  "flex min-w-0 w-full items-center justify-center gap-2 rounded-lg border border-flow-accent-red/35 bg-flow-accent-red/10 px-3 py-2 text-xs font-medium text-flow-accent-red transition-colors hover:bg-flow-accent-red/20 disabled:cursor-not-allowed disabled:opacity-50";

/** Secondary compact control (Open in Explorer). */
export const inspectorPanelCompactButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-flow-border/50 bg-flow-surface px-2.5 py-1.5 text-[11px] font-medium text-flow-text-secondary transition-colors hover:border-flow-border-accent hover:bg-flow-surface-elevated hover:text-flow-text-primary";

export const inspectorPanelCompactButtonDisabledClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-flow-border/40 bg-transparent px-2.5 py-1.5 text-[11px] font-medium text-flow-text-muted opacity-60 cursor-not-allowed";
