/**
 * Security round 2 (adversarial review findings N1-N5):
 *  N1 oauth/clients: interactive non-partner session only + ownership of client_id
 *  N2 /api/session: active keys only, minimal fields
 *  N4 local-auth bypasses are impossible in production
 */
import { NextRequest } from 'next/server'
import { POST as clientsPOST, GET as clientsGET } from '@/app/api/oauth/clients/route'
import { GET as sessionGET } from '@/app/api/session/route'
import { GET as devLoginGET } from '@/app/api/dev-login/route'
import { buildRequest, readJson } from '../helpers/nextRequest'

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

const U = 'http://localhost:3000'
const EXT = 'a'.repeat(32)
const json = async (res: Response) => (await readJson(res)) as any
const getDb = () => (global as any).__getTestDb()
const nextAuth = () => require('@/lib/auth/config').auth as jest.Mock
const req = (method: any, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  buildRequest({ method, url: `${U}${url}`, body, headers }) as NextRequest

const useRealAuthContext = () => {
  const unified = require('@/lib/auth/unified')
  ;(unified.getAuthContext as jest.Mock).mockImplementation(jest.requireActual('@/lib/auth/unified').getAuthContext)
}
const interactive = (customerId: string, userId = `user-${customerId}`) =>
  nextAuth().mockResolvedValue({ user: { id: userId, email: `${userId}@example.com` }, customerId })
const seedKey = async (doc: any) => (await getDb()).collection('esign_apikeys').insertOne({ active: true, userId: 'u', ...doc })

const envBackup = { ...process.env }
beforeEach(() => {
  nextAuth().mockResolvedValue(null)
  useRealAuthContext()
})
afterEach(() => {
  process.env = { ...envBackup }
})

describe('N1: /api/oauth/clients', () => {
  const post = (body: any, headers: Record<string, string> = {}) => clientsPOST(req('POST', '/api/oauth/clients', body, headers))

  it('N1 refuses ANY api key (incl. partner-issued): no mapping is written', async () => {
    await seedKey({ _id: 'osk_normal', customerId: 'cust-a' })
    await seedKey({ _id: 'osk_partner', customerId: 'cust-p', partnerId: 'vetcontrol', externalId: EXT })
    for (const k of ['osk_normal', 'osk_partner']) {
      const res = await post({ client_id: 'victim-client' }, { authorization: `Bearer ${k}` })
      expect(res.status).toBe(403)
    }
    expect(await (await getDb()).collection('oauth_clients').countDocuments({})).toBe(0)
  })

  it('N1 cannot re-point another customer\'s client_id mapping (409), the owner can update it', async () => {
    interactive('cust-a')
    expect((await post({ client_id: 'm2m-client-1', name: 'A client' })).status).toBe(201)

    interactive('cust-b')
    const res = await post({ client_id: 'm2m-client-1', name: 'hijack' })
    expect(res.status).toBe(409)
    const db = await getDb()
    const doc = await db.collection('oauth_clients').findOne({ clientId: 'm2m-client-1' })
    expect(doc).toMatchObject({ customerId: 'cust-a', userId: 'user-cust-a', name: 'A client' })

    interactive('cust-a')
    expect((await post({ client_id: 'm2m-client-1', name: 'renamed' })).status).toBe(200)
    expect((await db.collection('oauth_clients').findOne({ clientId: 'm2m-client-1' })).name).toBe('renamed')
  })

  it('N1 GET lists only the caller\'s own clients', async () => {
    interactive('cust-a'); await post({ client_id: 'client-a' })
    interactive('cust-b'); await post({ client_id: 'client-b' })
    interactive('cust-a')
    const { clients } = await json(await clientsGET(req('GET', '/api/oauth/clients')))
    expect(clients.map((c: any) => c.clientId)).toEqual(['client-a'])
  })
})

describe('N2: GET /api/session', () => {
  const get = (key: string) => sessionGET(req('GET', '/api/session', undefined, { authorization: `Bearer ${key}` }))

  it('N2 revoked / inactive keys do not validate', async () => {
    await seedKey({ _id: 'osk_revoked', customerId: 'c1', active: false, revokedAt: new Date() })
    await seedKey({ _id: 'osk_inactive', customerId: 'c1', active: false })
    expect((await get('osk_revoked')).status).toBe(401)
    expect((await get('osk_inactive')).status).toBe(401)
  })

  it('N2 an active key returns only minimal fields (no partner/scope internals)', async () => {
    await seedKey({ _id: 'osk_live', customerId: 'c1', userId: 'u1', name: 'k', createdAt: new Date(), partnerId: 'vetcontrol', externalId: EXT, scopes: ['contracts'], lastUsedAt: null })
    const res = await get('osk_live')
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(Object.keys(body).sort()).toEqual(['active', 'createdAt', 'customerId', 'name', 'userId'])
    expect(JSON.stringify(body)).not.toMatch(/vetcontrol|scopes|externalId|osk_live/)
  })
})

describe('N4: local-auth bypasses are impossible in production', () => {
  const setEnv = (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete (process.env as any)[k]
      else (process.env as any)[k] = v
    }
  }
  const withCookie = () => req('GET', '/api/contracts', undefined, { cookie: 'e2e_session=1' })

  it.each([
    ['NODE_ENV=production', { NODE_ENV: 'production' }],
    ['VERCEL_ENV=production', { VERCEL_ENV: 'production', NODE_ENV: 'development' }],
  ])('N4 getAuthContext ignores DEV_AUTH_BYPASS and e2e_session when %s', async (_n, env) => {
    setEnv({ ...env, DEV_AUTH_BYPASS: 'true', E2E_TEST_MODE: 'true' })
    const { getAuthContext } = jest.requireActual('@/lib/auth/unified')
    expect(await getAuthContext(withCookie())).toBeNull()
    expect(await getAuthContext(req('GET', '/api/contracts'))).toBeNull()
  })

  it('N4 control: both bypasses still work outside production', async () => {
    setEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined, DEV_AUTH_BYPASS: 'true' })
    const { getAuthContext } = jest.requireActual('@/lib/auth/unified')
    expect(await getAuthContext(req('GET', '/api/contracts'))).toMatchObject({ isOAuth: false })
    setEnv({ DEV_AUTH_BYPASS: undefined, E2E_TEST_MODE: 'true' })
    expect(await getAuthContext(withCookie())).toMatchObject({ isOAuth: false })
  })

  it('N4 dev-login route is 404 in production even with DEV_AUTH_BYPASS=true', async () => {
    setEnv({ NODE_ENV: 'production', DEV_AUTH_BYPASS: 'true' })
    expect((await devLoginGET(req('GET', '/api/dev-login'))).status).toBe(404)
    setEnv({ NODE_ENV: 'development', VERCEL_ENV: 'production' })
    expect((await devLoginGET(req('GET', '/api/dev-login'))).status).toBe(404)
    setEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined })
    expect((await devLoginGET(req('GET', '/api/dev-login'))).status).toBe(307)
  })

  describe('middleware', () => {
    let middleware: (r: any) => Promise<Response>
    beforeAll(() => {
      jest.isolateModules(() => {
        require('@/lib/auth/config').auth.mockImplementation((fn: any) => fn)
        middleware = require('@/middleware').default
      })
    })
    const call = () => { const r: any = withCookie(); r.auth = null; return middleware(r) }

    it.each([
      ['NODE_ENV=production', { NODE_ENV: 'production' }],
      ['VERCEL_ENV=production', { VERCEL_ENV: 'production', NODE_ENV: 'development' }],
    ])('N4 e2e_session cookie / DEV_AUTH_BYPASS do not authenticate when %s', async (_n, env) => {
      setEnv({ ...env, E2E_TEST_MODE: 'true', DEV_AUTH_BYPASS: 'true' })
      expect((await call()).status).toBe(401)
    })

    it('N4 control: cookie authenticates outside production', async () => {
      setEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined, E2E_TEST_MODE: 'true', DEV_AUTH_BYPASS: undefined })
      expect((await call()).status).not.toBe(401)
    })
  })
})


describe('POST /api/wallet: crédito manual solo para administradores', () => {
  it('wallet_manual_credit_is_admin_only', async () => {
    const { POST } = require('@/app/api/wallet/route')
    const { buildRequest } = require('../helpers/nextRequest')
    const nextAuth = require('@/lib/auth/config').auth as jest.Mock
    delete process.env.OSIGN_ADMIN_EMAILS
    delete process.env.OSIGN_ADMIN_USER_IDS
    nextAuth.mockResolvedValue({ user: { id: 'auth0|normal', email: 'normal@example.com' }, customerId: 'cust-normal' })
    const res = await POST(buildRequest({ method: 'POST', url: 'http://localhost:3000/api/wallet', body: { amount: 1000 } }) as any)
    expect(res.status).toBe(403)
  })
})
