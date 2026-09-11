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

const NO_ACCESS_TITLE = 'ไม่มีสิทธิ์เข้าถึง'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** Omitted (undefined) means always enabled — Dashboard and Products have no access
   * restriction of their own (Products stays view-for-everyone; only its New/Edit/Delete
   * controls are role-gated, inside the page itself — see ProductListPage.tsx). When
   * present and false, the item still renders (never hidden) but disabled: reduced
   * opacity, not-allowed cursor, no navigation, and an aria-disabled + title explaining why
   * — for a11y and so the module's existence isn't a secret from roles that can't open it. */
  accessible?: boolean
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

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
        'flex h-svh shrink-0 flex-col border-r bg-background transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className={cn('flex h-14 items-center border-b px-2', collapsed ? 'justify-center' : 'justify-end')}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
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
                  'flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground opacity-50',
                  collapsed && 'justify-center',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </span>
            )
          }

          return (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                  collapsed && 'justify-center',
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          )
        })}
      </nav>
    </aside>
  )
}
