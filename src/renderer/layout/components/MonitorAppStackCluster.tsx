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
        className="pointer-events-none absolute inset-y-1 right-1 z-10 flex w-9 flex-col items-end justify-center gap-0.5"
        data-stack-fan="true"
        aria-label="Stacked apps in this zone"
      >
        {backOnly.length > 0 ? (
          <div className="pointer-events-auto flex max-h-full flex-col items-center gap-0.5 overflow-y-auto rounded-md border border-white/12 bg-black/60 px-0.5 py-1 shadow-lg backdrop-blur-sm">
            {visible.map((appIndex) => {
              const app = apps[appIndex];
              if (!app) return null;
              const iconSrc = safeIconSrc(app.iconPath ?? undefined);
              const IconComp = app.icon;
              return (
                <div key={appIndex} className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                    <button
                      type="button"
                      className="absolute -right-0.5 -top-0.5 z-20 flex h-3 w-3 items-center justify-center rounded border border-white/25 bg-black/90 text-white/90 shadow-sm hover:border-flow-accent-blue/60 hover:text-flow-accent-blue"
                      aria-label={`Bring ${app.name} to front`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBringMemberToFront?.(monitorId, appIndex);
                      }}
                    >
                      <ChevronsUp className="h-2 w-2" strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded border border-white/18 bg-black/55 opacity-85 shadow-sm transition hover:border-flow-accent-blue/50 hover:bg-black/75 hover:opacity-100"
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
                          className="h-3.5 w-3.5 object-contain"
                          draggable={false}
                        />
                      ) : IconComp ? (
                        <IconComp className="h-3.5 w-3.5 text-white" />
                      ) : (
                        <span className="text-[8px] text-white/80">App</span>
                      )}
                      {appIndex === visible[visible.length - 1] && overflow > 0 ? (
                        <span className="absolute -left-1 top-1/2 z-[1] min-w-[12px] -translate-y-1/2 rounded-full bg-flow-accent-blue px-0.5 text-center text-[8px] font-semibold leading-tight text-white shadow-sm">
                          +{overflow}
                        </span>
                      ) : null}
                    </button>
                  </div>
              );
            })}
          </div>
        ) : null}

        <span
          className={`pointer-events-auto rounded-full border border-white/12 bg-black/55 px-1 py-px text-[8px] font-medium text-white/85 shadow backdrop-blur-sm ${
            densePreviewMode ? "hidden sm:inline" : ""
          }`}
        >
          {n} apps
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
