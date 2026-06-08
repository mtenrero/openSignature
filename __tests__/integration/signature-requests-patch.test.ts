/**
 * Integration tests for PATCH /api/signature-requests/[id].
 *
 * This is the "resend" code path triggered from the /signatures UI. It is the
 * pathway the user specifically suspected was losing pre-filled fields when
 * switching method (e.g. email → SMS).
 *
 * Invariants verified:
 *  - dynamicFieldValues are preserved verbatim on resend (no truncation/overwrite)
 *  - signerEmail/Phone/Name cannot be modified on resend (locked)
 *  - signatureType CAN change (email → SMS, etc.)
 *  - shortId IS rotated so older links can no longer be used
 *  - resentCount increments
 */
import { ObjectId } from 'mongodb'
import { PATCH } from '@/app/api/signature-requests/[id]/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { insertSignatureRequest } from '../helpers/fixtures'
import { mockAuthAs, TEST_CUSTOMER_ID, TEST_USER_ID } from '../helpers/mockAuth'

const buildExistingRequest = (overrides: Record<string, unknown> = {}) => ({
  _id: new ObjectId(),
  shortId: 'OLD12345AB',
  customerId: TEST_CUSTOMER_ID,
  createdBy: TEST_USER_ID,
  contractId: 'fake-contract-id',
  signatureType: 'email',
  status: 'pending',
  signerEmail: 'ada@example.com',
  signerName: 'Ada Lovelace',
  signerPhone: null,
  clientName: 'Ada Lovelace',
  clientTaxId: '12345678A',
  dynamicFieldValues: {
    clientName: 'Ada Lovelace',
    clientTaxId: '12345678A',
    clientEmail: 'ada@example.com',
    productName: 'Plan Pro',           // additional/optional partner field
    customNote: 'Atendido por María',  // additional/optional partner field
  },
  contractSnapshot: {
    name: 'Contrato test',
    content: '<p>{{dynamic:clientName}}</p>',
  },
  createdAt: new Date(Date.now() - 60_000),
  updatedAt: new Date(Date.now() - 60_000),
  expiresAt: new Date(Date.now() + 86_400_000),
  emailTracking: { emailsSent: 1, emailHistory: [] },
  resentCount: 0,
  auditTrail: [],
  ...overrides,
})

const invokePatch = (id: string, body: Record<string, unknown>) =>
  PATCH(
    buildRequest({
      method: 'PATCH',
      url: `http://localhost:3000/api/signature-requests/${id}`,
      body,
    }) as any,
    { params: Promise.resolve({ id }) } as any,
  )

describe('PATCH /api/signature-requests/[id] — action:resend', () => {
  beforeEach(() => mockAuthAs())

  it('preserves dynamicFieldValues intact when resending', async () => {
    const existing = buildExistingRequest()
    await insertSignatureRequest(existing)

    const res = await invokePatch(existing._id.toString(), {
      action: 'resend',
      signatureType: 'email',
      resendReason: 'test',
    })

    expect(res.status).toBeLessThan(400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (global as any).__getTestDb()
    const updated = await db.collection('signatureRequests').findOne({ _id: existing._id })
    expect(updated.dynamicFieldValues).toMatchObject({
      clientName: 'Ada Lovelace',
      clientTaxId: '12345678A',
      clientEmail: 'ada@example.com',
      productName: 'Plan Pro',
      customNote: 'Atendido por María',
    })
  })

  it('REGRESSION: email → SMS switch keeps all dynamicFieldValues, including custom partner fields', async () => {
    // The user-reported bug: resending via a different method appeared to drop fields.
    // This test pins the contract: PATCH must NEVER touch dynamicFieldValues.
    const existing = buildExistingRequest({
      // Even with signerPhone present on the original, the original was email.
      signerPhone: '+34600000000',
    })
    await insertSignatureRequest(existing)

    const res = await invokePatch(existing._id.toString(), {
      action: 'resend',
      signatureType: 'sms',
      resendReason: 'switch to sms',
    })

    expect(res.status).toBeLessThan(400)
    const body = (await readJson(res)) as any
    expect(body.success ?? true).toBeTruthy()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = await (global as any).__getTestDb()
    const updated = await db.collection('signatureRequests').findOne({ _id: existing._id })

    // dynamicFieldValues fully preserved
    expect(updated.dynamicFieldValues).toEqual(existing.dynamicFieldValues)
    // signatureType updated
    expect(updated.signatureType).toBe('sms')
    // Signer immutables preserved
    expect(updated.signerEmail).toBe('ada@example.com')
    expect(updated.signerName).toBe('Ada Lovelace')
    // shortId rotated (new accessible URL)
    expect(updated.shortId).not.toBe(existing.shortId)
    // Counter incremented
    expect(updated.resentCount).toBe(1)
  })

  it('rejects attempts to modify signer data on resend', async () => {
    const existing = buildExistingRequest()
    await insertSignatureRequest(existing)

    const res = await invokePatch(existing._id.toString(), {
      action: 'resend',
      signatureType: 'email',
      signerEmail: 'someone-else@example.com',
    })
    expect(res.status).toBe(400)
    const body = (await readJson(res)) as any
    expect(body.errorCode).toBe('SIGNER_DATA_IMMUTABLE')
  })

  it('rejects resend when the request is no longer pending', async () => {
    const existing = buildExistingRequest({ status: 'signed' })
    await insertSignatureRequest(existing)

    const res = await invokePatch(existing._id.toString(), {
      action: 'resend',
      signatureType: 'email',
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 when unauthenticated', async () => {
    const existing = buildExistingRequest()
    await insertSignatureRequest(existing)
    mockAuthAs({ unauthenticated: true })

    const res = await invokePatch(existing._id.toString(), {
      action: 'resend',
      signatureType: 'email',
    })
    expect(res.status).toBe(401)
  })

  it('returns 404 for a request belonging to a different customer', async () => {
    const existing = buildExistingRequest({ customerId: 'other-customer' })
    await insertSignatureRequest(existing)

    const res = await invokePatch(existing._id.toString(), {
      action: 'resend',
      signatureType: 'email',
    })
    expect(res.status).toBe(404)
  })
})
