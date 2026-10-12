import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithMantine } from '../../helpers/renderWithMantine'
import { BottomTabBar } from '@/components/shell/BottomTabBar'
import { getActiveTabKey } from '@/components/shell/navItems'

let mockPath = '/signatures'
jest.mock('next/navigation', () => ({ usePathname: () => mockPath, useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

describe('BottomTabBar', () => {
  it('has 5 links with accessible names', () => {
    mockPath = '/signatures'
    renderWithMantine(<BottomTabBar />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(5)
    for (const name of ['Firmas', 'Contratos', 'Nueva solicitud de firma', 'Tableta', 'Más']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('marks the active tab by longest prefix', () => {
    mockPath = '/signatures/abc123'
    renderWithMantine(<BottomTabBar />)
    expect(screen.getByRole('link', { name: 'Firmas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Contratos' })).not.toHaveAttribute('aria-current')
  })

  it('account pages keep "Más" active and /signatures/new owns the centre action', () => {
    expect(getActiveTabKey('/settings/api-keys')).toBe('more')
    expect(getActiveTabKey('/profile')).toBe('more')
    expect(getActiveTabKey('/signatures/new')).toBe('new')
    expect(getActiveTabKey('/contracts/x/edit')).toBe('contracts')
    expect(getActiveTabKey('/')).toBeNull()
  })
})

describe('isNavActive single active item', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isNavActive } = require('@/components/shell/navItems')
  it('/settings/api-keys activates only API Keys', () => {
    expect(isNavActive('/settings/api-keys', '/settings/api-keys')).toBe(true)
    expect(isNavActive('/settings/api-keys', '/settings')).toBe(false)
  })
  it('/settings/billing-wallet and /settings/subscription do not light /settings', () => {
    expect(isNavActive('/settings/billing-wallet', '/settings')).toBe(false)
    expect(isNavActive('/settings/subscription', '/settings')).toBe(false)
    expect(isNavActive('/settings', '/settings')).toBe(true)
  })
})
