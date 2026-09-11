import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { setActingCompanyId, useActingCompanyId } from '@/lib/actingCompany'

// User email + sign-out now live in Sidebar's SettingsPopover (gear icon on the icon rail)
// instead of here — this bar's only remaining job is the acting-as-company exit control,
// so it renders nothing at all outside that mode (no empty chrome for the common case).
export function Topbar() {
  const navigate = useNavigate()
  const actingCompanyId = useActingCompanyId()

  if (actingCompanyId === null) {
    return null
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-end border-b border-border bg-card px-6">
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
    </header>
  )
}
