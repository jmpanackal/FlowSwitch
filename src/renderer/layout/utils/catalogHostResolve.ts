/**
 * Resolve the host .exe for a content-library "opens with" label using the installed-apps
 * catalog. Uses exact display-name match only so we never pick another app's binary from a
 * partial name collision.
 */
export type CatalogRowForHostExe = {
  name?: string | null;
  executablePath?: string | null;
};

const HOST_APP_ALIAS_GROUPS = [
  ["file explorer", "windows explorer", "explorer"],
  ["microsoft edge", "edge"],
  ["google chrome", "chrome"],
  ["mozilla firefox", "firefox"],
  ["visual studio code", "vscode", "code"],
  ["cursor", "cursor editor"],
];

function normalizeLabel(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function candidateHostNames(appName: string): string[] {
  const base = normalizeLabel(appName);
  if (!base) return [];
  const out = new Set<string>([base]);
  const group = HOST_APP_ALIAS_GROUPS.find((g) => g.includes(base));
  if (group) {
    for (const alias of group) out.add(alias);
  }
  return Array.from(out);
}

export function resolveInstalledCatalogExecutableExact(
  catalog: CatalogRowForHostExe[] | null | undefined,
  appName: string,
): string | null {
  if (!catalog?.length || !String(appName || "").trim()) return null;
  const names = candidateHostNames(appName);
  if (names.length === 0) return null;
  for (const name of names) {
    const row = catalog.find((a) => normalizeLabel(String(a?.name || "")) === name);
    const ex = row?.executablePath;
    if (typeof ex !== "string") continue;
    const t = ex.trim();
    if (!t.toLowerCase().endsWith(".exe")) continue;
    return t;
  }
  return null;
}

/** Catalog miss: stable Windows host for the built-in File Explorer label. */
export function fallbackWindowsFileExplorerExe(): string | null {
  if (typeof navigator === "undefined") return null;
  if (!/windows/i.test(navigator.userAgent)) return null;
  return "C:\\Windows\\explorer.exe";
}

export function resolveHostExecutableForCatalogLabel(
  catalog: CatalogRowForHostExe[] | null | undefined,
  appName: string,
): string | null {
  const normalized = normalizeLabel(appName);
  return (
    resolveInstalledCatalogExecutableExact(catalog, appName)
    ?? (normalized === "file explorer" || normalized === "windows explorer" || normalized === "explorer"
      ? fallbackWindowsFileExplorerExe()
      : null)
  );
}
