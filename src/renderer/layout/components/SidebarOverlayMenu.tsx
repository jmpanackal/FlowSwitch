import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const MENU_MAX_H_PX = 224; // matches max-h-56

type SidebarOverlayMenuProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
};

/**
 * Renders a dropdown fixed to the viewport so it is not clipped by
 * `overflow-y-auto` sidebar lists (and does not inflate list scroll height).
 */
export function SidebarOverlayMenu({
  open,
  anchorEl,
  onClose,
  children,
}: SidebarOverlayMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const bumpLayout = useCallback(() => {
    setLayoutTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!open || !anchorEl) return;
    if (!anchorEl.isConnected) onClose();
  }, [open, anchorEl, onClose]);

  useLayoutEffect(() => {
    if (!open || !anchorEl || !menuRef.current) return;

    const menu = menuRef.current;
    const r = anchorEl.getBoundingClientRect();
    const margin = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    menu.style.maxHeight = `${MENU_MAX_H_PX}px`;

    const mw = Math.min(menu.offsetWidth, vw - margin * 2);

    let left = r.right - mw;
    left = Math.max(margin, Math.min(left, vw - mw - margin));

    let top = r.bottom + margin;

    let h = menu.offsetHeight;
    if (top + h > vh - margin) {
      const aboveTop = r.top - margin - h;
      if (aboveTop >= margin) {
        top = aboveTop;
      } else {
        const maxH = Math.max(120, vh - top - margin);
        menu.style.maxHeight = `${maxH}px`;
        h = menu.offsetHeight;
        if (top + h > vh - margin) {
          top = Math.max(margin, vh - margin - h);
        }
      }
    }

    menu.style.position = "fixed";
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.zIndex = "30000";
  }, [open, anchorEl, layoutTick]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => bumpLayout();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, bumpLayout]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorEl?.contains(t)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, anchorEl]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="flow-menu-panel flow-menu-panel--compact scrollbar-elegant max-h-56 overflow-y-auto py-0.5"
      role="menu"
    >
      {children}
    </div>,
    document.body,
  );
}
