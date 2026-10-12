import React from 'react'
import { screen, waitFor, fireEvent, within } from '@testing-library/react'
import { renderWithMantine, setMobile } from '../../helpers/renderWithMantine'
import { SignatureActions } from '@/components/signatures/actions/SignatureActions'

const push = jest.fn()
const toast = jest.fn()
jest.mock('@mantine/notifications', () => ({ notifications: { show: (...a: any[]) => toast(...a) } }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))

const row = (extra: any = {}) => ({
  id: 'r1', type: 'request', status: 'pending', contractId: 'c1', contractName: 'NDA', signatureType: 'email',
  signerEmail: 'a@b.es', signerPhone: '+34600000000', emailTracking: { emailsSent: 2 }, ...extra,
})

let fetchMock: jest.Mock
const respond = (ok: boolean, body: any = {}) => fetchMock.mockResolvedValueOnce({ ok, json: async () => body })

beforeEach(() => {
  setMobile(true)
  push.mockClear()
  toast.mockClear()
  fetchMock = jest.fn()
  ;(global as any).fetch = fetchMock
})

const openMore = async (name: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Más acciones' }))
  fireEvent.click(await screen.findByRole('menuitem', { name }))
}

describe('SignatureActions', () => {
  it('pending: primary is Recordar and sends a resend with the same method and default reason', async () => {
    respond(true, { auditEntry: { details: { emailSent: true } } })
    const onChanged = jest.fn()
    renderWithMantine(<SignatureActions row={row()} onChanged={onChanged} />)
    fireEvent.click(await screen.findByRole('button', { name: /Recordar/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/signature-requests/r1')
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'resend', signatureType: 'email', resendReason: 'Recordatorio' })
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ kind: 'remind' })))
  })

  it('Recordar is disabled at the email limit and the reason is VISIBLE text wired with aria-describedby', async () => {
    renderWithMantine(<SignatureActions row={row({ emailTracking: { emailsSent: 5 } })} />)
    const btn = await screen.findByRole('button', { name: /Recordar/ })
    expect(btn).toBeDisabled()
    const reason = screen.getByTestId('sticky-action-caption')
    expect(reason).toBeVisible()
    expect(reason).toHaveTextContent('Límite de 5 envíos alcanzado')
    expect(btn.getAttribute('aria-describedby')).toBe(reason.id)
    expect(btn).not.toHaveAttribute('title')
  })

  it('no caption when Recordar is enabled', async () => {
    renderWithMantine(<SignatureActions row={row()} />)
    await screen.findByRole('button', { name: /Recordar/ })
    expect(screen.queryByTestId('sticky-action-caption')).toBeNull()
  })

  it.each(['local', 'tablet', 'qr'])('%s request: no Recordar (it would deliver nothing); primary is Reenviar', async (t) => {
    renderWithMantine(<SignatureActions row={row({ signatureType: t })} />)
    expect(await screen.findByRole('button', { name: /Reenviar solicitud/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /Recordar/ })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  const pickMethod = async (re: RegExp) => {
    fireEvent.click(await screen.findByRole('button', { name: /Reenviar solicitud/ }))
    const dialog = await screen.findByRole('dialog', { name: /Reenviar solicitud/ })
    fireEvent.click(within(dialog).getByRole('radio', { name: re }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reenviar' }))
  }

  it('local resend opens the NEW signing url in the same tab', async () => {
    respond(true, { request: { signatureUrl: `${window.location.origin}/sign/NEW123?a=k` }, auditEntry: { details: {} } })
    renderWithMantine(<SignatureActions row={row({ signatureType: 'qr' })} />)
    await pickMethod(/En este dispositivo/)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign/NEW123?a=k'))
  })

  it('QR resend shows the new url and a QR code', async () => {
    respond(true, { request: { signatureUrl: 'https://osign.test/sign/QR999?a=k' }, auditEntry: { details: {} } })
    renderWithMantine(<SignatureActions row={row({ signatureType: 'local' })} />)
    await pickMethod(/QR/)
    const qr = await screen.findByTestId('resend-qr')
    expect(qr).toHaveTextContent('https://osign.test/sign/QR999?a=k')
    expect(push).not.toHaveBeenCalled()
  })

  it('email resend that the provider did not deliver does NOT claim success and does not bump the counter', async () => {
    respond(true, { request: { emailTracking: { emailsSent: 2 } }, auditEntry: { details: { emailSent: false, emailError: 'boom' } } })
    const onChanged = jest.fn()
    renderWithMantine(<SignatureActions row={row()} onChanged={onChanged} />)
    fireEvent.click(await screen.findByRole('button', { name: /Recordar/ }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ color: 'orange', title: expect.stringMatching(/no se pudo enviar/) }))
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Recordatorio enviado' }))
    expect(onChanged.mock.calls[0][0].patch.emailTracking.emailsSent).toBe(2)
  })

  it('email resend delivered says so, counter comes from the server', async () => {
    respond(true, { request: { emailTracking: { emailsSent: 3 } }, auditEntry: { details: { emailSent: true } } })
    const onChanged = jest.fn()
    renderWithMantine(<SignatureActions row={row()} onChanged={onChanged} />)
    fireEvent.click(await screen.findByRole('button', { name: /Recordar/ }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recordatorio enviado', color: 'green' })))
    await waitFor(() => expect(onChanged.mock.calls[0][0].patch.emailTracking.emailsSent).toBe(3))
  })

  it('Archive requires a reason (disabled until 3 chars) then PATCHes the right body and goes back to the list', async () => {
    respond(true)
    renderWithMantine(<SignatureActions row={row()} />)
    await openMore(/Archivar/)
    const dialog = await screen.findByRole('dialog', { name: /Archivar solicitud/ })
    const confirm = within(dialog).getByRole('button', { name: 'Archivar' })
    expect(confirm).toBeDisabled()
    const box = within(dialog).getByLabelText('Motivo del archivo')
    fireEvent.change(box, { target: { value: 'ab' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(box, { target: { value: 'abc' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'archive', archiveReason: 'abc' })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/signatures'))
  })

  it('Discard shows the destructive confirm and calls DELETE', async () => {
    respond(true)
    renderWithMantine(<SignatureActions row={row()} />)
    await openMore(/Descartar/)
    const dialog = await screen.findByRole('dialog', { name: /Descartar solicitud/ })
    expect(within(dialog).getByText(/no se puede deshacer/)).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Motivo para descartar'), { target: { value: 'duplicada' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Descartar solicitud' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ discardReason: 'duplicada' })
    await waitFor(() => expect(push).toHaveBeenCalledWith('/signatures'))
  })

  it('Resend with emailsSent=5 shows the disabled email card with its reason', async () => {
    renderWithMantine(<SignatureActions row={row({ emailTracking: { emailsSent: 5 } })} />)
    await openMore(/Reenviar/)
    const dialog = await screen.findByRole('dialog', { name: /Reenviar solicitud/ })
    const email = within(dialog).getByRole('radio', { name: /Email/ })
    expect(email).toBeDisabled()
    expect(email).toHaveTextContent('Límite de 5 envíos alcanzado')
    expect(within(dialog).getByText('Envíos: 5 de 5')).toBeInTheDocument()
  })

  it('Resend sends the chosen method and reason', async () => {
    respond(true)
    renderWithMantine(<SignatureActions row={row()} />)
    await openMore(/Reenviar/)
    const dialog = await screen.findByRole('dialog', { name: /Reenviar solicitud/ })
    fireEvent.click(within(dialog).getByRole('radio', { name: /SMS/ }))
    fireEvent.change(within(dialog).getByLabelText(/Motivo del reenvío/), { target: { value: 'no llegó' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reenviar' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'resend', signatureType: 'sms', resendReason: 'no llegó' })
  })

  it('a server error renders inside the sheet and keeps it open', async () => {
    respond(false, { error: 'No se pueden enviar más emails', errorCode: 'EMAIL_LIMIT_EXCEEDED' })
    renderWithMantine(<SignatureActions row={row()} />)
    await openMore(/Reenviar/)
    const dialog = await screen.findByRole('dialog', { name: /Reenviar solicitud/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reenviar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No se pueden enviar más emails')
    expect(push).not.toHaveBeenCalled()
  })

  it('archive server error renders inside the sheet', async () => {
    respond(false, { error: 'Cannot archive a signed request' })
    renderWithMantine(<SignatureActions row={row()} />)
    await openMore(/Archivar/)
    const dialog = await screen.findByRole('dialog', { name: /Archivar solicitud/ })
    fireEvent.change(within(dialog).getByLabelText('Motivo del archivo'), { target: { value: 'motivo' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archivar' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cannot archive a signed request')
  })

  it('signed: primary is Descargar PDF and there is no overflow', async () => {
    renderWithMantine(<SignatureActions row={row({ status: 'signed' })} />)
    expect(await screen.findByRole('button', { name: /Descargar PDF/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Más acciones' })).toBeNull()
  })

  it('archived: renders no actions', () => {
    const { container } = renderWithMantine(<SignatureActions row={row({ status: 'archived' })} />)
    expect(container.querySelector('[data-testid=sticky-action-bar]')).toBeNull()
  })
})
