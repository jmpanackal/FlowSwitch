import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutGrid, Plus, Scan } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";

type NewProfileMenuProps = {
  disabled: boolean;
  busy?: boolean;
  onCreateEmpty: () => void;
  onCaptureCurrentLayout: () => void;
  /** When set, replaces the default compact trigger (e.g. library toolbar pill). */
  triggerClassName?: string;
};

const menuPanelClass =
  "flow-menu-panel flow-menu-panel-enter absolute right-0 top-full z-[30000] mt-1.5 min-w-[12.5rem]";

export function NewProfileMenu({
  disabled,
  busy = false,
  onCreateEmpty,
  onCaptureCurrentLayout,
  triggerClassName,
}: NewProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const t = window.setTimeout(() => {
      document.addEventListener("click", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("click", onDoc);
    };
  }, [open]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const blocked = disabled || busy;

  const triggerHint =
    blocked && !disabled
      ? "Please wait…"
      : disabled
        ? "Cannot create a profile while in edit mode"
        : "New profile — empty layout or capture current layout";

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <FlowTooltip label={triggerHint}>
        <span className="inline-flex">
          <button
            type="button"
            disabled={blocked}
            onClick={(e) => {
              e.stopPropagation();
              if (!blocked) setOpen((v) => !v);
            }}
            className={
              triggerClassName
                ? `${triggerClassName}${
                    blocked ? " cursor-not-allowed opacity-50" : ""
                  }`
                : `inline-flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-xs transition-all duration-150 ease-out ${
                    blocked
                      ? "cursor-not-allowed text-flow-text-muted opacity-50"
                      : "text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary"
                  }`
            }
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={triggerHint}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <ChevronDown
              className={`h-3 w-3 shrink-0 opacity-80 ${open ? "rotate-180" : ""} transition-transform duration-150`}
              strokeWidth={2}
              aria-hidden
            />
          </button>
        </span>
      </FlowTooltip>
      {open && !blocked ? (
        <div className={menuPanelClass} role="menu">
          <button
            type="button"
            role="menuitem"
            className="flow-menu-item"
            onClick={() => run(onCreateEmpty)}
          >
            <LayoutGrid className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
            Empty layout
          </button>
          <button
            type="button"
            role="menuitem"
            className="flow-menu-item"
            onClick={() => run(onCaptureCurrentLayout)}
          >
            <Scan className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
            Capture current layout
          </button>
        </div>
      ) : null}
    </div>
  );
}
