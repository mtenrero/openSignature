import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { PageHeader } from '@/components/ui'

const push = jest.fn()
const back = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, back }), usePathname: () => '/' }))

describe('PageHeader', () => {
  beforeEach(() => {
    setMobile(true)
    push.mockClear()
    back.mockClear()
  })

  it('renders an h1 title and subtitle, sticky by default', () => {
    renderWithMantine(<PageHeader title="Firmas" subtitle="3 pendientes" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Firmas' })).toBeInTheDocument()
    expect(screen.getByTestId('page-header')).toHaveClass('os-ph--sticky')
  })

  it('large titles are not sticky unless asked', () => {
    renderWithMantine(<PageHeader title="Más" large />)
    expect(screen.getByTestId('page-header')).toHaveClass('os-ph--large')
    expect(screen.getByTestId('page-header')).not.toHaveClass('os-ph--sticky')
  })

  it('back button uses history when available, else the fallback href', () => {
    renderWithMantine(<PageHeader title="Detalle" back="/signatures" />)
    Object.defineProperty(window.history, 'length', { value: 3, configurable: true })
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(back).toHaveBeenCalled()
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true })
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(push).toHaveBeenCalledWith('/signatures')
  })

  it('overflow actions open an action sheet on mobile', async () => {
    const onClick = jest.fn()
    renderWithMantine(<PageHeader title="Detalle" overflowActions={[{ key: 'a', label: 'Archivar', onClick }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archivar' }))
    expect(onClick).toHaveBeenCalled()
  })
})
