import type * as React from 'react'

import { cn } from '@/lib/utils'

// Soft-neumorphism container (see ARCHITECTURE.md § 6): raised shadow on the card itself,
// but text/content inside stays whatever contrast its own classes set — this component only
// ever supplies the shadow + surface color, never touches foreground colors, so callers
// that need high-contrast text (e.g. a data grid) get it for free.
function NeumorphicCard({
  className,
  interactive = false,
  ...props
}: React.ComponentProps<'div'> & {
  /** Adds hover/active affordances for a card that's itself a click target (e.g. "open
   * detail" cards) — a plain wrapper around a table/grid should leave this false. */
  interactive?: boolean
}) {
  return (
    <div
      data-slot="neumorphic-card"
      className={cn(
        'neu-raised rounded-xl bg-card text-card-foreground transition-shadow duration-150',
        interactive &&
          'cursor-pointer hover:neu-raised-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:neu-pressed-sm',
        className,
      )}
      {...props}
    />
  )
}

export { NeumorphicCard }
