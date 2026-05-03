import type { ContentFolder, ContentItem } from "../components/ContentManager";
import { AVAILABLE_APPS } from "../constants/availableAppsForOpensWith";

type LibrarySelectionInput =
  | { kind: "item"; item: ContentItem }
  | { kind: "folder"; folder: ContentFolder };

const BROWSER_KEYWORDS = [
  "chrome",
  "edge",
  "firefox",
  "brave",
  "opera",
  "vivaldi",
  "safari",
  "browser",
];

const FOLDER_HOST_KEYWORDS = [
  "explorer",
  "code",
  "studio",
  "cursor",
  "terminal",
  "powershell",
  "command",
  "idea",
  "sublime",
  "atom",
  "notepad",
];

function normalizeCandidateApps(candidateApps?: string[]): string[] {
  const base = (candidateApps && candidateApps.length
    ? candidateApps
    : [...AVAILABLE_APPS]) as string[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const app of base) {
    const t = String(app || "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Apps shown in “Opens with” for the library inspector — subset of {@link AVAILABLE_APPS}.
 */
export function getCompatibleOpensWithApps(
  selection: LibrarySelectionInput,
  candidateApps?: string[],
): string[] {
  const candidates = normalizeCandidateApps(candidateApps);
  if (candidates.length === 0) return [];

  if (selection.kind === "item" && selection.item.type === "link") {
    const filtered = candidates.filter((app) => {
      const lc = app.toLowerCase();
      return BROWSER_KEYWORDS.some((kw) => lc.includes(kw));
    });
    return filtered.length ? filtered : candidates;
  }

  if (selection.kind === "folder" || isFolderLikeItem(selection)) {
    const filtered = candidates.filter((app) => {
      const lc = app.toLowerCase();
      return FOLDER_HOST_KEYWORDS.some((kw) => lc.includes(kw));
    });
    return filtered.length ? filtered : candidates;
  }

  return candidates;
}

function isFolderLikeItem(selection: LibrarySelectionInput): boolean {
  return (
    selection.kind === "item"
    && selection.item.type === "file"
    && Boolean(selection.item.isFolder)
  );
}
