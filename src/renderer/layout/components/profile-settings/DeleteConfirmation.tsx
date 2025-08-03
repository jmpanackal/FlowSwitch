interface DeleteConfirmationProps {
  isOpen: boolean;
  profileName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmation({ isOpen, profileName, onCancel, onConfirm }: DeleteConfirmationProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-2xl">
      <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl p-6 max-w-md">
        <h3 className="text-white text-lg mb-2">Delete Profile</h3>
        <p className="text-white/70 mb-4">
          Are you sure you want to delete "{profileName}"? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-400/30 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}