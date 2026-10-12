import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { ContractRow } from '../../../components/contracts/ContractRow'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))
jest.mock('@mantine/notifications', () => ({ notifications: { show: jest.fn() } }))

const handlers = () => ({ onRequest: jest.fn(), onArchive: jest.fn(), onActivated: jest.fn() })

beforeEach(() => {
  setMobile(true)
  ;(global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
})

describe('ContractRow', () => {
  test('active contract shows Solicitar firma and calls onRequest', () => {
    const h = handlers()
    const c = { id: 'a1', name: 'Servicios', status: 'active', usageCount: 2 }
    renderWithMantine(<ContractRow contract={c} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar firma' }))
    expect(h.onRequest).toHaveBeenCalledWith(c)
    expect(screen.getByText('2 usos')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Activar' })).toBeNull()
  })

  test('Solicitar firma is hidden for a draft contract', () => {
    renderWithMantine(<ContractRow contract={{ id: 'd1', name: 'Acta interna', status: 'draft' }} {...handlers()} />)
    expect(screen.queryByRole('button', { name: 'Solicitar firma' })).toBeNull()
    expect(screen.getByText('Borrador')).toBeTruthy()
  })

  test('Solicitar firma is hidden for a library contract pending activation, Activar is offered instead', () => {
    renderWithMantine(<ContractRow contract={{ id: 'l1', name: 'LOPD', status: 'draft', pendingActivation: true }} {...handlers()} />)
    expect(screen.queryByRole('button', { name: 'Solicitar firma' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Activar' })).toBeTruthy()
    expect(screen.getByText('Pendiente de activar')).toBeTruthy()
  })

  test('Activar sends the status update for that contract and reports it', async () => {
    const h = handlers()
    renderWithMantine(<ContractRow contract={{ id: 'l1', name: 'LOPD', status: 'draft', pendingActivation: true }} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
    await waitFor(() => expect(h.onActivated).toHaveBeenCalledWith('l1'))
    const [url, init] = (global as any).fetch.mock.calls[0]
    expect(url).toBe('/api/contracts/l1/status')
    expect(init.method).toBe('PUT') // the status endpoint is PUT
    expect(JSON.parse(init.body)).toEqual({ status: 'active' })
  })

  test('a failed activation does not report success', async () => {
    ;(global as any).fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) })
    const h = handlers()
    renderWithMantine(<ContractRow contract={{ id: 'l1', name: 'LOPD', status: 'draft', pendingActivation: true }} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
    await waitFor(() => expect((global as any).fetch).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activar' })).toBeEnabled())
    expect(h.onActivated).not.toHaveBeenCalled()
  })

  test('row menu offers Archivar last (destructive)', async () => {
    const h = handlers()
    const c = { id: 'a1', name: 'Servicios', status: 'active' }
    renderWithMantine(<ContractRow contract={c} {...h} />)
    fireEvent.click(screen.getByRole('button', { name: 'Más acciones de Servicios' }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.at(-1)!.textContent).toMatch(/Archivar/)
    fireEvent.click(items.at(-1)!)
    expect(h.onArchive).toHaveBeenCalledWith(c)
  })

  test('status badge sits in the meta row so it never squeezes the title', () => {
    const { container } = renderWithMantine(<ContractRow contract={{ id: 'l1', name: 'LOPD de la clínica', status: 'active', usageCount: 1 }} {...handlers()} />)
    expect(container.querySelector('.os-li__meta')?.textContent).toMatch(/Activo/)
    expect(container.querySelector('.os-li__main > .mantine-Badge-root')).toBeNull()
  })
})
