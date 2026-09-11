import { useAuth0 } from '@auth0/auth0-react'
import { Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface SettingsPopoverProps {
  /** Matches Sidebar's own collapsed state so this row's icon+label styling stays
   * consistent with every nav item above it (see Sidebar.tsx). */
  collapsed: boolean
}

// Replaces the old always-visible Topbar email + LogoutButton (see ARCHITECTURE.md § 2):
// both now live behind this gear button instead of taking up permanent chrome. user?.email
// comes straight from the Auth0 SDK's own session state, not a backend call — it renders
// correctly even for a super_admin, who has no Employee/Position record at all (see
// CLAUDE.md § Authentication & Authorization).
export function SettingsPopover({ collapsed }: SettingsPopoverProps) {
  const { user, logout } = useAuth0()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Settings"
          title={collapsed ? 'Settings' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
            collapsed && 'justify-center',
          )}
        >
          <Settings className="size-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="flex flex-col gap-3">
        <span className="truncate text-sm text-muted-foreground">{user?.email}</span>
        <Button
          type="button"
          variant="outline"
          elevated
          className="w-full"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  )
}
