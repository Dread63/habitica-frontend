import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme, type ThemePreference } from './ThemeProvider'

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Three-way toggle, not a binary switch — "system" is a real, persisted choice. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme()

  return (
    <div className="inline-flex items-center rounded-md border border-border bg-muted p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant={preference === value ? 'default' : 'ghost'}
          size="sm"
          className="h-7 px-2"
          aria-pressed={preference === value}
          aria-label={`${label} theme`}
          onClick={() => setPreference(value)}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  )
}
