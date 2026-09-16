import {
  Briefcase,
  Building2,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'

import { useMyPermissions, usePermissions } from '@/features/auth/hooks'
import { cn } from '@/lib/utils'

import { SettingsPopover } from './SettingsPopover'

const NO_ACCESS_TITLE = 'ไม่มีสิทธิ์เข้าถึง'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Omitted (undefined) means always enabled — Dashboard and Products have no access
   * restriction of their own (Products stays view-for-everyone; only its New/Edit/Delete
   * controls are role-gated, inside the page itself — see ProductListPage.tsx). When
   * present and false, the item still renders (never hidden) but disabled: grey label
   * text, a neutral (never green) icon tile, no navigation, and an aria-disabled + title
   * explaining why — for a11y and so the module's existence isn't a secret from roles that
   * can't open it. */
  accessible?: boolean
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

// Push-layout, collapsible Sidebar — flat "molten lava" styling (see ARCHITECTURE.md § 6):
// a solid --surface fill with a 1px --border edge, no shadow-based elevation at all. Icon
// tiles are their own small flat surfaces (--surface-alt, a real fill + border, not a
// shadow) regardless of what's behind them; the active tile is a solid --accent (lava)
// fill with --accent-foreground (dark) icon — verified ~5.0:1, since white-on-lava fails
// AA for this particular mid-toned orange (see the palette writeup in ARCHITECTURE.md § 6).
// Hover sits between default and active as a translucent --accent-hot wash, never full
// opacity, so it's never mistaken for "selected." Sidebar and content widths are
// complementary and animate together (push layout) — nothing covers anything else.
export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { canManageCompanies } = usePermissions()
  // Employees/Positions access now comes entirely from the caller's own Position
  // permissions (see useMyPermissions()'s docstring and require_position_permission on the
  // backend) — not a role check. Defaults to false while loading: fail closed, never show a
  // module as enabled before we're sure it's allowed.
  const { data: myPermissions } = useMyPermissions()
  const canManageEmployees = myPermissions?.manage_employees ?? false
  const canManagePositions = myPermissions?.manage_positions ?? false

  // Every item always renders, in a fixed order — restricted ones show disabled (not
  // hidden) when the current caller can't reach that module (see ARCHITECTURE.md §
  // Role-based UI). Disabling only changes the Sidebar entry itself: the actual boundary
  // is still enforced by ProtectedRoute's requiredPermission on the route (App.tsx) — a
  // disabled link alone would do nothing against someone typing the URL directly.
  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/employees', label: 'Employees', icon: Users, accessible: canManageEmployees },
    { to: '/positions', label: 'Positions', icon: Briefcase, accessible: canManagePositions },
    { to: '/products', label: 'Products', icon: Package },
    { to: '/companies', label: 'Companies', icon: Building2, accessible: canManageCompanies },
  ]

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden rounded-md border border-border bg-panel transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className="h-[2px] w-full shrink-0 bg-gradient-to-r from-accent-ember via-accent to-accent-hot" />
      {/* The toggle is pinned here, at a fixed spot in the Sidebar's own header, so it's
       * never hidden or scrolled away in either state (see ARCHITECTURE.md § 6). */}
      <div className={cn('flex h-14 items-center px-2', collapsed ? 'justify-center' : 'justify-end')}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-md p-2 text-panel-foreground/70 outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map(({ to, label, icon: Icon, accessible }) => {
          if (accessible === false) {
            return (
              <span
                key={to}
                aria-disabled="true"
                title={NO_ACCESS_TITLE}
                className={cn(
                  'flex cursor-not-allowed items-center gap-3 rounded-md px-2 py-2',
                  collapsed && 'justify-center',
                )}
              >
                {/* Disabled items keep the same neutral tile every enabled item starts
                 * from — never lava, never the hover wash — so color alone never has to be
                 * reinterpreted as "maybe clickable". */}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                {collapsed ? (
                  <span className="sr-only">{label}</span>
                ) : (
                  // --disabled-foreground (not --muted-foreground): a dedicated, cooler
                  // grey reserved for exactly this "you can't reach this module" signal,
                  // distinct from ordinary secondary/helper text elsewhere in the app.
                  <span className="font-display text-sm font-medium text-disabled-foreground">
                    {label}
                  </span>
                )}
              </span>
            )
          }

          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-md px-2 py-2 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
                collapsed && 'justify-center',
              )}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150',
                      isActive
                        ? // Selected: solid --accent (lava) fill, --accent-foreground
                          // (dark) icon — ~5.0:1, clears WCAG AA. White-on-lava was
                          // measured and rejected (~3.4:1, fails AA) — see the palette
                          // writeup in ARCHITECTURE.md § 6.
                          'border-transparent bg-accent text-accent-foreground'
                        : // Default: a flat neutral tile (--surface-alt + --border) — its
                          // own real fill and edge, not a shadow cue, so it reads clearly
                          // as its own tappable element regardless of the panel behind it.
                          // Hover is a translucent --accent-hot wash — a step toward the
                          // active lava fill without being confused for it.
                          'border-border bg-secondary text-muted-foreground group-hover:border-transparent group-hover:bg-accent-hot/20 group-hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  {collapsed ? (
                    <span className="sr-only">{label}</span>
                  ) : (
                    // --panel-foreground (not --foreground): this label sits directly on
                    // the dark --panel, with no card of its own underneath it.
                    <span className="font-display text-sm font-medium text-panel-foreground">
                      {label}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-border p-2">
        <SettingsPopover collapsed={collapsed} />
      </div>
    </aside>
  )
}
