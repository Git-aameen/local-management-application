import type * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Flat surface, real border (see ARCHITECTURE.md § 6) — border-border-strong so an
        // input's boundary clears WCAG 1.4.11 (~3.17:1) on its own, not just via focus state.
        'flex h-9 w-full min-w-0 rounded-md border border-border-strong bg-card px-3 py-1 text-sm transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
