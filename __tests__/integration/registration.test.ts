/**
 * Self-service registration (POST /api/auth/register-auth0), the Auth0 login callbacks
 * and what a freshly registered user sees. The Auth0 Management API is a mocked `fetch`
 * (payloads asserted); nothing leaves the process.
 */
jest.mock('next-auth', () => ({ __esModule: true, default: () => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() }) }))
jest.mock('next-auth/providers/auth0', () => ({ __esModule: true, default: (options: any) => ({ id: 'auth0', options }) }))

import { POST as REGISTER } from '@/app/api/auth/register-auth0/route'
import { GET as CONTRACTS_GET } from '@/app/api/contracts/route'
import { GET as VARIABLES_GET } from '@/app/api/variables/route'
import { GENERIC_REGISTER_MESSAGE, normalizeEmail } from '@/lib/auth/registration'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { mockAuthAs } from '../helpers/mockAuth'

const DOMAIN = 'osign-test-tenant.invalid'
const GOOD = {
  name: 'Ana Pérez',
  username: 'ana_perez',
  email: 'Ana.Perez@Example.com',
  password: 'Str0ng!Passw0rd',
  company: 'Clínica Ana',
}

let fetchMock: jest.SpyInstance
let existingUsers: any[]
let createResponse: { status: number; body: any }
let ipCounter = 0

function installFetch() {
  fetchMock = jest.spyOn(global, 'fetch').mockImplementation((async (input: any, init?: any) => {
    const url = String(input)
    const json = (status: number, body: any) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (!url.startsWith(`https://${DOMAIN}/`)) throw new Error(`unexpected outbound call: ${url}`)
    if (url.endsWith('/oauth/token')) return json(200, { access_token: 'mgmt-token' })
    if (url.includes('/api/v2/users-by-email')) return json(200, existingUsers)
    if (url.endsWith('/api/v2/users') && init?.method === 'POST') return json(createResponse.status, createResponse.body)
    throw new Error(`unmocked ${url}`)
  }) as any)
}

const calls = (needle: string) => fetchMock.mock.calls.filter((c) => String(c[0]).includes(needle))
const createdPayload = () => JSON.parse(calls('/api/v2/users')
  .filter((c) => (c[1] as any)?.method === 'POST' && String(c[0]).endsWith('/api/v2/users'))[0][1].body)

const register = (body: unknown, ip?: string) =>
  REGISTER(
    buildRequest({
      method: 'POST',
      url: 'http://localhost:3000/api/auth/register-auth0',
      body: body as any,
      headers: { 'x-forwarded-for': ip ?? `10.0.0.${++ipCounter}` },
    }) as any,
  )

beforeEach(() => {
  process.env.AUTH0_ISSUER = `https://${DOMAIN}/`
  process.env.AUTH0_MANAGEMENT_CLIENT_ID = 'mgmt-id'
  process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = 'mgmt-secret'
  existingUsers = []
  createResponse = { status: 201, body: { user_id: 'auth0|abc123' } }
  installFetch()
})
afterEach(() => {
  fetchMock.mockRestore()
  jest.restoreAllMocks()
})

