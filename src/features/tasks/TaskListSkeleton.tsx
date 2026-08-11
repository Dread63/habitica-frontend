/** Mirrors Dashboard's real rail + To-Dos-board layout so the loading state
 * doesn't cause a layout jump when real data replaces it. Kept in step with
 * Dashboard's own breakpoints/widths — if those change, change these too. */
export function TaskListSkeleton() {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start" aria-busy="true" aria-label="Loading tasks">
      {/* Rail: Habits / Dailies / Rewards, then the tag filter. */}
      <div className="flex w-full shrink-0 flex-col gap-5 lg:w-80 xl:w-96">
        {Array.from({ length: 3 }).map((_, section) => (
          <div key={section} className="flex flex-col gap-3">
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            {Array.from({ length: 2 }).map((_, row) => (
              <div key={row} className="h-20 animate-pulse rounded-lg border border-border bg-muted/50" />
            ))}
          </div>
        ))}
        <div className="flex flex-col gap-2 border-t border-border pt-5">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
        </div>
      </div>

      {/* To-Dos board: one header, then cards flowed across columns. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="h-6 w-28 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-muted/50" />
          ))}
        </div>
      </div>
    </div>
  )
}
