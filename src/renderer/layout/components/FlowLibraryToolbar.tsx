import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Filter,
  LayoutGrid,
  List,
  ListOrdered,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { SidebarOverlayMenu } from "./SidebarOverlayMenu";
import { FlowTooltip } from "./ui/tooltip";

export type FlowLibraryViewMode = "list" | "compact" | "grid";

export type FlowLibraryFilterChip = {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
};

export type FlowLibrarySortOption = {
  id: string;
  label: string;
};

/** Shared pill trigger for filter / sort / add in the library toolbar row. */
export const FLOW_LIBRARY_TOOLBAR_PILL_CLASS =
  "inline-flex h-9 w-full min-w-0 items-center justify-center gap-1 rounded-full border border-flow-border/55 bg-flow-surface/70 px-1.5 text-xs font-medium text-flow-text-secondary transition-colors hover:border-flow-border-accent/40 hover:bg-flow-surface hover:text-flow-text-primary disabled:pointer-events-none disabled:opacity-40";

/** Small add trigger (no outline/border, narrower). */
export const FLOW_LIBRARY_TOOLBAR_ADD_PILL_CLASS =
  "inline-flex h-8 w-auto min-w-0 items-center justify-center gap-1 rounded-full bg-flow-surface/65 px-2 text-xs font-medium text-flow-text-secondary transition-colors hover:bg-flow-surface hover:text-flow-text-primary disabled:pointer-events-none disabled:opacity-40";

type FlowLibraryToolbarProps = {
  /** Optional control on the search row (e.g. help), aligned to the right of the field. */
  toolbarStart?: React.ReactNode;
  /** Optional control on the bottom row, right of sort (e.g. New / Add menu). */
  toolbarEnd?: React.ReactNode;
  filterChips: FlowLibraryFilterChip[];
  selectedFilterId: string;
  onSelectFilter: (id: string) => void;
  filterMenuTitle?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  sortOptions: FlowLibrarySortOption[];
  selectedSortId: string;
  onSelectSort: (id: string) => void;
  sortMenuTitle?: string;
  viewMode?: FlowLibraryViewMode;
  onViewModeChange?: (mode: FlowLibraryViewMode) => void;
  showViewModes?: boolean;
  className?: string;
  /** Fired when the selected filter is no longer valid and is reset to the first visible chip. */
  onFilterCoerced?: (detail: { previousId: string; nextId: string }) => void;
};

/**
 * Library sidebar chrome: full-width search, then filter + sort + add pill dropdowns.
 */