describe('registration: Auth0 user payload', () => {
  it('creates the user with a stable osign_ businessID, platforms_allowed [osign], free plan, verification email', async () => {
    const res = await register(GOOD)
    expect(res.status).toBe(200)
    const p = createdPayload()
    expect(p.app_metadata.businessID).toMatch(/^osign_[0-9a-f]{24}$/)
    expect(p.app_metadata.platforms_allowed).toEqual(['osign'])
    expect(p.app_metadata.role).toBe('user')
    expect(p.app_metadata.requireVerifiedEmail).toBe(true)
    expect(p.user_metadata.subscriptionPlan).toBe('free')
    expect(p.user_metadata.subscriptionStatus).toBe('active')
    expect(p.verify_email).toBe(true)
    expect(p.email_verified).toBe(false)
    expect(p.connection).toBe('Username-Password-Authentication')
    expect(p.email).toBe('ana.perez@example.com')
    expect(p.username).toBe('ana_perez')
    expect(p.name).toBe('Ana Pérez')
    expect(p.user_metadata.company).toBe('Clínica Ana')
  })

  it('every registration gets its own businessID (never null, never the Auth0 sub)', async () => {
    await register(GOOD)
    await register({ ...GOOD, email: 'b@example.com', username: 'bbb' })
    const ids = calls('/api/v2/users')
      .filter((c) => (c[1] as any)?.method === 'POST' && String(c[0]).endsWith('/api/v2/users'))
      .map((c) => JSON.parse((c[1] as any).body).app_metadata.businessID)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    ids.forEach((id) => expect(id).toBeTruthy())
  })

  it('only talks to the configured Auth0 domain (Management API is the mock)', async () => {
    await register(GOOD)
    fetchMock.mock.calls.forEach((c) => expect(String(c[0]).startsWith(`https://${DOMAIN}/`)).toBe(true))
  })

  it('the success response never returns the Auth0 user id', async () => {
    const body = (await readJson((await register(GOOD)) as any)) as any
    expect(JSON.stringify(body)).not.toContain('auth0|')
    expect(body.userId).toBeUndefined()
  })
})

describe('registration: input validation', () => {
  const bad: Array<[string, any]> = [
    ['invalid email', { ...GOOD, email: 'not-an-email' }],
    ['email with spaces/quotes', { ...GOOD, email: 'a b@example.com' }],
    ['email too long', { ...GOOD, email: `${'a'.repeat(250)}@example.com` }],
    ['name too long', { ...GOOD, name: 'x'.repeat(101) }],
    ['empty name', { ...GOOD, name: '   ' }],
    ['company too long', { ...GOOD, company: 'x'.repeat(101) }],
    ['username too short', { ...GOOD, username: 'ab' }],
    ['username too long', { ...GOOD, username: 'a'.repeat(16) }],
    ['username with symbols', { ...GOOD, username: 'ana-perez!' }],
    ['password too short', { ...GOOD, password: 'Ab1!xyz' }],
    ['password with only 2 character classes', { ...GOOD, password: 'alllowercase123' }],
    ['password too long', { ...GOOD, password: 'Aa1!' + 'x'.repeat(130) }],
    ['non-string fields', { ...GOOD, email: 123, name: { a: 1 } }],
    ['non-string company', { ...GOOD, company: ['x'] }],
    ['missing fields', {}],
  ]
  it.each(bad)('rejects %s with 400 and never calls Auth0', async (_label, body) => {
    const res = await register(body)
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON', async () => {
    const res = await REGISTER(
      buildRequest({ method: 'POST', url: 'http://localhost:3000/api/auth/register-auth0', body: 'nope{', headers: { 'x-forwarded-for': '10.9.9.9' } }) as any,
    )
    expect(res.status).toBe(400)
  })

  it('an Auth0 password-strength rejection is a 400 about the password only', async () => {
    createResponse = { status: 400, body: { name: 'PasswordStrengthError', code: 'invalid_password', message: 'PasswordStrengthError: Password is too weak' } }
    const res = await register(GOOD)
    expect(res.status).toBe(400)
    expect(((await readJson(res as any)) as any).field).toBe('password')
  })

  it('other Auth0 failures give a generic error that does not echo Auth0 text', async () => {
    createResponse = { status: 400, body: { message: 'Payload validation error: ana.perez@example.com' } }
    const res = await register(GOOD)
    expect(res.status).toBe(400)
    expect(JSON.stringify(await readJson(res as any))).not.toContain('ana.perez')
  })
})

