/**
 * @jest-environment jsdom
 */
import React from 'react'
import { screen, fireEvent, act } from '@testing-library/react'
import { renderWithMantine } from '../helpers/renderWithMantine'
import { SignaturePadComponent } from '../../components/SignaturePad'

// signature_pad needs a real canvas 2d context; jsdom has none. A tiny fake that lets the test "draw".
const instances: any[] = []
jest.mock('signature_pad', () => {
  return {
    __esModule: true,
    default: class FakePad {
      listeners: Record<string, () => void> = {}
      strokes: any[] = []
      backgroundColor = ''
      penColor = ''
      constructor() {
        instances.push(this)
      }
      addEventListener(name: string, fn: () => void) {
        this.listeners[name] = fn
      }
      off() {}
      isEmpty() {
        return this.strokes.length === 0
      }
      clear() {
        this.strokes = []
      }
      toData() {
        return this.strokes
      }
      fromData(d: any[]) {
        this.strokes = d
      }
      toDataURL() {
        return 'data:image/png;base64,SIGNED'
      }
      draw() {
        this.strokes = [{ points: [{ x: 1, y: 1, time: 0 }, { x: 5, y: 5, time: 1 }] }]
        this.listeners.endStroke?.()
      }
    },
  }
})

describe('SignaturePad (full-screen confirm mode)', () => {
  beforeEach(() => {
    instances.length = 0
  })

  it('exposes the Borrar and Usar esta firma buttons by accessible name', () => {
    renderWithMantine(<SignaturePadComponent fill onConfirm={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar esta firma' })).toBeInTheDocument()
  })

  it('disables "Usar esta firma" while the signature is empty and enables it after a stroke', () => {
    const onConfirm = jest.fn()
    renderWithMantine(<SignaturePadComponent fill onConfirm={onConfirm} />)
    const use = screen.getByRole('button', { name: 'Usar esta firma' })
    expect(use).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Borrar' })).toBeDisabled()

    act(() => instances[0].draw())
    expect(screen.getByRole('button', { name: 'Usar esta firma' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Usar esta firma' }))
    expect(onConfirm).toHaveBeenCalledWith('data:image/png;base64,SIGNED')
  })

  it('Borrar clears the pad and disables the confirm button again', () => {
    renderWithMantine(<SignaturePadComponent fill onConfirm={jest.fn()} />)
    act(() => instances[0].draw())
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))
    expect(instances[0].isEmpty()).toBe(true)
    expect(screen.getByRole('button', { name: 'Usar esta firma' })).toBeDisabled()
  })

  it('inline mode keeps onSignatureChange and labels the undo icon button', () => {
    const onChange = jest.fn()
    renderWithMantine(<SignaturePadComponent onSignatureChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Deshacer último trazo' })).toBeInTheDocument()
    act(() => instances[0].draw())
    expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,SIGNED')
  })
})
