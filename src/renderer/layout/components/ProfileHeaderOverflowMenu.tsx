import { useEffect, useRef, useState } from "react";
import {
  MoreHorizontal,
  Settings,
  Copy,
  Trash2,
  Plus,
} from "lucide-react";

type ProfileHeaderOverflowMenuProps = {
  disabled: boolean;
  onSettings: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onNewProfile: () => void;
};

export function ProfileHeaderOverflowMenu({
  disabled,
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
        className={`inline-flex items-center justify-center rounded-lg p-2 md:px-3 md:py-2.5 text-flow-text-secondary border border-flow-border/60 bg-flow-surface/90 hover:bg-flow-surface-elevated hover:text-flow-text-primary hover:border-flow-border-accent/50 transition-all duration-150 ease-out ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
        title="More actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreHorizontal className="w-4 h-4" />
        <span className="sr-only">More profile actions</span>
      </button>
      {open && !disabled ? (
        <div
          className="absolute right-0 top-full z-[70] mt-1.5 min-w-[12rem] rounded-xl border border-flow-border/60 bg-flow-surface-elevated py-1 shadow-flow-shadow-lg"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary"
            onClick={() => run(onNewProfile)}
          >
            <Plus className="w-4 h-4 shrink-0" />
            New profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary"
            onClick={() => run(onSettings)}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Profile settings
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary"
            onClick={() => run(onDuplicate)}
          >
            <Copy className="w-4 h-4 shrink-0" />
            Duplicate
          </button>
          <div className="my-1 h-px bg-flow-border/60" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-flow-accent-red hover:bg-flow-accent-red/10"
            onClick={() => run(onDelete)}
          >
            <Trash2 className="w-4 h-4 shrink-0" />
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
