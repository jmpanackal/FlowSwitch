/**
 * FlowBackground v2 — stream definitions (animation design brief v2).
 *
 * Static marketing site:
 * - `website/index.html` → `.flow-background__stream-wrap--1` … `--4` + SVG paths
 * - `website/styles.css` → `.flow-background` + `@keyframes stream-warp-*` + `stream-dash`
 *
 * Metaphor: curved, branching streams (logo tentacles / river delta), not blobs.
 * Colors: blue-500 / blue-700 / indigo / sky — CSS stroke-opacity ~0.44–0.55 before blur.
 * Blur: ~34–40px per stream (CSS `filter` on each `.flow-background__stream-wrap`).
 * Motion: wrapper transform drift (~15–19s) + path `stroke-dashoffset` (“stream-dash”).
 *
 * A future React `FlowBackground` can add true path morph (Flubber / Framer) and
 * a subtle gradient pulse along stroke length; keep compositor-safe rules from the brief.
 */

export type StreamId = "stream-1" | "stream-2" | "stream-3" | "stream-4";

export interface StreamConfig {
  id: StreamId;
  /** Primary morph / drift cycle — brief: ~15–25s */
  cycleSeconds: number;
  delaySeconds: number;
  /** Per-stream blur (CSS px on wrapper) — brief: ~40–60 */
  blurPx: number;
  /** transform-origin hint (logo-adjacent streams read as “emanating” top-left) */
  transformOrigin: string;
  /** Trunk stroke width before blur — brief ~3–4 */
  trunkStrokePx: number;
  /** Branch stroke width before blur — brief ~1–2 */
  branchStrokePx: number;
  /** Notes for SVG stroke colors (hex + role) */
  palette: string[];
}

export const streams: StreamConfig[] = [
  {
    id: "stream-1",
    cycleSeconds: 17,
    delaySeconds: -4,
    blurPx: 36,
    transformOrigin: "16% 20%",
    trunkStrokePx: 3.2,
    branchStrokePx: 1.6,
    palette: ["#3b82f6 trunk", "#6366f1 branch", "#0ea5e9 branch"],
  },
  {
    id: "stream-2",
    cycleSeconds: 15,
    delaySeconds: -9,
    blurPx: 40,
    transformOrigin: "88% 28%",
    trunkStrokePx: 3,
    branchStrokePx: 1.6,
    palette: ["#2563eb trunk", "#3b82f6 branch", "#1d4ed8 branch"],
  },
  {
    id: "stream-3",
    cycleSeconds: 19,
    delaySeconds: -2,
    blurPx: 38,
    transformOrigin: "48% 92%",
    trunkStrokePx: 2.8,
    branchStrokePx: 1.5,
    palette: ["#1d4ed8 trunk", "#3b82f6 branch", "#6366f1 branch"],
  },
  {
    id: "stream-4",
    cycleSeconds: 16,
    delaySeconds: -11,
    blurPx: 34,
    transformOrigin: "42% 56%",
    trunkStrokePx: 2.6,
    branchStrokePx: 1.45,
    palette: ["#0ea5e9 trunk", "#3b82f6 branch", "#1d4ed8 branch"],
  },
];
