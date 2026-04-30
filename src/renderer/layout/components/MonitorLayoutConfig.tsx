import { useState } from "react";
import { Grid3X3, Check, ChevronDown } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";

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

// Visual Layout Preview Component
function LayoutPreview({ layout, orientation, isSelected }: { 
  layout: any; 
  orientation: 'landscape' | 'portrait';
  isSelected: boolean;
}) {
  const isPortrait = orientation === 'portrait';
  const containerClass = isPortrait ? 'w-8 h-12' : 'w-12 h-8';
  
  return (
    <div className={`relative ${containerClass} bg-flow-bg-tertiary border-2 rounded transition-all duration-200 ${
      isSelected ? 'border-flow-accent-blue' : 'border-flow-border'
    }`}>
      {layout.slots.map((slot: any, index: number) => (
        <div
          key={index}
          className={`absolute bg-flow-accent-blue/40 border border-flow-accent-blue/60 rounded-sm transition-all duration-200 ${
            isSelected ? 'bg-flow-accent-blue/60' : ''
          }`}
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

export function MonitorLayoutConfig({ monitor, onLayoutChange, isDropdown = false }: MonitorLayoutConfigProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const layouts = monitor.orientation === 'portrait' ? PORTRAIT_LAYOUTS : LANDSCAPE_LAYOUTS;
  const currentLayout = monitor.predefinedLayout ? layouts[monitor.predefinedLayout as keyof typeof layouts] : null;
  
  const handleLayoutSelect = (layoutKey: string | null) => {
    onLayoutChange(monitor.id, layoutKey);
    setIsOpen(false);
  };

  const layoutEntries = Object.entries(layouts);
  
  return (
    <div className="relative">
      <FlowTooltip label="Choose layout pattern">
        <button
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
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Layout Selection Popup */}
          <div className="absolute left-1/2 top-full z-50 mt-2 w-[26rem] -translate-x-1/2 rounded-xl border border-white/15 bg-flow-bg-secondary/95 p-3 shadow-xl backdrop-blur-md flow-modal-panel-enter">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-flow-text-muted">
                  Layout Presets
                </div>
                <div className="text-[11px] text-flow-text-muted/90">
                  {monitor.orientation === "portrait" ? "Portrait" : "Landscape"} monitor
                </div>
              </div>
            </div>

            <div className="grid max-h-[21rem] grid-cols-4 gap-2 overflow-y-auto pr-1 scrollbar-elegant">
              <button
                onClick={() => handleLayoutSelect(null)}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  !monitor.predefinedLayout 
                    ? 'border-flow-accent-blue/55 bg-flow-accent-blue/18' 
                    : 'border-white/10 bg-black/20 hover:border-flow-accent-blue/40 hover:bg-black/30'
                }`}
              >
                <div className={`mb-1.5 flex h-10 w-full items-center justify-center rounded border text-[11px] ${
                  !monitor.predefinedLayout ? "border-flow-accent-blue text-flow-accent-blue" : "border-white/20 text-flow-text-muted"
                }`}>
                  Auto
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className={`truncate text-[11px] font-medium ${
                    !monitor.predefinedLayout ? "text-flow-accent-blue" : "text-flow-text-primary"
                  }`}>
                    Dynamic
                  </span>
                  {!monitor.predefinedLayout ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-flow-accent-blue" />
                  ) : null}
                </div>
              </button>

              {layoutEntries.map(([key, layout]) => (
                <button
                  key={key}
                  onClick={() => handleLayoutSelect(key)}
                  className={`rounded-lg border p-2 text-left transition-colors ${
                    monitor.predefinedLayout === key
                      ? 'border-flow-accent-blue/55 bg-flow-accent-blue/18' 
                      : 'border-white/10 bg-black/20 hover:border-flow-accent-blue/40 hover:bg-black/30'
                  }`}
                >
                  <div className="mb-1.5 flex justify-center">
                    <LayoutPreview 
                      layout={layout} 
                      orientation={monitor.orientation}
                      isSelected={monitor.predefinedLayout === key}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <span className={`truncate text-[11px] font-medium ${
                      monitor.predefinedLayout === key ? 'text-flow-accent-blue' : 'text-flow-text-primary'
                    }`}>
                      {layout.name}
                    </span>
                    {monitor.predefinedLayout === key ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-flow-accent-blue" />
                    ) : null}
                  </div>
                  <div className="truncate text-[10px] text-flow-text-muted">
                    {layout.maxApps} app{layout.maxApps === 1 ? '' : 's'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}