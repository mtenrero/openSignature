/**
 * FULL-STACK e2e: "Entrar con VetControl" (Authentik OIDC) into the clinic's partner account.
 * VetControl :3005 (auto-onboarding registers idpTenantRef) + oSign :3100 + the LOCAL mock IdP
 * "authentik" flavour. Never the real Authentik. Run with playwright.stack.config.ts.
 */
import { test, expect, Page } from '@playwright/test'
import crypto from 'crypto'
import { newMivetTenant, NewTenant, waitFor, partnerAccountsFor, activeKeysFor, osignDb, json, state_, OSIGN_URL, MIVET_URL } from './stack'

const idp = state_.idpUrl as string
if (!idp || !/^http:\/\/127\.0\.0\.1:\d+$/.test(idp)) throw new Error('stack state has no local mock IdP')
const idpPost = (p: string, body?: unknown) => fetch(`${idp}${p}`, { method: 'POST', body: JSON.stringify(body ?? null) })
const idpLog = async () => (await fetch(`${idp}/__test/log`)).json() as Promise<{ authorize: Record<string, string>[]; token: unknown[]; endSession: Record<string, string>[] }>
// T = tenant id WITHOUT the "tenant_" prefix (what Authentik's user.attributes.tenant holds)
const refOfTenantDb = (tenantDb: string) => crypto.createHash('sha256').update(`osign-idp:${tenantDb.replace(/^tenant_/, '')}`).digest('hex')
const sessionOf = async (page: Page) => (await page.request.get('/api/auth/session')).json()

test.beforeEach(async () => { await idpPost('/__test/reset') })

/** A clinic that onboarded itself from VetControl (no click, no manual PATCH). */
async function onboarded(playwright: any, opts: Parameters<typeof newMivetTenant>[1] = {}) {
  const t = await newMivetTenant(playwright, opts)
  const st = await t.api.get('/api/esign/status')
  expect(st.status(), await st.text()).toBe(200)
  const acc = await waitFor(async () => (await partnerAccountsFor(t.tenant))[0], 'partner account')
  return { t, acc }
}

