import type * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Soft-neumorphism inset (see ARCHITECTURE.md § 6) says "this is a place to type
        // into", as opposed to the raised look on buttons — border-transparent so the inset
        // shadow reads as the only edge, not doubled up with a hard 1px line.
        'neu-inset-sm flex h-9 w-full min-w-0 rounded-md border border-transparent bg-card px-3 py-1 text-sm transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/50 aria-invalid:shadow-none',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
