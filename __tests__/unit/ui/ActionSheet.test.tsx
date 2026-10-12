import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { ActionSheet } from '@/components/ui'

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
})
