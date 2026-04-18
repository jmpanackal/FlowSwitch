'use strict';

const { describeMonitor } = require('../utils/launch-diagnostics');

const buildSystemMonitorSnapshot = () => {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const primaryDisplayId = screen.getPrimaryDisplay().id;

  const monitors = displays.map((display, idx) => {
    let workAreaPhysical = null;
    if (process.platform === 'win32') {
      try {
        workAreaPhysical = screen.dipToScreenRect(null, {
          x: display.workArea.x,
          y: display.workArea.y,
          width: display.workArea.width,
          height: display.workArea.height,
        });
      } catch {
        workAreaPhysical = null;
      }
    }
    return {
      id: `monitor-${display.id}`,
      displayId: display.id,
      name: `Monitor ${idx + 1}`,
      systemName: (display.label && String(display.label).trim()) ? String(display.label).trim() : null,
      primary: display.id === primaryDisplayId,
      scaleFactor: display.scaleFactor,
      resolution: `${Math.round(display.bounds.width * display.scaleFactor)}x${Math.round(display.bounds.height * display.scaleFactor)}`,
      orientation: (
        display.rotation === 90
        || display.rotation === 270
        || display.bounds.height > display.bounds.width
      ) ? 'portrait' : 'landscape',
      layoutPosition: { x: display.bounds.x, y: display.bounds.y },
      bounds: display.bounds,
      workArea: display.workArea,
      workAreaPhysical,
      pixelBounds: {
        x: Math.round(display.bounds.x * display.scaleFactor),
        y: Math.round(display.bounds.y * display.scaleFactor),
        width: Math.round(display.bounds.width * display.scaleFactor),
        height: Math.round(display.bounds.height * display.scaleFactor),
      },
      pixelWorkArea: {
        x: Math.round(display.workArea.x * display.scaleFactor),
        y: Math.round(display.workArea.y * display.scaleFactor),
        width: Math.round(display.workArea.width * display.scaleFactor),
        height: Math.round(display.workArea.height * display.scaleFactor),
      },
      apps: [],
    };
  });

  return monitors.length > 0 ? monitors : [{
    id: 'monitor-1',
    displayId: screen.getPrimaryDisplay().id,
    name: 'Monitor 1',
    systemName: null,
    primary: true,
    scaleFactor: 1,
    resolution: '1920x1080',
    orientation: 'landscape',
    layoutPosition: { x: 0, y: 0 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    workAreaPhysical: null,
    pixelBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    pixelWorkArea: { x: 0, y: 0, width: 1920, height: 1080 },
    apps: [],
  }];
};

/**
 * Electron Display bounds/workArea are DIP; Win32 SetWindowPos in a DPI-aware
 * PowerShell process expects physical screen pixels.
 *
 * `screen.dipToScreenRect(null, rect)` converts using the display nearest to `rect`.
 * Passing a Display object (not BrowserWindow) caused a silent failure in earlier code.
 */
const physicalBoundsFromDip = (dipBounds, diagnostics = null, diagnosticsContext = {}) => {
  if (process.platform !== 'win32' || !dipBounds) return dipBounds;
  try {
    const { screen } = require('electron');
    const rect = {
      x: Math.round(Number(dipBounds.left)),
      y: Math.round(Number(dipBounds.top)),
      width: Math.round(Number(dipBounds.width)),
      height: Math.round(Number(dipBounds.height)),
    };
    const p = screen.dipToScreenRect(null, rect);
    return {
      left: p.x,
      top: p.y,
      width: p.width,
      height: p.height,
      state: dipBounds.state,
    };
  } catch (error) {
    if (diagnostics) {
      diagnostics.failure({
        ...diagnosticsContext,
        event: 'dip-to-physical-conversion-failed',
        reason: 'dip-to-screen-rect-throw',
        dipBounds,
        error: String(error?.message || error || 'unknown-error'),
      });
    }
    return dipBounds;
  }
};

const sortMonitorsByLayout = (monitors) => (
  [...(Array.isArray(monitors) ? monitors : [])].sort((a, b) => (
    (a?.layoutPosition?.y ?? a?.bounds?.y ?? 0) - (b?.layoutPosition?.y ?? b?.bounds?.y ?? 0)
    || (a?.layoutPosition?.x ?? a?.bounds?.x ?? 0) - (b?.layoutPosition?.x ?? b?.bounds?.x ?? 0)
    || Number(Boolean(b?.primary)) - Number(Boolean(a?.primary))
  ))
);

const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

const parseMonitorOrdinal = (value) => {
  const input = String(value || '').trim();
  if (!input) return null;

  const match = input.match(/(?:^|\s|-)monitor\s*([0-9]+)$/i) || input.match(/^monitor-([0-9]+)$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const createProfileMonitorMap = (profileMonitors, systemMonitors) => {
  const profileList = sortMonitorsByLayout(profileMonitors);
  const systemList = sortMonitorsByLayout(systemMonitors);
  const usedSystemIds = new Set();
  const bySystemId = new Map(systemList.map((monitor) => [monitor.id, monitor]));
  const bySystemName = new Map();
  for (const monitor of systemList) {
    const key = normalizeLabel(monitor?.systemName);
    if (key && !bySystemName.has(key)) bySystemName.set(key, monitor);
  }
  const byMonitorOrdinal = new Map();
  for (const monitor of systemList) {
    const ordinal = parseMonitorOrdinal(monitor?.name);
    if (ordinal && !byMonitorOrdinal.has(ordinal)) {
      byMonitorOrdinal.set(ordinal, monitor);
    }
  }

  const closestByLayout = (profileMonitor) => {
    const px = Number(profileMonitor?.layoutPosition?.x ?? NaN);
    const py = Number(profileMonitor?.layoutPosition?.y ?? NaN);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const monitor of systemList) {
      if (usedSystemIds.has(monitor.id)) continue;
      const mx = Number(monitor?.layoutPosition?.x ?? monitor?.bounds?.x ?? NaN);
      const my = Number(monitor?.layoutPosition?.y ?? monitor?.bounds?.y ?? NaN);
      if (!Number.isFinite(mx) || !Number.isFinite(my)) continue;
      const dx = px - mx;
      const dy = py - my;
      const distance = (dx * dx) + (dy * dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = monitor;
      }
    }
    return best;
  };

  const pickFirstUnused = () => systemList.find((monitor) => !usedSystemIds.has(monitor.id)) || systemList[0] || null;

  const mapping = new Map();
  profileList.forEach((profileMonitor, index) => {
    let target = null;
    if (profileMonitor?.id && bySystemId.has(profileMonitor.id) && !usedSystemIds.has(profileMonitor.id)) {
      target = bySystemId.get(profileMonitor.id);
    }
    if (!target) {
      const nameMatch = bySystemName.get(normalizeLabel(profileMonitor?.systemName));
      if (nameMatch && !usedSystemIds.has(nameMatch.id)) {
        target = nameMatch;
      }
    }
    if (!target) {
      const ordinal = (
        parseMonitorOrdinal(profileMonitor?.name)
        || parseMonitorOrdinal(profileMonitor?.id)
      );
      const ordinalMatch = ordinal ? byMonitorOrdinal.get(ordinal) : null;
      if (ordinalMatch && !usedSystemIds.has(ordinalMatch.id)) {
        target = ordinalMatch;
      }
    }
    if (!target) {
      target = closestByLayout(profileMonitor);
    }
    if (!target) {
      const indexCandidate = systemList[index];
      if (indexCandidate && !usedSystemIds.has(indexCandidate.id)) {
        target = indexCandidate;
      }
    }
    if (!target) {
      target = pickFirstUnused();
    }

    if (profileMonitor?.id && target) {
      mapping.set(profileMonitor.id, target);
      usedSystemIds.add(target.id);
    }
  });

  return mapping;
};

const buildMonitorMappingDiagnostics = (profileMonitors, systemMonitors, monitorMap) => {
  const profileList = sortMonitorsByLayout(profileMonitors);
  const systemList = sortMonitorsByLayout(systemMonitors);
  return profileList.map((profileMonitor, index) => {
    const target = profileMonitor?.id ? monitorMap.get(profileMonitor.id) : null;
    const profileOrdinal = parseMonitorOrdinal(profileMonitor?.name) || parseMonitorOrdinal(profileMonitor?.id);
    const targetOrdinal = parseMonitorOrdinal(target?.name) || parseMonitorOrdinal(target?.id);
    const profileSystemName = normalizeLabel(profileMonitor?.systemName);
    const targetSystemName = normalizeLabel(target?.systemName);
    let reason = 'unmapped';
    if (target) {
      if (profileMonitor?.id && target?.id && profileMonitor.id === target.id) {
        reason = 'system-id';
      } else if (profileSystemName && targetSystemName && profileSystemName === targetSystemName) {
        reason = 'system-name';
      } else if (profileOrdinal && targetOrdinal && profileOrdinal === targetOrdinal) {
        reason = 'monitor-ordinal';
      } else if (systemList[index]?.id && systemList[index].id === target.id) {
        reason = 'index-fallback';
      } else if (
        Number.isFinite(Number(profileMonitor?.layoutPosition?.x))
        && Number.isFinite(Number(profileMonitor?.layoutPosition?.y))
      ) {
        reason = 'layout-proximity';
      } else {
        reason = 'first-unused-fallback';
      }
    }

    return {
      reason,
      profileMonitor: describeMonitor(profileMonitor),
      targetMonitor: describeMonitor(target),
    };
  });
};

module.exports = {
  buildSystemMonitorSnapshot,
  physicalBoundsFromDip,
  sortMonitorsByLayout,
  normalizeLabel,
  parseMonitorOrdinal,
  createProfileMonitorMap,
  buildMonitorMappingDiagnostics,
};
