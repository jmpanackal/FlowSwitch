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
