import { useEffect, useRef, useState } from "react";
import { LayoutGrid, Plus, Scan } from "lucide-react";

type NewProfileMenuProps = {
  disabled: boolean;
  busy?: boolean;
  onCreateEmpty: () => void;
  onCaptureCurrentLayout: () => void;
};

const menuPanelClass =
  "flow-menu-panel absolute right-0 top-full z-[30000] mt-1.5 min-w-[12.5rem]";

export function NewProfileMenu({
  disabled,
  busy = false,
  onCreateEmpty,
  onCaptureCurrentLayout,
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={blocked}
        onClick={(e) => {
          e.stopPropagation();
          if (!blocked) setOpen((v) => !v);
        }}
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-all duration-150 ease-out ${
          blocked
            ? "text-flow-text-muted cursor-not-allowed opacity-50"
            : "text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary"
        }`}
        title={
          blocked && !disabled
            ? "Please wait…"
            : disabled
              ? "Cannot create a profile while in edit mode"
              : "Create profile"
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus className="w-3 h-3 shrink-0" strokeWidth={2} />
        {busy ? "Working…" : "New"}
      </button>
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
