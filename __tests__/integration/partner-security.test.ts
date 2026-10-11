/**
 * Partner security: a disconnected partner account must cut ALL access (sessions,
 * key minting, keys), partner sessions are short-lived and cannot manage API keys,
 * link/rotate/revoke are scoped per externalId, and nothing sensitive is logged.
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
import { GET as keysGET, POST as keysPOST, DELETE as keysDELETE } from '@/app/api/settings/api-keys/route'
import { POST as createKeyPOST } from '@/app/api/settings/create-api-key/route'
import { GET as auth0KeysGET, POST as auth0KeysPOST } from '@/app/api/auth0/api-keys/route'
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
  process.env.AUTH0_CLIENT_ID = 'x'; process.env.AUTH0_CLIENT_SECRET = 'x'; process.env.AUTH0_ISSUER = 'https://e2e.example.auth0.com'
})
afterAll(() => {
  delete process.env.OSIGN_PARTNERS
})

const sessionCfg = () => jest.requireActual('@/lib/auth/config').config.callbacks
const getDb = () => (global as any).__getTestDb()
const ssoBody = (over: any = {}) => ({ externalId: EXT, email: 'vet@example.com', name: 'Vet', returnTo: '/contracts', ...over })

async function ssoSession(externalId = EXT) {
  const { url } = await json(await sso(ssoBody({ externalId })))
  const res = await redeem(tokenOf(url))
  const decoded: any = await decode({ token: res.cookies.get('authjs.session-token')!.value, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token' })
  return { res, decoded }
}

describe('O3: partner SSO sessions', () => {
  it('are minted with an 8h cookie maxAge and a mint timestamp (not 30 days)', async () => {
    await create()
    const { res, decoded } = await ssoSession()
    expect(res.cookies.get('authjs.session-token')!.maxAge).toBe(8 * 60 * 60)
    expect(typeof decoded.partnerSsoAt).toBe('number')
  })

  it('jwt callback invalidates the session once the account is revoked (every auth() reader)', async () => {
    await create()
    const { decoded } = await ssoSession()
    expect(await sessionCfg().jwt({ token: { ...decoded } })).toMatchObject({ partnerSso: 'vetcontrol' })
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect(await sessionCfg().jwt({ token: { ...decoded } })).toBeNull()
  })

  it('jwt callback invalidates a partner session older than 8h or without a mint time, even if the account is active', async () => {
    await create()
    const { decoded } = await ssoSession()
    expect(await sessionCfg().jwt({ token: { ...decoded, partnerSsoAt: Date.now() - 8 * 3600 * 1000 - 1000 } })).toBeNull()
    expect(await sessionCfg().jwt({ token: { ...decoded, partnerSsoAt: undefined } })).toBeNull()
  })

  describe('cannot manage API keys (403 SESSION_NOT_ALLOWED)', () => {
    let customerId: string
    beforeEach(async () => {
      customerId = (await json(await create())).customerId
      const { auth } = require('@/lib/auth/config')
      ;(auth as jest.Mock).mockResolvedValue({ user: { id: customerId, email: 'vet@example.com' }, customerId, partnerId: 'vetcontrol' })
      realAuthContext()
    })
    const keyCount = async () => (await getDb()).collection('esign_apikeys').countDocuments({})

    it('POST /api/settings/api-keys and /create-api-key mint nothing', async () => {
      const before = await keyCount()
      const a = await keysPOST(req('POST', '/api/settings/api-keys', { name: 'sneaky' }, {}))
      const b = await createKeyPOST(req('POST', '/api/settings/create-api-key', { name: 'sneaky' }, {}))
      for (const r of [a, b]) {
        expect(r.status).toBe(403)
        expect((await json(r)).errorCode).toBe('SESSION_NOT_ALLOWED')
      }
      expect(await keyCount()).toBe(before)
    })

    it('GET and DELETE /api/settings/api-keys are refused too', async () => {
      expect((await keysGET(req('GET', '/api/settings/api-keys', undefined, {}))).status).toBe(403)
      expect((await keysDELETE(req('DELETE', '/api/settings/api-keys?id=x', undefined, {}))).status).toBe(403)
    })

    it('/api/auth0/api-keys (M2M client management) is refused', async () => {
      expect((await auth0KeysGET(req('GET', '/api/auth0/api-keys', undefined, {}))).status).toBe(403)
      expect((await auth0KeysPOST(req('POST', '/api/auth0/api-keys', { name: 'x' }, {}))).status).toBe(403)
    })

    it('an ordinary (non-partner) session still can create a key', async () => {
      const { auth } = require('@/lib/auth/config')
      ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'auth0|real', email: 'r@e.al' }, customerId: 'cust-real' })
      expect((await keysPOST(req('POST', '/api/settings/api-keys', { name: 'mine' }, {}))).status).toBe(201)
    })
  })

  it('DELETE of a provisioned account revokes ALL active keys of its customer, including keys minted outside the partner API', async () => {
    const { customerId, apiKey } = await json(await create())
    const db = await getDb()
    await db.collection('esign_apikeys').insertOne({ _id: 'osk_minted_by_sso_session', userId: customerId, customerId, name: 'sneaky', active: true })
    const res = await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect((await json(res)).keysRevoked).toBe(2)
    expect(await db.collection('esign_apikeys').countDocuments({ customerId, active: true })).toBe(0)
    expect((await db.collection('esign_apikeys').findOne({ _id: apiKey })).active).toBe(false)
  })
})

describe('O4: link and per-externalId key scoping', () => {
  const seed = async (doc: any) => (await getDb()).collection('esign_apikeys').insertOne({ active: true, userId: 'auth0|u1', ...doc })
  const link = (externalId: string, apiKey: string) => linkPOST(req('POST', '/api/partner/accounts/link', { externalId, apiKey }))

  it('rejects a partner-issued key (partnerId set) with 400 INVALID_API_KEY', async () => {
    const { apiKey } = await json(await create(EXT2))
    const res = await link(EXT, apiKey)
    expect(res.status).toBe(400)
    expect((await json(res)).errorCode).toBe('INVALID_API_KEY')
    expect(await (await getDb()).collection('partner_accounts').countDocuments({ externalId: EXT })).toBe(0)
  })

  it('rejects an own-looking key of a partner-provisioned customer, active or revoked', async () => {
    const { customerId } = await json(await create(EXT2))
    await seed({ _id: 'osk_session_minted_key', customerId })
    expect((await link(EXT, 'osk_session_minted_key')).status).toBe(400)
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT2}`), ctx(EXT2))
    await (await getDb()).collection('esign_apikeys').updateOne({ _id: 'osk_session_minted_key' }, { $set: { active: true } })
    expect((await link(EXT, 'osk_session_minted_key')).status).toBe(400)
  })

  it('returns 409 CUSTOMER_ALREADY_LINKED when a second externalId targets the same customer', async () => {
    await seed({ _id: 'osk_real_customer_key', customerId: 'cust-real-1' })
    expect((await link(EXT, 'osk_real_customer_key')).status).toBe(200)
    const res = await link(EXT2, 'osk_real_customer_key')
    expect(res.status).toBe(409)
    expect((await json(res)).errorCode).toBe('CUSTOMER_ALREADY_LINKED')
    expect(await (await getDb()).collection('partner_accounts').countDocuments({ customerId: 'cust-real-1', status: 'active' })).toBe(1)
  })

  it('a customer can be relinked after its earlier link was revoked', async () => {
    await seed({ _id: 'osk_real_customer_key', customerId: 'cust-real-1' })
    await link(EXT, 'osk_real_customer_key')
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect((await link(EXT2, 'osk_real_customer_key')).status).toBe(200)
  })

  it('partner-issued keys carry the externalId', async () => {
    const { apiKey } = await json(await create())
    expect((await (await getDb()).collection('esign_apikeys').findOne({ _id: apiKey })).externalId).toBe(EXT)
  })

  it('DELETE of a LINKED account never revokes the customer\'s own keys', async () => {
    await seed({ _id: 'osk_own_key_1', customerId: 'cust-real-1' })
    await seed({ _id: 'osk_own_key_2', customerId: 'cust-real-1', name: 'other own key' })
    await link(EXT, 'osk_own_key_1')
    const { apiKey: partnerKey } = await json(await rotatePOST(req('POST', `/api/partner/accounts/${EXT}/rotate-key`), ctx(EXT)))
    const res = await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`), ctx(EXT))
    expect((await json(res)).keysRevoked).toBe(1)
    const db = await getDb()
    expect((await db.collection('esign_apikeys').findOne({ _id: partnerKey })).active).toBe(false)
    expect((await db.collection('esign_apikeys').findOne({ _id: 'osk_own_key_1' })).active).toBe(true)
    expect((await db.collection('esign_apikeys').findOne({ _id: 'osk_own_key_2' })).active).toBe(true)
  })

  it('rotate/revoke only touch the keys of that externalId', async () => {
    await seed({ _id: 'osk_own_key_1', customerId: 'cust-real-1' })
    await link(EXT, 'osk_own_key_1')
    const db = await getDb()
    // a key the same partner issued for a different externalId on the same customer
    await seed({ _id: 'osk_partner_other_ext', customerId: 'cust-real-1', partnerId: 'vetcontrol', externalId: EXT2 })
    const { apiKey: first } = await json(await rotatePOST(req('POST', `/api/partner/accounts/${EXT}/rotate-key`), ctx(EXT)))
    const { apiKey: second } = await json(await rotatePOST(req('POST', `/api/partner/accounts/${EXT}/rotate-key`), ctx(EXT)))
    expect((await db.collection('esign_apikeys').findOne({ _id: first })).active).toBe(false)
    expect((await db.collection('esign_apikeys').findOne({ _id: second })).active).toBe(true)
    expect((await db.collection('esign_apikeys').findOne({ _id: 'osk_partner_other_ext' })).active).toBe(true)
    expect((await db.collection('esign_apikeys').findOne({ _id: 'osk_own_key_1' })).active).toBe(true)
  })
})

describe('O5: partner/SSO routes log nothing sensitive', () => {
  it('create, link, rotate, sso mint and redeem write no token, SSO URL, email or key to the console', async () => {
    const lines: string[] = []
    const fmt = (a: any[]) => a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation((...a: any[]) => { lines.push(fmt(a)) }))
    let token = ''
    let url = ''
    let apiKey = ''
    try {
      apiKey = (await json(await create())).apiKey
      await rotatePOST(req('POST', `/api/partner/accounts/${EXT}/rotate-key`), ctx(EXT))
      url = (await json(await sso(ssoBody()))).url
      token = tokenOf(url)
      await redeem(token)
      await redeem(token) // replay
    } finally {
      spies.forEach((s) => s.mockRestore())
    }
    const all = lines.join('\n')
    for (const secret of [token, url, apiKey, 'vet@example.com', 'clinic@example.com', SECRET]) {
      expect(secret).toBeTruthy()
      expect(all).not.toContain(secret)
    }
  })
})