export function FlowLibraryToolbar({
  toolbarStart,
  toolbarEnd,
  filterChips,
  selectedFilterId,
  onSelectFilter,
  filterMenuTitle = "Filter",
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  sortOptions,
  selectedSortId,
  onSelectSort,
  sortMenuTitle = "Sort by",
  viewMode = "list",
  onViewModeChange,
  showViewModes = true,
  className,
  onFilterCoerced,
}: FlowLibraryToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const onFilterCoercedRef = useRef(onFilterCoerced);
  onFilterCoercedRef.current = onFilterCoerced;

  const visibleFilterChips = useMemo(
    () =>
      filterChips.filter(
        (c) => c.count === undefined || c.count > 0,
      ),
    [filterChips],
  );

  const onSelectFilterRef = useRef(onSelectFilter);
  onSelectFilterRef.current = onSelectFilter;

  useEffect(() => {
    if (visibleFilterChips.length === 0) return;
    if (!visibleFilterChips.some((c) => c.id === selectedFilterId)) {
      const previousId = selectedFilterId;
      const nextId = visibleFilterChips[0]!.id;
      onSelectFilterRef.current(nextId);
      onFilterCoercedRef.current?.({ previousId, nextId });
    }
  }, [visibleFilterChips, selectedFilterId]);

  const selectedFilterChip = useMemo(
    () => visibleFilterChips.find((c) => c.id === selectedFilterId),
    [visibleFilterChips, selectedFilterId],
  );

  const selectedFilterLabel = useMemo(() => {
    if (!selectedFilterChip) return "Filter";
    const suffix =
      selectedFilterChip.count !== undefined
        ? ` (${selectedFilterChip.count})`
        : "";
    return `${selectedFilterChip.label}${suffix}`;
  }, [selectedFilterChip]);

  const selectedSortLabel =
    sortOptions.find((o) => o.id === selectedSortId)?.label ?? "Sort";

  const openFilter = useCallback(() => {
    setSortOpen(false);
    setFilterOpen(true);
  }, []);

  const openSort = useCallback(() => {
    setFilterOpen(false);
    setSortOpen(true);
  }, []);

  const hasFilter = visibleFilterChips.length > 0;
  const bottomGridClass =
    hasFilter && toolbarEnd
      ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      : hasFilter
        ? "grid-cols-2"
        : toolbarEnd
          ? "grid-cols-[minmax(0,1fr)_auto]"
          : "grid-cols-1";

  return (
    <div
      className={`flow-library-toolbar flex min-w-0 w-full max-w-full flex-col gap-2 overflow-x-clip border-b border-flow-border/40 bg-flow-bg-primary/20 px-3 py-2.5 ${className ?? ""}`}
    >
      <div className="flex min-w-0 w-full items-center gap-2">
        <div className="relative flex min-h-9 min-w-0 flex-1 items-stretch overflow-hidden">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-flow-text-muted"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            ref={searchInputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            role="searchbox"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchAriaLabel}
            className="flow-sidebar-search min-h-0 min-w-0 h-9 w-full max-w-full box-border py-0 pl-9 pr-9 text-sm leading-none"
          />
          {searchValue.length > 0 ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1 top-1/2 z-[1] inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-flow-text-muted transition-colors hover:bg-flow-surface hover:text-flow-text-primary"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
        {toolbarStart ? (
          <div className="flex shrink-0 items-center">{toolbarStart}</div>
        ) : null}
      </div>

      <div
        className={`grid min-h-9 min-w-0 w-full gap-1.5 ${bottomGridClass}`}
      >
        {hasFilter ? (
          <div className="relative min-w-0">
            <button
              ref={filterBtnRef}
              type="button"
              onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
              className={FLOW_LIBRARY_TOOLBAR_PILL_CLASS}
              aria-expanded={filterOpen}
              aria-haspopup="menu"
            >
              <Filter className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
              <span className="min-w-0 truncate">{selectedFilterLabel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${filterOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {filterOpen ? (
              <SidebarOverlayMenu
                open={filterOpen}
                anchorEl={filterBtnRef.current}
                onClose={() => setFilterOpen(false)}
                unconstrainedHeight
              >
                <div className="px-1 py-1">
                  <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-flow-text-muted">
                    {filterMenuTitle}
                  </div>
                  {visibleFilterChips.map((chip) => {
                    const countSuffix =
                      chip.count !== undefined ? ` (${chip.count})` : "";
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        role="menuitem"
                        disabled={chip.disabled}
                        className={`flow-menu-item flex w-full items-center justify-between gap-2 text-xs disabled:pointer-events-none disabled:opacity-35 ${
                          chip.id === selectedFilterId
                            ? "text-flow-accent-blue"
                            : ""
                        }`}
                        onClick={() => {
                          if (!chip.disabled) {
                            onSelectFilter(chip.id);
                            setFilterOpen(false);
                          }
                        }}
                      >
                        <span className="truncate">
                          {chip.label}
                          {chip.count !== undefined ? (
                            <span className="tabular-nums opacity-80">
                              {countSuffix}
                            </span>
                          ) : null}
                        </span>
                        {chip.id === selectedFilterId ? (
                          <span className="shrink-0 text-flow-accent-blue">✓</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </SidebarOverlayMenu>
            ) : null}
          </div>
        ) : null}

        <div className="relative min-w-0">
          <button
            ref={sortBtnRef}
            type="button"
            onClick={() => (sortOpen ? setSortOpen(false) : openSort())}
            className={FLOW_LIBRARY_TOOLBAR_PILL_CLASS}
            aria-expanded={sortOpen}
            aria-haspopup="menu"
          >
            <ListOrdered className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            <span className="min-w-0 truncate">{selectedSortLabel}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${sortOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {sortOpen ? (
            <SidebarOverlayMenu
              open={sortOpen}
              anchorEl={sortBtnRef.current}
              onClose={() => setSortOpen(false)}
              unconstrainedHeight
            >
              <div className="px-1 py-1">
                <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-flow-text-muted">
                  {sortMenuTitle}
                </div>
                {sortOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitem"
                    className={`flow-menu-item flex w-full items-center justify-between gap-2 text-xs ${
                      opt.id === selectedSortId ? "text-flow-accent-blue" : ""
                    }`}
                    onClick={() => {
                      onSelectSort(opt.id);
                      setSortOpen(false);
                    }}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.id === selectedSortId ? (
                      <span className="shrink-0 text-flow-accent-blue">✓</span>
                    ) : null}
                  </button>
                ))}
                {showViewModes && onViewModeChange ? (
                  <>
                    <div
                      className="my-1 h-px bg-flow-border/50"
                      role="separator"
                      aria-hidden
                    />
                    <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-flow-text-muted">
                      View as
                    </div>
                    <div className="flex gap-1 px-1 pb-1">
                      {(
                        [
                          { mode: "list" as const, Icon: List, label: "List" },
                          {
                            mode: "compact" as const,
                            Icon: Rows3,
                            label: "Compact",
                          },
                          {
                            mode: "grid" as const,
                            Icon: LayoutGrid,
                            label: "Grid",
                          },
                        ] as const
                      ).map(({ mode, Icon, label }) => (
                        <FlowTooltip key={mode} label={label}>
                          <button
                            type="button"
                            onClick={() => {
                              onViewModeChange(mode);
                              setSortOpen(false);
                            }}
                            className={`flex flex-1 items-center justify-center rounded-md border p-2 transition-colors ${
                              viewMode === mode
                                ? "border-flow-accent-blue/50 bg-flow-accent-blue/15 text-flow-accent-blue"
                                : "border-transparent text-flow-text-muted hover:bg-flow-surface hover:text-flow-text-secondary"
                            }`}
                            aria-label={label}
                            aria-pressed={viewMode === mode}
                          >
                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </FlowTooltip>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </SidebarOverlayMenu>
          ) : null}
        </div>

        {toolbarEnd ? (
          <div className="flex min-w-0 items-center justify-end">
            {toolbarEnd}
          </div>
        ) : null}
      </div>
    </div>
  );
}
