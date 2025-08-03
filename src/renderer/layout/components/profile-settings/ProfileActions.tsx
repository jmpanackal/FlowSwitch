import { Copy, Trash2 } from "lucide-react";

interface ProfileActionsProps {
  onDuplicate?: () => void;
  onDelete?: () => void;
  onShowDeleteConfirm: () => void;
}

export function ProfileActions({ onDuplicate, onDelete, onShowDeleteConfirm }: ProfileActionsProps) {
  return (
    <div className="space-y-4 pt-4 border-t border-white/10">
      <h4 className="text-white">Profile Actions</h4>
      <div className="flex gap-3">
        {onDuplicate && (
          <button 
            onClick={onDuplicate}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-400/30 rounded-lg transition-colors text-sm"
          >
            <Copy className="w-4 h-4" />
            Duplicate
          </button>
        )}
        {onDelete && (
          <button 
            onClick={onShowDeleteConfirm}
            className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/30 rounded-lg transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Delete Profile
          </button>
        )}
      </div>
    </div>
  );
}