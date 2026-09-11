import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { setActingCompanyId } from '@/lib/actingCompany'

import { Topbar } from './Topbar'

function renderTopbar() {
  return render(
    <MemoryRouter>
      <Topbar />
    </MemoryRouter>,
  )
}

describe('Topbar "Exit company view" control', () => {
  afterEach(() => {
    setActingCompanyId(null)
  })

  // Email + Sign out no longer live here (see SettingsPopover.test.tsx) — this bar renders
  // nothing at all outside acting-as-company mode now.
  it('renders nothing when not acting as a company', () => {
    const { container } = renderTopbar()
    expect(container).toBeEmptyDOMElement()
  })

  it('is shown once a company has been selected', () => {
    setActingCompanyId(1)
    renderTopbar()
    expect(screen.getByRole('button', { name: /exit company view/i })).toBeInTheDocument()
  })
})
