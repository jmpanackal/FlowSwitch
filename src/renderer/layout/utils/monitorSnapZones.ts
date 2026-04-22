/**
 * Snap zone geometry for monitor layout preview and drop placement.
 * Keep aligned with `MonitorLayout` zone logic (single source for predefined + dynamic grids).
 */
export type MonitorSnapZone = {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

// Layout definitions - Horizontal Monitor Layouts
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

/**
 * For dynamic layouts we want to pick the grid based on how many **visual
 * slots** the monitor needs, not how many app records exist. Stacked apps
 * share one slot (same position+size), so two stacked apps = one unit.
 * Without this, stacking on a dynamic monitor inflates the zone grid and
 * fractures the layout on the next recompute.
 */
const UNIT_EPS = 0.5;

export function countStackUnits(apps: { position: { x: number; y: number }; size: { width: number; height: number } }[]): number {
  if (apps.length === 0) return 0;
  const groups: { position: { x: number; y: number }; size: { width: number; height: number } }[] = [];
  for (const app of apps) {
    const match = groups.find(
      (g) =>
        Math.abs(g.position.x - app.position.x) < UNIT_EPS &&
        Math.abs(g.position.y - app.position.y) < UNIT_EPS &&
        Math.abs(g.size.width - app.size.width) < UNIT_EPS &&
        Math.abs(g.size.height - app.size.height) < UNIT_EPS,
    );
    if (!match) {
      groups.push({ position: { ...app.position }, size: { ...app.size } });
    }
  }
  return groups.length;
}

export function getSnapZonesForMonitor(
  monitor: any,
  appCountOverride?: number,
): MonitorSnapZone[] {
    if (monitor.predefinedLayout) {
      const layouts = monitor.orientation === 'portrait' ? PORTRAIT_LAYOUTS : LANDSCAPE_LAYOUTS;
      const layout = layouts[monitor.predefinedLayout as keyof typeof layouts];
      return layout?.slots || [];
    }

    // Count **unit slots** (stacked apps = 1 slot) so the dynamic grid matches
    // what the user sees instead of inflating when apps share a position.
    const totalItems = typeof appCountOverride === 'number'
      ? appCountOverride
      : countStackUnits(monitor.apps || []);
    const isPortrait = monitor.orientation === 'portrait';
    
    if (isPortrait) {
      if (totalItems <= 1) {
        // Match 'fullscreen' layout exactly
        return [
          { id: 'full', position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }
        ];
      } else if (totalItems === 2) {
        // Match 'top-bottom' layout exactly
        return [
          { id: 'top', position: { x: 50, y: 25 }, size: { width: 100, height: 50 } },
          { id: 'bottom', position: { x: 50, y: 75 }, size: { width: 100, height: 50 } }
        ];
      } else if (totalItems === 3) {
        // Match '3-rows' layout exactly
        return [
          { id: 'top', position: { x: 50, y: 16.67 }, size: { width: 100, height: 33.33 } },
          { id: 'middle', position: { x: 50, y: 50 }, size: { width: 100, height: 33.33 } },
          { id: 'bottom', position: { x: 50, y: 83.33 }, size: { width: 100, height: 33.33 } }
        ];
      } else {
        // Match '4-panels' layout exactly
        return [
          { id: 'panel-1', position: { x: 50, y: 12.5 }, size: { width: 100, height: 25 } },
          { id: 'panel-2', position: { x: 50, y: 37.5 }, size: { width: 100, height: 25 } },
          { id: 'panel-3', position: { x: 50, y: 62.5 }, size: { width: 100, height: 25 } },
          { id: 'panel-4', position: { x: 50, y: 87.5 }, size: { width: 100, height: 25 } }
        ];
      }
    } else {
      if (totalItems <= 1) {
        // Match 'fullscreen' layout exactly
        return [
          { id: 'full', position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }
        ];
      } else if (totalItems === 2) {
        // Match 'side-by-side' layout exactly
        return [
          { id: 'left', position: { x: 25, y: 50 }, size: { width: 50, height: 100 } },
          { id: 'right', position: { x: 75, y: 50 }, size: { width: 50, height: 100 } }
        ];
      } else if (totalItems === 3) {
        // Match '3-columns' layout exactly
        return [
          { id: 'left', position: { x: 16.67, y: 50 }, size: { width: 33.33, height: 100 } },
          { id: 'center', position: { x: 50, y: 50 }, size: { width: 33.33, height: 100 } },
          { id: 'right', position: { x: 83.33, y: 50 }, size: { width: 33.33, height: 100 } }
        ];
      } else {
        // Match '4-quadrants' layout exactly
        return [
          { id: 'top-left', position: { x: 25, y: 25 }, size: { width: 50, height: 50 } },
          { id: 'top-right', position: { x: 75, y: 25 }, size: { width: 50, height: 50 } },
          { id: 'bottom-left', position: { x: 25, y: 75 }, size: { width: 50, height: 50 } },
          { id: 'bottom-right', position: { x: 75, y: 75 }, size: { width: 50, height: 50 } }
        ];
      }
    }
  }
