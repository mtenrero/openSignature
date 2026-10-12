/**
 * Partner entitlement e2e (VetControl -> oSign), against the real next dev + in-memory Mongo:
 * provision account -> PUT entitlement (exact VetControl payload) -> a send with the
 * partner-issued key is included and counted -> stale asOf ignored -> inactive => no
 * longer included -> settings page shows the remaining included sends.
 */
import { test, expect, TEST_DB_NAME } from './fixtures'
import { TEST_PARTNER_SECRET } from './globalSetup'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'

const partnerHeaders = { authorization: `Partner ${TEST_PARTNER_SECRET}` }
const entitlement = (over: Record<string, unknown> = {}) => ({
  source: 'vetcontrol',
  active: true,
  state: 'trialing',
  validUntil: new Date(Date.now() + 31 * 86_400_000).toISOString(),
  quotaPerMonth: 500,
  unit: 'signature_requests',
  asOf: new Date().toISOString(),
  ...over,
})

test.describe('partner entitlement (included signature requests)', () => {
  test('PUT entitlement -> included send counted -> monotonic -> inactive falls back', async ({ playwright, baseURL, db, page }) => {
    const partner = await playwright.request.newContext({ baseURL, extraHTTPHeaders: partnerHeaders })
    const ext = crypto.randomBytes(16).toString('hex')

    // Unknown account: 404 with the errorCode the VetControl client checks.
    const missing = await partner.put(`/api/partner/accounts/${ext}/entitlement`, { data: entitlement() })
    expect(missing.status()).toBe(404)
    expect((await missing.json()).errorCode).toBe('PARTNER_ACCOUNT_NOT_FOUND')

    const created = await partner.post('/api/partner/accounts', {
      data: { externalId: ext, email: 'clinic@example.com', businessName: 'Clinica Entitlement' },
    })
    expect(created.status()).toBe(201)
    const { customerId, apiKey } = await created.json()

    const firstAsOf = new Date(Date.now() - 60_000).toISOString()
    const put1 = await partner.put(`/api/partner/accounts/${ext}/entitlement`, { data: entitlement({ asOf: firstAsOf }) })
    expect(put1.status()).toBe(200)
    const b1 = await put1.json()
    expect(b1.customerId).toBe(customerId)
    expect(b1.entitlement).toMatchObject({ active: true, quotaPerMonth: 500, usedThisMonth: 0 })

    // The body cannot raise the quota.
    const greedy = await partner.put(`/api/partner/accounts/${ext}/entitlement`, { data: entitlement({ quotaPerMonth: 5000 }) })
    expect(greedy.status()).toBe(400)

    // A send with the partner-issued key is included.
    const contractId = new ObjectId()
    await db.db(TEST_DB_NAME).collection('contracts').insertOne({
      _id: contractId, customerId, type: 'contract', status: 'draft', name: 'Contrato Entitlement E2E',
      description: '', content: '<p>{{dynamic:clientName}}</p>',
      userFields: [{ id: 'f1', name: 'clientName', type: 'name', required: true, label: 'Nombre', order: 1 }],
      createdAt: new Date(), updatedAt: new Date(),
    })
    const own = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { authorization: `Bearer ${apiKey}` } })
    const send = await own.post('/api/signature-requests', {
      data: { contractId: contractId.toString(), signatureType: 'qr', signerName: 'Ada', dynamicFieldValues: { clientName: 'Ada' } },
    })
    expect(send.status()).toBe(200)
    expect((await send.json()).includedSend).toBe(true)

    // Stale update (older asOf) is ignored but reports the live counter.
    const stale = await partner.put(`/api/partner/accounts/${ext}/entitlement`, {
      data: entitlement({ active: false, state: 'canceled', validUntil: null, asOf: new Date(Date.now() - 120_000).toISOString() }),
    })
    expect(stale.status()).toBe(200)
    expect((await stale.json()).entitlement).toMatchObject({ active: true, usedThisMonth: 1 })

    // The settings page shows the remaining included sends (partner SSO session).
    const sso = await partner.post('/api/partner/sso', {
      data: { externalId: ext, email: 'vet@example.com', name: 'Vet', returnTo: '/settings' },
    })
    expect(sso.status()).toBe(200)
    await page.goto((await sso.json()).url)
    await page.goto('/settings/subscription')
    await expect(page.getByTestId('included-signatures')).toHaveText(/Incluidos con VetControl:\s*quedan 499 de 500 este mes/, { timeout: 60_000 })

    // Newer inactive update applies; the next send is no longer included.
    const off = await partner.put(`/api/partner/accounts/${ext}/entitlement`, {
      data: entitlement({ active: false, state: 'canceled', validUntil: null }),
    })
    expect((await off.json()).entitlement.active).toBe(false)
    const send2 = await own.post('/api/signature-requests', {
      data: { contractId: contractId.toString(), signatureType: 'qr', signerName: 'Ada', dynamicFieldValues: { clientName: 'Ada' } },
    })
    expect(send2.status()).toBe(200) // pyme plan still has its own email allowance
    expect((await send2.json()).includedSend).toBe(false)

    await own.dispose()
    await partner.dispose()
  })
})
