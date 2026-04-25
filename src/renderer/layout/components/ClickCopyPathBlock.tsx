import { useEffect, useRef, useState } from "react";
import { FlowTooltip } from "./ui/tooltip";

/** Primary surface: monospace path/URL, full width, click to copy. */
export const clickCopyPathBlockButtonClassName =
  "min-w-0 w-full max-w-full break-all rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/40 px-3 py-2 text-left font-mono text-xs leading-relaxed text-flow-text-secondary transition-colors hover:border-flow-border-accent hover:bg-flow-surface/40 hover:text-flow-text-primary";

/** Row under the block: hint left, “Copied” (or other notice) bottom-right. */
export const clickCopyPathFooterClassName =
  "flex min-w-0 items-end justify-between gap-2";

export const clickCopyPathHintClassName = "min-w-0 flex-1 text-[10px] text-flow-text-muted";

export const clickCopyPathNoticeClassName = "text-[10px] font-medium text-flow-accent-green";

const COPY_FLASH_MS = 1600;

type Props = {
  /** Text shown in the block and written to the clipboard when uncontrolled (trimmed). */
  value: string;
  /** Shown under the block on the left. */
  hint?: string;
  /**
   * With `onCopy`: parent-owned feedback (e.g. "Copied") shown bottom-right; parent clears after delay.
   * Without `onCopy`: ignored; the component manages copy + flash internally.
   */
  notice?: string | null;
  /** When set, invoked on click instead of writing `value` here; pair with `notice` for feedback. */
  onCopy?: () => void | Promise<void>;
};

/**
 * Standard path/URL click-to-copy control: mono block + footer (hint + optional notice).
 * Use exported `clickCopyPath*` class names when you need the same look without this wrapper.
 */
export function ClickCopyPathBlock({
  value,
  hint = "Click to copy",
  notice: controlledNotice,
  onCopy,
}: Props) {
  const trimmed = value.trim();
  const [internalNotice, setInternalNotice] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isControlled = typeof onCopy === "function";

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const flash = (label: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setInternalNotice(label);
    timerRef.current = setTimeout(() => {
      setInternalNotice(null);
      timerRef.current = null;
    }, COPY_FLASH_MS);
  };

  if (!trimmed) return null;

  const handleClick = async () => {
    if (onCopy) {
      await onCopy();
      return;
    }
    try {
      await navigator.clipboard.writeText(trimmed);
      flash("Copied");
    } catch {
      /* ignore */
    }
  };

  const notice = isControlled ? (controlledNotice ?? null) : internalNotice;

  return (
    <div className="space-y-1">
      <FlowTooltip label="Copy to clipboard">
        <button
          type="button"
          onClick={() => void handleClick()}
          className={clickCopyPathBlockButtonClassName}
        >
          {trimmed}
        </button>
      </FlowTooltip>
      <div className={clickCopyPathFooterClassName}>
        <p className={clickCopyPathHintClassName}>{hint}</p>
        {notice ? (
          <span className={`${clickCopyPathNoticeClassName} shrink-0`}>{notice}</span>
        ) : null}
      </div>
    </div>
  );
}
