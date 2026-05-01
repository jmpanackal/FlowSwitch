import { useState, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Grid3X3, ChevronDown } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";

/** Preset panel width matches `min(26rem, …)` for viewport clamp math. */
const PRESET_PANEL_WIDTH_PX = 416;
const PRESET_PANEL_MARGIN = 12;
/** Title row + padding + divider (approx.) before the scrollable grid. */
const PRESET_PANEL_HEADER_PX = 72;
const PRESET_GRID_MAX_PX = 21 * 16;

interface MonitorLayoutConfigProps {
  monitor: {
    id: string;
    name: string;
    orientation: 'landscape' | 'portrait';
    predefinedLayout: string | null;
    apps: any[];
  };
  onLayoutChange: (monitorId: string, layout: string | null) => void;
  isDropdown?: boolean;
}

// Visual Layout Preview Component (card selection is shown only on the outer preset tile)
function LayoutPreview({
  layout,
  orientation,
}: {
  layout: any;
  orientation: "landscape" | "portrait";
}) {
  const isPortrait = orientation === "portrait";
  const containerClass = isPortrait ? "w-8 h-12" : "w-12 h-8";

  return (
    <div
      className={`relative ${containerClass} rounded border-2 border-white/[0.22] bg-flow-bg-tertiary/90 shadow-inner shadow-black/20 transition-all duration-200`}
    >
      {layout.slots.map((slot: any, index: number) => (
        <div
          key={index}
          className="absolute rounded-sm border border-white/30 bg-flow-accent-blue/35 transition-all duration-200"
          style={{
            left: `${slot.position.x - slot.size.width/2}%`,
            top: `${slot.position.y - slot.size.height/2}%`,
            width: `${slot.size.width}%`,
            height: `${slot.size.height}%`,
          }}
        />
      ))}
    </div>
  );
}