describe('registration: duplicate accounts do not enumerate', () => {
  it('existing email answers exactly like a fresh signup and creates nothing', async () => {
    const fresh = await register(GOOD)
    const freshBody = await readJson(fresh as any)
    fetchMock.mockClear()

    existingUsers = [{ user_id: 'auth0|existing' }]
    const dup = await register(GOOD)
    expect(dup.status).toBe(fresh.status)
    expect(await readJson(dup as any)).toEqual(freshBody)
    expect((freshBody as any).message).toBe(GENERIC_REGISTER_MESSAGE)
    expect(calls('/api/v2/users').filter((c) => (c[1] as any)?.method === 'POST' && String(c[0]).endsWith('/api/v2/users'))).toHaveLength(0)
  })

  it('Auth0 user_exists on create (taken username/race) is also the generic success', async () => {
    createResponse = { status: 409, body: { code: 'user_exists', message: 'The user already exists.' } }
    const res = await register(GOOD)
    expect(res.status).toBe(200)
    expect(((await readJson(res as any)) as any).message).toBe(GENERIC_REGISTER_MESSAGE)
  })

  it('no longer returns type/action hints (existing_account, login)', async () => {
    existingUsers = [{ user_id: 'auth0|existing' }]
    const body = JSON.stringify(await readJson((await register(GOOD)) as any))
    expect(body).not.toContain('existing_account')
    expect(body).not.toContain('"action"')
    expect(body).not.toContain('409')
  })
})

describe('registration: rate limiting and anti-bot', () => {
  it('limits per IP (11th attempt in the hour is 429) before touching Auth0', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await register({ ...GOOD, email: `u${i}@example.com`, username: `user${i}` }, '203.0.113.7')).status).toBe(200)
    }
    fetchMock.mockClear()
    const res = await register({ ...GOOD, email: 'u11@example.com', username: 'user11' }, '203.0.113.7')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    // another IP is unaffected
    expect((await register({ ...GOOD, email: 'other@example.com', username: 'other' }, '203.0.113.8')).status).toBe(200)
  })

  it('limits per email across different IPs (4th attempt is 429), case-insensitively', async () => {
    expect((await register(GOOD)).status).toBe(200)
    expect((await register({ ...GOOD, email: GOOD.email.toUpperCase() })).status).toBe(200)
    expect((await register(GOOD)).status).toBe(200)
    expect((await register(GOOD)).status).toBe(429)
  })

  it('F1: rotating X-Forwarded-For (spoofed first hops) does not evade the per-IP limit', async () => {
    const attempt = (i: number) =>
      REGISTER(
        buildRequest({
          method: 'POST',
          url: 'http://localhost:3000/api/auth/register-auth0',
          body: { ...GOOD, email: `rot${i}@example.com`, username: `rot${i}` } as any,
          // the proxy appends the real client (198.51.100.20) as the LAST hop
          headers: { 'x-forwarded-for': `9.9.${i}.1, 198.51.100.20` },
        }) as any,
      )
    for (let i = 0; i < 10; i++) expect((await attempt(i)).status).toBe(200)
    expect((await attempt(99)).status).toBe(429)
  })

  it('F1: aliases of one mailbox (+tag, gmail dots, case, googlemail) share the per-email limit', async () => {
    const variants = ['ana@gmail.com', 'ANA+a@gmail.com', 'a.n.a+b@googlemail.com']
    for (const email of variants) expect((await register({ ...GOOD, email })).status).toBe(200)
    expect((await register({ ...GOOD, email: 'a.na+zzz@gmail.com' })).status).toBe(429)
  })

  it('F1: +tag is stripped on every domain, dots only on gmail', () => {
    expect(normalizeEmail('Bob+x@Example.com')).toBe('bob@example.com')
    expect(normalizeEmail('b.o.b@example.com')).toBe('b.o.b@example.com')
    expect(normalizeEmail('b.o.b+x@googlemail.com')).toBe('bob@gmail.com')
  })

  it('F1: global hourly ceiling is a backstop when IP and email both rotate', async () => {
    const d = await (global as any).__getTestDb()
    const windowStart = Math.floor(Date.now() / (3600 * 1000))
    await d.collection('rate_limits').updateOne(
      { _id: `register-global:all:${windowStart}` },
      { $set: { count: 300, expiresAt: new Date(Date.now() + 7200_000) } },
      { upsert: true },
    )
    fetchMock.mockClear()
    const res = await register({ ...GOOD, email: 'fresh@example.com', username: 'fresh' }, '203.0.113.200')
    expect(res.status).toBe(429)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores no email address in the rate limit collection', async () => {
    await register(GOOD)
    const d = await (global as any).__getTestDb()
    const docs = await d.collection('rate_limits').find({}).toArray()
    expect(docs.length).toBeGreaterThan(0)
    expect(JSON.stringify(docs).toLowerCase()).not.toContain('ana.perez')
  })

  it('honeypot: a filled hidden field looks like success but does nothing', async () => {
    const res = await register({ ...GOOD, website: 'http://spam.example' })
    expect(res.status).toBe(200)
    expect(((await readJson(res as any)) as any).message).toBe(GENERIC_REGISTER_MESSAGE)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('an empty honeypot (the real form) registers normally', async () => {
    expect((await register({ ...GOOD, website: '' })).status).toBe(200)
    expect(calls('/api/v2/users').length).toBeGreaterThan(0)
  })
})

