/**
 * Integration tests for GET /api/variables auto-detection.
 *
 * Account variables ({{variable:X}}) referenced by the customer's contracts but
 * not yet configured must appear in the variables list (empty value), so they
 * can be filled in the settings panel.
 */
import { GET } from '@/app/api/variables/route'
import { auth } from '@/lib/auth/config'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { TEST_CUSTOMER_ID, TEST_USER_ID } from '../helpers/mockAuth'
import { insertContract } from '../helpers/fixtures'

const variablesRequest = () =>
  buildRequest({ method: 'GET', url: 'http://localhost:3000/api/variables' }) as any

describe('GET /api/variables — auto-detect contract variables', () => {
  beforeEach(() => {
    // The route authenticates via NextAuth auth() (mocked to null in setup);
    // give it a session for this customer.
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: TEST_USER_ID }, customerId: TEST_CUSTOMER_ID })
  })

  it('surfaces a variable referenced by a contract but not configured', async () => {
    await insertContract({ content: '<p>{{variable:clinicName}} atiende a {{dynamic:clientName}}.</p>' })

    const res = await GET(variablesRequest())
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    const variables = body.data.variables as any[]
    const names = variables.map(v => v.name)

    expect(names).toContain('clinicName')
    const clinic = variables.find(v => v.name === 'clinicName')
    expect(clinic.autoDetected).toBe(true)
    expect(clinic.placeholder).toBe('')
    // Predefined variables are still present.
    expect(names).toContain('miNombre')
  })

  it('does not duplicate a variable that is already configured', async () => {
    const db = await (global as any).__getTestDb()
    await db.collection('variables').replaceOne(
      { customerId: TEST_CUSTOMER_ID, type: 'variables' },
      {
        customerId: TEST_CUSTOMER_ID,
        type: 'variables',
        variables: [{ id: 'x', name: 'clinicName', type: 'text', required: false, placeholder: 'Clínica ACME', enabled: true }],
      },
      { upsert: true },
    )
    await insertContract({ content: '<p>{{variable:clinicName}}</p>' })

    const res = await GET(variablesRequest())
    const body = (await readJson(res as any)) as any
    const clinics = (body.data.variables as any[]).filter(v => v.name === 'clinicName')

    expect(clinics).toHaveLength(1)
    expect(clinics[0].placeholder).toBe('Clínica ACME')
    expect(clinics[0].autoDetected).toBeUndefined()
  })

  it('never lists signer fields (clientName/clientTaxId) as account variables', async () => {
    // Even if a contract wrongly references them as {{variable:...}}, they stay out;
    // a legitimate account variable in the same contract is still surfaced.
    await insertContract({ content: '<p>{{variable:clientName}} {{variable:clientTaxId}} {{variable:clinicName}}</p>' })

    const res = await GET(variablesRequest())
    const body = (await readJson(res as any)) as any
    const names = (body.data.variables as any[]).map(v => v.name)

    expect(names).not.toContain('clientName')
    expect(names).not.toContain('clientTaxId')
    expect(names).toContain('clinicName')
  })

  it('returns only predefined variables when no contract references extra ones', async () => {
    await insertContract({ content: '<p>{{dynamic:clientName}} con NIF {{dynamic:clientTaxId}}.</p>' })

    const res = await GET(variablesRequest())
    const body = (await readJson(res as any)) as any
    const autoDetected = (body.data.variables as any[]).filter(v => v.autoDetected)
    expect(autoDetected).toHaveLength(0)
  })
})
