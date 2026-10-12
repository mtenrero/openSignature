import React from 'react'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { NewSignatureRequestWizard } from '@/components/signature-request/NewSignatureRequestWizard'
import { navigateSameTab } from '@/lib/ui/navigate'

jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))
jest.mock('@/lib/ui/navigate', () => ({ navigateSameTab: jest.fn() }))

const contract = {
  id: 'c1',
  name: 'Contrato de alquiler',
  status: 'active',
  userFields: [
    { id: 'f1', name: 'clientName', type: 'name', required: true },
    { id: 'f2', name: 'producto', type: 'text', required: false, label: 'Producto' },
  ],
}

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown }
function mockFetch(post: Handler) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  global.fetch = jest.fn(async (url: any, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    let r: { status?: number; body: unknown }
    if (String(url).startsWith('/api/contracts/c1')) r = { body: contract }
    else if (String(url).startsWith('/api/contracts')) r = { body: { contracts: [contract, { id: 'c2', name: 'Borrador', status: 'draft' }] } }
    else r = post(String(url), init)
    const status = r.status ?? 200
    return { ok: status < 400, status, json: async () => r.body } as Response
  }) as unknown as typeof fetch
  return calls
}

beforeEach(() => {
  setMobile(true)
  window.open = jest.fn()
  ;(navigateSameTab as jest.Mock).mockClear()
})

async function pickMethodAndContinue(name: string) {
  fireEvent.click(await screen.findByRole('radio', { name: new RegExp(name) }))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}

