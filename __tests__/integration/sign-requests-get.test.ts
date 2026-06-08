/**
 * Integration tests for GET /api/sign-requests/[shortId].
 * This is the PUBLIC endpoint the signer's browser hits to load the request.
 *
 * Auth model = capability URL: ?a=<accessKey> derived deterministically from
 *   base64(shortId:customerId).slice(0, 6)
 *
 * Critical: dynamicFieldValues MUST be returned so the signer page can
 * pre-fill the form. This is the upstream half of Bug #1.
 */
import { ObjectId } from 'mongodb'
import { GET } from '@/app/api/sign-requests/[shortId]/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { insertSignatureRequest } from '../helpers/fixtures'
import { TEST_CUSTOMER_ID } from '../helpers/mockAuth'

const generateAccessKey = (shortId: string, customerId: string) =>
  Buffer.from(`${shortId}:${customerId}`).toString('base64').slice(0, 6)

const buildPendingRequest = (overrides: Record<string, unknown> = {}) => {
  const shortId = (overrides.shortId as string) ?? 'PUB1234567'
  return {
    _id: new ObjectId(),
    shortId,
    customerId: TEST_CUSTOMER_ID,
    contractId: 'fake',
    signatureType: 'email',
    status: 'pending',
    signerEmail: 'ada@example.com',
    signerName: 'Ada Lovelace',
    signerPhone: null,
    dynamicFieldValues: {
      clientName: 'Ada Lovelace',
      clientTaxId: '12345678A',
      clientEmail: 'ada@example.com',
      productName: 'Plan Pro',
    },
    contractSnapshot: {
      originalContractId: 'snapshot-contract',
      name: 'Contrato snapshot',
      description: '',
      content: '<p>{{dynamic:clientName}}</p>',
      userFields: [
        { id: 'f1', name: 'clientName', type: 'name', required: true },
        { id: 'f2', name: 'clientTaxId', type: 'text', required: true },
      ],
      parameters: {},
    },
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    ...overrides,
  }
}

const invokeGet = (shortId: string, accessKey?: string) =>
  GET(
    buildRequest({
      method: 'GET',
      url: `http://localhost:3000/api/sign-requests/${shortId}`,
      searchParams: accessKey ? { a: accessKey } : {},
    }) as any,
    { params: Promise.resolve({ shortId }) } as any,
  )

describe('GET /api/sign-requests/[shortId]', () => {
  it('returns dynamicFieldValues so the signer page can pre-fill the form', async () => {
    const doc = buildPendingRequest()
    await insertSignatureRequest(doc)
    const accessKey = generateAccessKey(doc.shortId, TEST_CUSTOMER_ID)

    const res = await invokeGet(doc.shortId, accessKey)
    expect(res.status).toBe(200)
    const body = (await readJson(res)) as any
    expect(body.authorized).toBe(true)
    expect(body.signRequest.dynamicFieldValues).toMatchObject({
      clientName: 'Ada Lovelace',
      clientTaxId: '12345678A',
      productName: 'Plan Pro',
    })
    expect(body.contract.name).toBe('Contrato snapshot')
    expect(body.contract.userFields).toHaveLength(2)
  })

  it('returns 403 with an invalid access key (capability URL is the only auth)', async () => {
    const doc = buildPendingRequest()
    await insertSignatureRequest(doc)
    const res = await invokeGet(doc.shortId, 'XXXXXX')
    expect(res.status).toBe(403)
  })

  it('returns 400 when no access key is provided', async () => {
    const doc = buildPendingRequest()
    await insertSignatureRequest(doc)
    const res = await invokeGet(doc.shortId, undefined)
    expect(res.status).toBe(400)
  })

  it('returns 404 when the shortId does not exist', async () => {
    const accessKey = generateAccessKey('GHOST00000', TEST_CUSTOMER_ID)
    const res = await invokeGet('GHOST00000', accessKey)
    expect(res.status).toBe(404)
  })

  it('returns 410 when the request is already signed', async () => {
    const doc = buildPendingRequest({ status: 'signed' })
    await insertSignatureRequest(doc)
    const accessKey = generateAccessKey(doc.shortId, TEST_CUSTOMER_ID)
    const res = await invokeGet(doc.shortId, accessKey)
    expect(res.status).toBe(410)
  })

  it('returns 410 (expired) when expiresAt is in the past', async () => {
    const doc = buildPendingRequest({ expiresAt: new Date(Date.now() - 1000) })
    await insertSignatureRequest(doc)
    const accessKey = generateAccessKey(doc.shortId, TEST_CUSTOMER_ID)
    const res = await invokeGet(doc.shortId, accessKey)
    expect(res.status).toBe(410)
  })
})
