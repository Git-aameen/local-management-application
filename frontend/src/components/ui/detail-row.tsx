import type * as React from 'react'

// Shared label/value row for the read-only detail dialogs (Employee/Product/Position) —
// deliberately flat (no neumorphism) so the record's own data stays maximally readable, per
// ARCHITECTURE.md § 6.
export function DetailRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}
