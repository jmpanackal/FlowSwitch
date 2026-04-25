import { Settings, Zap, ZapOff, Clock, Layers, Keyboard } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { ProfileIconGlyph } from "../utils/profileHeaderPresentation";
import { formatUnit } from "../../utils/pluralize";
import { FlowTooltip } from "./ui/tooltip";
import type { ProfileSettingsInitialSection } from "./ProfileSettings";

interface Profile {
  id: string;
  name: string;
  icon: string;
  /** Legacy field; cards show hotkey line instead of description. */
  description?: string;
  appCount: number;
  tabCount: number;
  isActive: boolean;
  onStartup?: boolean;
  autoLaunchOnBoot?: boolean;
  autoSwitchTime?: string | null;
  estimatedStartupTime?: number;
  hotkey?: string;
  monitors: {
    id: string;
    name: string;
    primary: boolean;
    resolution: string;
    apps: {
      name: string;
      icon: LucideIcon;
      color: string;
    }[];
  }[];
  minimizedApps?: {
    name: string;
    icon: LucideIcon;
    color: string;
  }[];
}

interface ProfileCardProps {
  profile: Profile;
  onClick: () => void;
  /** Pass `{ initialTab: 'automation' }` from “Set launch hotkey” to open the shortcut editor. */
  onSettings?: (options?: { initialTab?: ProfileSettingsInitialSection }) => void;
  disabled?: boolean;
}

export function ProfileCard({ profile, onClick, onSettings, disabled = false }: ProfileCardProps) {
  return (
    <div className="relative">
      <div
        onClick={disabled ? undefined : onClick}
        className={`relative p-3.5 rounded-xl transition-all duration-150 ease-out group border ${
          disabled
            ? 'bg-flow-surface/80 border-flow-border/50 opacity-60 cursor-not-allowed'
            : profile.isActive
              ? 'border-flow-border-accent/35 bg-flow-surface-elevated ring-1 ring-flow-accent-blue/35 shadow-flow-shadow-md cursor-pointer'
              : 'flow-card-quiet cursor-pointer'
        }`}
      >
        {/* Status indicators - removed active dot */}
        {(profile.autoLaunchOnBoot || profile.autoSwitchTime) && (
          <div className="absolute top-2 left-2 flex gap-1">
            {profile.autoLaunchOnBoot && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-flow-accent-green/20 text-flow-accent-green border border-flow-accent-green/30">
                <Zap className="w-2.5 h-2.5" />
              </span>
            )}
            {profile.autoSwitchTime && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-flow-accent-purple/20 text-flow-accent-purple border border-flow-accent-purple/30">
                <Clock className="w-2.5 h-2.5" />
              </span>
            )}
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg transition-colors duration-150 ${
            profile.isActive ? 'bg-flow-accent-blue/15' : 'bg-flow-bg-tertiary/80 group-hover:bg-flow-surface'
          }`}>
            <ProfileIconGlyph icon={profile.icon} className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-2">
              <h3 className={`text-sm font-semibold tracking-tight truncate ${
                profile.isActive ? 'text-flow-accent-blue' : 'text-flow-text-primary'
              }`}>{profile.name}</h3>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-flow-text-muted">
              <div className="flex min-w-0 items-center gap-1">
                <Layers className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{formatUnit(profile.appCount, "app")}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{profile.estimatedStartupTime}s</span>
              </div>
              <div className="col-span-2 flex min-w-0 items-center gap-1">
                <Keyboard className="h-3 w-3 shrink-0" aria-hidden />
                {profile.hotkey ? (
                  <span className="truncate">{profile.hotkey}</span>
                ) : (
                  <FlowTooltip label="Edit profile → Automation to set a launch hotkey">
                    <button
                      type="button"
                      disabled={disabled || !onSettings}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSettings?.({ initialTab: "automation" });
                      }}
                      className="truncate rounded px-0.5 text-left transition-colors hover:bg-flow-surface hover:text-flow-text-primary disabled:pointer-events-none disabled:opacity-50"
                    >
                      Set launch hotkey
                    </button>
                  </FlowTooltip>
                )}
              </div>
            </div>
          </div>
        </div>

        {!disabled && (
          <div className="absolute top-3 right-3 flex items-center">
            <FlowTooltip label="Edit profile">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSettings?.();
                }}
                disabled={!onSettings}
                className="rounded p-1 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary disabled:pointer-events-none disabled:opacity-50"
                aria-label={`Edit ${profile.name} settings`}
              >
                <Settings className="h-3 w-3" />
              </button>
            </FlowTooltip>
          </div>
        )}
      </div>
    </div>
  );
}
