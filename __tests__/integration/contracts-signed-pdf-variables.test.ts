/**
 * GET /api/contracts/[id]/signed-pdf — cuando la firma sale de signatureRequests,
 * el PDF debe aplicar los overrides del partner (variable:clinicName) igual que
 * /api/sign-requests/[shortId]/pdf y la página del firmante.
 */
import { ObjectId } from 'mongodb'
import { GET } from '@/app/api/contracts/[id]/signed-pdf/route'
import { SimplePDFGenerator } from '@/lib/pdf/simplePdfGenerator'
import { buildRequest } from '../helpers/nextRequest'
import { insertContract, insertSignatureRequest } from '../helpers/fixtures'
import { mockAuthAs, TEST_CUSTOMER_ID } from '../helpers/mockAuth'

jest.mock('@/lib/auditTrail', () => ({
  auditTrailService: {
    verifyAuditTrailIntegrity: jest.fn(() => ({ isValid: true, trail: { isSealed: true, records: [] } })),
    addAuditRecord: jest.fn(),
  },
}))

const CONTENT = '<p>{{variable:clinicName}} atiende a {{dynamic:clientName}}, mascota {{dynamic:Nombre del animal}}.</p>'

const capture = async (contractId: string) => {
  const spy = jest.spyOn(SimplePDFGenerator.prototype, 'generateSignedContractPDF')
  const res = await GET(
    buildRequest({ method: 'GET', url: `http://localhost:3000/api/contracts/${contractId}/signed-pdf` }) as any,
    { params: Promise.resolve({ id: contractId }) } as any,
  )
  const content = spy.mock.calls[0]?.[0] as string
  spy.mockRestore()
  return { res, content }
}

describe('PDF firmado por contrato — overrides del partner', () => {
  beforeEach(() => mockAuthAs())

  it('signed_pdf_by_contract_applies_partner_variable_overrides', async () => {
    const contract = await insertContract({ content: CONTENT })
    const contractId = contract._id.toString()
    await insertSignatureRequest({
      _id: new ObjectId(),
      shortId: 'CPDFVAR001',
      customerId: TEST_CUSTOMER_ID,
      contractId,
      signatureType: 'local',
      status: 'signed',
      signedAt: new Date(),
      variableOverrides: { clinicName: 'Vet Real Stack' },
      dynamicFieldValues: { clientName: 'Ada Lovelace' },
      contractSnapshot: { name: 'Consentimiento', content: CONTENT, userFields: [] },
    })
    const { res, content } = await capture(contractId)
    expect(res.status).toBe(200)
    expect(content).toContain('Vet Real Stack')
    expect(content).toContain('Ada Lovelace')
    expect(content).not.toContain('[clinicName]')
    expect(content).not.toContain('[Nombre del animal]')
  })

  // Un PDF por test: cada uno genera un documento y juntos pasaban del límite de 5 s bajo carga.
  const ES = '<p>El cliente acepta: {{dynamic:aceptaX}} según el contrato de la clínica.</p>'
  const EN = '<p>The client agrees: {{dynamic:acceptsX}} as this agreement states.</p>'
  it.each([
    ['es_true', ES, { aceptaX: 'true' }, undefined, 'acepta: SÍ según'],
    ['es_false', ES, { aceptaX: 'false' }, undefined, 'acepta: NO según'],
    ['en_true', EN, { acceptsX: 'true' }, undefined, 'agrees: YES as'],
    ['en_false', EN, { acceptsX: 'false' }, undefined, 'agrees: NO as'],
    ['explicit_language_wins', ES, { aceptaX: 'true' }, 'en', 'acepta: YES según'],
  ])('signed_pdf_by_contract_prints_checkboxes_as_yes_no_%s', async (tag, content, values, language, expected) => {
    const contract = await insertContract({ content })
    const contractId = contract._id.toString()
    await insertSignatureRequest({
      _id: new ObjectId(), shortId: `CPDFYN${tag}`.slice(0, 16), customerId: TEST_CUSTOMER_ID, contractId, signatureType: 'local',
      status: 'signed', signedAt: new Date(), dynamicFieldValues: values,
      contractSnapshot: { name: 'C', content, userFields: [], ...(language ? { language } : {}) },
    })
    const { res, content: pdf } = await capture(contractId)
    expect(res.status).toBe(200)
    expect(pdf.replace(/<[^>]*>/g, '')).toContain(expected)
  }, 20000)
})