describe('NewSignatureRequestWizard', () => {
  it('only lists sendable contracts and disables Continuar until a method is chosen', async () => {
    mockFetch(() => ({ body: {} }))
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} initialContractId="c1" />)
    const next = await screen.findByRole('button', { name: 'Continuar' })
    await screen.findByRole('radio', { name: /Email/ })
    expect(next).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: /Email/ }))
    expect(next).toBeEnabled()
  })

  it('starts at contract selection (draft contracts are not offered)', async () => {
    mockFetch(() => ({ body: {} }))
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} />)
    expect(await screen.findByText('Contrato de alquiler')).toBeInTheDocument()
    expect(screen.queryByText('Borrador')).toBeNull()
    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()
  })

  it('shows "Email no válido" for a bad address', async () => {
    mockFetch(() => ({ body: {} }))
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} initialContractId="c1" />)
    await pickMethodAndContinue('Email')
    fireEvent.change(await screen.findByLabelText(/^Email/), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('Email no válido')).toBeInTheDocument()
  })

  it('email flow POSTs the expected body and shows "Solicitud enviada"', async () => {
    const calls = mockFetch(() => ({ body: { id: 'r1', signatureUrl: 'http://x/sign/abc?a=k' } }))
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} initialContractId="c1" />)
    await pickMethodAndContinue('Email')
    fireEvent.change(await screen.findByLabelText('Nombre completo'), { target: { value: 'Ada' } })
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ada@x.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    // fields step (extra field "Producto")
    fireEvent.change(await screen.findByLabelText(/Producto/), { target: { value: 'Plan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar solicitud' }))
    expect(await screen.findByText('Solicitud enviada')).toBeInTheDocument()
    const post = calls.find((c) => c.init?.method === 'POST')!
    expect(post.url).toBe('/api/signature-requests')
    expect(JSON.parse(post.init!.body as string)).toEqual({
      contractId: 'c1',
      signatureType: 'email',
      signerEmail: 'ada@x.com',
      signerName: 'Ada',
      dynamicFieldValues: { clientName: 'Ada', clientEmail: 'ada@x.com', producto: 'Plan' },
    })
    expect(screen.getByRole('link', { name: 'Ver solicitud' })).toHaveAttribute('href', '/signatures/r1')
  })

  it('local flow navigates in the same tab and never calls window.open', async () => {
    mockFetch(() => ({ body: { id: 'r2', signatureUrl: 'http://x/sign/abc?a=k' } }))
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} initialContractId="c1" />)
    await pickMethodAndContinue('Firmar en este dispositivo')
    await screen.findByLabelText('Nombre completo')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' })) // signer
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' })) // fields
    fireEvent.click(await screen.findByRole('button', { name: 'Empezar firma' }))
    await waitFor(() => expect(navigateSameTab).toHaveBeenCalledWith('http://x/sign/abc?a=k'))
    expect(window.open).not.toHaveBeenCalled()
  })

  it('renders an inline alert with the missing account variables', async () => {
    mockFetch(() => ({ status: 400, body: { errorCode: 'MISSING_ACCOUNT_VARIABLES', missingVariables: ['empresa', 'cif'] } }))
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} initialContractId="c1" initialMethod="local" />)
    await screen.findByLabelText('Nombre completo')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' })) // signer (method skipped)
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' })) // fields
    fireEvent.click(await screen.findByRole('button', { name: 'Empezar firma' }))
    expect(await screen.findByText('{{variable:empresa}}')).toBeInTheDocument()
    expect(screen.getByText('{{variable:cif}}')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configurar en Ajustes' })).toHaveAttribute('href', '/settings')
  })

  it('prefill with lockedFields renders those inputs read-only and resends with PATCH', async () => {
    const calls = mockFetch(() => ({ body: { ok: true } }))
    renderWithMantine(
      <NewSignatureRequestWizard
        mode="page"
        onClose={jest.fn()}
        initialContractId="c1"
        initialMethod="email"
        prefill={{ values: { clientName: 'Ada', clientEmail: 'ada@x.com' }, lockedFields: ['clientName', 'clientEmail'], signatureRequestId: 'r9' }}
      />
    )
    const name = await screen.findByLabelText('Nombre completo')
    expect(name).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('readonly')
    fireEvent.change(name, { target: { value: 'Otro' } })
    expect(name).toHaveValue('Ada')
    for (let i = 0; i < 3 && !screen.queryByRole('button', { name: 'Reenviar' }); i++) {
      fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: /Continuar|Reenviar/ })).toBeTruthy())
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar' }))
    expect(await screen.findByText('Solicitud enviada')).toBeInTheDocument()
    const patch = calls.find((c) => c.init?.method === 'PATCH')!
    expect(patch.url).toBe('/api/signature-requests/r9')
    expect(JSON.parse(patch.init!.body as string)).toMatchObject({ action: 'resend', signatureType: 'email' })
  })

  it('qr flow requires the billing acknowledgement and shows the QR panel', async () => {
    mockFetch(() => ({ body: { id: 'r3', signatureUrl: 'http://x/sign/qq?a=k' } }))
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} initialContractId="c1" />)
    fireEvent.click(await screen.findByRole('radio', { name: /QR/ }))
    expect(screen.getByText('Se tarifica como firma por email')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
    const send = await screen.findByRole('button', { name: 'Enviar solicitud' })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /se tarifica como una firma por email/ }))
    fireEvent.click(send)
    expect(await screen.findByRole('button', { name: /Copiar enlace/ })).toBeInTheDocument()
  })

  const resendPrefill = { values: { clientName: 'Ada', clientEmail: 'ada@x.com' }, lockedFields: ['clientName', 'clientEmail'], signatureRequestId: 'r9' }
  async function runResend() {
    await screen.findByLabelText('Nombre completo')
    for (let i = 0; i < 3 && !screen.queryByRole('button', { name: 'Reenviar' }); i++) {
      fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }))
      await waitFor(() => expect(screen.queryByRole('button', { name: /Continuar|Reenviar/ })).toBeTruthy())
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar' }))
    expect(await screen.findByText('Solicitud enviada')).toBeInTheDocument()
  }

  it('resend still works when the contract was archived since', async () => {
    const calls = mockFetch(() => ({ body: {} }))
    const base = global.fetch as jest.Mock
    global.fetch = jest.fn(async (url: any, init?: RequestInit) =>
      String(url).startsWith('/api/contracts/c1')
        ? ({ ok: true, status: 200, json: async () => ({ ...contract, status: 'archived' }) } as Response)
        : base(url, init)) as unknown as typeof fetch
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} initialContractId="c1" initialMethod="email" prefill={resendPrefill} />)
    await runResend()
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true)
  })

  it('resend still works when the contract can no longer be loaded (deleted)', async () => {
    const calls = mockFetch(() => ({ body: {} }))
    const base = global.fetch as jest.Mock
    global.fetch = jest.fn(async (url: any, init?: RequestInit) =>
      String(url).startsWith('/api/contracts/c1')
        ? ({ ok: false, status: 404, json: async () => ({}) } as Response)
        : base(url, init)) as unknown as typeof fetch
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} initialContractId="c1" initialMethod="email" prefill={resendPrefill} />)
    await runResend()
    expect(calls.some((c) => c.init?.method === 'PATCH')).toBe(true)
  })

  it('pages through all active contracts (more than 100)', async () => {
    const urls: string[] = []
    global.fetch = jest.fn(async (url: any) => {
      urls.push(String(url))
      const second = String(url).includes('skip=100')
      const contracts = second ? [{ id: 'z', name: 'Contrato 101', status: 'active' }] : [{ id: 'a', name: 'Contrato 1', status: 'active' }]
      return { ok: true, status: 200, json: async () => ({ contracts, hasMore: !second }) } as Response
    }) as unknown as typeof fetch
    renderWithMantine(<NewSignatureRequestWizard mode="page" onClose={jest.fn()} />)
    expect(await screen.findByText('Contrato 101')).toBeInTheDocument()
    expect(urls).toHaveLength(2)
  })
})
