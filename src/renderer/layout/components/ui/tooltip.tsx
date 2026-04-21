"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "./utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipPortal = TooltipPrimitive.Portal;

/** Inner surface only; outer Content is positioned by Radix (avoids transform clashes). */
export const flowTooltipInnerClassName = cn(
  "flow-tooltip-inner-surface max-w-[min(20rem,calc(100vw-1.5rem))] rounded-md border border-flow-border bg-flow-surface-elevated px-2.5 py-1.5 text-xs font-medium leading-snug text-flow-text-primary shadow-flow-shadow-lg",
);

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => (
  <TooltipPortal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn("z-[100000] outline-none", className)}
      {...props}
    >
      <div className={cn(flowTooltipInnerClassName, "flow-tooltip-inner-pop")}>{children}</div>
    </TooltipPrimitive.Content>
  </TooltipPortal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

type FlowTooltipProps = {
  /** When missing or empty, children render with no tooltip wrapper. */
  label?: string | null;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"];
  delayDuration?: number;
  children: React.ReactElement;
};

/**
 * Standard hover tooltip: Radix positioning + shared FlowSwitch panel styling and motion.
 * Prefer this over native `title` for consistent UI.
 */
function FlowTooltip({
  label,
  side = "top",
  delayDuration = 420,
  children,
}: FlowTooltipProps) {
  if (label == null || label === "") {
    return children;
  }

  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span className="block whitespace-pre-line">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  FlowTooltip,
};
