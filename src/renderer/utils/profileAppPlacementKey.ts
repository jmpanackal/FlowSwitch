/**
 * Mirrors main `getPlacementProcessKey` / `rowToPlacementKey` basename logic for profile apps
 * (no Node `path` in renderer).
 */
export function profileAppPlacementKey(app: {
  executablePath?: string;
  path?: string;
  name?: string;
}): string {
  const raw = String(app?.executablePath || app?.path || "").trim();
  if (raw) {
    const norm = raw.replace(/\\/g, "/");
    const base = norm.split("/").pop() || "";
    return base.replace(/\.(exe|msi)$/i, "").toLowerCase();
  }
  return String(app?.name || "")
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, "");
}
