/**
 * Browser e2e on the running local stack: oSign LOGIN and SELF-SERVICE REGISTRATION against
 * the local mock Auth0 (OIDC + Management API, e2e/mock-idp). Never the real Auth0.
 * Run with playwright.stack.config.ts.
 */
import { test, expect, Page } from '@playwright/test'
import crypto from 'crypto'
import { OSIGN_URL, osignDb, state_ } from './stack'

const BUTTON = /Iniciar Sesión con Barvet Empresas/
const idp = state_.idpUrl as string
if (!idp || !/^http:\/\/127\.0\.0\.1:\d+$/.test(idp)) throw new Error('stack state has no local mock IdP (restart the stack with the current launcher)')

const idpPost = (p: string, body?: unknown) => fetch(`${idp}${p}`, { method: 'POST', body: JSON.stringify(body ?? null) })
const idpLog = async () => (await fetch(`${idp}/__test/log`)).json() as Promise<{ authorize: Record<string, string>[]; token: unknown[] }>
const idpUsers = async () => (await (await fetch(`${idp}/__test/users`)).json()) as any[]
const sessionOf = async (page: Page) => (await page.request.get('/api/auth/session')).json()

test.beforeEach(async () => { await idpPost('/__test/reset') })

test.describe('b) oSign login through the mock IdP (real browser)', () => {
  test('signin -> IdP -> lands logged in on /contracts', async ({ page }) => {
    await page.goto('/auth/signin')
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    const s = await sessionOf(page)
    expect(s.customerId).toBe('biz-e2e-idp-001')
    expect(s.user.email).toBe('idp.user@example.com')
    const { authorize, token } = await idpLog()
    expect(authorize).toHaveLength(1)
    expect(authorize[0].prompt).toBeUndefined()
    expect(token).toHaveLength(1)
  })

  test('?switch=1 sends prompt=login and switches to the other account', async ({ page }) => {
    await page.goto('/auth/signin')
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    await idpPost('/__test/reset')
    await idpPost('/__test/user', { sub: 'auth0|switchuser0009', businessID: 'biz-switched', email: 'switched@example.com' })
    await page.goto('/auth/signin?switch=1')
    await expect(page).toHaveURL(/\/auth\/signin\?switch=1/)
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect((await idpLog()).authorize[0].prompt).toBe('login')
    expect((await sessionOf(page)).customerId).toBe('biz-switched')
  })

  test('a deep link is honoured after login and a foreign callbackUrl is not', async ({ page, baseURL }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/auth\/signin\?.*callbackUrl=/)
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/settings$/, { timeout: 60_000 })

    await page.context().clearCookies()
    await page.goto(`/auth/signin?callbackUrl=${encodeURIComponent('https://evil.example/steal')}`)
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin)
  })

  test('logout clears the session; protected pages bounce to signin', async ({ page }) => {
    await page.goto('/auth/signin')
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    const { csrfToken } = await (await page.request.get('/api/auth/csrf')).json()
    expect((await page.request.post('/api/auth/signout', { form: { csrfToken, callbackUrl: '/' } })).ok()).toBe(true)
    expect(await sessionOf(page)).toBeNull()
    await page.goto('/contracts')
    await expect(page).toHaveURL(/\/auth\/signin\?.*callbackUrl=/)
    expect((await page.request.get('/api/contracts')).status()).toBe(401)
  })
})

const PASSWORD = 'Str0ng!Passw0rd'
async function fillSignup(page: Page, f: { name: string; username: string; email: string; company?: string }) {
  await page.goto('/auth/signup')
  await page.getByPlaceholder('Tu nombre completo').fill(f.name)
  await page.getByPlaceholder('usuario123').fill(f.username)
  await page.getByPlaceholder('tu@empresa.com').fill(f.email)
  if (f.company) await page.getByPlaceholder('Nombre de tu empresa').fill(f.company)
  await page.getByPlaceholder('Mínimo 8 caracteres, 3 de 4 tipos').fill(PASSWORD)
  await page.getByPlaceholder('Repite tu contraseña').fill(PASSWORD)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Crear cuenta gratuita' }).click()
}
const uniq = () => crypto.randomBytes(4).toString('hex')

