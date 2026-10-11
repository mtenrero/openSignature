/**
 * Partner provisioning + SSO (VetControl): accounts, link, rotate, revoke,
 * one-time SSO tokens, session cookie, plan fallback.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { decode } from 'next-auth/jwt'
import { POST as accountsPOST } from '@/app/api/partner/accounts/route'
import { POST as linkPOST } from '@/app/api/partner/accounts/link/route'
import { POST as rotatePOST } from '@/app/api/partner/accounts/[externalId]/rotate-key/route'
import { DELETE as accountDELETE } from '@/app/api/partner/accounts/[externalId]/route'
import { POST as ssoPOST } from '@/app/api/partner/sso/route'
import { GET as ssoGET } from '@/app/auth/partner-sso/route'
import { GET as contractsGET } from '@/app/api/contracts/route'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { insertContract } from '../helpers/fixtures'

// next-auth/jwt is ESM-only (not transformable here): a reversible stand-in that
// still records salt/secret so the cookie contract is asserted. The real
// encrypt/decrypt round trip is covered by e2e/partner-sso.spec.ts.
jest.mock('next-auth/jwt', () => ({
  encode: async ({ token, salt, secret }: any) =>
    Buffer.from(JSON.stringify({ token, salt, secret })).toString('base64url'),
  decode: async ({ token, salt, secret }: any) => {
    const p = JSON.parse(Buffer.from(token, 'base64url').toString())
    return p.salt === salt && p.secret === secret ? p.token : null
  },
}))

jest.mock('next-auth', () => ({
  __esModule: true,
  default: () => ({ handlers: {}, auth: jest.fn(), signIn: jest.fn(), signOut: jest.fn() }),
}))
jest.mock('next-auth/providers/auth0', () => ({ __esModule: true, default: () => ({ id: 'auth0' }) }))
jest.mock('@/lib/usage/usageAudit', () => ({
  UsageAuditService: {
    getUsageSummary: async () => ({ contractsCreated: 0, emailsSent: 0, smssSent: 0, localSignaturesSent: 0 }),
    recordContractCreation: async () => undefined,
    record: async () => undefined,
  },
}))
jest.mock('@/lib/subscription/usage', () => jest.requireActual('@/lib/subscription/usage'))

const SECRET = 'test-partner-secret-vetcontrol'
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
const EXT = 'a'.repeat(32)
const EXT2 = 'b'.repeat(32)
const partnersEnv = (plan = 'pyme') =>
  JSON.stringify([
    { id: 'vetcontrol', secretSha256: sha(SECRET), defaultPlan: plan, ssoAllowedReturn: ['/contracts', '/dashboard', '/settings'] },
  ])

const H = { authorization: `Partner ${SECRET}` }
const req = (method: any, url: string, body?: unknown, headers: Record<string, string> = H) =>
  buildRequest({ method, url: `http://localhost:3000${url}`, body, headers }) as NextRequest
const json = async (res: Response) => (await readJson(res)) as any
const ctx = (externalId: string) => ({ params: Promise.resolve({ externalId }) })
const create = (externalId = EXT) =>
  accountsPOST(req('POST', '/api/partner/accounts', { externalId, email: 'clinic@example.com', businessName: 'Clinica Test' }))
const sso = (body: any, headers = H) => ssoPOST(req('POST', '/api/partner/sso', body, headers))
const tokenOf = (url: string) => new URL(url).searchParams.get('token')!
const redeem = (token: string) =>
  ssoGET(buildRequest({ url: 'http://localhost:3000/auth/partner-sso', searchParams: { token } }) as NextRequest)

const realAuthContext = () => {
  const unified = require('@/lib/auth/unified')
  const actual = jest.requireActual('@/lib/auth/unified')
  ;(unified.getAuthContext as jest.Mock).mockImplementation(actual.getAuthContext)
}

beforeEach(() => {
  process.env.OSIGN_PARTNERS = partnersEnv()
})
afterAll(() => {
  delete process.env.OSIGN_PARTNERS
})

describe('partner authentication', () => {
  it('rejects a wrong partner secret with 401 PARTNER_UNAUTHORIZED', async () => {
    const res = await accountsPOST(req('POST', '/api/partner/accounts', {}, { authorization: 'Partner nope' }))
    expect(res.status).toBe(401)
    expect((await json(res)).errorCode).toBe('PARTNER_UNAUTHORIZED')
  })

  it('rejects a missing Authorization header and a Bearer scheme', async () => {
    expect((await accountsPOST(req('POST', '/api/partner/accounts', {}, {}))).status).toBe(401)
    expect((await accountsPOST(req('POST', '/api/partner/accounts', {}, { authorization: `Bearer ${SECRET}` }))).status).toBe(401)
  })

  it('fails closed when OSIGN_PARTNERS is empty, missing or invalid', async () => {
    for (const v of ['', '[]', 'not json', '{"id":"x"}', '[{"id":"vetcontrol","secretSha256":"short"}]']) {
      process.env.OSIGN_PARTNERS = v
      expect((await create()).status).toBe(401)
    }
    delete process.env.OSIGN_PARTNERS
    expect((await create()).status).toBe(401)
  })

  it('compares the secret digest with crypto.timingSafeEqual', async () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual')
    await create()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('POST /api/partner/accounts', () => {
  it('creates an account with a partner-bound osk_ key (201) and is idempotent (200, no key)', async () => {
    const res = await create()
    expect(res.status).toBe(201)
    const body = await json(res)
    expect(body).toMatchObject({ customerId: `partner_vetcontrol_${EXT}`, created: true })
    expect(body.apiKey).toMatch(/^osk_/)

    const db = await (global as any).__getTestDb()
    const key = await db.collection('esign_apikeys').findOne({ _id: body.apiKey })
    expect(key).toMatchObject({ customerId: body.customerId, partnerId: 'vetcontrol', active: true, scopes: ['contracts', 'signature-requests', 'variables'] })
    const account = await db.collection('partner_accounts').findOne({ externalId: EXT })
    expect(account).toMatchObject({ partnerId: 'vetcontrol', plan: 'pyme', linkedVia: 'provisioned', status: 'active', email: 'clinic@example.com' })

    const again = await create()
    expect(again.status).toBe(200)
    const b2 = await json(again)
    expect(b2).toEqual({ customerId: body.customerId, created: false })
    expect(await db.collection('esign_apikeys').countDocuments({ partnerId: 'vetcontrol' })).toBe(1)
  })

  it('creates the unique (partnerId, externalId) and TTL indexes', async () => {
    await create()
    const db = await (global as any).__getTestDb()
    const acc = await db.collection('partner_accounts').indexes()
    expect(acc.some((i: any) => i.unique && i.key.partnerId === 1 && i.key.externalId === 1)).toBe(true)
    const tok = await db.collection('partner_sso_tokens').indexes()
    expect(tok.some((i: any) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true)
  })

  it('validates body fields', async () => {
    const bad = await accountsPOST(req('POST', '/api/partner/accounts', { externalId: 'x', email: 'a@b.co', businessName: 'N' }))
    expect(bad.status).toBe(400)
    const bad2 = await accountsPOST(req('POST', '/api/partner/accounts', { externalId: EXT, email: 'nope', businessName: 'N' }))
    expect(bad2.status).toBe(400)
  })
})

describe('POST /api/partner/accounts/link', () => {
  const seedKey = async (key: string, customerId: string) => {
    const db = await (global as any).__getTestDb()
    await db.collection('esign_apikeys').insertOne({ _id: key, active: true, customerId, userId: 'auth0|u1' })
  }

  it('links a valid existing API key (linkedVia linked)', async () => {
    await seedKey('osk_existing_customer_key_1', 'cust-real-1')
    const res = await linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_existing_customer_key_1' }))
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ customerId: 'cust-real-1', linked: true })
    const db = await (global as any).__getTestDb()
    expect(await db.collection('partner_accounts').findOne({ externalId: EXT })).toMatchObject({ customerId: 'cust-real-1', linkedVia: 'linked', status: 'active' })
    // idempotent
    expect((await linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_existing_customer_key_1' }))).status).toBe(200)
  })

  it('rejects an unknown or revoked API key with 400 INVALID_API_KEY', async () => {
    const res = await linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_does_not_exist' }))
    expect(res.status).toBe(400)
    expect((await json(res)).errorCode).toBe('INVALID_API_KEY')
    const db = await (global as any).__getTestDb()
    await db.collection('esign_apikeys').insertOne({ _id: 'osk_revoked_key_x', active: false, customerId: 'c', userId: 'u' })
    expect((await linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_revoked_key_x' }))).status).toBe(400)
  })

  it('returns 409 ALREADY_LINKED_OTHER when externalId maps to another customer', async () => {
    await seedKey('osk_key_one_aaaaaa', 'cust-1')
    await seedKey('osk_key_two_bbbbbb', 'cust-2')
    await linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_key_one_aaaaaa' }))
    const res = await linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_key_two_bbbbbb' }))
    expect(res.status).toBe(409)
    expect((await json(res)).errorCode).toBe('ALREADY_LINKED_OTHER')
  })
})

describe('rotate-key and revoke', () => {
  it('rotate revokes the old partner key (401 afterwards) and the new key works', async () => {
    realAuthContext()
    const { apiKey: oldKey, customerId } = await json(await create())
    await insertContract({ customerId })
    const list = (key: string) => contractsGET(req('GET', '/api/contracts', undefined, { authorization: `Bearer ${key}` }))
    expect((await list(oldKey)).status).toBe(200)

    const res = await rotatePOST(req('POST', `/api/partner/accounts/${EXT}/rotate-key`), ctx(EXT))
    expect(res.status).toBe(200)
    const { apiKey: newKey } = await json(res)
    expect(newKey).toMatch(/^osk_/)
    expect(newKey).not.toBe(oldKey)
    expect((await list(oldKey)).status).toBe(401)
    expect((await list(newKey)).status).toBe(200)
  })

  it('rotate on an unknown account is 404 ACCOUNT_NOT_FOUND', async () => {
    const res = await rotatePOST(req('POST', `/api/partner/accounts/${EXT}/rotate-key`), ctx(EXT))
    expect(res.status).toBe(404)
  })

  it('revoke marks the account revoked and the old key stops working (401)', async () => {
    realAuthContext()
    const { apiKey } = await json(await create())
    const res = await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect(res.status).toBe(200)
    const db = await (global as any).__getTestDb()
    expect((await db.collection('partner_accounts').findOne({ externalId: EXT })).status).toBe('revoked')
    const after = await contractsGET(req('GET', '/api/contracts', undefined, { authorization: `Bearer ${apiKey}` }))
    expect(after.status).toBe(401)
  })

  it('requires partner auth for rotate and revoke', async () => {
    expect((await rotatePOST(req('POST', `/api/partner/accounts/${EXT}/rotate-key`, undefined, {}), ctx(EXT))).status).toBe(401)
    expect((await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`, undefined, {}), ctx(EXT))).status).toBe(401)
  })
})

describe('SSO', () => {
  const body = (over: any = {}) => ({ externalId: EXT, email: 'vet@example.com', name: 'Vet', returnTo: '/contracts', ...over })

  it('valid token -> 302 to returnTo with a session cookie carrying the partner customerId; the session works on a protected API', async () => {
    const { customerId } = await json(await create())
    await insertContract({ customerId, name: 'Mine' })
    await insertContract({ customerId: 'someone-else', name: 'Other' })

    const minted = await sso(body())
    expect(minted.status).toBe(200)
    const { url } = await json(minted)
    expect(url).toMatch(/\/auth\/partner-sso\?token=[0-9a-f]{64}$/)

    const res = await redeem(tokenOf(url))
    expect(res.status).toBe(302)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/contracts')
    const cookie = res.cookies.get('authjs.session-token')
    expect(cookie?.value).toBeTruthy()
    expect(cookie?.httpOnly).toBe(true)

    const decoded: any = await decode({ token: cookie!.value, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token' })
    expect(decoded).toMatchObject({ customerId, email: 'vet@example.com' })

    // Run the REAL NextAuth callbacks over the decoded cookie, then the real getAuthContext
    process.env.AUTH0_CLIENT_ID = 'x'; process.env.AUTH0_CLIENT_SECRET = 'x'; process.env.AUTH0_ISSUER = 'https://e2e.example.auth0.com'
    const realConfig = jest.requireActual('@/lib/auth/config')
    const token = await realConfig.config.callbacks.jwt({ token: decoded })
    expect(token.customerId).toBe(customerId) // not overwritten from sub
    const session = await realConfig.config.callbacks.session({ session: { user: {} }, token })
    const { auth } = require('@/lib/auth/config')
    ;(auth as jest.Mock).mockResolvedValue(session)
    realAuthContext()

    const list = await contractsGET(req('GET', '/api/contracts', undefined, {}))
    expect(list.status).toBe(200)
    const names = JSON.stringify(await json(list))
    expect(names).toContain('Mine')
    expect(names).not.toContain('Other')
  })

  it('a linked account keeps its customerId in the session even though sub is the Auth0 user id', async () => {
    const db = await (global as any).__getTestDb()
    await db.collection('esign_apikeys').insertOne({ _id: 'osk_linked_real_key_1', active: true, customerId: 'cust-real-1', userId: 'auth0|u1' })
    await linkPOST(req('POST', '/api/partner/accounts/link', { externalId: EXT, apiKey: 'osk_linked_real_key_1' }))
    const { url } = await json(await sso(body()))
    const res = await redeem(tokenOf(url))
    const decoded: any = await decode({ token: res.cookies.get('authjs.session-token')!.value, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token' })
    expect(decoded).toMatchObject({ sub: 'auth0|u1', customerId: 'cust-real-1' })
    process.env.AUTH0_CLIENT_ID = 'x'; process.env.AUTH0_CLIENT_SECRET = 'x'; process.env.AUTH0_ISSUER = 'https://e2e.example.auth0.com'
    const realConfig = jest.requireActual('@/lib/auth/config')
    const token = await realConfig.config.callbacks.jwt({ token: decoded })
    expect(token.customerId).toBe('cust-real-1')
  })

  it('a partner session stops working once the account is revoked', async () => {
    const { customerId } = await json(await create())
    process.env.AUTH0_CLIENT_ID = 'x'; process.env.AUTH0_CLIENT_SECRET = 'x'; process.env.AUTH0_ISSUER = 'https://e2e.example.auth0.com'
    const { auth } = require('@/lib/auth/config')
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: customerId }, customerId, partnerId: 'vetcontrol' })
    realAuthContext()
    expect((await contractsGET(req('GET', '/api/contracts', undefined, {}))).status).toBe(200)
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect((await contractsGET(req('GET', '/api/contracts', undefined, {}))).status).toBe(401)
  })

  it('a reused token redirects to /auth/signin?error=sso_expired', async () => {
    await create()
    const { url } = await json(await sso(body()))
    const token = tokenOf(url)
    expect((await redeem(token)).status).toBe(302)
    const again = await redeem(token)
    expect(again.status).toBe(302)
    const loc = new URL(again.headers.get('location')!)
    expect(loc.pathname).toBe('/auth/signin')
    expect(loc.searchParams.get('error')).toBe('sso_expired')
    expect(again.cookies.get('authjs.session-token')).toBeUndefined()
  })

  it('an expired token is rejected (sso_expired)', async () => {
    await create()
    const { url } = await json(await sso(body()))
    const db = await (global as any).__getTestDb()
    await db.collection('partner_sso_tokens').updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await redeem(tokenOf(url))
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('sso_expired')
  })

  it('stores the token hashed with a 60s expiry and used:false', async () => {
    await create()
    const { url } = await json(await sso(body()))
    const db = await (global as any).__getTestDb()
    const doc = await db.collection('partner_sso_tokens').findOne({})
    expect(doc.tokenHash).toBe(sha(tokenOf(url)))
    expect(JSON.stringify(doc)).not.toContain(tokenOf(url))
    expect(doc.used).toBe(false)
    const ttl = doc.expiresAt.getTime() - Date.now()
    expect(ttl).toBeGreaterThan(50_000)
    expect(ttl).toBeLessThanOrEqual(60_000)
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', '/api/settings', '/contracts/../api/settings', 'contracts', '/%5Cevil.com', '/contractsevil'])(
    'foreign or disallowed returnTo %s is rejected with 400 INVALID_RETURN_TO',
    async (returnTo) => {
      await create()
      const res = await sso(body({ returnTo }))
      expect(res.status).toBe(400)
      expect((await json(res)).errorCode).toBe('INVALID_RETURN_TO')
    }
  )

  it('allows sub-paths and query strings under an allowed prefix', async () => {
    await create()
    const res = await sso(body({ returnTo: '/contracts/abc?tab=1' }))
    expect(res.status).toBe(200)
  })

  it('a revoked account gets 404 ACCOUNT_NOT_FOUND; an unknown account too', async () => {
    await create()
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    const res = await sso(body())
    expect(res.status).toBe(404)
    expect((await json(res)).errorCode).toBe('ACCOUNT_NOT_FOUND')
    expect((await sso(body({ externalId: EXT2 }))).status).toBe(404)
  })

  it('a token minted before the account was revoked cannot be redeemed', async () => {
    await create()
    const { url } = await json(await sso(body()))
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    const res = await redeem(tokenOf(url))
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('sso_expired')
  })

  it('wrong partner secret on /api/partner/sso is 401', async () => {
    await create()
    expect((await sso(body(), { authorization: 'Partner wrong' })).status).toBe(401)
  })

  it('garbage tokens redirect to sso_expired', async () => {
    for (const t of ['', 'zzz', 'a'.repeat(64)]) {
      const res = await redeem(t)
      expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('sso_expired')
    }
  })
})

describe('plan fallback for partner customers', () => {
  const infoFor = async (plan: string) => {
    process.env.OSIGN_PARTNERS = partnersEnv(plan)
    const { customerId } = await json(await create())
    const { Auth0UserManager } = jest.requireActual('@/lib/auth/userManagement')
    return { customerId, info: await new Auth0UserManager().getUserSubscriptionInfo(customerId) }
  }

  it('returns the PYME plan and limits (not null) for a pyme partner account', async () => {
    const { info } = await infoFor('pyme')
    expect(info.plan.id).toBe('pyme')
    expect(info.limits.contracts).toBe(15)
    expect(info.limits.apiAccess).toBe(true)
  })

  it('returns the FREE plan limits for a free partner account', async () => {
    const { info } = await infoFor('free')
    expect(info.plan.id).toBe('free')
    expect(info.limits.contracts).toBe(5)
  })

  it('returns null for a revoked or unknown partner customer', async () => {
    const { Auth0UserManager } = jest.requireActual('@/lib/auth/userManagement')
    expect(await new Auth0UserManager().getUserSubscriptionInfo('partner_vetcontrol_unknown')).toBeNull()
  })

  it('enforces the FREE contract limit on POST /api/contracts for a free partner customer', async () => {
    const { customerId } = await infoFor('free')
    const um = require('@/lib/auth/userManagement')
    const { Auth0UserManager } = jest.requireActual('@/lib/auth/userManagement')
    const real = new Auth0UserManager()
    um.auth0UserManager.getUserSubscriptionInfo.mockImplementation((id: string) => real.getUserSubscriptionInfo(id))
    for (let i = 0; i < 5; i++) await insertContract({ customerId, name: `c${i}` })
    const { mockAuthAs } = require('../helpers/mockAuth')
    mockAuthAs({ userId: customerId, customerId })
    const { POST: contractsPOST } = require('@/app/api/contracts/route')
    const res = await contractsPOST(req('POST', '/api/contracts', { name: 'sixth', content: '<p>x</p>' }, {}))
    expect(res.status).not.toBe(201)
    expect(JSON.stringify(await json(res))).toMatch(/LIMIT_EXCEEDED|l[ií]mite/i)
  })
})
