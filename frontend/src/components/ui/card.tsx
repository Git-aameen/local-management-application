import type * as React from 'react'

import { cn } from '@/lib/utils'

// Flat surface (see ARCHITECTURE.md § 6): a solid --surface-alt fill plus a 1-2px border,
// no shadow-based elevation. Only ever supplies the surface color + edge, never touches
// foreground colors, so callers that need specific text contrast (e.g. a data grid) get it
// for free via --card-foreground.
function Card({
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
      data-slot="card"
      className={cn(
        'rounded-md border border-border bg-card text-card-foreground transition-colors duration-150',
        interactive &&
          'cursor-pointer hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel active:bg-muted',
        className,
      )}
      {...props}
    />
  )
}

export { Card }
