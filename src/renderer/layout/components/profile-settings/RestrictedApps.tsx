import { Shield } from "lucide-react";
import { commonRestrictedApps } from "./constants";

interface RestrictedAppsProps {
  restrictedApps: string[];
  onToggleApp: (appName: string) => void;
}

export function RestrictedApps({ restrictedApps, onToggleApp }: RestrictedAppsProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-white flex items-center gap-2">
        <Shield className="w-4 h-4" />
        Restricted Applications
      </h4>
      <p className="text-white/60 text-sm">Prevent these apps from being launched in this profile</p>
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {commonRestrictedApps.map((appName) => (
          <label key={appName} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <input
              type="checkbox"
              checked={restrictedApps.includes(appName)}
              onChange={() => onToggleApp(appName)}
              className="accent-red-400"
            />
            <span className="text-white text-sm">{appName}</span>
          </label>
        ))}
      </div>
    </div>
  );
}