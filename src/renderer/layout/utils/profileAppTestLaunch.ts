/**
 * Profile layout apps that host a content-library folder should pass that folder path as the
 * first spawn argument to the host .exe (Explorer, VS Code, Cursor, etc.) — same idea as
 * `profile-launch-gather`.
 */
export function buildTestLaunchSpawnArgsForFolderContentHost(data: {
  executablePath?: string | null;
  associatedFiles?: Array<{ type?: string; path?: string | null }>;
} | null | undefined): string[] | undefined {
  if (!data) return undefined;
  const exe = typeof data.executablePath === "string" ? data.executablePath.trim() : "";
  if (!exe.toLowerCase().endsWith(".exe")) return undefined;
  const files = Array.isArray(data.associatedFiles) ? data.associatedFiles : [];
  const folder = files.find(
    (f) => f
      && String(f.type || "").toLowerCase() === "folder"
      && String(f.path || "").trim(),
  );
  const p = folder && typeof folder.path === "string" ? folder.path.trim() : "";
  if (!p) return undefined;
  return [p.replace(/\//g, "\\")];
}
