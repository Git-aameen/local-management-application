import {
  Briefcase,
  Building2,
  LayoutDashboard,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { usePermissions } from '@/features/auth/hooks'
import { cn } from '@/lib/utils'

const BASE_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/employees', label: 'Employees', icon: Users },
  { to: '/positions', label: 'Positions', icon: Briefcase },
  { to: '/products', label: 'Products', icon: Package },
]

const COMPANIES_NAV_ITEM = { to: '/companies', label: 'Companies', icon: Building2 }

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { canManageCompanies } = usePermissions()
  // Companies is a platform-operator (super_admin) concern — hidden for every other role,
  // including a regular tenant "admin". The other four links stay visible for everyone;
  // each page hides its own actions per usePermissions() instead of being hidden entirely
  // (e.g. a super_admin can still open Employees, it'll just show an error/empty state
  // since their token has no company_id — see CLAUDE.md § Authentication & Authorization).
  const navItems = canManageCompanies ? [...BASE_NAV_ITEMS, COMPANIES_NAV_ITEM] : BASE_NAV_ITEMS

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
        {navItems.map(({ to, label, icon: Icon }) => (
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
        ))}
      </nav>
    </aside>
  )
}
