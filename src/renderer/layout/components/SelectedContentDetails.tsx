import { useMemo } from "react";
import { ExternalLink, FileText, Folder, Trash2 } from "lucide-react";
import type { ContentItem, ContentFolder } from "./ContentManager";
import { getCompatibleOpensWithApps } from "../utils/contentOpensWithOptions";

export type LibrarySelection =
  | { kind: "item"; item: ContentItem }
  | { kind: "folder"; folder: ContentFolder };

type Props = {
  selection: LibrarySelection;
  onChangeDefaultApp: (
    id: string,
    nextApp: string,
    scope: "item" | "folder",
  ) => void;
  onPlaceOnMonitor: (monitorId: string) => void;
  onPlaceOnMinimized: () => void;
  monitors: { id: string; name?: string; primary?: boolean }[];
  /** Hidden from the compact list for the active profile only (library entry remains). */
  excludedFromActiveProfile?: boolean;
  onToggleExcludeFromActiveProfile?: () => void;
  /** Permanently removes this entry from the global library. */
  onDeleteFromLibrary?: () => void;
};

export function SelectedContentDetails({
  selection,
  onChangeDefaultApp,
  onPlaceOnMonitor,
  onPlaceOnMinimized,
  monitors,
  excludedFromActiveProfile,
  onToggleExcludeFromActiveProfile,
  onDeleteFromLibrary,
}: Props) {
  const isFolder = selection.kind === "folder";
  const title = isFolder ? selection.folder.name : selection.item.name;
  const defaultApp = isFolder
    ? selection.folder.defaultApp
    : selection.item.defaultApp;
  const id = isFolder ? selection.folder.id : selection.item.id;
  const diskPath = isFolder ? selection.folder.diskPath : undefined;
  const subtitle = isFolder
    ? diskPath
      ? diskPath
      : `${selection.folder.children.length} item(s) in this folder`
    : selection.item.type === "link"
      ? selection.item.url || ""
      : selection.item.path || "";

  const appOptions = useMemo(() => {
    const base = getCompatibleOpensWithApps(selection);
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (a: string) => {
      const t = a.trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    push(defaultApp);
    for (const a of base) push(a);
    return out;
  }, [
    id,
    defaultApp,
    isFolder,
    isFolder ? selection.folder.children?.length : selection.item.type,
    isFolder ? diskPath : selection.item.path,
    isFolder ? undefined : selection.item.url,
    isFolder ? undefined : selection.item.isFolder,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col pt-12">
      <div className="border-b border-flow-border/50 px-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0 text-flow-text-muted">
            {isFolder ? (
              <Folder className="h-6 w-6 text-amber-400" aria-hidden />
            ) : selection.item.type === "link" ? (
              <ExternalLink className="h-6 w-6 text-blue-400" aria-hidden />
            ) : (
              <FileText className="h-6 w-6 text-flow-text-muted" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-semibold leading-snug text-flow-text-primary">
              {title}
            </h2>
          </div>
        </div>
      </div>

      <div className="scrollbar-elegant flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {((isFolder && diskPath) || (!isFolder && subtitle)) ? (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-flow-text-muted">
              {isFolder ? "Folder path" : selection.item.type === "link" ? "URL" : "Path"}
            </div>
            <div className="break-all rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/40 px-3 py-2 font-mono text-xs leading-relaxed text-flow-text-secondary">
              {subtitle}
            </div>
          </div>
        ) : null}

        {onToggleExcludeFromActiveProfile ? (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-flow-border/50 bg-flow-surface/40 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 rounded border-flow-border"
              checked={Boolean(excludedFromActiveProfile)}
              onChange={() => onToggleExcludeFromActiveProfile()}
            />
            <span className="text-xs leading-snug text-flow-text-secondary">
              <span className="font-medium text-flow-text-primary">
                Hide from this profile
              </span>
              {" "}
              — the entry stays in your library for other profiles.
            </span>
          </label>
        ) : null}

        {onDeleteFromLibrary ? (
          <div>
            <button
              type="button"
              onClick={() => onDeleteFromLibrary()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-flow-accent-red/35 bg-flow-accent-red/10 px-3 py-2 text-xs font-medium text-flow-accent-red transition-colors hover:bg-flow-accent-red/20"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete from library
            </button>
            <p className="mt-1.5 text-[11px] leading-snug text-flow-text-muted">
              Removes this {isFolder ? "folder and its library items" : "entry"}{" "}
              everywhere. This cannot be undone.
            </p>
          </div>
        ) : null}

        <div>
          <label
            className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-flow-text-muted"
            htmlFor="library-default-app"
          >
            Opens with
          </label>
          <select
            key={`library-opens-with-${id}`}
            id="library-default-app"
            value={defaultApp}
            onChange={(e) =>
              onChangeDefaultApp(id, e.target.value, isFolder ? "folder" : "item")
            }
            className="flow-sidebar-search w-full rounded-lg border border-flow-border bg-flow-surface py-2 pl-3 pr-3 text-sm text-flow-text-primary"
          >
            {appOptions.map((app) => (
              <option key={app} value={app}>
                {app}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-snug text-flow-text-muted">
            Choose which application should open this{" "}
            {isFolder ? "folder" : selection.item.type === "link" ? "link" : "file"}.
          </p>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-flow-text-muted">
            Add to layout
          </div>
          <div className="flex flex-col gap-1">
            {monitors.length ? (
              monitors.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onPlaceOnMonitor(m.id)}
                  className="rounded-lg border border-flow-border/60 bg-flow-surface px-3 py-2 text-left text-xs text-flow-text-secondary transition-colors hover:bg-flow-surface-elevated hover:text-flow-text-primary"
                >
                  {(m.name || m.id) + (m.primary ? " (primary)" : "")}
                </button>
              ))
            ) : (
              <p className="text-xs text-flow-text-muted">No monitors in profile.</p>
            )}
            <button
              type="button"
              onClick={onPlaceOnMinimized}
              className="rounded-lg border border-flow-border/60 bg-flow-surface px-3 py-2 text-left text-xs text-flow-text-secondary transition-colors hover:bg-flow-surface-elevated hover:text-flow-text-primary"
            >
              Minimized row
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
