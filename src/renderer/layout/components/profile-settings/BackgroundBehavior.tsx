import { Settings } from "lucide-react";
import { backgroundBehaviorOptions } from "./constants";

interface BackgroundBehaviorProps {
  backgroundBehavior: string;
  onBehaviorChange: (behavior: string) => void;
}

export function BackgroundBehavior({ backgroundBehavior, onBehaviorChange }: BackgroundBehaviorProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-white flex items-center gap-2">
        <Settings className="w-4 h-4" />
        Background App Behavior
      </h4>
      <div className="space-y-2">
        {backgroundBehaviorOptions.map((option) => (
          <label key={option.value} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <input 
              type="radio"
              name="backgroundBehavior"
              value={option.value}
              checked={backgroundBehavior === option.value}
              onChange={(e) => onBehaviorChange(e.target.value)}
              className="accent-purple-400"
            />
            <div>
              <div className="text-white text-sm">{option.label}</div>
              <div className="text-white/60 text-xs">{option.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}