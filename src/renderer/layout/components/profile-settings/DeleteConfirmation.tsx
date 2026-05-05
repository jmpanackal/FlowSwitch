import { Trash2 } from "lucide-react";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";

interface DeleteConfirmationProps {
  isOpen: boolean;
  profileName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmation({ isOpen, profileName, onCancel, onConfirm }: DeleteConfirmationProps) {
  useEscapeToClose(isOpen, onCancel);

  if (!isOpen) return null;

  return (
    <div
      className="flow-modal-backdrop-enter absolute inset-0 z-[60] flex items-center justify-center rounded-2xl bg-black/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-profile-title"
        aria-describedby="delete-profile-desc"
        className="flow-modal-nested-panel-enter w-full max-w-md rounded-xl border border-flow-border bg-flow-surface-elevated p-5 shadow-flow-shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-flow-accent-red/30 bg-flow-accent-red/15">
            <Trash2 className="h-5 w-5 text-flow-accent-red" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="delete-profile-title" className="text-lg font-semibold text-flow-text-primary">
              Delete profile?
            </h3>
            <p id="delete-profile-desc" className="mt-2 text-sm leading-relaxed text-flow-text-secondary">
              This permanently removes{" "}
              <span className="font-medium text-flow-text-primary">{profileName}</span>
              {" "}
              and everything saved for it (layout, automation, filters). This cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-sm font-medium text-flow-text-secondary transition-colors rounded-lg border border-flow-border bg-flow-surface hover:bg-flow-surface-elevated hover:text-flow-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-2 text-sm font-medium text-flow-accent-red transition-colors rounded-lg border border-flow-accent-red/35 bg-flow-accent-red/10 hover:bg-flow-accent-red/20"
          >
            Delete profile
          </button>
        </div>
      </div>
    </div>
  );
}
