import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useTags } from '@/features/tasks/useTags'
import type { PomodoroSettings } from './pomodoroEngine'
import { usePomodoroStore } from './pomodoroStore'
import { categoryColor } from './pomodoroCategories'
import { notificationPermission, requestNotificationPermission } from './pomodoroNotify'

type NumericSettingKey = 'workMinutes' | 'shortBreakMinutes' | 'longBreakMinutes' | 'sessionsBeforeLongBreak'

const NUMERIC_FIELDS: { key: NumericSettingKey; label: string; max: number }[] = [
  { key: 'workMinutes', label: 'Focus length (minutes)', max: 180 },
  { key: 'shortBreakMinutes', label: 'Short break (minutes)', max: 60 },
  { key: 'longBreakMinutes', label: 'Long break (minutes)', max: 120 },
  { key: 'sessionsBeforeLongBreak', label: 'Sessions before long break', max: 12 },
]

export function PomodoroSettingsPanel() {
  const settings = usePomodoroStore((s) => s.settings)
  const { updateSettings, toggleTrackedTag } = usePomodoroStore()
  const tagsQuery = useTags()
  const [permission, setPermission] = React.useState(() => notificationPermission())

  const numericValue = (key: NumericSettingKey): number => settings[key]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {NUMERIC_FIELDS.map(({ key, label, max }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Input
              type="number"
              min={1}
              max={max}
              value={numericValue(key)}
              onChange={(e) => {
                const value = Math.min(Math.max(Math.round(Number(e.target.value)) || 1, 1), max)
                updateSettings({ [key]: value } as Partial<PomodoroSettings>)
              }}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">When a phase ends</span>
        <p className="text-xs text-muted-foreground">
          The timer never starts the next phase by itself — it waits for you. These are how it lets you know it's
          waiting.
        </p>
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={settings.soundEnabled} onChange={() => updateSettings({ soundEnabled: !settings.soundEnabled })} />
          Play a chime
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox
            checked={settings.notificationsEnabled}
            onChange={() => updateSettings({ notificationsEnabled: !settings.notificationsEnabled })}
          />
          Show a desktop notification
        </label>
        {settings.notificationsEnabled && permission !== 'granted' && (
          <div className="flex items-center gap-2">
            {permission === 'unsupported' ? (
              <p className="text-xs text-muted-foreground">This browser doesn't support notifications.</p>
            ) : permission === 'denied' ? (
              <p className="text-xs text-muted-foreground">
                Notifications are blocked for this site — re-allow them in your browser's site settings.
              </p>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void requestNotificationPermission().then(setPermission)}
              >
                Allow notifications
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <span className="text-xs font-medium text-muted-foreground">Tags tracked as focus categories</span>
        <p className="text-xs text-muted-foreground">
          Only checked tags roll up in stats — a "where" tag like Home usually isn't a meaningful measure of time
          the way School or Work is, so opt in only the tags you actually want totals for. Each gets a color, handed
          out in the order you check them.
        </p>
        {tagsQuery.data && tagsQuery.data.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {tagsQuery.data.map((tag) => {
              const color = categoryColor(tag.id, settings.trackedTagIds)
              return (
                <label key={tag.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={settings.trackedTagIds.includes(tag.id)}
                    onChange={() => toggleTrackedTag(tag.id)}
                  />
                  {color && (
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  )}
                  {tag.name}
                </label>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No tags yet — create some on the Dashboard first.</p>
        )}
        {settings.trackedTagIds.length > 8 && (
          <p className="text-xs text-muted-foreground">
            Past eight tracked tags the palette runs out of colors that stay distinguishable, so the rest are grouped
            as "Other" in charts — they're still listed and totalled individually.
          </p>
        )}
      </div>
    </div>
  )
}
