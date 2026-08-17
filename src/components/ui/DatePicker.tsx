import * as React from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addMonths, isSameDate, parseDateOnlyString, toDateOnlyString, today } from '@/lib/dateOnly'
import { Button } from './button'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface CalendarGridProps {
  /** Selected date, or null for none. */
  value: Date | null
  onChange: (date: Date) => void
  /** Omit to hide the "Clear" action — used when there's nothing to clear (e.g. the drag-drop
   * mini picker, which is only ever setting a date, never unsetting one). */
  onClear?: () => void
}

/**
 * The calendar itself — month navigation + a day grid — with no trigger or
 * positioning chrome around it, so it can be dropped into two different
 * contexts unchanged: `DatePicker`'s popover below, and `TodoBoard`'s
 * "Later" drag-drop mini picker (see its own comment for why that one
 * needs the bare grid rather than the full input-like `DatePicker`).
 */
export function CalendarGrid({ value, onChange, onClear }: CalendarGridProps) {
  const [viewMonth, setViewMonth] = React.useState(() => value ?? today())
  const todayDate = today()

  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const startWeekday = monthStart.getDay()
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day))

  return (
    <div className="w-64 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg">
      <div className="flex items-center justify-between pb-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Previous month"
          onClick={() => setViewMonth((m) => addMonths(m, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">
          {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Next month"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((label, i) => (
          // Index-keyed on purpose — this is a fixed, never-reordered set
          // of 7 weekday initials, not a list of data with real identity.
          <span key={i}>{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 pt-1">
        {cells.map((date, i) =>
          date ? (
            <button
              key={date.getDate()}
              type="button"
              onClick={() => onChange(date)}
              aria-pressed={value !== null && isSameDate(date, value)}
              className={cn(
                'mx-auto flex size-8 items-center justify-center rounded-full text-sm transition-colors hover:bg-muted',
                value !== null && isSameDate(date, value) && 'bg-primary text-primary-foreground hover:opacity-90',
                (value === null || !isSameDate(date, value)) &&
                  isSameDate(date, todayDate) &&
                  'font-semibold text-primary',
              )}
            >
              {date.getDate()}
            </button>
          ) : (
            <span key={`empty-${i}`} />
          ),
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <button type="button" onClick={() => onChange(today())} className="text-xs font-medium text-primary hover:underline">
          Today
        </button>
        {onClear && (
          <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive">
            Clear date
          </button>
        )}
      </div>
    </div>
  )
}

interface DatePickerProps {
  /** "YYYY-MM-DD", or '' for no date selected — same convention as `<input type="date">`
   * (this replaces one), so callers didn't need to change how they store the value. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/**
 * Replaces the native `<input type="date">` in TaskEditorDialog — the
 * browser's own date picker can't be restyled to match the rest of the
 * app (a real complaint: "the date selection box should match the theme").
 * A trigger button showing the selected date opens a popover holding
 * `CalendarGrid`; closes on selecting a day, clicking outside, or Escape.
 */
export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  ({ value, onChange, placeholder = 'No due date' }, ref) => {
    const [open, setOpen] = React.useState(false)
    const containerRef = React.useRef<HTMLDivElement>(null)
    const selected = value ? parseDateOnlyString(value) : null

    React.useEffect(() => {
      if (!open) return
      function onPointerDown(event: PointerEvent) {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false)
      }
      function onKeyDown(event: KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false)
      }
      document.addEventListener('pointerdown', onPointerDown)
      document.addEventListener('keydown', onKeyDown)
      return () => {
        document.removeEventListener('pointerdown', onPointerDown)
        document.removeEventListener('keydown', onKeyDown)
      }
    }, [open])

    return (
      <div ref={containerRef} className="relative">
        <button
          ref={ref}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm shadow-sm transition-colors',
            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={cn('flex-1', !selected && 'text-muted-foreground')}>
            {selected
              ? selected.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
              : placeholder}
          </span>
        </button>
        {open && (
          <div className="absolute z-20 mt-1">
            <CalendarGrid
              value={selected}
              onChange={(date) => {
                onChange(toDateOnlyString(date))
                setOpen(false)
              }}
              onClear={
                selected
                  ? () => {
                      onChange('')
                      setOpen(false)
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    )
  },
)
DatePicker.displayName = 'DatePicker'
