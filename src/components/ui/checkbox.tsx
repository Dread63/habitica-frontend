import * as React from 'react'
import { cn } from '@/lib/utils'

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} type="checkbox" className={cn('size-4 accent-primary', className)} {...props} />
  ),
)
Checkbox.displayName = 'Checkbox'
