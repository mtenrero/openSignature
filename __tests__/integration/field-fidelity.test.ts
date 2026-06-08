/**
 * Integration tests for field/data fidelity on POST /api/signature-requests.
 *
 * These lock in the cross-system fixes (mivet → oSign) and two latent defects
 * discovered while exercising the flow:
 *
 *  - Multi-word dynamic field names survive (space↔underscore tolerant matching).
 *  - Account variables sent the "legacy" way (flattened into dynamicFieldValues)
 *    are rerouted into variableOverrides so {{variable:X}} renders.
 *  - The prefixed `fields` payload binds to exact contract names.
 *  - Client NIF forwarded via top-level clientTaxId lands in dynamicFieldValues.
 *  - REGRESSION: top-level `shortId` is present in the response for NEW requests.
 *  - REGRESSION: the email send path completes (no `session is not defined`).
 *
 * Harness: handler invoked directly; mongodb-memory-server via jestSetupIntegration;
 * getAuthContext auto-mocked (mockAuthAs); email/SMS inert.
 */
import { POST } from '@/app/api/signature-requests/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs, TEST_CUSTOMER_ID } from '../helpers/mockAuth'
import { insertContract, insertAccountVariables } from '../helpers/fixtures'

// Contract exercising: an account variable, the two mandatory dynamic fields,
// and a MULTI-WORD dynamic field (the case that used to silently drop values).
const CONTENT =
  '<p>{{variable:clinicName}} atiende a {{dynamic:clientName}} ' +
  'con NIF {{dynamic:clientTaxId}}, mascota {{dynamic:Nombre del animal}}.</p>'

async function getDb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (global as any).__getTestDb()
}

async function storedRequest() {
  const db = await getDb()
  return db.collection('signatureRequests').findOne({ customerId: TEST_CUSTOMER_ID })
}

describe('POST /api/signature-requests — field & data fidelity', () => {
  beforeEach(async () => {
    mockAuthAs()
    // The fixture content uses {{variable:clinicName}}; configure it so the
    // account-variable guard doesn't block these field-fidelity scenarios.
    await insertAccountVariables([{ name: 'clinicName', value: 'Clínica ACME' }])
  })

  it('preserves MULTI-WORD dynamic field names (space ↔ underscore tolerant)', async () => {
    const contract = await insertContract({ content: CONTENT })
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'local',
          // mivet sends the value keyed by its normalized id "nombre_del_animal"
          dynamicFieldValues: { nombre_del_animal: 'Rex', clientName: 'Ada', clientTaxId: '12345678A' },
        },
      }) as any,
    )

    const stored = await storedRequest()
    // Bound to the contract's EXACT placeholder name, not the orphaned key
    expect(stored.dynamicFieldValues['Nombre del animal']).toBe('Rex')
    expect(stored.dynamicFieldValues['nombre_del_animal']).toBeUndefined()
  })

  it('reroutes a legacy-flattened account variable into variableOverrides', async () => {
    const contract = await insertContract({ content: CONTENT })
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'local',
          // Legacy caller flattened the variable (lowercased, no prefix) into dynamicFieldValues
          dynamicFieldValues: { clinicname: 'Clínica ACME', clientName: 'Ada', clientTaxId: '12345678A' },
        },
      }) as any,
    )

    const stored = await storedRequest()
    // Rerouted to the variable bucket under the contract's exact variable name
    expect(stored.variableOverrides?.clinicName).toBe('Clínica ACME')
    // ...and removed from dynamicFieldValues so it does not double-render
    expect(stored.dynamicFieldValues['clinicname']).toBeUndefined()
    expect(stored.dynamicFieldValues['clinicName']).toBeUndefined()
  })

  it('binds the prefixed `fields` payload to exact contract names', async () => {
    const contract = await insertContract({ content: CONTENT })
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'local',
          fields: {
            'variable:clinicName': 'Clínica ACME',
            'dynamic:clientName': 'Ada Lovelace',
            'dynamic:Nombre del animal': 'Rex',
          },
          clientTaxId: '12345678A',
        },
      }) as any,
    )

    const stored = await storedRequest()
    expect(stored.dynamicFieldValues['clientName']).toBe('Ada Lovelace')
    expect(stored.dynamicFieldValues['Nombre del animal']).toBe('Rex')
    expect(stored.dynamicFieldValues['clientTaxId']).toBe('12345678A')
    expect(stored.variableOverrides?.clinicName).toBe('Clínica ACME')
  })

  it('forwards the client NIF via top-level clientTaxId', async () => {
    const contract = await insertContract({ content: CONTENT })
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'local',
          signerName: 'Ada Lovelace',
          clientTaxId: '99999999B',
        },
      }) as any,
    )

    const stored = await storedRequest()
    expect(stored.dynamicFieldValues['clientTaxId']).toBe('99999999B')
    expect(stored.signerInfo?.clientTaxId).toBe('99999999B')
  })

  it('REGRESSION: returns a usable top-level shortId for NEW requests', async () => {
    const contract = await insertContract({ content: CONTENT })
    const res = await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'local',
          signerName: 'Ada',
          clientTaxId: '12345678A',
        },
      }) as any,
    )
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(true)
    // Used to be `undefined` due to a block-scoped `let shortId` in the new branch
    expect(typeof body.shortId).toBe('string')
    expect(body.shortId).toHaveLength(10)
    // And it must match the shortId embedded in the signatureUrl
    expect(body.signatureUrl).toContain(`/sign/${body.shortId}`)
  })

  it('REGRESSION: email send path completes without `session is not defined`', async () => {
    const contract = await insertContract({ content: CONTENT })
    const res = await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'email',
          signerEmail: 'ada@example.com',
          signerName: 'Ada',
          clientTaxId: '12345678A',
        },
      }) as any,
    )
    expect(res.status).toBeLessThan(400)

    const stored = await storedRequest()
    // emailTracking is only incremented AFTER a successful send. Before the fix,
    // the ReferenceError aborted the send and this stayed at 0.
    expect(stored.emailTracking?.emailsSent).toBe(1)
    expect(stored.emailTracking?.emailHistory?.[0]?.email).toBe('ada@example.com')
  })
})
