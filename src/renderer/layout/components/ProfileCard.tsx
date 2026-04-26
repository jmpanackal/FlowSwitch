import { Settings, Zap, Clock, Layers, Keyboard } from "lucide-react";
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
  /**
   * Sidebar library density: `default` (list) = icon, name, stats, hotkey;
   * `compact` = icon and name only; `grid` = tile grid.
   */
  density?: "default" | "compact" | "grid";
}

const cardSurfaceClass = (profile: Profile, disabled: boolean) =>
  disabled
    ? "bg-flow-surface/80 border-flow-border/50 opacity-60 cursor-not-allowed"
    : profile.isActive
      ? "border-flow-border-accent/35 bg-flow-surface-elevated ring-1 ring-flow-accent-blue/35 shadow-flow-shadow-md cursor-pointer"
      : "flow-card-quiet cursor-pointer";

export function ProfileCard({
  profile,
  onClick,
  onSettings,
  disabled = false,
  density = "default",
}: ProfileCardProps) {
  const pad =
    density === "compact" ? "p-2" : density === "grid" ? "p-2.5" : "p-2.5";
  const titleCls = "text-xs";

  const statusBadges =
    profile.autoLaunchOnBoot || profile.autoSwitchTime ? (
      <div className="absolute top-2 left-2 z-[1] flex gap-1">
        {profile.autoLaunchOnBoot && (
          <span className="inline-flex items-center gap-1 rounded-full border border-flow-accent-green/30 bg-flow-accent-green/20 px-1.5 py-0.5 text-xs font-medium text-flow-accent-green">
            <Zap className="h-2.5 w-2.5" />
          </span>
        )}
        {profile.autoSwitchTime && (
          <span className="inline-flex items-center gap-1 rounded-full border border-flow-accent-purple/30 bg-flow-accent-purple/20 px-1.5 py-0.5 text-xs font-medium text-flow-accent-purple">
            <Clock className="h-2.5 w-2.5" />
          </span>
        )}
      </div>
    ) : null;

  const settingsBtn =
    !disabled && onSettings ? (
      <div
        className={`absolute z-[1] flex items-center ${
          density === "grid" || density === "compact"
            ? "top-2 right-2"
            : "top-2.5 right-2.5"
        }`}
      >
        <FlowTooltip label="Edit profile">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSettings();
            }}
            disabled={!onSettings}
            className="rounded p-1 text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary disabled:pointer-events-none disabled:opacity-50"
            aria-label={`Edit ${profile.name} settings`}
          >
            <Settings className="h-3 w-3" />
          </button>
        </FlowTooltip>
      </div>
    ) : null;

  if (density === "grid") {
    return (
      <div className="relative min-w-0">
        <div
          onClick={disabled ? undefined : onClick}
          className={`relative ${pad} rounded-xl transition-all duration-150 ease-out group border ${cardSurfaceClass(
            profile,
            disabled,
          )} flex min-w-0 flex-col items-center text-center`}
        >
          {statusBadges}
          <div className="flex w-full min-w-0 flex-col items-center gap-2 pt-1">
            <div
              className={`rounded-xl p-2.5 transition-colors duration-150 ${
                profile.isActive
                  ? "bg-flow-accent-blue/15"
                  : "bg-flow-bg-tertiary/80 group-hover:bg-flow-surface"
              }`}
            >
              <ProfileIconGlyph icon={profile.icon} className="h-5 w-5" />
            </div>
            <h3
              className={`w-full min-w-0 truncate font-semibold tracking-tight ${titleCls} ${
                profile.isActive
                  ? "text-flow-accent-blue"
                  : "text-flow-text-primary"
              }`}
            >
              {profile.name}
            </h3>
            <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[10px] text-flow-text-muted">
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <Layers className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">
                  {formatUnit(profile.appCount, "app")}
                </span>
              </span>
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <Clock className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{profile.estimatedStartupTime}s</span>
              </span>
            </div>
            <div className="flex w-full min-w-0 items-center justify-center gap-0.5 text-[10px] text-flow-text-muted">
              <Keyboard className="h-3 w-3 shrink-0" aria-hidden />
              {profile.hotkey ? (
                <span className="min-w-0 truncate">{profile.hotkey}</span>
              ) : (
                <FlowTooltip label="Edit profile → Automation to set a launch hotkey">
                  <button
                    type="button"
                    disabled={disabled || !onSettings}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSettings?.({ initialTab: "automation" });
                    }}
                    className="max-w-full truncate rounded px-0.5 transition-colors hover:bg-flow-surface hover:text-flow-text-primary disabled:pointer-events-none disabled:opacity-50"
                  >
                    Set hotkey
                  </button>
                </FlowTooltip>
              )}
            </div>
          </div>
          {settingsBtn}
        </div>
      </div>
    );
  }

  if (density === "compact") {
    return (
      <div className="relative min-w-0">
        <div
          onClick={disabled ? undefined : onClick}
          className={`relative ${pad} rounded-xl transition-all duration-150 ease-out group border ${cardSurfaceClass(
            profile,
            disabled,
          )} ${!disabled && onSettings ? "pr-9" : ""}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div
              className={`shrink-0 rounded-lg p-1.5 transition-colors duration-150 ${
                profile.isActive
                  ? "bg-flow-accent-blue/15"
                  : "bg-flow-bg-tertiary/80 group-hover:bg-flow-surface"
              }`}
            >
              <ProfileIconGlyph icon={profile.icon} className="h-4 w-4" />
            </div>
            <h3
              className={`min-w-0 flex-1 truncate font-semibold tracking-tight ${titleCls} ${
                profile.isActive
                  ? "text-flow-accent-blue"
                  : "text-flow-text-primary"
              }`}
            >
              {profile.name}
            </h3>
          </div>
          {settingsBtn}
        </div>
      </div>
    );
  }

  /* List (`default`): former “compact” card — stats + hotkey, tighter padding */
  return (
    <div className="relative">
      <div
        onClick={disabled ? undefined : onClick}
        className={`relative ${pad} rounded-xl transition-all duration-150 ease-out group border ${cardSurfaceClass(
          profile,
          disabled,
        )}`}
      >
        {statusBadges}

        <div className="flex items-start gap-3">
          <div
            className={`rounded-lg p-2 transition-colors duration-150 ${
              profile.isActive
                ? "bg-flow-accent-blue/15"
                : "bg-flow-bg-tertiary/80 group-hover:bg-flow-surface"
            }`}
          >
            <ProfileIconGlyph icon={profile.icon} className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1">
              <h3
                className={`${titleCls} truncate font-semibold tracking-tight ${
                  profile.isActive
                    ? "text-flow-accent-blue"
                    : "text-flow-text-primary"
                }`}
              >
                {profile.name}
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-1 text-[11px] text-flow-text-muted">
              <div className="flex min-w-0 items-center gap-1">
                <Layers className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">
                  {formatUnit(profile.appCount, "app")}
                </span>
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

        {settingsBtn}
      </div>
    </div>
  );
}
