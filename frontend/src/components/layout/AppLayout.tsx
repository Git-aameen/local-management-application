import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { AccountNotProvisionedPage } from '@/features/auth/components/AccountNotProvisionedPage'
import { useAccountNotProvisioned } from '@/lib/accountProvisioning'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const isAccountNotProvisioned = useAccountNotProvisioned()

  // Every route under AppLayout — including /companies — shares this check. That's safe:
  // super_admin never triggers ACCOUNT_NOT_PROVISIONED server-side (it bypasses the
  // provisioning gate entirely, see backend/app/core/dependencies.py), so this can never
  // fire for the super_admin user whose access to Companies must stay unaffected.
  if (isAccountNotProvisioned) {
    return <AccountNotProvisionedPage />
  }

  return (
    // Flat "molten lava" design (see ARCHITECTURE.md § 6): the Sidebar and this content
    // panel are two SEPARATE --surface fills on the near-black --background, separated by
    // a real gap plus their own --border edge — no shadow-based elevation anywhere. The
    // one deliberate flourish: a 2px lava-gradient seam across the top of each panel (the
    // only place in the app allowed to show all three accent tones at once).
    //
    // No outer padding on this row (deliberately, unlike the previous "floating panel"
    // look): both panels go edge-to-edge on their own outer sides (Sidebar flush
    // top/left/bottom, content panel flush top/right/bottom) — gap-4 is the ONLY spacing
    // left, and it only ever separates the two panels from each other.
    //
    // <Outlet/> renders directly on --panel (== --surface) — there is no shared white
    // wrapper. Each page is responsible for its own contrast: headings/labels/helper text
    // that sit directly on this background use text-panel-foreground (full) or
    // text-panel-foreground/70 (secondary), and any dense content (cards, tables, form
    // fields) supplies its own explicit bg-card (--surface-alt) surface, same as Sidebar's
    // icon tiles and Input/Select already do.
    <div className="flex h-svh gap-4 bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-panel">
        <div className="h-[2px] w-full shrink-0 bg-gradient-to-r from-accent-ember via-accent to-accent-hot" />
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
