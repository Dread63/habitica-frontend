import * as React from 'react'
import { Timer } from 'lucide-react'
import { Dialog, type DialogHandle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PomodoroPanel } from './PomodoroPanel'
import { PomodoroSettingsPanel } from './PomodoroSettingsPanel'
import { PomodoroStatsPanel } from './PomodoroStatsPanel'

type PomodoroTab = 'timer' | 'settings' | 'stats'

const TABS: { id: PomodoroTab; label: string }[] = [
  { id: 'timer', label: 'Timer' },
  { id: 'settings', label: 'Settings' },
  { id: 'stats', label: 'Stats' },
]

/**
 * Thin shell only — dialog chrome plus a tab switcher over the three panel
 * components. Deliberately split (rather than one big file) before it can
 * grow into a TaskEditorDialog-sized blob; the panels don't share state
 * beyond the store, so there's nothing to co-locate.
 */
export const PomodoroDialog = React.forwardRef<DialogHandle>((_, ref) => {
  const [tab, setTab] = React.useState<PomodoroTab>('timer')

  return (
    <Dialog ref={ref} title="Pomodoro" icon={<Timer className="size-4 text-primary" aria-hidden="true" />} size="lg">
      <div className="flex flex-col gap-4">
        <div role="tablist" className="flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-t-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.id
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'timer' && <PomodoroPanel />}
        {tab === 'settings' && <PomodoroSettingsPanel />}
        {tab === 'stats' && <PomodoroStatsPanel />}
      </div>
    </Dialog>
  )
})
PomodoroDialog.displayName = 'PomodoroDialog'
