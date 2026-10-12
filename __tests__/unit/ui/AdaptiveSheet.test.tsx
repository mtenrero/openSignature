import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { AdaptiveSheet } from '@/components/ui'

const sheet = () => (
  <AdaptiveSheet opened onClose={() => {}} title="Reenviar" footer={<button>Enviar</button>}>
    <p>contenido</p>
  </AdaptiveSheet>
)

describe('AdaptiveSheet', () => {
  it('renders a bottom Drawer on mobile, with footer and title', async () => {
    setMobile(true)
    renderWithMantine(sheet())
    expect(await screen.findByTestId('adaptive-sheet')).toBeInTheDocument()
    expect(document.querySelector('.mantine-Drawer-content')).toBeTruthy()
    expect(document.querySelector('.mantine-Modal-content')).toBeNull()
    expect(screen.getByTestId('sheet-footer')).toHaveTextContent('Enviar')
    expect(screen.getByRole('dialog', { name: 'Reenviar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()
  })

  it('renders a centered Modal otherwise, with footer', async () => {
    setMobile(false)
    renderWithMantine(sheet())
    expect(await screen.findByText('contenido')).toBeInTheDocument()
    expect(document.querySelector('.mantine-Modal-content')).toBeTruthy()
    expect(document.querySelector('.mantine-Drawer-content')).toBeNull()
    expect(screen.getByTestId('sheet-footer')).toHaveTextContent('Enviar')
  })
})
