import { Settings } from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";

type ProfileHeaderSettingsButtonProps = {
  disabled: boolean;
  onOpenProfileSettings: () => void;
};

/** Header control: opens the profile editor modal (same as former “Profile preferences” in the overflow menu). */
export function ProfileHeaderSettingsButton({
  disabled,
  onOpenProfileSettings,
}: ProfileHeaderSettingsButtonProps) {
  return (
    <FlowTooltip label="Profile settings">
      <span className="inline-flex">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!disabled) onOpenProfileSettings();
          }}
          className={`inline-flex items-center justify-center rounded-lg p-2 text-flow-text-secondary transition-colors duration-150 ease-out hover:bg-white/[0.06] hover:text-flow-text-primary md:px-2.5 md:py-2 ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          }`}
          aria-label="Profile settings"
        >
          <Settings className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </span>
    </FlowTooltip>
  );
}
