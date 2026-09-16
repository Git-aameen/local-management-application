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
            // text-panel-foreground/70 (not text-muted-foreground): this button sits
            // directly on the dark --panel, with no card of its own.
            'flex items-center gap-3 rounded-md px-2 py-2 font-display text-sm font-medium text-panel-foreground/70 outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
            collapsed && 'justify-center',
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center">
            <Settings className="size-4" />
          </span>
          {collapsed ? <span className="sr-only">Settings</span> : <span>Settings</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="flex flex-col gap-3">
        <span className="truncate text-sm text-muted-foreground">{user?.email}</span>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  )
}
