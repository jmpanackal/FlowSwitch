/**
 * Rules for how many file vs folder paths make sense per host app tile.
 * Launch still uses profile data as stored; this guides the inspector UX.
 */
export type AssociatedContentHostLimits = {
  /** Max folder-root entries (`type === "folder"`). `null` = no limit. */
  maxFolderRoots: number | null;
  /** Max non-folder associated rows (files, URLs, etc.). `null` = no limit. */
  maxNonFolderEntries: number | null;
};

function normalizeHostLabel(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function getAssociatedContentLimitsForHost(
  appName: string | null | undefined,
): AssociatedContentHostLimits {
  const n = normalizeHostLabel(appName || "");
  if (!n) {
    return { maxFolderRoots: null, maxNonFolderEntries: null };
  }

  // Single-root workspace editors: one folder workspace; many files OK.
  if (
    n.includes("visual studio code")
    || n === "vscode"
    || n.endsWith(" code")
    || n === "code"
    || n.includes("cursor")
  ) {
    return { maxFolderRoots: 1, maxNonFolderEntries: null };
  }

  return { maxFolderRoots: null, maxNonFolderEntries: null };
}

export function countAssociatedFolderRoots(
  rows: Array<{ type?: string }> | null | undefined,
): number {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((r) => String(r?.type || "").toLowerCase() === "folder").length;
}

export function countAssociatedNonFolderEntries(
  rows: Array<{ type?: string }> | null | undefined,
): number {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((r) => String(r?.type || "").toLowerCase() !== "folder").length;
}
