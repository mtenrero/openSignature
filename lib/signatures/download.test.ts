/** @jest-environment jsdom */
import { downloadOrShare, fetchSignedPdf } from './download'

const blob = new Blob(['%PDF'], { type: 'application/pdf' })

function setNav(nav: any) {
  Object.defineProperty(window.navigator, 'share', { value: nav.share, configurable: true })
  Object.defineProperty(window.navigator, 'canShare', { value: nav.canShare, configurable: true })
}

beforeEach(() => {
  jest.useFakeTimers()
  ;(URL as any).createObjectURL = jest.fn(() => 'blob:x')
  ;(URL as any).revokeObjectURL = jest.fn()
  setNav({ share: undefined, canShare: undefined })
  window.matchMedia = ((q: string) => ({ matches: false, media: q })) as any
})
afterEach(() => jest.useRealTimers())

describe('downloadOrShare', () => {
  it('shares the file when the platform can', async () => {
    const share = jest.fn().mockResolvedValue(undefined)
    setNav({ share, canShare: () => true })
    expect(await downloadOrShare(blob, 'a.pdf', { preferShare: true })).toBe('shared')
    expect(share.mock.calls[0][0].files[0].name).toBe('a.pdf')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('reports cancel when the user dismisses the sheet', async () => {
    setNav({ share: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })), canShare: () => true })
    expect(await downloadOrShare(blob, 'a.pdf', { preferShare: true })).toBe('cancelled')
  })
  it('falls back to a download when sharing fails or is unsupported', async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    setNav({ share: jest.fn().mockRejectedValue(new Error('boom')), canShare: () => true })
    expect(await downloadOrShare(blob, 'a.pdf', { preferShare: true })).toBe('downloaded')
    setNav({ share: jest.fn(), canShare: () => false })
    expect(await downloadOrShare(blob, 'b.pdf', { preferShare: true })).toBe('downloaded')
    setNav({ share: undefined, canShare: undefined })
    expect(await downloadOrShare(blob, 'c.pdf', { preferShare: true })).toBe('downloaded')
    expect(click).toHaveBeenCalledTimes(3)
    jest.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x')
    click.mockRestore()
  })
  it('downloads on desktop (no coarse pointer) even if share exists', async () => {
    const share = jest.fn()
    setNav({ share, canShare: () => true })
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await downloadOrShare(blob, 'a.pdf')).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    click.mockRestore()
  })
  it('prefers share on coarse pointers by default, and tolerates matchMedia errors', async () => {
    const share = jest.fn().mockResolvedValue(undefined)
    setNav({ share, canShare: () => true })
    window.matchMedia = ((q: string) => ({ matches: true, media: q })) as any
    expect(await downloadOrShare(blob, 'a.pdf')).toBe('shared')
    window.matchMedia = (() => { throw new Error('x') }) as any
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(await downloadOrShare(blob, 'a.pdf')).toBe('downloaded')
    click.mockRestore()
  })
})

describe('fetchSignedPdf', () => {
  const ok = (b = blob) => ({ ok: true, blob: async () => b, json: async () => ({}) })
  it('uses the sign-requests pdf when shortId and accessKey exist', async () => {
    const f = jest.fn().mockResolvedValue(ok())
    const r = await fetchSignedPdf({ shortId: 'abc', accessKey: 'k', contractId: 'c', contractName: 'NDA' }, f as any)
    expect(f).toHaveBeenCalledWith('/api/sign-requests/abc/pdf?a=k')
    expect(r.filename).toBe('contrato-firmado-NDA-abc.pdf')
    const r2 = await fetchSignedPdf({ shortId: 'abc', accessKey: 'k', contractId: 'c' }, f as any)
    expect(r2.filename).toBe('contrato-firmado-documento-abc.pdf')
  })
  it('fails when that pdf is not available', async () => {
    const f = jest.fn().mockResolvedValue({ ok: false })
    await expect(fetchSignedPdf({ shortId: 'a', accessKey: 'k', contractId: 'c' }, f as any)).rejects.toThrow('No se pudo descargar')
  })
  it('falls back to the contract signed-pdf', async () => {
    const f = jest.fn().mockResolvedValue(ok())
    const r = await fetchSignedPdf({ contractId: 'c1', contractName: 'NDA' }, f as any, new Date('2026-10-12T10:00:00Z'))
    expect(f).toHaveBeenCalledWith('/api/contracts/c1/signed-pdf', { method: 'GET' })
    expect(r.filename).toBe('Contrato_Firmado_NDA_2026-10-12.pdf')
  })
  it('surfaces the API error message, or a default', async () => {
    const f1 = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'no firmado' }) })
    await expect(fetchSignedPdf({ contractId: 'c' }, f1 as any)).rejects.toThrow('no firmado')
    const f2 = jest.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error('x') } })
    await expect(fetchSignedPdf({ contractId: 'c' }, f2 as any)).rejects.toThrow('Error al generar PDF')
  })
  it('uses global fetch and today by default', async () => {
    ;(global as any).fetch = jest.fn().mockResolvedValue(ok())
    const r = await fetchSignedPdf({ contractId: 'c', contractName: 'X' })
    expect(r.filename).toMatch(/^Contrato_Firmado_X_\d{4}-\d{2}-\d{2}\.pdf$/)
  })
})
