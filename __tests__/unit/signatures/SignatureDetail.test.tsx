import React from 'react'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import SignatureDetailsPage from '@/app/signatures/[id]/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ id: 'req1' }),
  usePathname: () => '/signatures/req1',
}))
jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: { user: { id: 'u' }, customerId: 'c' } }),
}))

const LONG_EMAIL = 'una.direccion.de.correo.extremadamente.larga.sin.cortes@subdominio.de-un-dominio-larguisimo.example.org'
const HASH = 'a'.repeat(96)

function mockApi(request: any) {
  ;(global as any).fetch = jest.fn(async (url: string) => {
    const u = String(url)
    if (u.startsWith('/api/signature-requests')) return { ok: true, json: async () => ({ requests: [request] }) }
    if (u.startsWith('/api/signatures')) return { ok: true, json: async () => ({ signatures: [] }) }
    if (u.startsWith('/api/contracts/')) return { ok: true, json: async () => ({ contract: { name: 'NDA', content: '<p>Texto <script>alert(1)</script>del contrato</p>' } }) }
    if (u.startsWith('/api/sign-requests/')) return { ok: true, blob: async () => new Blob(['%PDF']) }
    return { ok: false, json: async () => ({}), blob: async () => new Blob(['x']) }
  })
}

const base = {
  id: 'req1', contractId: 'k1', contractName: 'NDA', signerName: 'Ada Lovelace', signerEmail: LONG_EMAIL,
  clientTaxId: '12345678A', signatureType: 'email', status: 'pending', createdAt: '2026-10-01T10:00:00Z',
  expiresAt: '2999-01-01T00:00:00Z', signatureUrl: 'https://x/sign/abc?a=1', emailTracking: { emailsSent: 2 },
}

describe('SignatureDetailsPage', () => {
  beforeEach(() => { setMobile(true); push.mockClear() })

  it('pending: shows hero, Seguimiento and the audit timeline in chronological order', async () => {
    mockApi({
      ...base,
      auditRecords: [
        { action: 'documento_accedido', timestamp: '2026-10-03T10:00:00Z', ipAddress: HASH },
        { action: 'solicitud_creada', timestamp: '2026-10-01T10:00:00Z' },
        { action: 'email_reenviado', timestamp: '2026-10-02T10:00:00Z', details: { reason: 'recordatorio', shortId: 'hidden' } },
      ],
    })
    renderWithMantine(<SignatureDetailsPage />)
    await screen.findByTestId('status-hero')
    expect(screen.getByTestId('hero-signer')).toHaveTextContent('Ada Lovelace')
    expect(within(screen.getByTestId('status-hero')).getByTestId('status-badge')).toHaveTextContent('Pendiente')
    expect(screen.getByRole('heading', { name: 'Seguimiento' })).toBeInTheDocument()
    expect(screen.getByText('Emails enviados')).toBeInTheDocument()
    expect(screen.getByText('2/5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Auditoría' })).toBeInTheDocument()
    const times = screen.getAllByTestId('audit-time').map((n) => n.textContent)
    expect(times).toHaveLength(3)
    const titles = within(screen.getByTestId('audit-timeline')).getAllByText(/Solicitud creada|Email reenviado|Documento visualizado/).map((n) => n.textContent)
    expect(titles).toEqual(['Solicitud creada', 'Email reenviado', 'Documento visualizado'])
    expect(screen.queryByText(/hidden/)).toBeNull()
    expect(screen.getByText('Motivo:', { exact: false })).toBeInTheDocument()
    // progress reflects the access event
    expect(screen.getByTestId('request-progress').querySelectorAll('li.is-done')).toHaveLength(2)
    // primary action is the resend slot, not a PDF
    expect(screen.getByRole('button', { name: /Reenviar solicitud/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descargar PDF' })).toBeNull()
  })

  it('signed: Descargar PDF is the primary action and the PDF is fetched', async () => {
    mockApi({ ...base, status: 'signed', signedAt: '2026-10-02T10:00:00Z', shortId: 'abc', accessKey: 'k' })
    URL.createObjectURL = jest.fn(() => 'blob:x')
    URL.revokeObjectURL = jest.fn()
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderWithMantine(<SignatureDetailsPage />)
    const btn = await screen.findByRole('button', { name: 'Descargar PDF' })
    expect(within(screen.getByTestId('sticky-action-bar')).getByRole('button', { name: 'Descargar PDF' })).toBe(btn)
    expect(within(screen.getByTestId('status-hero')).getByTestId('status-badge')).toHaveTextContent('Firmada')
    expect(screen.getByTestId('request-progress').querySelectorAll('li.is-done')).toHaveLength(3)
    fireEvent.click(btn)
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect((global as any).fetch).toHaveBeenCalledWith('/api/sign-requests/abc/pdf?a=k')
    click.mockRestore()
  })

  it('long email and hash values can wrap (no overflow)', async () => {
    mockApi({ ...base, auditRecords: [{ action: 'documento_accedido', timestamp: '2026-10-03T10:00:00Z', ipAddress: HASH }] })
    renderWithMantine(<SignatureDetailsPage />)
    const email = await screen.findAllByText(LONG_EMAIL)
    const dd = email[0].closest('dd') as HTMLElement
    expect(dd.closest('dl')).toHaveClass('os-kv') // .os-kv dd { overflow-wrap:anywhere; word-break:break-word }
    const ip = screen.getByText(`IP: ${HASH}`)
    expect(ip.style.overflowWrap).toBe('anywhere')
    expect(screen.getByTestId('hero-signer').style.overflowWrap).toBe('anywhere')
  })

  it('contract is sanitised and opens full screen', async () => {
    mockApi(base)
    renderWithMantine(<SignatureDetailsPage />)
    const preview = await screen.findByTestId('contract-preview')
    expect(preview.innerHTML).not.toContain('script')
    expect(preview).toHaveTextContent('Texto del contrato')
    fireEvent.click(screen.getByRole('button', { name: /Ver completo/ }))
    expect(await screen.findByRole('region', { name: 'Contrato completo' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar vista previa' }))
    expect(screen.queryByTestId('contract-preview')).toBeNull()
  })

  it('shows an error state when the request does not exist', async () => {
    mockApi({ ...base, id: 'other' })
    renderWithMantine(<SignatureDetailsPage />)
    expect(await screen.findByText('Solicitud de firma no encontrada')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver a firmas' }))
    expect(push).toHaveBeenCalledWith('/signatures')
  })
})
