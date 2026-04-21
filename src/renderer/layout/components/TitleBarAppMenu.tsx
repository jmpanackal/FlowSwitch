import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Info, Settings } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";

type TitleBarAppMenuProps = {
  onAppPreferences: () => void;
  onAbout: () => void;
};

export function TitleBarAppMenu({
  onAppPreferences,
  onAbout,
}: TitleBarAppMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuRect(null);
      return;
    }
    const el = triggerRef.current;
    const update = () => {
      const r = el.getBoundingClientRect();
      setMenuRect({
        top: r.bottom + 6,
        left: r.left,
        minWidth: Math.max(r.width, 13.5 * 16),
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t)) {
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

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const menu =
    open && menuRect
      ? createPortal(
          <div
            className="flow-menu-panel fixed z-[30000]"
            style={{
              top: menuRect.top,
              left: menuRect.left,
              minWidth: menuRect.minWidth,
            }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="flow-menu-item"
              onClick={() => run(onAppPreferences)}
            >
              <Settings className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
              App preferences…
            </button>
            <div className="my-1 h-px bg-white/[0.08]" />
            <button
              type="button"
              role="menuitem"
              className="flow-menu-item"
              onClick={() => run(onAbout)}
            >
              <Info className="h-4 w-4 shrink-0 opacity-90" strokeWidth={1.75} />
              About FlowSwitch
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="app-no-drag relative" ref={rootRef}>
      <FlowTooltip label="FlowSwitch menu" side="bottom">
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-flow-text-primary transition-colors hover:bg-white/[0.08]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <img
          src="/flowswitch-logo.png"
          alt=""
          className="h-7 w-7 shrink-0 rounded-md object-contain"
          width={28}
          height={28}
        />
        <span className="truncate text-sm font-semibold tracking-tight">
          FlowSwitch
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-flow-text-muted transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      </FlowTooltip>
      {menu}
    </div>
  );
}
