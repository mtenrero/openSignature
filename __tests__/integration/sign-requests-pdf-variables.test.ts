/**
 * GET /api/sign-requests/[shortId]/pdf — el PDF final debe sustituir las variables
 * de cuenta igual que la página del firmante (incluidos los overrides del partner)
 * y dejar en blanco los campos dinámicos sin rellenar.
 */
import { ObjectId } from 'mongodb'
import { GET } from '@/app/api/sign-requests/[shortId]/pdf/route'
import { SimplePDFGenerator } from '@/lib/pdf/simplePdfGenerator'
import { buildRequest } from '../helpers/nextRequest'
import { insertSignatureRequest } from '../helpers/fixtures'
import { TEST_CUSTOMER_ID } from '../helpers/mockAuth'

jest.mock('@/lib/auditTrail', () => ({
  auditTrailService: {
    verifyAuditTrailIntegrity: jest.fn(() => ({ isValid: true, trail: { isSealed: true, records: [] } })),
    addAuditRecord: jest.fn(),
  },
}))

const accessKey = (shortId: string) => Buffer.from(`${shortId}:${TEST_CUSTOMER_ID}`).toString('base64').slice(0, 6)

const signed = (shortId: string, extra: Record<string, unknown> = {}) => ({
  _id: new ObjectId(),
  shortId,
  customerId: TEST_CUSTOMER_ID,
  contractId: 'c-pdf',
  signatureType: 'local',
  status: 'signed',
  signerName: 'Ada Lovelace',
  signedAt: new Date(),
  dynamicFieldValues: { clientName: 'Ada Lovelace', clientTaxId: '12345678A' },
  contractSnapshot: {
    name: 'Consentimiento',
    content: '<p>{{variable:clinicName}} / {{dynamic:Nombre del animal}} / {{dynamic:clientName}}</p>',
    userFields: [],
  },
  ...extra,
})

const capture = async (shortId: string) => {
  const spy = jest.spyOn(SimplePDFGenerator.prototype, 'generateSignedContractPDF')
  const res = await GET(
    buildRequest({
      method: 'GET',
      url: `http://localhost:3000/api/sign-requests/${shortId}/pdf`,
      searchParams: { a: accessKey(shortId) },
    }) as any,
    { params: Promise.resolve({ shortId }) } as any,
  )
  const content = spy.mock.calls[0]?.[0] as string
  spy.mockRestore()
  return { res, content }
}

describe('PDF firmado — variables y campos sin rellenar', () => {
  it('sustituye {{variable:clinicName}} con el override del partner (como la página del firmante)', async () => {
    await insertSignatureRequest(signed('PDFVAR0001', { variableOverrides: { clinicName: 'Clinica Local E2E' } }))
    const { res, content } = await capture('PDFVAR0001')
    expect(res.status).toBe(200)
    expect(content).toContain('Clinica Local E2E')
    expect(content).not.toContain('[clinicName]')
  })

  it('deja en blanco el campo dinámico sin rellenar, sin [Nombre del animal]', async () => {
    await insertSignatureRequest(signed('PDFVAR0002', { variableOverrides: { clinicName: 'X' } }))
    const { content } = await capture('PDFVAR0002')
    expect(content).not.toContain('[Nombre del animal]')
    expect(content).toContain('Ada Lovelace')
  })
})