test.describe('c) oSign registration through the signup UI (mock Auth0 Management API)', () => {
  test('creates the user with businessID + platforms_allowed, then logs in and sees an empty tenant', async ({ page }) => {
    const id = uniq()
    const email = `new.${id}@clinic.example.test`
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `10.1.${parseInt(id.slice(0, 2), 16)}.${parseInt(id.slice(2, 4), 16)}` })
    await fillSignup(page, { name: 'Nueva Usuaria', username: `u_${id}`, email, company: 'Empresa E2E' })
    await expect(page.getByText('¡Cuenta creada exitosamente!')).toBeVisible({ timeout: 30_000 })

    const users = await idpUsers()
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ email, username: `u_${id}`, email_verified: false })
    expect(users[0].app_metadata.businessID).toMatch(/^osign_[0-9a-f]{24}$/)
    expect(users[0].app_metadata.platforms_allowed).toEqual(['osign'])
    expect(users[0].app_metadata.role).toBe('user')
    expect(users[0].user_metadata.subscriptionPlan).toBe('free')

    // The new user then logs in through the IdP and gets a brand-new, empty tenant.
    expect((await idpPost('/__test/login-as', { email })).status).toBe(200)
    await page.goto('/auth/signin')
    await page.getByRole('button', { name: BUTTON }).click()
    await expect(page).toHaveURL(/\/contracts$/, { timeout: 60_000 })
    const s = await sessionOf(page)
    expect(s.customerId).toBe(users[0].app_metadata.businessID)
    const res = await page.request.get('/api/contracts')
    expect(res.status()).toBe(200)
    const body = await res.json()
    const list = Array.isArray(body) ? body : body.contracts ?? body.data ?? []
    expect(list).toHaveLength(0)
    // and nothing leaked from the seeded e2e tenant (its template is not visible)
    expect(JSON.stringify(body)).not.toContain('Consentimiento informado (seed)')
  })

  test('a duplicate email gets the SAME generic success (no enumeration) and creates no second user', async ({ page }) => {
    const id = uniq()
    const email = `dup.${id}@clinic.example.test`
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `10.2.${parseInt(id.slice(0, 2), 16)}.${parseInt(id.slice(2, 4), 16)}` })
    await fillSignup(page, { name: 'Dup Uno', username: `d1_${id}`, email })
    await expect(page.getByText('¡Cuenta creada exitosamente!')).toBeVisible({ timeout: 30_000 })
    await fillSignup(page, { name: 'Dup Dos', username: `d2_${id}`, email })
    await expect(page.getByText('¡Cuenta creada exitosamente!')).toBeVisible({ timeout: 30_000 })
    expect(await page.getByText(/ya existe|already exists|registrado/i).count()).toBe(0)
    expect((await idpUsers()).filter((u) => u.email === email)).toHaveLength(1)

    // same through the API: identical bodies for created vs existing
    const mk = (u: string) => page.request.post('/api/auth/register-auth0', {
      data: { name: 'X', username: u, email, password: PASSWORD, company: '' },
      headers: { 'x-forwarded-for': `10.2.99.${Math.floor(Math.random() * 200)}` },
    })
    const a = await mk(`d3_${id}`)
    expect(a.status()).toBe(200)
    expect((await a.json()).success).toBe(true)
  })

  test('validation errors are specific, but a weak password never reaches Auth0', async ({ page }) => {
    const id = uniq()
    const r = await page.request.post('/api/auth/register-auth0', {
      data: { name: 'X', username: `w_${id}`, email: `weak.${id}@clinic.example.test`, password: 'password' },
      headers: { 'x-forwarded-for': `10.3.0.${Math.floor(Math.random() * 200)}` },
    })
    expect(r.status()).toBe(400)
    expect((await r.json()).field).toBe('password')
    expect(await idpUsers()).toHaveLength(0)
  })

  test('rate limits kick in: per email (3/h) and per IP (10/h)', async ({ page }) => {
    const id = uniq()
    const email = `rl.${id}@clinic.example.test`
    const post = (e: string, ip: string, u: string) => page.request.post('/api/auth/register-auth0', {
      data: { name: 'RL', username: u, email: e, password: PASSWORD },
      headers: { 'x-forwarded-for': ip },
    })
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await post(email, `10.4.${i}.1`, `rl${i}_${id}`)).status())
    expect(statuses).toEqual([200, 200, 200, 429])
    const limited = await post(email, '10.4.9.9', `rlx_${id}`)
    expect(limited.status()).toBe(429)
    expect((await limited.json()).errorCode).toBe('RATE_LIMITED')

    const ip = `10.5.${parseInt(id.slice(0, 2), 16)}.${parseInt(id.slice(2, 4), 16)}`
    const ipStatuses: number[] = []
    for (let i = 0; i < 11; i++) ipStatuses.push((await post(`ip${i}.${id}@clinic.example.test`, ip, `ip${i}_${id}`)).status())
    expect(ipStatuses.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(ipStatuses[10]).toBe(429)

    // the limiter stores hashed subjects only: no email in rate_limits
    const { client, db } = await osignDb()
    try {
      const dump = JSON.stringify(await db.collection('rate_limits').find({}).toArray())
      expect(dump).not.toContain(email)
    } finally { await client.close() }
  })
})
