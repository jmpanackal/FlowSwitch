/**
 * Resolve the host .exe for a content-library "opens with" label using the installed-apps
 * catalog. Uses exact display-name match only so we never pick another app's binary from a
 * partial name collision.
 */
export type CatalogRowForHostExe = {
  name?: string | null;
  executablePath?: string | null;
};

export function resolveInstalledCatalogExecutableExact(
  catalog: CatalogRowForHostExe[] | null | undefined,
  appName: string,
): string | null {
  if (!catalog?.length || !String(appName || "").trim()) return null;
  const tl = String(appName).trim().toLowerCase();
  const row = catalog.find((a) => String(a?.name || "").trim().toLowerCase() === tl);
  const ex = row?.executablePath;
  if (typeof ex !== "string") return null;
  const t = ex.trim();
  if (!t.toLowerCase().endsWith(".exe")) return null;
  return t;
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
  return (
    resolveInstalledCatalogExecutableExact(catalog, appName)
    ?? (String(appName || "").trim().toLowerCase() === "file explorer"
      ? fallbackWindowsFileExplorerExe()
      : null)
  );
}
