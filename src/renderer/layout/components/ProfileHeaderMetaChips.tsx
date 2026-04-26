import {
  AppWindow,
  Eye,
  LayoutGrid,
  ListOrdered,
  Minimize2,
  Sparkles,
  SquareChevronDown,
  XCircle,
} from "lucide-react";
import { FlowTooltip } from "./ui/tooltip";
import type { FlowProfile } from "../../../types/flow-profile";

/** Plain icon hit-target: no box outline (reads as part of the stats line). */
const iconBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded-md p-0.5 text-flow-text-muted/80 transition-colors hover:bg-white/[0.06] hover:text-flow-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-accent-blue/40";

type Props = {
  launchOrder: FlowProfile["launchOrder"];
  outside: FlowProfile["preLaunchOutsideProfileBehavior"];
  inside: FlowProfile["preLaunchInProfileBehavior"];
};

export function ProfileHeaderMetaChips({ launchOrder, outside, inside }: Props) {
  const launchIcon =
    launchOrder === "sequential" ? (
      <ListOrdered className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    ) : (
      <LayoutGrid className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    );
  const launchTooltip =
    launchOrder === "sequential"
      ? "Launch order: one app at a time, in your chosen sequence."
      : "Launch order: all profile apps start at once.";
  const launchAria =
    launchOrder === "sequential"
      ? "Sequential profile launch"
      : "Parallel profile launch";

  const outsideIcon =
    outside === "minimize" ? (
      <Minimize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    ) : outside === "close" ? (
      <XCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    ) : (
      <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    );
  const outsideTooltip =
    outside === "minimize"
      ? "Apps outside this profile: minimized when you launch."
      : outside === "close"
        ? "Apps outside this profile: closed when you launch."
        : "Apps outside this profile: left open when you launch.";
  const outsideAria =
    outside === "minimize"
      ? "Apps outside this profile minimized on launch"
      : outside === "close"
        ? "Apps outside this profile closed on launch"
        : "Apps outside this profile left open on launch";

  const insideIcon =
    inside === "close_for_fresh_launch" ? (
      <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    ) : inside === "minimize_then_launch" ? (
      <SquareChevronDown className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    ) : (
      <AppWindow className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    );
  const insideTooltip =
    inside === "close_for_fresh_launch"
      ? "Apps in this profile: closed first, then reopened (clean start)."
      : inside === "minimize_then_launch"
        ? "Apps in this profile: minimized first, then launched."
        : "Apps in this profile: reuse open windows when possible.";
  const insideAria =
    inside === "close_for_fresh_launch"
      ? "Profile apps closed then reopened for a clean start"
      : inside === "minimize_then_launch"
        ? "Profile apps minimized then launched"
        : "Profile apps reuse open windows when possible";

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <FlowTooltip label={launchTooltip}>
        <button type="button" className={iconBtnClass} aria-label={launchAria}>
          {launchIcon}
        </button>
      </FlowTooltip>
      <FlowTooltip label={outsideTooltip}>
        <button type="button" className={iconBtnClass} aria-label={outsideAria}>
          {outsideIcon}
        </button>
      </FlowTooltip>
      <FlowTooltip label={insideTooltip}>
        <button type="button" className={iconBtnClass} aria-label={insideAria}>
          {insideIcon}
        </button>
      </FlowTooltip>
    </span>
  );
}
