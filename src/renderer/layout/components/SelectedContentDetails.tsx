import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Trash2,
  FolderSearch,
  Layers,
  PlusCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ContentItem, ContentFolder } from "./ContentManager";
import { ClickCopyPathBlock } from "./ClickCopyPathBlock";
import {
  inspectorEyebrowBlock,
  inspectorEyebrowText,
  inspectorHelperTextClass,
  inspectorPanelCtaButtonClass,
  inspectorPanelListButtonClass,
} from "./inspectorStyles";
import { getCompatibleOpensWithApps } from "../utils/contentOpensWithOptions";
import { FlowTooltip } from "./ui/tooltip";

export type LibrarySelection =
  | { kind: "item"; item: ContentItem }
  | { kind: "folder"; folder: ContentFolder };

type Props = {
  selection: LibrarySelection;
  /** Resolve folder `children` IDs to names and paths in the Browse tab. */
  libraryItems: ContentItem[];
  libraryFolders: ContentFolder[];
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

type ContentInspectorTab = "browse" | "organize" | "add";

export function SelectedContentDetails({
  selection,
  libraryItems,
  libraryFolders,
  onChangeDefaultApp,
  onPlaceOnMonitor,
  onPlaceOnMinimized,
  monitors,
  excludedFromActiveProfile,
  onToggleExcludeFromActiveProfile,
  onDeleteFromLibrary,
}: Props) {
  const [activeTab, setActiveTab] = useState<ContentInspectorTab>("browse");
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const copyNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openExplorerError, setOpenExplorerError] = useState<string | null>(null);
  const [diskBrowse, setDiskBrowse] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | {
        status: "ready";
        entries: Array<{ name: string; isDirectory: boolean }>;
        truncated: boolean;
      }
    | { status: "error"; message: string }
  >({ status: "idle" });

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

  const itemTypeLabel = isFolder
    ? "Folder"
    : selection.item.type === "link"
      ? "Link"
      : selection.item.isFolder
        ? "Folder path"
        : "File";

  const linkUrl =
    !isFolder && selection.item.type === "link"
      ? (selection.item.url || "").trim()
      : "";

  const pathForExplorer = useMemo(() => {
    if (isFolder) {
      const p = selection.folder.diskPath?.trim();
      return p || null;
    }
    if (selection.item.type === "file") {
      const p = selection.item.path?.trim();
      return p || null;
    }
    return null;
  }, [isFolder, selection]);

  const diskListPath = useMemo(() => {
    if (isFolder) {
      const p = selection.folder.diskPath?.trim();
      return p || null;
    }
    if (
      selection.kind === "item"
      && selection.item.type === "file"
      && selection.item.isFolder
    ) {
      const p = selection.item.path?.trim();
      return p || null;
    }
    return null;
  }, [isFolder, selection]);

  const resolvedFolderChildren = useMemo(() => {
    if (!isFolder) return [];
    const itemById = new Map(libraryItems.map((it) => [it.id, it]));
    const folderById = new Map(libraryFolders.map((f) => [f.id, f]));
    return selection.folder.children.map((childId) => {
      const item = itemById.get(childId);
      if (item) {
        const detail =
          item.type === "link"
            ? (item.url || "").trim()
            : (item.path || "").trim();
        const kind =
          item.type === "link"
            ? ("link" as const)
            : item.isFolder
              ? ("folderPath" as const)
              : ("file" as const);
        return {
          kind: "item" as const,
          id: childId,
          name: item.name,
          detail,
          entryKind: kind,
        };
      }
      const sub = folderById.get(childId);
      if (sub) {
        const detail =
          sub.diskPath?.trim()
          || `${sub.children.length} in library`;
        return {
          kind: "folder" as const,
          id: childId,
          name: sub.name,
          detail,
          entryKind: "libraryFolder" as const,
        };
      }
      return {
        kind: "missing" as const,
        id: childId,
        name: childId,
        detail: "",
        entryKind: "missing" as const,
      };
    });
  }, [isFolder, libraryFolders, libraryItems, selection]);

  useEffect(() => {
    setActiveTab("browse");
  }, [selection.kind, id]);

  useEffect(() => {
    setOpenExplorerError(null);
  }, [id, selection.kind]);

  useEffect(() => {
    return () => {
      if (copyNoticeTimer.current) {
        clearTimeout(copyNoticeTimer.current);
        copyNoticeTimer.current = null;
      }
    };
  }, []);

  const flashCopy = (label: string) => {
    if (copyNoticeTimer.current) clearTimeout(copyNoticeTimer.current);
    setCopyNotice(label);
    copyNoticeTimer.current = setTimeout(() => {
      setCopyNotice(null);
      copyNoticeTimer.current = null;
    }, 1600);
  };

  const copyText = async (text: string, label: string) => {
    const t = text.trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      flashCopy(label);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (activeTab !== "browse" || !diskListPath) {
      setDiskBrowse({ status: "idle" });
      return;
    }
    const api = window.electron?.browseFolderList;
    if (typeof api !== "function") {
      setDiskBrowse({
        status: "error",
        message: "Folder listing is not available in this build.",
      });
      return;
    }
    let cancelled = false;
    setDiskBrowse({ status: "loading" });
    void api(diskListPath).then((res) => {
      if (cancelled) return;
      if (res.ok && res.entries) {
        setDiskBrowse({
          status: "ready",
          entries: res.entries,
          truncated: Boolean(res.truncated),
        });
      } else {
        setDiskBrowse({
          status: "error",
          message: res.error || "Could not list folder.",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, diskListPath, id]);

  const canOpenInFileExplorer =
    Boolean(pathForExplorer)
    && typeof window.electron?.openPathInExplorer === "function";

  const handleOpenPathInExplorer = async () => {
    if (!pathForExplorer) return;
    setOpenExplorerError(null);
    const fn = window.electron?.openPathInExplorer;
    if (typeof fn !== "function") {
      setOpenExplorerError("This build cannot open File Explorer from here.");
      return;
    }
    const result = await fn(pathForExplorer);
    if (!result.ok) {
      setOpenExplorerError(result.error || "Could not open file location.");
    }
  };

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

  const tabs: { id: ContentInspectorTab; label: string; icon: LucideIcon }[] = [
    { id: "browse", label: "Browse", icon: FolderSearch },
    { id: "organize", label: "Organize", icon: Layers },
    { id: "add", label: "Add", icon: PlusCircle },
  ];

  const entryKindBadge = (k: (typeof resolvedFolderChildren)[number]["entryKind"]) => {
    switch (k) {
      case "link":
        return "Link";
      case "file":
        return "File";
      case "folderPath":
        return "Folder path";
      case "libraryFolder":
        return "Folder";
      default:
        return "Missing";
    }
  };

  const renderBrowseTab = () => (
    <div className="space-y-4">
      {copyNotice ? (
        <p className="text-[11px] font-medium text-flow-accent-green">{copyNotice}</p>
      ) : null}

      <div className="rounded-lg border border-flow-border/50 bg-flow-surface/30 px-3 py-2.5">
        <div className={inspectorEyebrowText}>
          Summary
        </div>
        <p className="mt-1 text-sm text-flow-text-primary">{itemTypeLabel}</p>
        {isFolder ? (
          <p className="mt-1 text-[11px] leading-snug text-flow-text-muted">
            {diskPath
              ? "Linked to a folder on disk. Library entries below are shortcuts you added."
              : "Contains library items and subfolders only (no disk path)."}
          </p>
        ) : null}
        {!isFolder && selection.item.type !== "link" && selection.item.path ? (
          <p className="mt-1 text-[11px] leading-snug text-flow-text-muted">
            Double-check the path before launching with a profile.
          </p>
        ) : null}
      </div>

      {((isFolder && diskPath) || (!isFolder && subtitle)) ? (
        <div>
          <div className={inspectorEyebrowBlock}>
            {isFolder ? "Folder path" : selection.item.type === "link" ? "URL" : "Path"}
          </div>
          <ClickCopyPathBlock value={subtitle} />
        </div>
      ) : null}

      {pathForExplorer ? (
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={!canOpenInFileExplorer}
            onClick={() => void handleOpenPathInExplorer()}
            className={`${inspectorPanelCtaButtonClass} disabled:pointer-events-none disabled:opacity-45`}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Open in File Explorer
          </button>
          {openExplorerError ? (
            <p className="text-[11px] text-flow-accent-red">{openExplorerError}</p>
          ) : null}
        </div>
      ) : null}

      {linkUrl ? (
        <div>
          <button
            type="button"
            onClick={() => window.open(linkUrl, "_blank", "noopener,noreferrer")}
            className={inspectorPanelCtaButtonClass}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Open link in browser
          </button>
        </div>
      ) : null}

      {isFolder && !resolvedFolderChildren.length && !diskListPath ? (
        <p className="text-xs text-flow-text-muted">
          This folder has no items yet. Use Add content or drag entries here from the library list.
        </p>
      ) : null}

      {isFolder && resolvedFolderChildren.length ? (
        <div>
          <div className={inspectorEyebrowBlock}>
            In this library
          </div>
          <ul className="scrollbar-elegant max-h-48 space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/30 p-1">
            {resolvedFolderChildren.map((row) => (
              <li
                key={row.id}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs text-flow-text-secondary"
              >
                <span className="mt-0.5 shrink-0 text-flow-text-muted">
                  {row.entryKind === "link" ? (
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  ) : row.entryKind === "libraryFolder" || row.entryKind === "folderPath" ? (
                    <Folder className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-flow-text-primary">{row.name}</span>
                    <span className="rounded bg-flow-surface px-1 py-0 text-[10px] uppercase tracking-wide text-flow-text-muted">
                      {entryKindBadge(row.entryKind)}
                    </span>
                  </div>
                  {row.detail ? (
                    <p className="mt-0.5 break-all font-mono text-[10px] leading-snug text-flow-text-muted">
                      {row.detail}
                    </p>
                  ) : null}
                </div>
                {row.detail && row.entryKind !== "missing" ? (
                  <FlowTooltip label="Copy path or URL">
                    <button
                      type="button"
                      aria-label={`Copy ${row.name}`}
                      onClick={() => void copyText(row.detail, "Copied")}
                      className="shrink-0 rounded p-1 text-flow-text-muted hover:bg-flow-surface hover:text-flow-text-primary"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </FlowTooltip>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {diskListPath ? (
        <div>
          <div className={inspectorEyebrowBlock}>
            On disk
          </div>
          {diskBrowse.status === "loading" ? (
            <p className="text-xs text-flow-text-muted">Loading folder contents…</p>
          ) : null}
          {diskBrowse.status === "error" ? (
            <p className="text-xs text-flow-accent-red">{diskBrowse.message}</p>
          ) : null}
          {diskBrowse.status === "ready" ? (
            <>
              {diskBrowse.entries.length === 0 ? (
                <p className="text-xs text-flow-text-muted">This folder is empty.</p>
              ) : (
                <ul className="scrollbar-elegant max-h-56 space-y-0.5 overflow-y-auto overscroll-contain rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/30 p-1 font-mono text-[11px]">
                  {diskBrowse.entries.map((ent) => (
                    <li
                      key={ent.name}
                      className="flex items-center gap-2 rounded px-2 py-1 text-flow-text-secondary"
                    >
                      {ent.isDirectory ? (
                        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/90" aria-hidden />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0 text-flow-text-muted" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate">{ent.name}</span>
                    </li>
                  ))}
                </ul>
              )}
              {diskBrowse.truncated ? (
                <p className="mt-1.5 text-[10px] text-flow-text-muted">
                  List capped for performance — open the folder in File Explorer to see everything.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const renderOrganizeTab = () => (
    <div className="space-y-4">
      {onToggleExcludeFromActiveProfile ? (
        <div>
          <div className={inspectorEyebrowBlock}>This profile</div>
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
        </div>
      ) : null}

      <div>
        <label className={inspectorEyebrowBlock} htmlFor="library-default-app">
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

      {!isFolder && selection.item.description?.trim() ? (
        <div>
          <div className={inspectorEyebrowBlock}>Description</div>
          <p className="whitespace-pre-wrap rounded-lg border border-flow-border/50 bg-flow-surface/40 px-3 py-2 text-xs leading-snug text-flow-text-secondary">
            {selection.item.description.trim()}
          </p>
        </div>
      ) : null}

      {onDeleteFromLibrary ? (
        <div>
          <div className={inspectorEyebrowBlock}>Library</div>
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
    </div>
  );

  const renderAddTab = () => (
    <div className="space-y-4">
      <p className={inspectorHelperTextClass}>
        Place on the monitor layout or minimized row. The library entry stays; this adds a
        slot reference for the active profile. Paths and disk contents are on the Browse tab.
      </p>
      <div>
        <div className={inspectorEyebrowBlock}>Add to layout</div>
        <div className="flex flex-col gap-1">
          {monitors.length ? (
            monitors.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onPlaceOnMonitor(m.id)}
                className={inspectorPanelListButtonClass}
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
            className={inspectorPanelListButtonClass}
          >
            Minimized row
          </button>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "browse":
        return renderBrowseTab();
      case "organize":
        return renderOrganizeTab();
      case "add":
        return renderAddTab();
      default:
        return renderBrowseTab();
    }
  };

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

      <div className="border-b border-flow-border/50 bg-flow-bg-secondary/80">
        <div className="flex">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 text-[11px] font-medium transition-all duration-150 ease-out border-b-2 ${
                  activeTab === tab.id
                    ? "border-flow-accent-blue bg-flow-bg-primary/40 text-flow-accent-blue"
                    : "border-transparent text-flow-text-muted hover:bg-flow-surface/50 hover:text-flow-text-primary"
                }`}
              >
                <IconComponent className="h-3 w-3 shrink-0" aria-hidden />
                <span className="hidden min-[340px]:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="scrollbar-elegant min-h-0 flex-1 overflow-y-auto pl-4 pr-0 py-4">
        <div className="space-y-4 pr-3 sm:pr-4">{renderTabContent()}</div>
      </div>
    </div>
  );
}
