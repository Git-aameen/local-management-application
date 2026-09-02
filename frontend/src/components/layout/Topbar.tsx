import { useAuth0 } from '@auth0/auth0-react'

import { LogoutButton } from '@/features/auth/components/LogoutButton'

export function Topbar() {
  const { user } = useAuth0()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <span className="text-sm text-muted-foreground">{user?.email}</span>
      <LogoutButton />
    </header>
  )
}
