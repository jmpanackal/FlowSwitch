const MAX_ICON_BYTES = 2 * 1024 * 1024;

/**
 * Returns a safe `img` src for persisted or IPC-provided icon strings.
 * Only allows non-SVG raster data URLs (same policy as main process).
 */
export function safeIconSrc(value: string | null | undefined): string | undefined {
  if (value == null || typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v.startsWith('data:image/')) return undefined;
  const match = /^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(v);
  if (!match) return undefined;
  const b64 = match[2].replace(/\s/g, '');
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > MAX_ICON_BYTES || approxBytes < 0) return undefined;
  return v;
}