describe('registration: no PII in logs', () => {
  const allLogs = (spies: jest.SpyInstance[]) => JSON.stringify(spies.flatMap((s) => s.mock.calls))
  const spyConsole = () => (['log', 'error', 'warn', 'info'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined))

  it.each([
    ['success', () => undefined],
    ['Auth0 failure', () => { createResponse = { status: 500, body: { message: 'boom ana.perez@example.com', code: 'x' } } }],
    ['duplicate', () => { createResponse = { status: 409, body: { code: 'user_exists' } } }],
  ])('%s logs neither email, username, name nor password', async (_l, setup) => {
    setup()
    const spies = spyConsole()
    await register(GOOD)
    const logged = allLogs(spies).toLowerCase()
    for (const secret of ['ana.perez', 'ana_perez', 'ana pérez', 'str0ng!passw0rd', 'clínica ana']) {
      expect(logged).not.toContain(secret)
    }
  })
})

describe('registration: partner-provisioned email', () => {
  it('a normal signup with a partner account email creates a SEPARATE osign_ account and leaves the partner account alone', async () => {
    const d = await (global as any).__getTestDb()
    await d.collection('partner_accounts').insertOne({
      partnerId: 'vetcontrol', externalId: 'ext_clinic_0001', customerId: 'partner_abc', plan: 'free',
      email: 'ana.perez@example.com', businessName: 'Clínica', status: 'active', linkedVia: 'provisioned', createdAt: new Date(),
    })
    const before = await d.collection('partner_accounts').findOne({ partnerId: 'vetcontrol' })

    const res = await register(GOOD)
    expect(res.status).toBe(200)
    const p = createdPayload()
    expect(p.app_metadata.businessID).toMatch(/^osign_/)
    expect(p.app_metadata.businessID).not.toBe('partner_abc')

    expect(await d.collection('partner_accounts').findOne({ partnerId: 'vetcontrol' })).toEqual(before)
    // the response is identical to any other signup: it never reveals the partner account
    expect(((await readJson(res as any)) as any).message).toBe(GENERIC_REGISTER_MESSAGE)
  })
})

describe('login callbacks (Auth0)', () => {
  let cfg: any
  beforeAll(() => {
    process.env.AUTH0_CLIENT_ID = 'id'
    process.env.AUTH0_CLIENT_SECRET = 'secret'
    process.env.AUTH0_ISSUER = `https://${DOMAIN}/`
    cfg = jest.requireActual('@/lib/auth/config').config
  })
  const firstLogin = (profile: any) =>
    cfg.callbacks.jwt({ token: { sub: 'nextauth-uuid' }, account: { provider: 'auth0', access_token: 't' }, profile, user: { id: profile.sub, email: profile.email } })

  it('session customerId is the registered businessID when Auth0 delivers it', async () => {
    const t = await firstLogin({ sub: 'auth0|abc123', email: 'a@b.c', app_metadata: { businessID: 'osign_0123456789abcdef01234567', platforms_allowed: ['osign'] } })
    expect(t.customerId).toBe('osign_0123456789abcdef01234567')
    expect(t.id).toBe('auth0|abc123')
    const session = await cfg.callbacks.session({ session: { user: {} }, token: t })
    expect(session.customerId).toBe('osign_0123456789abcdef01234567')
  })

  it('legacy account (businessID null) keeps the sub-derived customerId, unchanged', async () => {
    const t = await firstLogin({ sub: 'auth0|68b614f56d55fe52931dbda9', email: 'a@b.c', app_metadata: { businessID: null } })
    expect(t.customerId).toBe('68b614f56d55fe52931dbda9')
  })

  it('signIn: allows osign and legacy (no metadata) accounts, refuses accounts without osign in platforms_allowed', async () => {
    const run = (app_metadata: any) => cfg.callbacks.signIn({ account: { provider: 'auth0' }, profile: { sub: 'auth0|x', app_metadata } })
    expect(await run({ platforms_allowed: ['osign'] })).toBe(true)
    expect(await run({ platforms_allowed: ['vetcontrol', 'osign'] })).toBe(true)
    expect(await run(undefined)).toBe(true)
    expect(await run({ businessID: 'x' })).toBe(true)
    expect(await run({ platforms_allowed: ['vetcontrol'] })).toBe(false)
    expect(await run({ platforms_allowed: [] })).toBe(false)
  })
})

