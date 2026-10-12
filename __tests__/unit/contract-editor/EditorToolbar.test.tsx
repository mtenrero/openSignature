import React from 'react'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { EditorToolbar } from '@/components/contract-editor/EditorToolbar'

/** Minimal tiptap Editor double: records which command ran. */
function fakeEditor(active: string[] = []) {
  const calls: string[] = []
  const chain: any = { run: () => true }
  for (const m of ['focus', 'toggleBold', 'toggleItalic', 'toggleBulletList', 'toggleOrderedList', 'toggleBlockquote', 'undo', 'redo']) {
    chain[m] = () => { calls.push(m); return chain }
  }
  const editor: any = {
    isActive: (n: string) => active.includes(n),
    can: () => ({ undo: () => true, redo: () => false }),
    chain: () => chain,
    on: jest.fn(),
    off: jest.fn(),
  }
  return { editor, calls }
}

describe('EditorToolbar', () => {
  beforeEach(() => setMobile(true))

  it('gives every control an accessible name (no tooltip-only labels)', () => {
    const { editor } = fakeEditor()
    renderWithMantine(<EditorToolbar editor={editor} onOpenPalette={() => {}} />)
    for (const name of ['Negrita', 'Cursiva', 'Lista', 'Lista numerada', 'Cita', 'Deshacer', 'Rehacer', 'Insertar campo']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    // every button in the toolbar is named
    screen.getAllByRole('button').forEach((b) => {
      expect(b.getAttribute('aria-label') || b.textContent).toBeTruthy()
    })
  })

  it('"Insertar campo" fires onOpenPalette', () => {
    const { editor } = fakeEditor()
    const onOpenPalette = jest.fn()
    renderWithMantine(<EditorToolbar editor={editor} onOpenPalette={onOpenPalette} />)
    fireEvent.click(screen.getByRole('button', { name: 'Insertar campo' }))
    expect(onOpenPalette).toHaveBeenCalledTimes(1)
  })

  it('formatting buttons run their tiptap command and reflect the active state', () => {
    const { editor, calls } = fakeEditor(['bold'])
    renderWithMantine(<EditorToolbar editor={editor} onOpenPalette={() => {}} />)
    expect(screen.getByRole('button', { name: 'Negrita' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cursiva' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))
    expect(calls).toContain('toggleBold')
  })

  it('disables Rehacer when nothing can be redone', () => {
    const { editor } = fakeEditor()
    renderWithMantine(<EditorToolbar editor={editor} onOpenPalette={() => {}} />)
    expect(screen.getByRole('button', { name: 'Rehacer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeEnabled()
  })

  it('is exposed as a labelled toolbar', () => {
    const { editor } = fakeEditor()
    renderWithMantine(<EditorToolbar editor={editor} onOpenPalette={() => {}} />)
    expect(screen.getByRole('toolbar', { name: 'Formato del texto' })).toBeInTheDocument()
  })
})
