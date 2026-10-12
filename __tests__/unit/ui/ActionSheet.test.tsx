import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { ActionMenu, ActionSheet } from '@/components/ui'

describe('ActionSheet', () => {
  beforeEach(() => setMobile(true))

  it('disabled item shows its reason and does not fire; enabled items fire and close', async () => {
    const a = jest.fn()
    const b = jest.fn()
    const onClose = jest.fn()
    renderWithMantine(
      <ActionSheet
        opened
        onClose={onClose}
        items={[
          { key: 'resend', label: 'Reenviar', disabled: true, disabledReason: 'Ya está firmada', onClick: a },
          { key: 'archive', label: 'Archivar', onClick: b },
        ]}
      />
    )
    expect(await screen.findByText('Ya está firmada')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /Reenviar/ }))
    expect(a).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archivar' }))
    expect(b).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('puts destructive items last', async () => {
    renderWithMantine(
      <ActionSheet
        opened
        onClose={() => {}}
        items={[
          { key: 'd', label: 'Descartar', color: 'red', onClick: () => {} },
          { key: 'r', label: 'Reenviar', onClick: () => {} },
        ]}
      />
    )
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual(['Reenviar', 'Descartar'])
  })

  it('disabled row is linked to its visible reason with aria-describedby', async () => {
    renderWithMantine(
      <ActionSheet opened onClose={() => {}} items={[{ key: 'r', label: 'Recordar', disabled: true, disabledReason: 'Límite alcanzado', onClick: () => {} }]} />
    )
    const item = await screen.findByRole('menuitem', { name: /Recordar/ })
    const reason = screen.getByText('Límite alcanzado')
    expect(reason).toBeVisible()
    expect(item.getAttribute('aria-describedby')).toBe(reason.id)
  })
})

describe('ActionMenu (desktop)', () => {
  beforeEach(() => setMobile(false))
  it('a disabled item shows its reason as visible text, not only a title', async () => {
    renderWithMantine(
      <ActionMenu
        title="Más"
        target={<button>Abrir</button>}
        items={[{ key: 'r', label: 'Recordar', disabled: true, disabledReason: 'Límite alcanzado', onClick: () => {} }]}
      />
    )
    fireEvent.click(screen.getByText('Abrir'))
    const reason = await screen.findByText('Límite alcanzado')
    expect(reason).toBeVisible()
    const item = reason.closest('[role=menuitem]')!
    expect(item.getAttribute('aria-describedby')).toBe(reason.id)
    expect(item).not.toHaveAttribute('title')
  })
})
