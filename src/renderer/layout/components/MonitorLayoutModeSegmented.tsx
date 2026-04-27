import { Eye, PenLine } from "lucide-react";

type MonitorLayoutModeSegmentedProps = {
  isEditMode: boolean;
  onChange: (edit: boolean) => void;
  /** Tighter padding and shorter labels (toolbar compact / dense preview). */
  dense?: boolean;
};

/**
 * Two-segment control: Edit mode (left) vs Preview mode (right).
 * Uses radiogroup semantics; labels do not truncate so full text stays visible.
 */
export function MonitorLayoutModeSegmented({
  isEditMode,
  onChange,
  dense = false,
}: MonitorLayoutModeSegmentedProps) {
  const labelEdit = dense ? "Edit" : "Edit mode";
  const labelPreview = dense ? "Preview" : "Preview mode";

  const segmentBase =
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold tracking-tight whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/50 focus-visible:ring-offset-2 focus-visible:ring-offset-flow-bg-secondary";

  const active =
    "bg-flow-accent-blue/[0.14] text-flow-accent-blue shadow-[0_0_0_1px_rgba(56,189,248,0.75),0_0_14px_rgba(56,189,248,0.18)]";
  const inactive =
    "text-flow-text-muted hover:bg-white/[0.06] hover:text-flow-text-secondary";

  const pad = dense ? "px-2.5 py-1.5 text-[11px]" : "px-3.5 py-2 text-xs sm:text-[13px]";
  const iconClass = dense ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0";

  return (
    <div
      role="radiogroup"
      aria-label="Monitor layout mode"
      className="inline-flex max-w-full shrink-0 flex-nowrap items-stretch rounded-full border border-white/[0.12] bg-black/40 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
    >
      {/* Edit = left */}
      <button
        type="button"
        role="radio"
        aria-checked={isEditMode}
        onClick={() => onChange(true)}
        className={`${segmentBase} ${pad} ${isEditMode ? active : inactive}`}
      >
        <PenLine className={iconClass} strokeWidth={1.85} aria-hidden />
        <span>{labelEdit}</span>
      </button>
      {/* Preview = right */}
      <button
        type="button"
        role="radio"
        aria-checked={!isEditMode}
        onClick={() => onChange(false)}
        className={`${segmentBase} ${pad} ${!isEditMode ? active : inactive}`}
      >
        <Eye className={iconClass} strokeWidth={1.85} aria-hidden />
        <span>{labelPreview}</span>
      </button>
    </div>
  );
}
