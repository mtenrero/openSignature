/**
 * Partner provisioning + SSO e2e (VetControl -> oSign):
 * create account -> mint SSO url -> open it in a browser -> lands on /contracts logged in.
 */
import { test, expect, TEST_DB_NAME } from './fixtures'
import { TEST_PARTNER_SECRET } from './globalSetup'
import { MongoClient, ObjectId } from 'mongodb'
import crypto from 'crypto'

const partnerHeaders = { authorization: `Partner ${TEST_PARTNER_SECRET}` }
const externalId = () => crypto.randomBytes(16).toString('hex')

test.describe('partner provisioning + SSO', () => {
  test('create account -> sso -> lands on /contracts logged in', async ({ playwright, baseURL, page, db }) => {
    const partner = await playwright.request.newContext({ baseURL, extraHTTPHeaders: partnerHeaders })
    const ext = externalId()

    const created = await partner.post('/api/partner/accounts', {
      data: { externalId: ext, email: 'clinic@example.com', businessName: 'Clinica E2E' },
    })
    expect(created.status()).toBe(201)
    const { customerId, apiKey } = await created.json()
    expect(customerId).toBe(`partner_vetcontrol_${ext}`)

    // The issued key works on the contracts API and is isolated to the new customer.
    const own = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { authorization: `Bearer ${apiKey}` } })
    expect((await own.get('/api/contracts')).status()).toBe(200)

    await db.db(TEST_DB_NAME).collection('contracts').insertOne({
      _id: new ObjectId(), customerId, type: 'contract', status: 'draft', name: 'Contrato Partner E2E',
      description: '', content: '<p>x</p>', userFields: [], createdAt: new Date(), updatedAt: new Date(),
    })

    const sso = await partner.post('/api/partner/sso', {
      data: { externalId: ext, email: 'vet@example.com', name: 'Vet', returnTo: '/contracts' },
    })
    expect(sso.status()).toBe(200)
    const { url } = await sso.json()

    await page.goto(url)
    await expect(page).toHaveURL(/\/contracts$/)
    await expect(page.getByText('Contrato Partner E2E')).toBeVisible({ timeout: 30_000 })

    // The session cookie resolves to the partner customer on a protected API.
    const mine = await page.request.get('/api/contracts')
    expect(mine.status()).toBe(200)
    expect(JSON.stringify(await mine.json())).toContain('Contrato Partner E2E')

    // One-time: replaying the URL does not log anyone in.
    const fresh = await page.context().browser()!.newContext()
    const replay = await fresh.newPage()
    await replay.goto(url)
    await expect(replay).toHaveURL(/\/auth\/signin\?.*error=sso_expired/)
    await fresh.close()
    await partner.dispose()
    await own.dispose()
  })

  test('rejects a foreign returnTo and a wrong partner secret', async ({ playwright, baseURL }) => {
    const partner = await playwright.request.newContext({ baseURL, extraHTTPHeaders: partnerHeaders })
    const ext = externalId()
    await partner.post('/api/partner/accounts', { data: { externalId: ext, email: 'c@example.com', businessName: 'C' } })
    const bad = await partner.post('/api/partner/sso', { data: { externalId: ext, email: 'v@example.com', returnTo: '//evil.com' } })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).errorCode).toBe('INVALID_RETURN_TO')

    const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { authorization: 'Partner wrong' } })
    expect((await anon.post('/api/partner/accounts', { data: {} })).status()).toBe(401)
    await partner.dispose()
    await anon.dispose()
  })
})
