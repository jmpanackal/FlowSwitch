import { Check, Clipboard, FolderOpen } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";
import { inspectorTextLinkClass } from "./inspectorStyles";

function pathLeaf(path: string): string {
  const t = path.replace(/[/\\]+$/, "");
  const parts = t.split(/[/\\]/);
  return parts[parts.length - 1] || t;
}

export type InspectorPathDisplayProps = {
  path: string;
  copyNotice: string | null;
  onCopy: () => void;
  canRevealInExplorer: boolean;
  onRevealInExplorer: () => void | Promise<void>;
};

/**
 * Executable card: filename row with Open in Explorer + copy, then full path (truncated RTL).
 */
export function InspectorPathDisplay({
  path,
  copyNotice,
  onCopy,
  canRevealInExplorer,
  onRevealInExplorer,
}: InspectorPathDisplayProps) {
  const trimmed = path.trim();
  if (!trimmed) return null;
  const leaf = pathLeaf(trimmed);

  return (
    <div className="min-w-0 divide-y divide-flow-border/35 rounded-lg border border-flow-border/50 bg-flow-bg-tertiary/30">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2">
        <FlowTooltip label={trimmed}>
          <span className="min-w-0 flex-1 basis-[8rem] truncate font-mono text-[13px] text-flow-text-primary">
            {leaf}
          </span>
        </FlowTooltip>
        <div className="ml-auto flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {canRevealInExplorer ? (
            <button
              type="button"
              onClick={() => void onRevealInExplorer()}
              className={`${inspectorTextLinkClass} !min-h-0 gap-1 py-0.5 text-[11px]`}
              title="Show this file in File Explorer"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
              Open in Explorer
            </button>
          ) : null}
          <FlowTooltip label="Copy path">
            <button
              type="button"
              onClick={() => void onCopy()}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-flow-text-secondary transition-colors hover:border-flow-border/50 hover:bg-flow-surface-elevated hover:text-flow-text-primary"
              aria-label="Copy executable path"
            >
              {copyNotice ? (
                <Check className="h-4 w-4 text-flow-accent-green" strokeWidth={2} aria-hidden />
              ) : (
                <Clipboard className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </FlowTooltip>
        </div>
      </div>
      <div
        className="min-w-0 truncate px-3 py-1.5 font-mono text-[11px] leading-snug text-flow-text-muted"
        title={trimmed}
        dir="rtl"
      >
        <span dir="ltr">{trimmed}</span>
      </div>
    </div>
  );
}
