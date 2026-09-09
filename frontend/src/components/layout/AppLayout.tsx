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
    <div className="flex h-svh">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
