/**
 * Profile layout apps that host content-library paths pass spawn arguments to the host .exe
 * (Explorer, VS Code, Cursor, etc.) — mirrors `profile-launch-gather` (Explorer: all paths;
 * others: first folder or first browser URL).
 */
export function buildTestLaunchSpawnArgsForFolderContentHost(data: {
  executablePath?: string | null;
  associatedFiles?: Array<{ type?: string; path?: string | null }>;
  browserTabs?: Array<{ url?: string | null }>;
} | null | undefined): string[] | undefined {
  if (!data) return undefined;
  const exe = typeof data.executablePath === "string" ? data.executablePath.trim() : "";
  if (!exe.toLowerCase().endsWith(".exe")) return undefined;
  const files = Array.isArray(data.associatedFiles) ? data.associatedFiles : [];
  const exeLc = exe.replace(/\//g, "\\").toLowerCase();
  if (exeLc.endsWith("\\explorer.exe")) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      const raw = f && typeof f.path === "string" ? f.path.trim().replace(/\//g, "\\") : "";
      if (!raw || raw.includes("..")) continue;
      const k = raw.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const isFolder = String(f?.type || "").toLowerCase() === "folder";
      if (isFolder) {
        out.push(raw);
        continue;
      }
      const sel = /\s/.test(raw) ? `/select,"${raw}"` : `/select,${raw}`;
      out.push(sel);
    }
    if (out.length > 0) return out;
  }
  const folder = files.find(
    (f) => f
      && String(f.type || "").toLowerCase() === "folder"
      && String(f.path || "").trim(),
  );
  const p = folder && typeof folder.path === "string" ? folder.path.trim() : "";
  if (p) return [p.replace(/\//g, "\\")];
  const tabs = Array.isArray(data.browserTabs) ? data.browserTabs : [];
  const firstUrl = tabs.find((t) => typeof t?.url === "string" && String(t.url).trim());
  const u = firstUrl && typeof firstUrl.url === "string" ? firstUrl.url.trim() : "";
  if (u) return [u];
  return undefined;
}
