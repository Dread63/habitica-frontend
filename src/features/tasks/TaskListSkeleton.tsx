/** Mirrors Dashboard's real sidebar+columns layout so the loading state
 * doesn't cause a layout jump when real data replaces it. */
export function TaskListSkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:flex-row" aria-busy="true" aria-label="Loading tasks">
      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-56">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 w-16 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-6 sm:flex-row">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="h-16 animate-pulse rounded-lg border border-border bg-muted/50" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