describe('F3: email verification is enforced for new registrations only', () => {
  let cfg: any
  beforeAll(() => {
    process.env.AUTH0_CLIENT_ID = 'id'
    process.env.AUTH0_CLIENT_SECRET = 'secret'
    process.env.AUTH0_ISSUER = `https://${DOMAIN}/`
    cfg = jest.requireActual('@/lib/auth/config').config
  })
  const run = (profile: any) => cfg.callbacks.signIn({ account: { provider: 'auth0' }, profile: { sub: 'auth0|x', ...profile } })
  const fresh = { businessID: 'osign_0123456789abcdef01234567', requireVerifiedEmail: true, platforms_allowed: ['osign'] }

  it('blocks an unverified new registration and sends it to the verify-your-email page', async () => {
    expect(await run({ email_verified: false, app_metadata: fresh })).toBe('/auth/error?error=EmailNotVerified')
    expect(await run({ app_metadata: fresh })).toBe('/auth/error?error=EmailNotVerified')
  })
  it('lets the same account in once Auth0 reports email_verified', async () => {
    expect(await run({ email_verified: true, app_metadata: fresh })).toBe(true)
  })
  it('does not affect existing users (no flag), osign_ without flag, or non-osign ids with the flag', async () => {
    expect(await run({ email_verified: false, app_metadata: { businessID: 'osign_0123456789abcdef01234567' } })).toBe(true)
    expect(await run({ email_verified: false, app_metadata: { businessID: '68b614f56d55fe52931dbda9' } })).toBe(true)
    expect(await run({ email_verified: false, app_metadata: { businessID: 'legacy', requireVerifiedEmail: true } })).toBe(true)
    expect(await run({ email_verified: false })).toBe(true)
  })
  it('the platform check still wins', async () => {
    expect(await run({ email_verified: true, app_metadata: { ...fresh, platforms_allowed: ['vetcontrol'] } })).toBe(false)
  })
})

describe('a freshly registered user lands on an empty tenant', () => {
  const BUSINESS = 'osign_aaaaaaaaaaaaaaaaaaaaaaaa'
  beforeEach(() => mockAuthAs({ userId: 'auth0|fresh', customerId: BUSINESS }))

  it('has no contracts', async () => {
    const res = await CONTRACTS_GET(buildRequest({ method: 'GET', url: 'http://localhost:3000/api/contracts' }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    const list = Array.isArray(body) ? body : body.contracts
    expect(list).toEqual([])
  })

  it('gets the default account variables and they are stored under its own businessID', async () => {
    const res = await VARIABLES_GET(buildRequest({ method: 'GET', url: 'http://localhost:3000/api/variables' }) as any)
    expect(res.status).toBe(200)
    const body = JSON.stringify(await readJson(res as any))
    expect(body).toContain('miNombre')
    expect(body).toContain('miIdentificacionFiscal')
    const d = await (global as any).__getTestDb()
    expect(await d.collection('variables').findOne({ customerId: BUSINESS })).toBeTruthy()
  })
})
