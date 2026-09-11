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
   * present and false, the item still renders (never hidden) but disabled: reduced
   * opacity, not-allowed cursor, no navigation, and an aria-disabled + title explaining why
   * — for a11y and so the module's existence isn't a secret from roles that can't open it. */
  accessible?: boolean
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

// Single-column soft-neumorphism nav (see ARCHITECTURE.md § 6): the whole sidebar is one
// `neu-raised` shape; each row is icon + label side by side, collapsing to icon-only (label
// as a native title tooltip) when `collapsed`. Collapse state is plain component state —
// deliberately not persisted (see AppLayout.tsx): resets to expanded on every reload rather
// than reaching for localStorage or a backend preference, per this project's own constraint
// against adding state-persistence machinery that wasn't asked for.
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
        'neu-raised flex h-svh shrink-0 flex-col bg-card transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      <div className={cn('flex h-14 items-center px-2', collapsed ? 'justify-center' : 'justify-end')}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-md p-2 text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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
                  'flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground opacity-50',
                  collapsed && 'justify-center',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {/* Always a real text node (sr-only when collapsed) rather than dropping
                 * it — the `title` tooltip alone wouldn't give this item any accessible
                 * name for screen readers, only a hover hint for a mouse. */}
                {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
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
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                  collapsed && 'justify-center',
                  // Active item gets a raised pill in --accent-soft (a second, slightly
                  // lighter dark-green step from --primary — see index.css) with white
                  // icon/label on top, easily clearing WCAG AA (~6.2:1). Every other state
                  // (hover, disabled above) deliberately stays flat/neutral so this one
                  // "you are here" indicator never gets confused with anything else.
                  isActive
                    ? 'neu-raised-sm bg-accent-soft text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              {collapsed ? <span className="sr-only">{label}</span> : <span>{label}</span>}
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
