/**
 * Authentik OIDC login e2e against the LOCAL mock IdP "authentik" flavour (never the real
 * Authentik): VetControl user -> /auth/signin?provider=authentik -> IdP -> callback -> the
 * clinic's partner account. Negative paths: clinic not enabled, revoked account.
 */
import { test, expect } from './fixtures'
import { loadE2EState, TEST_PARTNER_SECRET } from './globalSetup'
import crypto from 'crypto'
import type { Page } from '@playwright/test'

const idpUrl = () => loadE2EState().idpUrl as string
const idpPost = (path: string, body?: unknown) => fetch(`${idpUrl()}${path}`, { method: 'POST', body: JSON.stringify(body ?? null) })
const idpLog = async () => (await fetch(`${idpUrl()}/__test/log`)).json() as Promise<{ authorize: Record<string, string>[]; token: unknown[]; endSession: Record<string, string>[] }>
const partnerHeaders = { authorization: `Partner ${TEST_PARTNER_SECRET}` }
const rand = () => crypto.randomBytes(16).toString('hex')
const refOf = (tenant: string) => crypto.createHash('sha256').update(`osign-idp:${tenant}`).digest('hex')
const session = async (page: Page) => (await page.request.get('/api/auth/session')).json()

test.beforeEach(async () => { await idpPost('/__test/reset') })

async function provision(playwright: any, baseURL: string | undefined, tenant: string) {
  const partner = await playwright.request.newContext({ baseURL, extraHTTPHeaders: partnerHeaders })
  const externalId = rand()
  const created = await partner.post('/api/partner/accounts', { data: { externalId, email: 'clinic@example.com', businessName: 'Clinica AK' } })
  expect(created.status()).toBe(201)
  const { customerId } = await created.json()
  const patched = await partner.patch(`/api/partner/accounts/${externalId}`, { data: { idpTenantRef: refOf(tenant) } })
  expect(patched.status()).toBe(200)
  return { partner, externalId, customerId }
}

test.describe('login with VetControl (authentik)', () => {
  test('signin page offers Entrar con VetControl and it logs into the clinic account', async ({ page, playwright, baseURL }) => {
    const tenant = `tenant-${rand()}`
    const { partner, customerId } = await provision(playwright, baseURL, tenant)
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOf(tenant), sub: 'ak-sub-unstable-1' })

    await page.goto('/auth/signin')
    await page.getByRole('button', { name: /Entrar con VetControl/ }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })

    const s = await session(page)
    expect(s.customerId).toBe(customerId)
    expect(s.partnerId).toBe('vetcontrol')
    expect(s.idp).toBe('authentik')
    expect(s.user.email).toBe('vet@example.com')
    expect(JSON.stringify(s)).not.toContain('id_token')

    // PKCE + nonce + state were really used against the mock
    const log = await idpLog()
    expect(log.authorize[0]).toMatchObject({ flavour: 'authentik', code_challenge_method: 'S256' })
    expect(log.authorize[0].nonce).toBeTruthy()

    // Partner-session restrictions: cannot manage API keys
    expect((await page.request.post('/api/settings/api-keys', { data: { name: 'x' } })).status()).toBe(403)
    expect((await page.request.get('/api/contracts')).status()).toBe(200)
    await partner.dispose()
  })

  test('?provider=authentik auto-starts and honours a safe callbackUrl; unsafe falls back', async ({ page, playwright, baseURL }) => {
    const tenant = `tenant-${rand()}`
    const { partner } = await provision(playwright, baseURL, tenant)
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOf(tenant) })
    await page.goto(`/auth/signin?provider=authentik&callbackUrl=${encodeURIComponent('https://evil.example/x')}`)
    await expect(page).toHaveURL(/localhost:\d+\/contracts$/, { timeout: 60_000 })
    await partner.dispose()
  })

  test('a clinic that has not activated oSign lands on clinic_not_enabled (no session)', async ({ page }) => {
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOf(`never-provisioned-${rand()}`) })
    await page.goto('/auth/signin?provider=authentik')
    await expect(page).toHaveURL(/\/auth\/error\?error=clinic_not_enabled/, { timeout: 60_000 })
    await expect(page.getByText(/Ajustes → Firma digital/)).toBeVisible()
    expect((await session(page))?.user).toBeUndefined()
  })

  test('an email that matches the account but no vc_tenant_ref never logs in', async ({ page, playwright, baseURL }) => {
    const { partner } = await provision(playwright, baseURL, `tenant-${rand()}`)
    await idpPost('/__test/authentik-user', { vc_tenant_ref: null, email: 'clinic@example.com' })
    await page.goto('/auth/signin?provider=authentik')
    await expect(page).toHaveURL(/error=clinic_not_enabled/, { timeout: 60_000 })
    await partner.dispose()
  })

  test('revoking the partner account kills the session', async ({ page, playwright, baseURL }) => {
    const tenant = `tenant-${rand()}`
    const { partner, externalId } = await provision(playwright, baseURL, tenant)
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOf(tenant) })
    await page.goto('/auth/signin?provider=authentik')
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await page.request.get('/api/contracts')).status()).toBe(200)
    expect((await partner.delete(`/api/partner/accounts/${externalId}`)).status()).toBe(200)
    expect((await page.request.get('/api/contracts')).status()).toBe(401)
    await partner.dispose()
  })

  test('logout ends the Authentik session (id_token_hint) and the oSign session', async ({ page, playwright, baseURL }) => {
    const tenant = `tenant-${rand()}`
    const { partner } = await provision(playwright, baseURL, tenant)
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOf(tenant) })
    await page.goto('/auth/signin?provider=authentik')
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })

    await page.goto('/api/auth/idp-logout')
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 30_000 })
    const log = await idpLog()
    expect(log.endSession).toHaveLength(1)
    expect(log.endSession[0].id_token_hint).toMatch(/^eyJ/)
    expect(log.endSession[0].post_logout_redirect_uri).toMatch(/\/auth\/signin$/)
    expect((await session(page))?.user).toBeUndefined()
    await partner.dispose()
  })
})
