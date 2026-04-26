import { getInstalledAppCatalogKey } from "./installedAppCatalogKey";
import type { InstalledAppCatalogKeySource } from "./installedAppCatalogKey";

function normPathForCategoryKey(p: string | null | undefined): string {
  if (p == null || typeof p !== "string") return "";
  return p.trim().replace(/\\/g, "/").toLowerCase();
}

/**
 * Possible override map keys for one logical installed app. Catalog rows and profile
 * slots often disagree (e.g. catalog has shortcut + exe, layout slot only stored exe).
 */
export function installedAppCategoryOverrideLookupKeys(
  app: InstalledAppCatalogKeySource,
): string[] {
  const name = String(app.name ?? "").trim();
  const url = app.launchUrl ?? null;
  const exeRaw = app.executablePath;
  const scRaw = app.shortcutPath;
  const nExe = normPathForCategoryKey(exeRaw);
  const nSc = normPathForCategoryKey(scRaw);
  const keys = new Set<string>();

  const add = (exe: string | null | undefined, sc: string | null | undefined) => {
    keys.add(
      getInstalledAppCatalogKey({
        name,
        executablePath: exe ?? null,
        shortcutPath: sc ?? null,
        launchUrl: url,
      }),
    );
  };

  add(exeRaw, scRaw);

  if (nExe || nSc) {
    add(nExe || null, nSc || null);
  }

  if (exeRaw || nExe) {
    add(exeRaw ?? null, null);
    add(nExe || null, null);
  }
  if (scRaw || nSc) {
    add(null, scRaw ?? null);
    add(null, nSc || null);
  }

  return [...keys];
}

/** Labels shown in the Apps library and inspector; matches legacy `inferCategory` outputs. */
export const APP_LIBRARY_CATEGORIES = [
  "Browser",
  "Development",
  "Communication",
  "Media",
  "Productivity",
  "Gaming",
  "Other",
] as const;

export type AppLibraryCategory = (typeof APP_LIBRARY_CATEGORIES)[number];

const CATEGORY_SET = new Set<string>(APP_LIBRARY_CATEGORIES);

export function isAppLibraryCategory(value: unknown): value is AppLibraryCategory {
  return typeof value === "string" && CATEGORY_SET.has(value);
}

/** Heuristic type from display name (no user override). */
export function inferInstalledAppLibraryCategory(name: string): AppLibraryCategory {
  const normalized = name.toLowerCase();
  if (/(chrome|firefox|edge|brave|vivaldi|opera|safari|browser)/.test(normalized))
    return "Browser";
  if (/(code|studio|terminal|intellij|pycharm|webstorm|developer)/.test(normalized))
    return "Development";
  if (/(discord|slack|teams|zoom|mail|outlook|telegram|whatsapp)/.test(normalized))
    return "Communication";
  if (/(spotify|music|vlc|media|camera|photos|video)/.test(normalized)) return "Media";
  if (/(calendar|note|notion|office|word|excel|powerpoint|task)/.test(normalized))
    return "Productivity";
  if (/(steam|epic|game|xbox|battle\.net|gog)/.test(normalized)) return "Gaming";
  return "Other";
}

const STORAGE_KEY = "flowswitch.installedAppCategoryOverrides.v1";

export function readInstalledAppCategoryOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function persistInstalledAppCategoryOverrides(
  map: Record<string, string>,
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolveInstalledAppLibraryCategory(
  app: InstalledAppCatalogKeySource,
  overrides: Record<string, string> | undefined,
): AppLibraryCategory {
  if (!overrides) {
    return inferInstalledAppLibraryCategory(app.name);
  }
  for (const key of installedAppCategoryOverrideLookupKeys(app)) {
    const raw = overrides[key];
    if (raw && isAppLibraryCategory(raw)) return raw;
  }
  return inferInstalledAppLibraryCategory(app.name);
}