test.describe('authentik login on the full stack', () => {
  let t: NewTenant | undefined
  test.afterEach(async () => { await t?.api.dispose(); t = undefined })

  test('a) auto-onboarding registers the clinic idpTenantRef (sha256 of the tenant id) in oSign', async ({ playwright }) => {
    const o = await onboarded(playwright); t = o.t
    const acc = await waitFor(async () => {
      const a = (await partnerAccountsFor(t!.tenant))[0]
      return a?.idpTenantRefs?.length ? a : null
    }, 'idpTenantRefs on the partner account')
    expect(acc.idpTenantRefs).toEqual([refOfTenantDb(t.tenant)])
    // the raw tenant id never travels / is stored
    expect(JSON.stringify(acc.idpTenantRefs)).not.toContain(t.tenant.replace(/^tenant_/, ''))
  })

  test('b) Entrar con VetControl -> the clinic account; per-user email recorded; restrictions apply', async ({ page, playwright }) => {
    const o = await onboarded(playwright); t = o.t
    await waitFor(async () => (await partnerAccountsFor(t!.tenant))[0]?.idpTenantRefs?.length, 'idpTenantRef')
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOfTenantDb(t.tenant), sub: 'ak-sub-b', email: 'dra.perez@clinic.example.test', name: 'Dra Perez' })

    await page.goto('/auth/signin')
    await page.getByRole('button', { name: /Entrar con VetControl/ }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    const s = await sessionOf(page)
    expect(s).toMatchObject({ customerId: o.acc.customerId, partnerId: 'vetcontrol', idp: 'authentik' })
    expect(s.user.email).toBe('dra.perez@clinic.example.test')
    expect(JSON.stringify(s)).not.toContain('id_token')
    const log = await idpLog()
    expect(log.authorize[0]).toMatchObject({ flavour: 'authentik', code_challenge_method: 'S256' })
    expect((await page.request.get('/api/contracts')).status()).toBe(200)

    // (e) a partner-shaped session cannot manage API keys nor buy
    expect((await page.request.post('/api/settings/api-keys', { data: { name: 'x' } })).status()).toBe(403)
    const keysBefore = (await activeKeysFor(o.acc.customerId)).length
    for (const path of ['/api/subscription/checkout', '/api/subscription/set-plan', '/api/subscription/billing', '/api/subscription/refunds']) {
      const r = await page.request.post(path, { data: {} })
      expect([401, 403], `${path} -> ${r.status()} ${await r.text()}`).toContain(r.status())
    }
    expect((await activeKeysFor(o.acc.customerId)).length).toBe(keysBefore)
  })

  test('c) a tenant with no oSign account lands on clinic_not_enabled and gets no session', async ({ page }) => {
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOfTenantDb(`tenant_nobody${Date.now()}`) })
    await page.goto('/auth/signin?provider=authentik')
    await expect(page).toHaveURL(/\/auth\/error\?error=clinic_not_enabled/, { timeout: 60_000 })
    await expect(page.getByText(/Ajustes → Firma digital/)).toBeVisible()
    expect((await sessionOf(page))?.user).toBeUndefined()
  })

  test('d) VetControl status of an Authentik session points Abrir en oSign at /auth/signin?provider=authentik', async ({ playwright, page }) => {
    const o = await onboarded(playwright, { provider: 'authentik-users' }); t = o.t
    await waitFor(async () => (await partnerAccountsFor(t!.tenant))[0]?.idpTenantRefs?.length, 'idpTenantRef')
    const st = await json(await t.api.get('/api/esign/status'))
    expect(st.directLoginBase).toBe(OSIGN_URL)
    // exactly the URL VetControl's directLoginUrl() builds; drive the oSign side with it
    const url = `${st.directLoginBase}/auth/signin?provider=authentik&callbackUrl=${encodeURIComponent('/contracts')}`
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOfTenantDb(t.tenant), sub: 'ak-sub-d' })
    await page.goto(url)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await sessionOf(page)).customerId).toBe(o.acc.customerId)

    // a non-Authentik (local-dummy) session never gets the direct-login base
    const plain = await newMivetTenant(playwright)
    try {
      await plain.api.get('/api/esign/status')
      expect((await json(await plain.api.get('/api/esign/status'))).directLoginBase).toBeNull()
    } finally { await plain.api.dispose() }
  })

  test('e) revoking the partner account kills the session; logout calls end-session', async ({ page, playwright }) => {
    const o = await onboarded(playwright); t = o.t
    await waitFor(async () => (await partnerAccountsFor(t!.tenant))[0]?.idpTenantRefs?.length, 'idpTenantRef')
    await idpPost('/__test/authentik-user', { vc_tenant_ref: refOfTenantDb(t.tenant) })
    await page.goto('/auth/signin?provider=authentik')
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    await page.goto('/api/auth/idp-logout')
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 30_000 })
    const log = await idpLog()
    expect(log.endSession).toHaveLength(1)
    expect(log.endSession[0].id_token_hint).toMatch(/^eyJ/)
    expect((await sessionOf(page))?.user).toBeUndefined()

    // log in again, then disconnect from VetControl (revokes the partner account)
    await page.goto('/auth/signin?provider=authentik')
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await page.request.get('/api/contracts')).status()).toBe(200)
    const d = await t.api.post('/api/esign/disconnect', { data: {} })
    expect(d.status(), await d.text()).toBe(200)
    await expect.poll(async () => (await page.request.get('/api/contracts')).status(), { timeout: 20_000 }).toBe(401)
  })

  test('f) callbackUrl control-char / foreign payloads never leave oSign', async ({ page, playwright }) => {
    const o = await onboarded(playwright); t = o.t
    await waitFor(async () => (await partnerAccountsFor(t!.tenant))[0]?.idpTenantRefs?.length, 'idpTenantRef')
    const payloads = ['/\t/evil.example', '/%09/evil.example', '/\\evil.example', '//evil.example', '/%0d%0aSet-Cookie:x=1', 'javascript:alert(1)', 'https://evil.example/x', '/contracts%00//evil.example']
    for (const p of payloads) {
      await idpPost('/__test/reset')
      await idpPost('/__test/authentik-user', { vc_tenant_ref: refOfTenantDb(t.tenant) })
      await page.context().clearCookies()
      await page.goto(`/auth/signin?provider=authentik&callbackUrl=${encodeURIComponent(p)}`)
      await expect(page).toHaveURL(/^http:\/\/localhost:3100\/[^/]/, { timeout: 60_000 })
      await page.waitForLoadState('networkidle')
      expect(new URL(page.url()).origin, p).toBe(new URL(OSIGN_URL).origin)
      expect(new URL(page.url()).pathname, p).toBe('/contracts')
    }
  })
})
