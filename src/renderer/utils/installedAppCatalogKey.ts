export type InstalledAppCatalogKeySource = {
  name: string;
  executablePath?: string | null;
  shortcutPath?: string | null;
  launchUrl?: string | null;
};

/** Stable catalog row id (aligned with layout dedupe / add-app modal). */
export function getInstalledAppCatalogKey(app: InstalledAppCatalogKeySource): string {
  return `${app.name}\0${app.executablePath ?? ""}\0${app.shortcutPath ?? ""}\0${app.launchUrl ?? ""}`;
}

/**
 * Identity for launch-path overrides: stable when `executablePath` changes from discovery
 * or user override (prefs key in main: `catalogLaunchExeOverrides`).
 */
export function getCatalogLaunchIdentityKey(
  app: Pick<
    InstalledAppCatalogKeySource,
    "name" | "shortcutPath" | "launchUrl"
  >,
): string {
  return `${String(app.name ?? "").trim()}\0${app.shortcutPath ?? ""}\0${app.launchUrl ?? ""}`;
}
