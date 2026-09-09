import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { setActingCompanyId, useActingCompanyId } from '@/lib/actingCompany'

export function Topbar() {
  const { user } = useAuth0()
  const navigate = useNavigate()
  const actingCompanyId = useActingCompanyId()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-6">
      <span className="text-sm text-muted-foreground">{user?.email}</span>
      <div className="flex items-center gap-2">
        {actingCompanyId !== null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              // Just clears the acting selection and returns to the full-screen gate
              // (RequireActingCompanyForSuperAdmin then bounces here on its own too, but
              // navigating explicitly avoids a render where the guard hasn't caught up
              // yet). Deliberately NOT a logout — the super_admin stays signed in.
              setActingCompanyId(null)
              navigate('/select-company')
            }}
          >
            Exit company view
          </Button>
        )}
        <LogoutButton />
      </div>
    </header>
  )
}
