import { useAuth0 } from '@auth0/auth0-react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setActingCompanyId } from '@/lib/actingCompany'

import { Topbar } from './Topbar'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}))

function renderTopbar() {
  render(
    <MemoryRouter>
      <Topbar />
    </MemoryRouter>,
  )
}

describe('Topbar "Exit company view" control', () => {
  beforeEach(() => {
    vi.mocked(useAuth0).mockReturnValue({
      user: { email: 'admin@example.com' },
      logout: vi.fn(),
    } as unknown as ReturnType<typeof useAuth0>)
  })

  afterEach(() => {
    setActingCompanyId(null)
  })

  it('is hidden when not acting as a company', () => {
    renderTopbar()
    expect(screen.queryByRole('button', { name: /exit company view/i })).not.toBeInTheDocument()
  })

  it('is shown once a company has been selected', () => {
    setActingCompanyId(1)
    renderTopbar()
    expect(screen.getByRole('button', { name: /exit company view/i })).toBeInTheDocument()
  })
})