// Horizontal Monitor Layouts
const LANDSCAPE_LAYOUTS = {
  'fullscreen': {
    name: 'Fullscreen',
    maxApps: 1,
    slots: [
      { id: 'full', position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }
    ]
  },
  'side-by-side': {
    name: 'Side by Side',
    maxApps: 2,
    slots: [
      { id: 'left', position: { x: 25, y: 50 }, size: { width: 50, height: 100 } },
      { id: 'right', position: { x: 75, y: 50 }, size: { width: 50, height: 100 } }
    ]
  },
  'golden-left': {
    name: 'Golden Left',
    maxApps: 2,
    slots: [
      { id: 'left', position: { x: 30.9, y: 50 }, size: { width: 61.8, height: 100 } },
      { id: 'right', position: { x: 80.9, y: 50 }, size: { width: 38.2, height: 100 } }
    ]
  },
  'golden-right': {
    name: 'Golden Right',
    maxApps: 2,
    slots: [
      { id: 'left', position: { x: 19.1, y: 50 }, size: { width: 38.2, height: 100 } },
      { id: 'right', position: { x: 69.1, y: 50 }, size: { width: 61.8, height: 100 } }
    ]
  },
  'top-bottom': {
    name: 'Top/Bottom',
    maxApps: 2,
    slots: [
      { id: 'top', position: { x: 50, y: 25 }, size: { width: 100, height: 50 } },
      { id: 'bottom', position: { x: 50, y: 75 }, size: { width: 100, height: 50 } }
    ]
  },
  '3-columns': {
    name: '3 Columns',
    maxApps: 3,
    slots: [
      { id: 'left', position: { x: 16.67, y: 50 }, size: { width: 33.33, height: 100 } },
      { id: 'center', position: { x: 50, y: 50 }, size: { width: 33.33, height: 100 } },
      { id: 'right', position: { x: 83.33, y: 50 }, size: { width: 33.33, height: 100 } }
    ]
  },
  'left-stack': {
    name: 'Left + Stack',
    maxApps: 3,
    slots: [
      { id: 'left', position: { x: 33.33, y: 50 }, size: { width: 66.66, height: 100 } },
      { id: 'right-top', position: { x: 83.33, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'right-bottom', position: { x: 83.33, y: 75 }, size: { width: 33.33, height: 50 } }
    ]
  },
  'right-stack': {
    name: 'Right + Stack',
    maxApps: 3,
    slots: [
      { id: 'right', position: { x: 66.67, y: 50 }, size: { width: 66.66, height: 100 } },
      { id: 'left-top', position: { x: 16.67, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'left-bottom', position: { x: 16.67, y: 75 }, size: { width: 33.33, height: 50 } }
    ]
  },
  'wide-center': {
    name: 'Wide Center',
    maxApps: 3,
    slots: [
      { id: 'left', position: { x: 10, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'center', position: { x: 50, y: 50 }, size: { width: 60, height: 100 } },
      { id: 'right', position: { x: 90, y: 50 }, size: { width: 20, height: 100 } }
    ]
  },
  '4-quadrants': {
    name: '4 Quadrants',
    maxApps: 4,
    slots: [
      { id: 'top-left', position: { x: 25, y: 25 }, size: { width: 50, height: 50 } },
      { id: 'top-right', position: { x: 75, y: 25 }, size: { width: 50, height: 50 } },
      { id: 'bottom-left', position: { x: 25, y: 75 }, size: { width: 50, height: 50 } },
      { id: 'bottom-right', position: { x: 75, y: 75 }, size: { width: 50, height: 50 } }
    ]
  },
  '4-panels': {
    name: '4 Panels',
    maxApps: 4,
    slots: [
      { id: 'panel-1', position: { x: 12.5, y: 50 }, size: { width: 25, height: 100 } },
      { id: 'panel-2', position: { x: 37.5, y: 50 }, size: { width: 25, height: 100 } },
      { id: 'panel-3', position: { x: 62.5, y: 50 }, size: { width: 25, height: 100 } },
      { id: 'panel-4', position: { x: 87.5, y: 50 }, size: { width: 25, height: 100 } }
    ]
  },
  '5-panels': {
    name: '5 Panels',
    maxApps: 5,
    slots: [
      { id: 'panel-1', position: { x: 10, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'panel-2', position: { x: 30, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'panel-3', position: { x: 50, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'panel-4', position: { x: 70, y: 50 }, size: { width: 20, height: 100 } },
      { id: 'panel-5', position: { x: 90, y: 50 }, size: { width: 20, height: 100 } }
    ]
  },
  '3x2-grid': {
    name: '3x2 Grid',
    maxApps: 6,
    slots: [
      { id: 'top-left', position: { x: 16.67, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'top-center', position: { x: 50, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'top-right', position: { x: 83.33, y: 25 }, size: { width: 33.33, height: 50 } },
      { id: 'bottom-left', position: { x: 16.67, y: 75 }, size: { width: 33.33, height: 50 } },
      { id: 'bottom-center', position: { x: 50, y: 75 }, size: { width: 33.33, height: 50 } },
      { id: 'bottom-right', position: { x: 83.33, y: 75 }, size: { width: 33.33, height: 50 } }
    ]
  }
};

// Vertical Monitor Layouts
const PORTRAIT_LAYOUTS = {
  'fullscreen': {
    name: 'Fullscreen',
    maxApps: 1,
    slots: [
      { id: 'full', position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }
    ]
  },
  'top-bottom': {
    name: 'Top/Bottom',
    maxApps: 2,
    slots: [
      { id: 'top', position: { x: 50, y: 25 }, size: { width: 100, height: 50 } },
      { id: 'bottom', position: { x: 50, y: 75 }, size: { width: 100, height: 50 } }
    ]
  },
  'golden-top': {
    name: 'Golden Top',
    maxApps: 2,
    slots: [
      { id: 'top', position: { x: 50, y: 30.9 }, size: { width: 100, height: 61.8 } },
      { id: 'bottom', position: { x: 50, y: 80.9 }, size: { width: 100, height: 38.2 } }
    ]
  },
  'golden-bottom': {
    name: 'Golden Bot',
    maxApps: 2,
    slots: [
      { id: 'top', position: { x: 50, y: 19.1 }, size: { width: 100, height: 38.2 } },
      { id: 'bottom', position: { x: 50, y: 69.1 }, size: { width: 100, height: 61.8 } }
    ]
  },
  '3-rows': {
    name: '3 Rows',
    maxApps: 3,
    slots: [
      { id: 'top', position: { x: 50, y: 16.67 }, size: { width: 100, height: 33.33 } },
      { id: 'middle', position: { x: 50, y: 50 }, size: { width: 100, height: 33.33 } },
      { id: 'bottom', position: { x: 50, y: 83.33 }, size: { width: 100, height: 33.33 } }
    ]
  },
  'tall-center': {
    name: 'Tall Center',
    maxApps: 3,
    slots: [
      { id: 'top', position: { x: 50, y: 7.5 }, size: { width: 100, height: 15 } },
      { id: 'center', position: { x: 50, y: 50 }, size: { width: 100, height: 70 } },
      { id: 'bottom', position: { x: 50, y: 92.5 }, size: { width: 100, height: 15 } }
    ]
  },
  'top-split': {
    name: 'Top + Split',
    maxApps: 3,
    slots: [
      { id: 'top', position: { x: 50, y: 33.33 }, size: { width: 100, height: 66.66 } },
      { id: 'bottom-left', position: { x: 25, y: 83.33 }, size: { width: 50, height: 33.33 } },
      { id: 'bottom-right', position: { x: 75, y: 83.33 }, size: { width: 50, height: 33.33 } }
    ]
  },
  'bot-split': {
    name: 'Bot + Split',
    maxApps: 3,
    slots: [
      { id: 'bottom', position: { x: 50, y: 66.67 }, size: { width: 100, height: 66.66 } },
      { id: 'top-left', position: { x: 25, y: 16.67 }, size: { width: 50, height: 33.33 } },
      { id: 'top-right', position: { x: 75, y: 16.67 }, size: { width: 50, height: 33.33 } }
    ]
  },
  '4-panels': {
    name: '4 Panels',
    maxApps: 4,
    slots: [
      { id: 'panel-1', position: { x: 50, y: 12.5 }, size: { width: 100, height: 25 } },
      { id: 'panel-2', position: { x: 50, y: 37.5 }, size: { width: 100, height: 25 } },
      { id: 'panel-3', position: { x: 50, y: 62.5 }, size: { width: 100, height: 25 } },
      { id: 'panel-4', position: { x: 50, y: 87.5 }, size: { width: 100, height: 25 } }
    ]
  },
  '2x2-grid': {
    name: '2x2 Grid',
    maxApps: 4,
    slots: [
      { id: 'top-left', position: { x: 25, y: 25 }, size: { width: 50, height: 50 } },
      { id: 'top-right', position: { x: 75, y: 25 }, size: { width: 50, height: 50 } },
      { id: 'bottom-left', position: { x: 25, y: 75 }, size: { width: 50, height: 50 } },
      { id: 'bottom-right', position: { x: 75, y: 75 }, size: { width: 50, height: 50 } }
    ]
  }
};

type PresetPanelPlacement = "below" | "above";

type PresetPanelRect = {
  top: number;
  left: number;
  width: number;
  gridMaxHeight: number;
  /** Horizontal center of caret from panel’s left edge (viewport px). */
  caretOffsetPx: number;
  placement: PresetPanelPlacement;
};

const PRESET_TRIGGER_GAP_PX = 8;
const PRESET_GRID_MIN_PX = 120;

/**
 * Anchor the panel to the layout trigger like a dropdown: centered on the
 * button horizontally, opening below when possible else above — never
 * detached to the viewport top. Caret offset ties the panel to the trigger.
 */
function computePresetPanelPosition(triggerRect: DOMRect): PresetPanelRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const m = PRESET_PANEL_MARGIN;
  const width = Math.min(PRESET_PANEL_WIDTH_PX, vw - m * 2);

  let left = triggerRect.left + triggerRect.width / 2 - width / 2;
  left = Math.max(m, Math.min(left, vw - width - m));

  const header = PRESET_PANEL_HEADER_PX;
  const maxGridCap = PRESET_GRID_MAX_PX;

  const belowTop = triggerRect.bottom + PRESET_TRIGGER_GAP_PX;
  const maxBelowGrid = vh - m - belowTop - header;

  const spaceAbove = triggerRect.top - m - PRESET_TRIGGER_GAP_PX;
  const maxAboveGrid = spaceAbove - header;

  let top: number;
  let placement: PresetPanelPlacement;
  let gridMaxHeight: number;

  const preferBelow =
    maxBelowGrid >= PRESET_GRID_MIN_PX || maxBelowGrid >= maxAboveGrid;

  if (preferBelow && maxBelowGrid >= PRESET_GRID_MIN_PX) {
    placement = "below";
    top = belowTop;
    gridMaxHeight = Math.max(
      PRESET_GRID_MIN_PX,
      Math.min(maxGridCap, maxBelowGrid),
    );
  } else if (maxAboveGrid >= PRESET_GRID_MIN_PX) {
    placement = "above";
    gridMaxHeight = Math.max(
      PRESET_GRID_MIN_PX,
      Math.min(maxGridCap, maxAboveGrid),
    );
    const totalH = header + gridMaxHeight;
    top = triggerRect.top - PRESET_TRIGGER_GAP_PX - totalH;
    top = Math.max(m, top);
  } else {
    placement = "below";
    top = belowTop;
    gridMaxHeight = Math.max(
      PRESET_GRID_MIN_PX,
      Math.min(maxGridCap, Math.max(0, maxBelowGrid)),
    );
  }

  const triggerMidX = triggerRect.left + triggerRect.width / 2;
  const caretCenterX = triggerMidX - left;
  const caretClamp = 18;
  const caretOffsetPx = Math.min(
    width - caretClamp,
    Math.max(caretClamp, caretCenterX),
  );

  return { top, left, width, gridMaxHeight, caretOffsetPx, placement };
}

export function MonitorLayoutConfig({ monitor, onLayoutChange, isDropdown = false }: MonitorLayoutConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [panelRect, setPanelRect] = useState<PresetPanelRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const layouts = monitor.orientation === 'portrait' ? PORTRAIT_LAYOUTS : LANDSCAPE_LAYOUTS;
  const currentLayout = monitor.predefinedLayout ? layouts[monitor.predefinedLayout as keyof typeof layouts] : null;
  
  const handleLayoutSelect = (layoutKey: string | null) => {
    onLayoutChange(monitor.id, layoutKey);
    setIsOpen(false);
  };

  const layoutEntries = Object.entries(layouts);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelRect(null);
      return;
    }
    const run = () => {
      const el = triggerRef.current;
      if (!el) return;
      setPanelRect(computePresetPanelPosition(el.getBoundingClientRect()));
    };
    run();
    const raf = requestAnimationFrame(run);
    window.addEventListener("resize", run);
    window.addEventListener("scroll", run, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", run);
      window.removeEventListener("scroll", run, true);
    };
  }, [isOpen]);
  
  return (
    <div className="relative">
      <FlowTooltip label="Choose layout pattern">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/[0.12] ${
            isDropdown ? "" : ""
          }`}
        >
          <Grid3X3 className="w-3 h-3" />
          <span>{currentLayout?.name || 'Dynamic'}</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </FlowTooltip>
      
      {isOpen &&
        createPortal(
          <>
            {/* Portal to body: monitor previews use CSS transform; fixed descendants would mis-align with viewport rects */}
            <div
              className="fixed inset-0 z-[8000] bg-black/45"
              aria-hidden
              onClick={() => setIsOpen(false)}
            />

            {panelRect ? (
              <div
                style={{
                  position: "fixed",
                  top: panelRect.top,
                  left: panelRect.left,
                  width: panelRect.width,
                  zIndex: 8001,
                }}
                className="relative flow-modal-panel-enter overflow-visible"
              >
                {panelRect.placement === "below" ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-2 z-10"
                    style={{
                      left: panelRect.caretOffsetPx,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <div
                      className="h-0 w-0 border-x-[7px] border-x-transparent border-b-[8px] border-b-flow-bg-secondary border-t-0"
                      style={{
                        filter:
                          "drop-shadow(0 -1px 0 rgba(255,255,255,0.14))",
                      }}
                    />
                  </div>
                ) : null}

                <div className="rounded-xl border border-white/[0.22] bg-flow-bg-secondary p-3 shadow-2xl shadow-black/50 ring-1 ring-black/30">
            <div className="mb-3 flex items-center justify-between border-b border-white/[0.08] pb-2.5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-flow-text-muted">
                  Layout Presets
                </div>
                <div className="text-[11px] text-flow-text-muted/90">
                  {monitor.orientation === "portrait" ? "Portrait" : "Landscape"} monitor
                </div>
              </div>
            </div>

            <div
              className="grid grid-cols-4 gap-3 overflow-y-auto px-1.5 py-1 pr-2 scrollbar-elegant"
              style={{ maxHeight: panelRect.gridMaxHeight }}
            >
              <button
                type="button"
                onClick={() => handleLayoutSelect(null)}
                className={`rounded-lg border-2 p-2.5 text-left shadow-sm transition-colors ${
                  !monitor.predefinedLayout
                    ? "border-flow-accent-blue bg-flow-bg-tertiary"
                    : "border-white/[0.18] bg-flow-bg-tertiary hover:border-flow-accent-blue/45"
                }`}
              >
                <div
                  className="mb-1.5 flex h-10 w-full items-center justify-center rounded-md border border-white/[0.22] bg-black/40 text-[11px] font-medium text-flow-text-muted"
                >
                  Auto
                </div>
                <div className="flex items-center gap-1">
                  <span className="truncate text-[11px] font-medium text-flow-text-primary">
                    Dynamic
                  </span>
                </div>
              </button>

              {layoutEntries.map(([key, layout]) => (
                <button
                  type="button"
                  key={key}
                  onClick={() => handleLayoutSelect(key)}
                  className={`rounded-lg border-2 p-2.5 text-left shadow-sm transition-colors ${
                    monitor.predefinedLayout === key
                      ? "border-flow-accent-blue bg-flow-bg-tertiary"
                      : "border-white/[0.18] bg-flow-bg-tertiary hover:border-flow-accent-blue/45"
                  }`}
                >
                  <div className="mb-1.5 flex justify-center">
                    <LayoutPreview
                      layout={layout}
                      orientation={monitor.orientation}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[11px] font-medium text-flow-text-primary">
                      {layout.name}
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-flow-text-muted">
                    {layout.maxApps} app{layout.maxApps === 1 ? '' : 's'}
                  </div>
                </button>
              ))}
            </div>
                </div>

                {panelRect.placement === "above" ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-2 z-10"
                    style={{
                      left: panelRect.caretOffsetPx,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <div
                      className="h-0 w-0 border-x-[7px] border-x-transparent border-b-0 border-t-[8px] border-t-flow-bg-secondary"
                      style={{
                        filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.14))",
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>,
          document.body,
        )}
    </div>
  );
}