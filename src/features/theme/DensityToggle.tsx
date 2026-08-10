import { Rows3, LayoutList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDensity } from './DensityProvider'

export function DensityToggle() {
  const { density, toggleDensity } = useDensity()
  const isCompact = density === 'compact'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isCompact ? 'Switch to comfortable spacing' : 'Switch to compact spacing'}
      aria-pressed={isCompact}
      title={isCompact ? 'Comfortable view' : 'Compact view'}
      onClick={toggleDensity}
    >
      {isCompact ? <Rows3 className="size-4" /> : <LayoutList className="size-4" />}
    </Button>
  )
}
