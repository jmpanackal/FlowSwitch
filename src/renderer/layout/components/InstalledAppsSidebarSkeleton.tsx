const DEFAULT_ROWS = 4;

function AppTilesLoader() {
  return (
    <div
      className="grid grid-cols-2 gap-1.5 rounded-xl p-1"
      aria-hidden
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flow-installed-apps-tile h-4 w-4 rounded-md motion-safe:will-change-transform"
          style={{ animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </div>
  );
}

/**
 * Loading state for the compact sidebar Apps list — borderless, Flow tokens, app-tile motif.
 * Render inside a `flex flex-1 flex-col items-center justify-center` wrapper so it sits mid-list.
 */
export function InstalledAppsSidebarSkeleton({
  rowCount = DEFAULT_ROWS,
}: {
  rowCount?: number;
}) {
  return (
    <div
      className="flex w-full max-w-[17.5rem] flex-col items-center gap-5"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading installed applications"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-flow-surface/25 px-5 py-5">
        <AppTilesLoader />
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-flow-text-secondary">
            Loading apps
          </p>
          <p className="max-w-[14rem] text-[10px] leading-snug text-flow-text-muted">
            Scanning Start Menu, Store packages, and icons…
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col gap-2">
        {Array.from({ length: rowCount }, (_, i) => (
          <div
            key={i}
            className="rounded-lg bg-flow-bg-tertiary/40 p-3 motion-safe:flow-installed-apps-skeleton-row"
            style={{
              animationDelay: `${i * 95}ms`,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-flow-bg-tertiary/60" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
                <div className="h-3.5 max-w-[11rem] rounded bg-flow-bg-tertiary/55" />
                <div className="h-2.5 w-16 rounded bg-flow-bg-tertiary/45" />
              </div>
              <div className="h-7 w-7 shrink-0 rounded-md bg-flow-bg-tertiary/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
