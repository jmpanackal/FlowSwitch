import { Globe, Monitor } from "lucide-react";

export type DropZoneSpec = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export function getBrowserIcon(_browserName: string) {
  return Globe;
}

export function getBrowserColor(browserName: string) {
  const colorMap: Record<string, string> = {
    Chrome: "#4285F4",
    Firefox: "#FF7139",
    Safari: "#006CFF",
    Edge: "#0078D4",
  };
  return colorMap[browserName] || "#4285F4";
}

export function getAppIcon(_appName: string) {
  return Monitor;
}

export function getAppColor(appName: string) {
  const colorMap: Record<string, string> = {
    "Adobe Acrobat": "#DC143C",
    "Microsoft Word": "#2B579A",
    "Microsoft Excel": "#217346",
    "Microsoft PowerPoint": "#D24726",
    "Visual Studio Code": "#007ACC",
    Notepad: "#0078D4",
    "File Explorer": "#FFB900",
    "VLC Media Player": "#FF8800",
    "Windows Media Player": "#0078D4",
    WinRAR: "#FF6B35",
    "7-Zip": "#0078D4",
  };
  return colorMap[appName] || "#4285F4";
}

/**
 * Snap grid for new app placement on a monitor, portrait vs landscape.
 */
export function computeDropZonesForAppCount(
  isPortrait: boolean,
  count: number,
): DropZoneSpec[] {
  if (isPortrait) {
    if (count <= 1) return [{ position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }];
    if (count === 2) return [
      { position: { x: 50, y: 25 }, size: { width: 100, height: 50 } },
      { position: { x: 50, y: 75 }, size: { width: 100, height: 50 } },
    ];
    if (count === 3) return [
      { position: { x: 50, y: 16.67 }, size: { width: 100, height: 33.33 } },
      { position: { x: 50, y: 50 }, size: { width: 100, height: 33.33 } },
      { position: { x: 50, y: 83.33 }, size: { width: 100, height: 33.33 } },
    ];
    return [
      { position: { x: 50, y: 12.5 }, size: { width: 100, height: 25 } },
      { position: { x: 50, y: 37.5 }, size: { width: 100, height: 25 } },
      { position: { x: 50, y: 62.5 }, size: { width: 100, height: 25 } },
      { position: { x: 50, y: 87.5 }, size: { width: 100, height: 25 } },
    ];
  }

  if (count <= 1) return [{ position: { x: 50, y: 50 }, size: { width: 100, height: 100 } }];
  if (count === 2) return [
    { position: { x: 25, y: 50 }, size: { width: 50, height: 100 } },
    { position: { x: 75, y: 50 }, size: { width: 50, height: 100 } },
  ];
  if (count === 3) return [
    { position: { x: 16.67, y: 50 }, size: { width: 33.33, height: 100 } },
    { position: { x: 50, y: 50 }, size: { width: 33.33, height: 100 } },
    { position: { x: 83.33, y: 50 }, size: { width: 33.33, height: 100 } },
  ];
  return [
    { position: { x: 25, y: 25 }, size: { width: 50, height: 50 } },
    { position: { x: 75, y: 25 }, size: { width: 50, height: 50 } },
    { position: { x: 25, y: 75 }, size: { width: 50, height: 50 } },
    { position: { x: 75, y: 75 }, size: { width: 50, height: 50 } },
  ];
}
