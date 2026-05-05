import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Info, Settings } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";

const MENU_ID = "flowswitch-titlebar-app-menu";

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  const focusTrigger = useCallback(() => {
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

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
        minWidth: Math.max(r.width, 12 * 16),
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [open]);

  /** Focus first menu item after portal paint. */
  useLayoutEffect(() => {
    if (!open || !menuRect) return;
    const id = window.requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector(
        "[role=\"menuitem\"]",
      ) as HTMLElement | null;
      first?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, menuRect]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) {
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      focusTrigger();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, closeMenu, focusTrigger]);

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!menuRef.current) return;
    const items = Array.from(
      menuRef.current.querySelectorAll<HTMLElement>("[role=\"menuitem\"]"),
    );
    if (items.length === 0) return;

    const active = document.activeElement;
    let index =
      active instanceof HTMLElement ? items.indexOf(active) : -1;
    if (index < 0) index = 0;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const next = items[Math.min(index + 1, items.length - 1)];
        next?.focus();
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = items[Math.max(index - 1, 0)];
        prev?.focus();
        break;
      }
      case "Home": {
        e.preventDefault();
        items[0]?.focus();
        break;
      }
      case "End": {
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
      }
      default:
        break;
    }
  };

  const menu =
    open && menuRect
      ? createPortal(
          <div
            ref={menuRef}
            id={MENU_ID}
            className="flow-menu-panel flow-menu-panel-enter fixed z-[30000]"
            style={{
              top: menuRect.top,
              left: menuRect.left,
              minWidth: menuRect.minWidth,
            }}
            role="menu"
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
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
    <div className="app-no-drag relative flex shrink-0 items-center" ref={rootRef}>
      <FlowTooltip label="FlowSwitch menu" side="bottom">
        <button
          ref={triggerRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex max-w-full items-center gap-0.5 rounded-md p-0.5 text-flow-text-primary transition-colors hover:bg-white/[0.08]"
          aria-label="FlowSwitch menu"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={open ? MENU_ID : undefined}
        >
          <img
            src={`${import.meta.env.BASE_URL}flowswitch-logo.png`}
            alt=""
            className="h-7 w-7 shrink-0 rounded-md object-contain"
            width={28}
            height={28}
          />
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
