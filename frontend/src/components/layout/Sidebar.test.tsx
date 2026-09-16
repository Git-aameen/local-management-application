import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { useMyPermissions } from '@/features/auth/hooks'

import { Sidebar } from './Sidebar'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

// Employees/Positions disabled-state now comes from useMyPermissions() (the caller's own
// Position permission, from the backend) rather than role — see Sidebar.tsx and CLAUDE.md §
// Authentication & Authorization. usePermissions() (canManageCompanies, still role-based)
// stays real, driven by the useAuth0 mock below.
vi.mock('@/features/auth/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/hooks')>()
  return { ...actual, useMyPermissions: vi.fn() }
})

const ROLE_CLAIM = 'https://localmanagementapp.com/role'
const NO_ACCESS_TITLE = 'ไม่มีสิทธิ์เข้าถึง'

function mockRole(role: string | undefined) {
  vi.mocked(useAuth0).mockReturnValue({
    user: role ? { [ROLE_CLAIM]: role } : undefined,
  } as ReturnType<typeof useAuth0>)
}

function mockManagePermissions({
  canManageEmployees = false,
  canManagePositions = false,
}: {
  canManageEmployees?: boolean
  canManagePositions?: boolean
} = {}) {
  vi.mocked(useMyPermissions).mockReturnValue({
    data: {
      role: '',
      manage_employees: canManageEmployees,
      manage_products: false,
      manage_positions: canManagePositions,
      view_salary: false,
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useMyPermissions>)
}

function renderSidebar({
  collapsed = false,
  onToggle = () => {},
  initialPath = '/dashboard',
}: {
  collapsed?: boolean
  onToggle?: () => void
  initialPath?: string
} = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar collapsed={collapsed} onToggle={onToggle} />
    </MemoryRouter>,
  )
}

/** A nav item the current caller CAN reach — rendered as a real, enabled link. */
function expectEnabled(name: RegExp) {
  expect(screen.getByRole('link', { name })).toBeInTheDocument()
}

/** A nav item the current caller CANNOT reach — still rendered (never hidden), but as a
 * non-interactive, aria-disabled element with a "no access" tooltip, not a link (so it has
 * no href to navigate via at all). */
function expectDisabled(name: RegExp) {
  expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
  const item = screen.getByText(name).closest('[aria-disabled="true"]')
  expect(item).not.toBeNull()
  expect(item).toHaveAttribute('title', NO_ACCESS_TITLE)
}

describe('Sidebar Companies link', () => {
  it('is enabled for super_admin', () => {
    mockRole('super_admin')
    mockManagePermissions()
    renderSidebar()
    expectEnabled(/companies/i)
  })

  it('is shown disabled (not hidden) for a regular tenant admin', () => {
    mockRole('admin')
    mockManagePermissions({ canManageEmployees: true, canManagePositions: true })
    renderSidebar()
    expectDisabled(/companies/i)
  })

  it('is shown disabled (not hidden) for hr_manager, inventory_manager, and employee', () => {
    for (const role of ['hr_manager', 'inventory_manager', 'employee']) {
      mockRole(role)
      mockManagePermissions()
      const { unmount } = renderSidebar()
      expectDisabled(/companies/i)
      unmount()
    }
  })

  it('always shows Dashboard/Products, always enabled, regardless of role', () => {
    for (const role of ['admin', 'hr_manager', 'inventory_manager', 'employee', 'super_admin']) {
      mockRole(role)
      mockManagePermissions()
      const { unmount } = renderSidebar()
      expectEnabled(/dashboard/i)
      expectEnabled(/products/i)
      unmount()
    }
  })
})

describe('Sidebar Employees/Positions links', () => {
  it('are enabled when the backend grants manage_employees/manage_positions', () => {
    mockRole('employee')
    mockManagePermissions({ canManageEmployees: true, canManagePositions: true })
    renderSidebar()
    expectEnabled(/employees/i)
    expectEnabled(/positions/i)
  })

  it('are shown disabled (not hidden) when the backend grants neither', () => {
    mockRole('admin')
    mockManagePermissions()
    renderSidebar()
    expectDisabled(/employees/i)
    expectDisabled(/positions/i)
  })

  it('Employees is independent of Positions — only manage_employees enables it', () => {
    mockRole('employee')
    mockManagePermissions({ canManageEmployees: true, canManagePositions: false })
    renderSidebar()
    expectEnabled(/employees/i)
    expectDisabled(/positions/i)
  })

  it('are shown disabled while permissions are still loading', () => {
    mockRole('admin')
    vi.mocked(useMyPermissions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useMyPermissions>)
    renderSidebar()
    expectDisabled(/employees/i)
    expectDisabled(/positions/i)
  })
})

describe('Sidebar Grades link removed', () => {
  it('no longer renders a Grades link at all — the module has been retired', () => {
    mockRole('admin')
    mockManagePermissions({ canManageEmployees: true, canManagePositions: true })
    renderSidebar()
    expect(screen.queryByText(/grades/i)).not.toBeInTheDocument()
  })
})

describe('Sidebar expand/collapse toggle', () => {
  it('is always rendered and calls onToggle when clicked, in the expanded state', async () => {
    mockRole('admin')
    mockManagePermissions()
    const onToggle = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ collapsed: false, onToggle })

    const toggle = screen.getByRole('button', { name: /collapse sidebar/i })
    expect(toggle).toBeInTheDocument()
    await user.click(toggle)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('is still rendered and functional once collapsed (button never disappears)', async () => {
    mockRole('admin')
    mockManagePermissions()
    const onToggle = vi.fn()
    const user = userEvent.setup()
    renderSidebar({ collapsed: true, onToggle })

    const toggle = screen.getByRole('button', { name: /expand sidebar/i })
    expect(toggle).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /collapse sidebar/i })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('keeps every enabled nav item reachable (by its accessible name) while collapsed', () => {
    mockRole('employee')
    mockManagePermissions({ canManageEmployees: true, canManagePositions: true })
    renderSidebar({ collapsed: true })

    expectEnabled(/dashboard/i)
    expectEnabled(/employees/i)
    expectEnabled(/positions/i)
    expectEnabled(/products/i)
  })

  it('shows the label as a hover tooltip (title attribute) only while collapsed', () => {
    mockRole('admin')
    mockManagePermissions()

    const { unmount } = renderSidebar({ collapsed: false })
    expect(screen.getByRole('link', { name: /dashboard/i })).not.toHaveAttribute('title')
    unmount()

    renderSidebar({ collapsed: true })
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('title', 'Dashboard')
  })

  it('keeps a disabled item disabled, with its tooltip, while collapsed', () => {
    mockRole('admin')
    mockManagePermissions()
    renderSidebar({ collapsed: true })

    expectDisabled(/employees/i)
    expectDisabled(/companies/i)
  })
})

describe('Sidebar active/disabled icon styling', () => {
  it('gives the active item a solid lava icon tile (bg-accent)', () => {
    mockRole('employee')
    mockManagePermissions({ canManageEmployees: true })
    renderSidebar({ initialPath: '/employees' })

    const link = screen.getByRole('link', { name: /employees/i })
    const iconTile = link.querySelector('span')
    expect(iconTile).toHaveClass('bg-accent')
  })

  it('gives a non-active, enabled item the neutral tile, not the active lava fill', () => {
    mockRole('employee')
    mockManagePermissions({ canManageEmployees: true })
    renderSidebar({ initialPath: '/employees' })

    const link = screen.getByRole('link', { name: /dashboard/i })
    const iconTile = link.querySelector('span')
    expect(iconTile).toHaveClass('bg-secondary')
    expect(iconTile).not.toHaveClass('bg-accent')
  })

  it('gives a disabled item the same neutral tile as an enabled default item, and a grey label', () => {
    mockRole('admin')
    mockManagePermissions()
    renderSidebar()

    const label = screen.getByText('Employees')
    const item = label.closest('[aria-disabled="true"]') as HTMLElement
    const iconTile = item.querySelector('span')

    expect(iconTile).toHaveClass('bg-secondary')
    expect(iconTile).not.toHaveClass('bg-accent')
    expect(label).toHaveClass('text-disabled-foreground')
    expect(label).not.toHaveClass('text-panel-foreground')
  })

  it('gives an enabled, non-active item a full-contrast label — distinct from a disabled item\'s grey one', () => {
    mockRole('employee')
    mockManagePermissions({ canManageEmployees: true })
    renderSidebar()

    const label = screen.getByText('Employees')
    expect(label).toHaveClass('text-panel-foreground')
    expect(label).not.toHaveClass('text-disabled-foreground')
  })
})

describe('Sidebar settings gear', () => {
  it('always renders the Settings trigger, in both expanded and collapsed modes', () => {
    mockRole('admin')
    mockManagePermissions()

    const { unmount } = renderSidebar({ collapsed: false })
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
    unmount()

    renderSidebar({ collapsed: true })
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })
})
