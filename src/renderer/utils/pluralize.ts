/** Returns singular when count is 1, otherwise plural (default: singular + "s"). */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  const p = plural ?? `${singular}s`;
  return Math.abs(count) === 1 ? singular : p;
}

/** e.g. formatUnit(1, "app") → "1 app"; formatUnit(3, "app") → "3 apps" */
export function formatUnit(
  count: number,
  singular: string,
  plural?: string,
): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}
