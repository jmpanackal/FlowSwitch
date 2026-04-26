import type { ReactNode } from "react";
import { ChevronsUp } from "lucide-react";
import { safeIconSrc } from "../../utils/safeIconSrc";
import type { SnapZoneLike } from "../utils/monitorLayoutStacking";
import { frontIndexInStack } from "../utils/monitorLayoutStacking";

type StackAppLike = {
  name: string;
  iconPath?: string | null;
  icon?: React.ComponentType<{ className?: string }>;
};

type MonitorAppStackClusterProps = {
  zone: SnapZoneLike;
  apps: StackAppLike[];
  /** Sorted ascending (back → front). */
  indices: number[];
  densePreviewMode?: boolean;
  /** Front-most app index (higher = front). */
  frontIndex: number;
  children: ReactNode;
  onSelectMember?: (appIndex: number) => void;
  onFanMemberPointerDown?: (
    monitorId: string,
    appIndex: number,
    clientX: number,
    clientY: number,
  ) => void;
  /** Bring this member to the top of the stack (launch order). */
  onBringMemberToFront?: (monitorId: string, appIndex: number) => void;
  monitorId: string;
};

const FAN_VISIBLE = 4;

/**
 * Stack controls sit on the **right edge** as an overlay so the child window keeps exact
 * percent geometry. The **front** app is shown only in the main tile — the rail lists
 * other stack members; reorder is a tiny control on each row.
 */
export function MonitorAppStackCluster({
  zone,
  apps,
  indices,
  densePreviewMode,
  frontIndex,
  children,
  onSelectMember,
  onFanMemberPointerDown,
  onBringMemberToFront,
  monitorId,
}: MonitorAppStackClusterProps) {
  const orderedFrontFirst = [...indices].sort((a, b) => b - a);
  const backOnly = orderedFrontFirst.filter((idx) => idx !== frontIndex);
  const visible = backOnly.slice(0, FAN_VISIBLE);
  const overflow = Math.max(0, backOnly.length - FAN_VISIBLE);
  const n = indices.length;

  return (
    <div
      className="absolute z-[25] overflow-visible"
      style={{
        left: `${zone.position.x - zone.size.width / 2}%`,
        top: `${zone.position.y - zone.size.height / 2}%`,
        width: `${zone.size.width}%`,
        height: `${zone.size.height}%`,
      }}
      data-monitor-stack-cluster="true"
    >
      <div className="absolute inset-0 z-0 min-h-0 min-w-0">{children}</div>

      <div
        className="pointer-events-none absolute inset-y-1 right-1 z-10 flex w-14 min-w-0 flex-col items-center justify-center gap-1.5"
        data-stack-fan="true"
        aria-label="Stacked apps in this zone"
      >
        {backOnly.length > 0 ? (
          <div className="pointer-events-auto flex max-h-full w-max min-w-0 max-w-full flex-col items-center gap-1 overflow-y-auto rounded-lg border border-white/12 bg-black/70 px-1.5 py-1.5 shadow-md backdrop-blur-md">
            {visible.map((appIndex) => {
              const app = apps[appIndex];
              if (!app) return null;
              const iconSrc = safeIconSrc(app.iconPath ?? undefined);
              const IconComp = app.icon;
              return (
                <div
                  key={appIndex}
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center"
                >
                  <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-inset ring-white/[0.06] transition-[background-color,box-shadow,color,transform] duration-200 ease-out hover:bg-white/[0.11] hover:ring-white/15 active:scale-[0.97] motion-reduce:active:scale-100"
                    aria-label={`${app.name}, in stack`}
                    onClick={() => onSelectMember?.(appIndex)}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      onFanMemberPointerDown?.(monitorId, appIndex, e.clientX, e.clientY);
                    }}
                  >
                    {iconSrc ? (
                      <img
                        src={iconSrc}
                        alt=""
                        className="h-7 w-7 object-contain"
                        draggable={false}
                      />
                    ) : IconComp ? (
                      <IconComp className="h-7 w-7 text-white" />
                    ) : (
                      <span className="text-[9px] text-white/80">App</span>
                    )}
                    {appIndex === visible[visible.length - 1] && overflow > 0 ? (
                      <span className="absolute -left-0.5 top-1/2 z-[1] min-w-[14px] -translate-y-1/2 rounded-full bg-flow-accent-blue px-0.5 text-center text-[8px] font-semibold leading-tight text-white shadow-sm">
                        +{overflow}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto absolute bottom-0.5 right-0.5 z-20 flex h-5 w-5 items-center justify-center rounded-md border border-white/15 bg-black/85 text-white/90 shadow-md backdrop-blur-sm transition-[color,background-color,border-color,transform] duration-200 ease-out hover:border-flow-accent-blue/50 hover:text-flow-accent-blue active:scale-95 motion-reduce:active:scale-100"
                    aria-label={`Bring ${app.name} to front`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onBringMemberToFront?.(monitorId, appIndex);
                    }}
                  >
                    <ChevronsUp className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}

        <span
          className={`pointer-events-auto w-full shrink-0 text-center ${
            densePreviewMode ? "hidden sm:block" : ""
          }`}
        >
          <span className="inline-block rounded-full border border-white/12 bg-black/65 px-2 py-0.5 text-[8px] font-medium tabular-nums text-white/90 shadow-sm backdrop-blur-sm">
            {n} apps
          </span>
        </span>
      </div>
    </div>
  );
}

export function isHiddenStackMember(
  appIndex: number,
  stackClusters: { indices: number[] }[],
): boolean {
  for (const c of stackClusters) {
    if (c.indices.length < 2) continue;
    if (!c.indices.includes(appIndex)) continue;
    return appIndex !== frontIndexInStack(c.indices);
  }
  return false;
}
