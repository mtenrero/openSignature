import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithMantine } from '../../helpers/renderWithMantine'
import { ListItemCard, StatusBadge } from '@/components/ui'

jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }))

describe('ListItemCard', () => {
  it('the whole row is one link; the trailing control is separate and does not bubble', () => {
    const onTrailing = jest.fn()
    const onRow = jest.fn()
    renderWithMantine(
      <div onClick={onRow}>
        <ListItemCard
          testId="row"
          title="Contrato de alquiler"
          subtitle="Ada Lovelace"
          meta={['hace 2 h']}
          status={<StatusBadge kind="signature" status="pending" />}
          href="/signatures/1"
          trailing={<button aria-label="Más acciones" onClick={onTrailing} />}
        />
      </div>
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/signatures/1')
    expect(link).toHaveTextContent('Contrato de alquiler')
    expect(link).toHaveTextContent('Pendiente')
    expect(link).not.toContainElement(screen.getByRole('button', { name: 'Más acciones' }))
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones' }))
    expect(onTrailing).toHaveBeenCalled()
    expect(onRow).not.toHaveBeenCalled()
  })

  it('renders a button when only onClick is given', () => {
    const onClick = jest.fn()
    renderWithMantine(<ListItemCard title="X" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: /X/ }))
    expect(onClick).toHaveBeenCalled()
  })
})
