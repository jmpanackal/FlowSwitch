import { useState } from "react";
import { Monitor, Globe, MoreVertical, Copy, Edit, Trash2, Download, Zap, ZapOff, Clock, Layers } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { ProfileIconGlyph } from "../utils/profileHeaderPresentation";
import { formatUnit } from "../../utils/pluralize";
import { FlowTooltip } from "./ui/tooltip";

interface Profile {
  id: string;
  name: string;
  icon: string;
  description: string;
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
  onSettings?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onSetOnStartup?: () => void;
  disabled?: boolean;
}

export function ProfileCard({ profile, onClick, onSettings, onDuplicate, onDelete, onExport, onSetOnStartup, disabled = false }: ProfileCardProps) {
  const [showActions, setShowActions] = useState(false);

  const handleActionClick = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setShowActions(false);
  };

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
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`text-sm font-semibold tracking-tight truncate ${
                profile.isActive ? 'text-flow-accent-blue' : 'text-flow-text-primary'
              }`}>{profile.name}</h3>
              {profile.hotkey && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-flow-surface text-flow-text-muted border border-flow-border">
                  {profile.hotkey.replace('Ctrl+Shift+', '⌘')}
                </span>
              )}
            </div>

            <p className="text-flow-text-muted text-[11px] leading-snug mb-3 line-clamp-2">{profile.description}</p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1 text-flow-text-muted">
                <Layers className="w-3 h-3" />
                <span>{formatUnit(profile.appCount, "app")}</span>
              </div>
              <div className="flex items-center gap-1 text-flow-text-muted">
                <Globe className="w-3 h-3" />
                <span>{formatUnit(profile.tabCount, "tab")}</span>
              </div>
              <div className="flex items-center gap-1 text-flow-text-muted">
                <Monitor className="w-3 h-3" />
                <span>{formatUnit(profile.monitors.length, "monitor")}</span>
              </div>
              <div className="flex items-center gap-1 text-flow-text-muted">
                <Clock className="w-3 h-3" />
                <span>{profile.estimatedStartupTime}s</span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile actions: always visible for discoverability and keyboard paths */}
        {!disabled && (
          <div className="absolute top-3 right-3 flex items-center gap-0.5">
            {onSettings ? (
              <FlowTooltip label="Edit profile">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSettings();
                  }}
                  className="rounded p-1 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary"
                  aria-label={`Edit ${profile.name}`}
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
              </FlowTooltip>
            ) : null}
            <div className="relative">
              <FlowTooltip label="More">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowActions(!showActions);
                  }}
                  className="rounded p-1 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary"
                  aria-expanded={showActions}
                  aria-haspopup="menu"
                  aria-label={`More actions for ${profile.name}`}
                >
                  <MoreVertical className="h-3 w-3" />
                </button>
              </FlowTooltip>

              {showActions && (
                <div className="absolute top-6 right-0 w-48 bg-flow-surface-elevated border border-flow-border/60 rounded-xl shadow-flow-shadow-lg z-10 py-1">
                  {onSetOnStartup && (
                    <button
                      onClick={(e) => handleActionClick(e, onSetOnStartup)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary text-sm transition-colors"
                    >
                      {profile.onStartup ? <ZapOff className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                      {profile.onStartup ? 'Disable On-Startup' : 'Set On-Startup'}
                    </button>
                  )}
                  {onExport && (
                    <button
                      onClick={(e) => handleActionClick(e, onExport)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary text-sm transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Export Profile
                    </button>
                  )}
                  {onDuplicate && (
                    <button
                      onClick={(e) => handleActionClick(e, onDuplicate)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-text-secondary hover:bg-flow-surface hover:text-flow-text-primary text-sm transition-colors"
                    >
                      <Copy className="w-3 h-3" />
                      Duplicate
                    </button>
                  )}
                  <div className="h-px bg-flow-border my-1" />
                  {onDelete && (
                    <button
                      onClick={(e) => handleActionClick(e, onDelete)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-flow-accent-red hover:bg-flow-accent-red/10 text-sm transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
