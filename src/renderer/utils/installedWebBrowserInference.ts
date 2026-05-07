/**
 * Heuristic classification of Windows installed apps FlowSwitch treats as **web browsers**
 * for tab association, inspector type, drag updates, etc.
 *
 * Strategy (in order): known `.exe` basenames (~top desktop browsers + common forks/alternatives),
 * then recognizable **display-name** phrases, then guarded **whole-word** product tokens,
 * then a narrow `"... browser"` shortcut-title fallback aligned with legacy behavior.
 *
 * **Rough product coverage (~20+)**: Chrome, Edge, Firefox, Brave, Opera & Opera GX, Vivaldi,
 * Chromium, Arc, DuckDuckGo Privacy Browser, Yandex Browser, Zen Browser, Sigma Browser,
 * Waterfox, LibreWolf, Floorp, Pale Moon, SeaMonkey, Tor Browser (title), Slimjet, Maxthon,
 * Torch, Epic Privacy Browser, Avast / AVG Secure Browser, CCleaner Browser, Safari, Internet Explorer.
 *
 * Windows does not expose a reliable OS-level “this is a web browser” flag for arbitrary Start
 * Menu items; maintain this list deliberately when onboarding new major browsers.
 */

export type InstalledWebBrowserInferenceInput = {
  name?: string | null;
  executablePath?: string | null;
};

/** `.exe` basenames only (already lowercased; include trailing `.exe`). */
const KNOWN_BROWSER_EXE_BASENAMES = new Set<string>([
  // Chromium / Blink / evergreen (desktop share leaders)
  "chrome.exe",
  "msedge.exe",
  "brave.exe",
  "opera.exe",
  "opera_gx.exe",
  "vivaldi.exe",
  "chromium.exe",
  "arc.exe",
  "duckduckgo.exe",
  // Gecko / forks
  "firefox.exe",
  "waterfox.exe",
  "librewolf.exe",
  "floorp.exe",
  "palemoon.exe",
  "seamonkey.exe",
  "zen.exe",
  // Blink / Chromium regional / niche with distinct exes on Windows
  "yandexbrowser.exe",
  "yandex_browser.exe",
  "slimjet.exe",
  "maxthon.exe",
  "torch.exe",
  // Privacy / bundled first-party Blink shells
  "epic.exe",
  "avastbrowser.exe",
  "ccleanerbrowser.exe",
  // WebKit legacy on Windows (rare)
  "safari.exe",
]);

/**
 * Multi-word / distinctive substrings matched against the **display name** (lowercase).
 * Longest matches first reduces accidental partial hits.
 */
const TITLE_PHRASE_SUBSTRINGS: string[] = [
  "avast secure browser",
  "avg secure browser",
  "ccleaner browser",
  "microsoft edge",
  "internet explorer",
  "mozilla firefox",
  "google chrome",
  "opera gx",
  "duckduckgo",
  "duck duck go",
  "tor browser",
  "arc browser",
  "vivaldi",
  "yandex browser",
  "zen browser",
  "sigma browser",
  "librewolf",
  "waterfox",
  "pale moon",
  "sea monkey",
  "dragon browser",
  "slimjet",
  "maxthon",
].sort((a, b) => b.length - a.length);

/** Single-token product cues (whole-word match on normalized display name). */
const TITLE_BOUNDARY_HINTS =
  /\b(arc|brave|opera|vivaldi|chromium|chrome|firefox|edge|safari|msedge|seamonkey|palemoon|floorp|librewolf|waterfox|epic|slimjet|maxthon|torch|zen|yandex)\b/i;

function normalizeExeBasename(executablePath: string | undefined | null): string | null {
  const raw = String(executablePath ?? "").trim().replace(/\//g, "\\");
  if (!raw) return null;
  const slash = raw.replace(/[/\\]+$/, "").split(/[/\\]/);
  const leaf = slash[slash.length - 1] ?? "";
  const lower = leaf.trim().toLowerCase();
  if (!lower.endsWith(".exe")) return null;
  return lower;
}

function normalizeTitle(raw: string | undefined | null): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * `true` when this catalog / layout snapshot should behave as a FlowSwitch **browser** host
 * (browser tab wiring, inspector `browser` typing, tab moves across monitors).
 */
export function inferIsWebBrowserFromInstalledApp(
  input: InstalledWebBrowserInferenceInput,
): boolean {
  const exeLeaf = normalizeExeBasename(input.executablePath ?? null);
  if (exeLeaf && KNOWN_BROWSER_EXE_BASENAMES.has(exeLeaf)) return true;

  const title = normalizeTitle(input.name ?? null);
  if (!title) return false;

  for (const phrase of TITLE_PHRASE_SUBSTRINGS) {
    if (phrase && title.includes(phrase)) return true;
  }

  if (TITLE_BOUNDARY_HINTS.test(title)) return true;

  // Legacy catch-all for Start Menu shortcuts like "Brave Browser", "Tor Browser".
  if (/\bbrowser\b/.test(title)) return true;

  return false;
}
