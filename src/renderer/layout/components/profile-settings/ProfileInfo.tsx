import { Edit } from "lucide-react";

interface ProfileInfoProps {
  profileName: string;
  profileDescription: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onUpdate: () => void;
}

export function ProfileInfo({ 
  profileName, 
  profileDescription, 
  onNameChange, 
  onDescriptionChange, 
  onUpdate 
}: ProfileInfoProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-white flex items-center gap-2">
        <Edit className="w-4 h-4" />
        Profile Information
      </h4>
      <div className="space-y-3">
        <div>
          <label className="block text-white/70 text-sm mb-1">Profile Name</label>
          <input
            type="text"
            value={profileName}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50"
          />
        </div>
        <div>
          <label className="block text-white/70 text-sm mb-1">Description</label>
          <textarea
            value={profileDescription}
            onChange={(e) => onDescriptionChange(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-400/50 resize-none"
            rows={2}
          />
        </div>
        <button
          onClick={onUpdate}
          className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-400/30 rounded-lg transition-colors text-sm"
        >
          Update Profile Info
        </button>
      </div>
    </div>
  );
}