/**
 * Login e2e against a LOCAL mock OIDC provider (e2e/mock-idp) - never the real Auth0.
 * signin page -> Auth0 button -> mock IdP -> NextAuth callback -> app, plus the
 * negative paths (bad state, replayed code, denied consent, open redirect, logged out).
 */
import { test, expect, TEST_DB_NAME } from './fixtures'
import { loadE2EState, TEST_PARTNER_SECRET } from './globalSetup'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import type { Page, BrowserContext } from '@playwright/test'

const BUTTON = /Iniciar Sesión con Barvet Empresas/
const NS = 'https://vetcontrol-pro.eu.auth0.com/businessID'

const idpUrl = () => loadE2EState().idpUrl as string
const idpPost = (path: string, body?: unknown) =>
  fetch(`${idpUrl()}${path}`, { method: 'POST', body: JSON.stringify(body ?? null) })
const idpLog = async () => (await fetch(`${idpUrl()}/__test/log`)).json() as Promise<{ authorize: Record<string, string>[]; token: unknown[] }>

async function session(page: Page | BrowserContext['request'] | any) {
  const res = await (page.request ?? page).get('/api/auth/session')
  return res.json()
}

async function loginViaButton(page: Page, path = '/auth/signin') {
  await page.goto(path)
  await page.getByRole('button', { name: BUTTON }).click()
}

test.beforeEach(async () => {
  await idpPost('/__test/reset')
})

test.describe('login through the mock IdP', () => {
  test('signin -> IdP -> callback -> /contracts, logged in with the businessID customerId', async ({ page }) => {
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    const s = await session(page)
    expect(s.customerId).toBe('biz-e2e-idp-001')
    expect(s.user.email).toBe('idp.user@example.com')
    expect(s.user.id).toBe('auth0|e2eidpuser0001')
    // The oidc code exchange really happened against the mock.
    expect((await idpLog()).token.length).toBe(1)
  })

  test('namespaced businessID claim alone resolves the customerId', async ({ page }) => {
    await idpPost('/__test/user', { businessIdVia: 'namespaced', businessID: 'biz-from-claim' })
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await session(page)).customerId).toBe('biz-from-claim')
    expect(NS).toContain('businessID')
  })

  test('a user without businessID falls back to the sub', async ({ page }) => {
    await idpPost('/__test/user', { sub: 'auth0|nobizuser0002', businessIdVia: 'none', email: 'nobiz@example.com' })
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await session(page)).customerId).toBe('nobizuser0002')
  })

  test('session cookie is HttpOnly, SameSite=Lax, path=/', async ({ page, context }) => {
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    const c = (await context.cookies()).find((x) => x.name === 'authjs.session-token')
    expect(c).toBeTruthy()
    expect(c!.httpOnly).toBe(true)
    expect(c!.sameSite).toBe('Lax')
    expect(c!.path).toBe('/')
    expect(await page.evaluate(() => document.cookie)).not.toContain('authjs.session-token')
  })

  test('logout clears the session and protected pages bounce to signin', async ({ page }) => {
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await session(page)).customerId).toBeTruthy()

    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json()
    const out = await page.request.post('/api/auth/signout', { form: { csrfToken, callbackUrl: '/' } })
    expect(out.ok()).toBe(true)
    expect(await session(page)).toBeNull()

    await page.goto('/contracts')
    await expect(page).toHaveURL(/\/auth\/signin\?.*callbackUrl=/)
  })

  test('protected page and API reject anonymous visitors', async ({ page }) => {
    await page.goto('/contracts')
    await expect(page).toHaveURL(/\/auth\/signin\?.*callbackUrl=/)
    expect((await page.request.get('/api/contracts')).status()).toBe(401)
  })
})

test.describe('prompt=login and account switching', () => {
  test('prompt=login is NOT sent by default', async ({ page }) => {
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    const { authorize } = await idpLog()
    expect(authorize).toHaveLength(1)
    expect(authorize[0].prompt).toBeUndefined()
    expect(authorize[0].scope).toBe('openid profile email')
  })

  test('prompt=login IS sent with ?switch=1, and a signed-in user can reach the page and switch account', async ({ page }) => {
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await session(page)).customerId).toBe('biz-e2e-idp-001')

    await idpPost('/__test/reset')
    await idpPost('/__test/user', { sub: 'auth0|otheruser0003', businessID: 'biz-other', email: 'other@example.com' })
    await page.goto('/auth/signin?switch=1')
    // Not bounced to /contracts although already authenticated.
    await expect(page).toHaveURL(/\/auth\/signin\?switch=1/)
    await expect(page.getByRole('button', { name: BUTTON })).toBeVisible()
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })

    const { authorize } = await idpLog()
    expect(authorize[0].prompt).toBe('login')
    expect((await session(page)).customerId).toBe('biz-other')
  })

  test('a signed-in user hitting plain /auth/signin is still sent to /contracts', async ({ page }) => {
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    await page.goto('/auth/signin')
    await expect(page).toHaveURL(/\/contracts$/)
  })
})

