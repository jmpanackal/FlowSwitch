import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const MENU_MAX_H_PX = 224; // matches max-h-56

type SidebarOverlayMenuPlacement = "align-end" | "right-start";

type SidebarOverlayMenuProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  /**
   * When nested menus each use their own portal, outside-click on the parent
   * would see submenu clicks as “outside”. Pass the same id on parent + child
   * so pointer targets inside `[data-flow-menu-stack="…"]` do not close the parent.
   */
  menuStackId?: string;
  children: React.ReactNode;
  /**
   * When true, avoid the compact max-height + internal scroll used for long per-row menus.
   * Library filter/sort popovers are short; this shows full content without a scrollbar.
   */
  unconstrainedHeight?: boolean;
  /**
   * How to position relative to `anchorEl`.
   * - `align-end`: default dropdown, aligns right edge to anchor right edge.
   * - `right-start`: cascading submenu, prefers opening to the right of the anchor.
   */
  placement?: SidebarOverlayMenuPlacement;
};

/**
 * Renders a dropdown fixed to the viewport so it is not clipped by
 * `overflow-y-auto` sidebar lists (and does not inflate list scroll height).
 */
export function SidebarOverlayMenu({
  open,
  anchorEl,
  onClose,
  menuStackId,
  children,
  unconstrainedHeight = false,
  placement = "align-end",
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

    if (unconstrainedHeight) {
      menu.style.maxHeight = "";
      menu.style.overflowY = "visible";
    } else {
      menu.style.maxHeight = `${MENU_MAX_H_PX}px`;
    }

    const mw = Math.min(menu.offsetWidth, vw - margin * 2);

    let left = r.right - mw;
    let top = r.bottom + margin;

    if (placement === "right-start") {
      // Prefer opening to the right of the anchor (cascading submenu).
      const preferredLeft = r.right + margin;
      const fitsRight = preferredLeft + mw <= vw - margin;
      if (fitsRight) {
        left = preferredLeft;
      } else {
        // Fallback: open to the left of the anchor.
        left = r.left - margin - mw;
      }
      top = r.top - 4;
    }

    left = Math.max(margin, Math.min(left, vw - mw - margin));

    let h = menu.offsetHeight;
    if (top + h > vh - margin) {
      const aboveTop = r.top - margin - h;
      if (aboveTop >= margin) {
        top = aboveTop;
      } else if (unconstrainedHeight) {
        const maxH = Math.max(120, vh - margin * 2);
        menu.style.maxHeight = `${maxH}px`;
        menu.style.overflowY = "auto";
        h = menu.offsetHeight;
        if (top + h > vh - margin) {
          top = Math.max(margin, vh - margin - h);
        }
      } else {
        const maxH = Math.max(120, vh - top - margin);
        menu.style.maxHeight = `${maxH}px`;
        h = menu.offsetHeight;
        if (top + h > vh - margin) {
          top = Math.max(margin, vh - margin - h);
        }
      }
    }
    top = Math.max(margin, top);

    menu.style.position = "fixed";
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.zIndex = "30000";
  }, [open, anchorEl, layoutTick, unconstrainedHeight, placement]);

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
      if (menuStackId && t instanceof Element) {
        const stackHost = t.closest("[data-flow-menu-stack]");
        if (
          stackHost
          && stackHost.getAttribute("data-flow-menu-stack") === menuStackId
        ) {
          return;
        }
      }
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
  }, [open, onClose, anchorEl, menuStackId]);

  if (!open || !anchorEl) return null;

  const panelClass = unconstrainedHeight
    ? "flow-menu-panel flow-menu-panel--compact flow-menu-panel-enter max-h-none overflow-visible py-0.5"
    : "flow-menu-panel flow-menu-panel--compact flow-menu-panel-enter scrollbar-elegant max-h-56 overflow-y-auto py-0.5";

  return createPortal(
    <div
      ref={menuRef}
      className={panelClass}
      role="menu"
      data-flow-menu-stack={menuStackId}
    >
      {children}
    </div>,
    document.body,
  );
}
