import { useEffect, useRef, useState } from "react";
import {
  MoreHorizontal,
  Settings,
  Copy,
  Trash2,
  Plus,
  Upload,
  Download,
} from "lucide-react";

type ProfileHeaderOverflowMenuProps = {
  disabled: boolean;
  /** Hidden file input id for import (label uses htmlFor). */
  importInputId: string;
  exportDisabled: boolean;
  onExport: () => void;
  onSettings: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onNewProfile: () => void;
};

const menuPanelClass =
  "flow-menu-panel absolute right-0 top-full z-[30000] mt-1.5 min-w-[14rem]";

export function ProfileHeaderOverflowMenu({
  disabled,
  importInputId,
  exportDisabled,
  onExport,
  onSettings,
  onDuplicate,
  onDelete,
  onNewProfile,
}: ProfileHeaderOverflowMenuProps) {
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((v) => !v);
        }}
        className={`inline-flex items-center justify-center rounded-lg p-2 text-flow-text-secondary transition-colors duration-150 ease-out hover:bg-white/[0.06] md:px-2.5 md:py-2 ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
        title="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
        <span className="sr-only">More profile actions</span>
      </button>
      {open && !disabled ? (
        <div className={menuPanelClass} role="menu">
          <button
            type="button"
            role="menuitem"
            className="flow-menu-item"
            onClick={() => run(onSettings)}
          >
            <Settings className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
            Profile preferences…
          </button>
          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            type="button"
            role="menuitem"
            className="flow-menu-item"
            onClick={() => run(onNewProfile)}
          >
            <Plus className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            New profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="flow-menu-item"
            onClick={() => run(onDuplicate)}
          >
            <Copy className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
            Duplicate
          </button>
          <div className="my-1 h-px bg-white/[0.08]" />
          <label
            htmlFor={importInputId}
            role="menuitem"
            className="flow-menu-item cursor-pointer"
            onClick={() => setOpen(false)}
          >
            <Upload className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
            Import profile…
          </label>
          <button
            type="button"
            role="menuitem"
            disabled={exportDisabled}
            className="flow-menu-item disabled:pointer-events-none disabled:opacity-40"
            onClick={() => {
              if (!exportDisabled) run(onExport);
            }}
          >
            <Download className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
            Export profile
          </button>
          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            type="button"
            role="menuitem"
            className="flow-menu-item flow-menu-item-danger"
            onClick={() => run(onDelete)}
          >
            <Trash2 className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
