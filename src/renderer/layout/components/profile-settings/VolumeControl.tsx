import { Volume2, VolumeX } from "lucide-react";

interface VolumeControlProps {
  globalVolume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
}

export function VolumeControl({ globalVolume, isMuted, onVolumeChange, onMuteToggle }: VolumeControlProps) {
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    onVolumeChange(newVolume);
  };

  return (
    <div className="space-y-4">
      <h4 className="text-white flex items-center gap-2">
        <Volume2 className="w-4 h-4" />
        Global Volume Control
      </h4>
      <div className="flex items-center gap-3">
        <button 
          onClick={onMuteToggle}
          className={`p-2 rounded-lg transition-colors ${isMuted ? 'bg-red-500/20 text-red-200' : 'bg-white/10 text-white/70'}`}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input 
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : globalVolume}
          onChange={handleVolumeChange}
          disabled={isMuted}
          className="flex-1 accent-purple-400"
        />
        <span className="text-white/60 text-sm w-12">{isMuted ? 0 : globalVolume}%</span>
      </div>
      <p className="text-white/50 text-xs">Controls the default volume level for all apps in this profile</p>
    </div>
  );
}