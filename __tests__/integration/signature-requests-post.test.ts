/**
 * Integration tests for POST /api/signature-requests
 *
 * Validates:
 *  - dynamicFieldValues persistence (predefined + custom)
 *  - field-name normalization (case-insensitive)
 *  - "fields" prefix parsing (variable:* vs dynamic:*)
 *  - isResend strategy (new vs reuse)
 *
 * Decoupling: handlers are invoked directly with NextRequest; mongodb is
 * redirected to mongodb-memory-server via jestSetupIntegration; getAuthContext
 * is auto-mocked and per-test set via mockAuthAs(); email/SMS services are inert.
 */
import { POST } from '@/app/api/signature-requests/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs, TEST_CUSTOMER_ID, TEST_USER_ID } from '../helpers/mockAuth'
import { insertContract } from '../helpers/fixtures'

describe('POST /api/signature-requests', () => {
  beforeEach(() => {
    mockAuthAs()
  })

  it('rejects request without auth context', async () => {
    mockAuthAs({ unauthenticated: true })
    const res = await POST(
      buildRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/signature-requests',
        body: { contractId: 'x', signatureType: 'email' },
      }) as any,
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when contractId or signatureType is missing', async () => {
    const res = await POST(
      buildRequest({
        method: 'POST',
        url: 'http://localhost:3000/api/signature-requests',
        body: { signatureType: 'email' },
      }) as any,
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when contract belongs to another customer', async () => {
    const other = await insertContract({ customerId: 'someone-else' })
    const res = await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: other._id.toString(),
          signatureType: 'email',
          signerEmail: 'ada@example.com',
          signerName: 'Ada',
        },
      }) as any,
    )
    expect(res.status).toBe(404)
  })

  it('creates a signature request and persists dynamicFieldValues as source of truth', async () => {
    const contract = await insertContract({})
    const res = await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'email',
          signerName: 'Ada Lovelace',
          signerEmail: 'ada@example.com',
          clientTaxId: '12345678A',
        },
      }) as any,
    )
    expect(res.status).toBeLessThan(400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (global as any).__getTestDb()
    const stored = await db.collection('signatureRequests').findOne({ customerId: TEST_CUSTOMER_ID })
    expect(stored).toBeTruthy()
    expect(stored.dynamicFieldValues.clientName).toBe('Ada Lovelace')
    expect(stored.dynamicFieldValues.clientEmail).toBe('ada@example.com')
    expect(stored.dynamicFieldValues.clientTaxId).toBe('12345678A')
    expect(stored.contractSnapshot).toBeTruthy()
    expect(stored.contractSnapshot.name).toBe(contract.name)
    expect(stored.shortId).toBeTruthy()
    expect(stored.status).toBe('pending')
  })

  it('normalizes case of dynamic field keys to match contract userFields', async () => {
    // Contract uses "clientName" (camelCase) — partner sends "clientname" (lowercase)
    const contract = await insertContract({})
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'email',
          signerEmail: 'ada@example.com',
          dynamicFieldValues: { clientname: 'Ada', CLIENTTAXID: '99999999B' },
        },
      }) as any,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (global as any).__getTestDb()
    const stored = await db.collection('signatureRequests').findOne({ customerId: TEST_CUSTOMER_ID })
    expect(stored.dynamicFieldValues.clientName).toBe('Ada')
    expect(stored.dynamicFieldValues.clientTaxId).toBe('99999999B')
    expect(stored.dynamicFieldValues.clientname).toBeUndefined()
  })

  it('parses the new "fields" format with variable:* and dynamic:* prefixes', async () => {
    const contract = await insertContract({})
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'email',
          signerEmail: 'ada@example.com',
          fields: {
            'variable:clinicName': 'Clinic ACME',
            'dynamic:clientName': 'Ada Lovelace',
            'dynamic:productName': 'Plan Pro',
          },
        },
      }) as any,
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (global as any).__getTestDb()
    const stored = await db.collection('signatureRequests').findOne({ customerId: TEST_CUSTOMER_ID })
    // Dynamic fields land in dynamicFieldValues
    expect(stored.dynamicFieldValues.clientName).toBe('Ada Lovelace')
    expect(stored.dynamicFieldValues.productName).toBe('Plan Pro')
    // Variable overrides land in their own bucket
    expect(stored.variableOverrides?.clinicName).toBe('Clinic ACME')
  })

  it('isResend=false (default) creates a brand-new independent request even when a pending one exists', async () => {
    const contract = await insertContract({})

    // First request
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'email',
          signerEmail: 'first@example.com',
          signerName: 'First',
        },
      }) as any,
    )
    // Second request — different recipient, isResend omitted (defaults to false)
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'sms',
          signerPhone: '+34600000000',
          signerName: 'Second',
        },
      }) as any,
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (global as any).__getTestDb()
    const all = await db
      .collection('signatureRequests')
      .find({ customerId: TEST_CUSTOMER_ID })
      .toArray()
    expect(all).toHaveLength(2)
    const byType = Object.fromEntries(all.map((d: any) => [d.signatureType, d]))
    expect(byType.email.dynamicFieldValues.clientName).toBe('First')
    expect(byType.sms.dynamicFieldValues.clientName).toBe('Second')
  })

  it('isResend=true reuses an existing pending request when type+recipient match', async () => {
    const contract = await insertContract({})

    const first = await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'email',
          signerEmail: 'ada@example.com',
          signerName: 'Ada',
        },
      }) as any,
    )
    const firstBody = (await readJson(first as any)) as any

    // Resend to same email + same type → must reuse, not create a new doc
    await POST(
      buildRequest({
        method: 'POST',
        body: {
          contractId: contract._id.toString(),
          signatureType: 'email',
          signerEmail: 'ada@example.com',
          signerName: 'Ada',
          isResend: true,
        },
      }) as any,
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (global as any).__getTestDb()
    const all = await db
      .collection('signatureRequests')
      .find({ customerId: TEST_CUSTOMER_ID })
      .toArray()
    expect(all).toHaveLength(1)
    expect(all[0].shortId).toBe(firstBody?.signatureRequest?.shortId ?? all[0].shortId)
  })
})