test.describe('callbackUrl handling', () => {
  test('a deep link survives the login round trip', async ({ page, db }) => {
    const id = new ObjectId()
    await db.db(TEST_DB_NAME).collection('contracts').insertOne({
      _id: id, customerId: 'biz-e2e-idp-001', type: 'contract', status: 'draft', name: 'Deep link contract',
      description: '', content: '<p>x</p>', userFields: [], createdAt: new Date(), updatedAt: new Date(),
    })
    await page.goto(`/contracts/${id}/edit`)
    await expect(page).toHaveURL(/\/auth\/signin\?.*callbackUrl=/)
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(new RegExp(`/contracts/${id}/edit$`), { timeout: 60_000 })
  })

  test('an absolute foreign callbackUrl is rejected', async ({ page, baseURL }) => {
    const hosts: string[] = []
    page.on('request', (r) => hosts.push(new URL(r.url()).hostname))
    await loginViaButton(page, `/auth/signin?callbackUrl=${encodeURIComponent('https://evil.example/steal')}`)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
    expect(hosts).not.toContain('evil.example')
  })

  test('a protocol-relative callbackUrl is rejected too', async ({ page, baseURL }) => {
    await loginViaButton(page, `/auth/signin?callbackUrl=${encodeURIComponent('//evil.example/x')}`)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
  })
})

test.describe('callback hardening', () => {
  test('an invalid state is rejected and no session is created', async ({ page, context }) => {
    await page.goto('/api/auth/callback/auth0?code=whatever&state=bogus')
    await expect(page).toHaveURL(/\/auth\/error|\/auth\/signin/)
    expect(await session(page)).toBeNull()
    expect((await context.cookies()).some((c) => c.name === 'authjs.session-token')).toBe(false)
  })

  test('a replayed authorization code does not log anyone in', async ({ page, browser }) => {
    let callbackUrl = ''
    page.on('request', (r) => { if (r.url().includes('/api/auth/callback/auth0')) callbackUrl = r.url() })
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect(callbackUrl).toContain('code=')

    const fresh = await browser.newContext()
    const p2 = await fresh.newPage()
    await p2.goto(callbackUrl)
    expect(await session(p2)).toBeNull()
    expect((await fresh.cookies()).some((c) => c.name === 'authjs.session-token')).toBe(false)
    await fresh.close()
  })

  test('the IdP denying consent leaves the user logged out', async ({ page, context }) => {
    await idpPost('/__test/user', null)
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/auth\/(error|signin)/, { timeout: 60_000 })
    expect(await session(page)).toBeNull()
    expect((await context.cookies()).some((c) => c.name === 'authjs.session-token')).toBe(false)
  })
})

test.describe('normal login and partner SSO coexist', () => {
  const partner = { authorization: `Partner ${TEST_PARTNER_SECRET}` }

  async function ssoUrl(playwright: any, baseURL: string, ext: string) {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: partner })
    const created = await ctx.post('/api/partner/accounts', { data: { externalId: ext, email: 'c@example.com', businessName: 'Coexist' } })
    expect(created.status()).toBe(201)
    const { customerId } = await created.json()
    const sso = await ctx.post('/api/partner/sso', { data: { externalId: ext, email: 'vet@example.com', name: 'Vet', returnTo: '/contracts' } })
    const { url } = await sso.json()
    await ctx.dispose()
    return { url: url as string, customerId: customerId as string }
  }

  test('redeeming a partner SSO URL while logged in normally REPLACES the session', async ({ page, playwright, baseURL }) => {
    await loginViaButton(page)
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await session(page)).customerId).toBe('biz-e2e-idp-001')

    const { url, customerId } = await ssoUrl(playwright, baseURL!, crypto.randomBytes(16).toString('hex'))
    await page.goto(url)
    await expect(page).toHaveURL(/\/contracts$/)
    const s = await session(page)
    expect(s.customerId).toBe(customerId)
    expect(s.partnerId).toBe('vetcontrol')
  })

  test('after a partner SSO session, ?switch=1 lets the user log in normally and replaces it', async ({ page, playwright, baseURL }) => {
    const { url } = await ssoUrl(playwright, baseURL!, crypto.randomBytes(16).toString('hex'))
    await page.goto(url)
    await expect(page).toHaveURL(/\/contracts$/)
    expect((await session(page)).partnerId).toBe('vetcontrol')

    await page.goto('/auth/signin?switch=1')
    await expect(page).toHaveURL(/\/auth\/signin\?switch=1/)
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    const s = await session(page)
    expect(s.customerId).toBe('biz-e2e-idp-001')
    expect(s.partnerId).toBeUndefined()
  })
})
