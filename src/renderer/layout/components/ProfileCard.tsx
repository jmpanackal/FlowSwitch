import type { ReactNode } from "react";
import { Settings, Zap, Clock, Layers, Keyboard } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { ProfileIconFrame } from "../utils/profileHeaderPresentation";
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
      : "flow-card-quiet flow-card-quiet-library cursor-pointer";

const primaryHitClass =
  "absolute inset-0 z-0 m-0 cursor-pointer rounded-xl border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/50 focus-visible:ring-offset-0 disabled:cursor-not-allowed";

type ProfileCardShellProps = {
  profile: Profile;
  disabled: boolean;
  onClick: () => void;
  titleId: string;
  pad: string;
  surfaceExtraClass?: string;
  children: ReactNode;
  settingsSlot: ReactNode;
};

/**
 * Primary selection is a full-size transparent `button` (keyboard + SR) so we never nest
 * interactive buttons. Secondary actions sit above with `pointer-events-auto`.
 */
function ProfileCardShell({
  profile,
  disabled,
  onClick,
  titleId,
  pad,
  surfaceExtraClass = "",
  children,
  settingsSlot,
}: ProfileCardShellProps) {
  const surface = `${cardSurfaceClass(profile, disabled)} ${surfaceExtraClass}`.trim();
  return (
    <div className="relative min-w-0">
      <div
        className={`relative ${pad} rounded-xl transition-all duration-150 ease-out group border ${surface}`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={disabled ? undefined : onClick}
          className={primaryHitClass}
          aria-labelledby={titleId}
          aria-current={profile.isActive ? "true" : undefined}
        />
        <div className="relative z-[1] min-w-0 pointer-events-none">{children}</div>
        {settingsSlot}
      </div>
    </div>
  );
}

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
  const titleId = `profile-card-title-${profile.id}`;

  const statusBadges =
    profile.autoLaunchOnBoot || profile.autoSwitchTime ? (
      <div className="absolute top-2 left-2 z-[1] flex gap-1">
        {profile.autoLaunchOnBoot && (
          <span className="inline-flex items-center gap-1 rounded-full border border-flow-accent-green/30 bg-flow-accent-green/20 px-1.5 py-0.5 text-xs font-medium text-flow-accent-green">
            <Zap className="h-2.5 w-2.5" aria-hidden />
          </span>
        )}
        {profile.autoSwitchTime && (
          <span className="inline-flex items-center gap-1 rounded-full border border-flow-accent-purple/30 bg-flow-accent-purple/20 px-1.5 py-0.5 text-xs font-medium text-flow-accent-purple">
            <Clock className="h-2.5 w-2.5" aria-hidden />
          </span>
        )}
      </div>
    ) : null;

  const settingsBtn =
    !disabled && onSettings ? (
      <div
        className={`pointer-events-auto absolute z-[2] flex items-center ${
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
      <ProfileCardShell
        profile={profile}
        disabled={disabled}
        onClick={onClick}
        titleId={titleId}
        pad={pad}
        surfaceExtraClass="flex min-w-0 flex-col items-center text-center"
        settingsSlot={settingsBtn}
      >
        {statusBadges}
        <div className="flex w-full min-w-0 flex-col items-center gap-2 pt-1">
          <div
            className={`rounded-[12px] p-0.5 transition-[box-shadow,transform] duration-150 ${
              profile.isActive
                ? "shadow-[0_0_0_2px_color-mix(in_oklch,var(--flow-accent-blue)_42%,transparent)]"
                : "group-hover:scale-[1.02]"
            }`}
          >
            <ProfileIconFrame icon={profile.icon} variant="default" />
          </div>
          <h3
            id={titleId}
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
                <span className="pointer-events-auto inline-flex max-w-full min-w-0">
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
                </span>
              </FlowTooltip>
            )}
          </div>
        </div>
      </ProfileCardShell>
    );
  }

  if (density === "compact") {
    return (
      <ProfileCardShell
        profile={profile}
        disabled={disabled}
        onClick={onClick}
        titleId={titleId}
        pad={pad}
        surfaceExtraClass={!disabled && onSettings ? "pr-9" : ""}
        settingsSlot={settingsBtn}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`shrink-0 rounded-[10px] p-0.5 transition-[box-shadow,transform] duration-150 ${
              profile.isActive
                ? "shadow-[0_0_0_2px_color-mix(in_oklch,var(--flow-accent-blue)_42%,transparent)]"
                : "group-hover:scale-[1.02]"
            }`}
          >
            <ProfileIconFrame icon={profile.icon} variant="sidebar" />
          </div>
          <h3
            id={titleId}
            className={`min-w-0 flex-1 truncate font-semibold tracking-tight ${titleCls} ${
              profile.isActive
                ? "text-flow-accent-blue"
                : "text-flow-text-primary"
            }`}
          >
            {profile.name}
          </h3>
        </div>
      </ProfileCardShell>
    );
  }

  /* List (`default`): former “compact” card — stats + hotkey, tighter padding */
  return (
    <ProfileCardShell
      profile={profile}
      disabled={disabled}
      onClick={onClick}
      titleId={titleId}
      pad={pad}
      settingsSlot={settingsBtn}
    >
      {statusBadges}

      <div className="flex items-start gap-3">
        <div
          className={`shrink-0 rounded-[10px] p-0.5 transition-[box-shadow,transform] duration-150 ${
            profile.isActive
              ? "shadow-[0_0_0_2px_color-mix(in_oklch,var(--flow-accent-blue)_42%,transparent)]"
              : "group-hover:scale-[1.02]"
          }`}
        >
          <ProfileIconFrame icon={profile.icon} variant="sidebar" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1">
            <h3
              id={titleId}
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
                  <span className="pointer-events-auto inline-flex min-w-0 max-w-full">
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
                  </span>
                </FlowTooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProfileCardShell>
  );
}
