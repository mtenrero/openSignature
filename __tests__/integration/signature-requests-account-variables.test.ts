/**
 * Integration tests for the ACCOUNT VARIABLE guard on POST /api/signature-requests.
 *
 * A contract that uses {{variable:X}} cannot be sent unless X has a configured
 * value in account settings OR is supplied as an override in the request, because
 * the signer can't fill issuer variables (they'd render as a [placeholder]).
 */
import { POST } from '@/app/api/signature-requests/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs } from '../helpers/mockAuth'
import { insertContract, insertAccountVariables } from '../helpers/fixtures'

const CONTENT_WITH_VARIABLE =
  '<p>{{variable:clinicName}} atiende a {{dynamic:clientName}} (NIF {{dynamic:clientTaxId}}).</p>'

const newRequestBody = (contractId: string, extra: Record<string, unknown> = {}) => ({
  contractId,
  signatureType: 'local',
  signerName: 'Ada Lovelace',
  clientTaxId: '12345678A',
  ...extra,
})

describe('POST /api/signature-requests — account variable guard', () => {
  beforeEach(() => {
    mockAuthAs()
  })

  it('blocks sending when a content variable has no configured value', async () => {
    const contract = await insertContract({ content: CONTENT_WITH_VARIABLE })
    const res = await POST(buildRequest({ method: 'POST', body: newRequestBody(contract._id.toString()) }) as any)

    expect(res.status).toBe(400)
    const body = (await readJson(res as any)) as any
    expect(body.errorCode).toBe('MISSING_ACCOUNT_VARIABLES')
    expect(body.missingVariables).toContain('clinicName')
  })

  it('allows sending once the variable is configured in account settings', async () => {
    await insertAccountVariables([{ name: 'clinicName', value: 'Clínica ACME' }])
    const contract = await insertContract({ content: CONTENT_WITH_VARIABLE })
    const res = await POST(buildRequest({ method: 'POST', body: newRequestBody(contract._id.toString()) }) as any)

    expect(res.status).toBeLessThan(400)
  })

  it('allows sending when the variable is supplied as an override in the request', async () => {
    const contract = await insertContract({ content: CONTENT_WITH_VARIABLE })
    const res = await POST(
      buildRequest({
        method: 'POST',
        body: newRequestBody(contract._id.toString(), { fields: { 'variable:clinicName': 'Clínica ACME' } }),
      }) as any,
    )

    expect(res.status).toBeLessThan(400)
  })

  it('does not block contracts that use no account variables', async () => {
    const contract = await insertContract({
      content: '<p>{{dynamic:clientName}} con NIF {{dynamic:clientTaxId}}.</p>',
    })
    const res = await POST(buildRequest({ method: 'POST', body: newRequestBody(contract._id.toString()) }) as any)

    expect(res.status).toBeLessThan(400)
  })
})
