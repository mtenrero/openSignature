/**
 * Partner security round 2 (N1 partner part, N3, N5):
 *  N3 partner sessions are bound to the account generation (die on DELETE + re-provision)
 *  N5 partner SSO sessions cannot change plan / buy
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { decode } from 'next-auth/jwt'
import { POST as clientsPOST, GET as clientsGET } from '@/app/api/oauth/clients/route'
import { POST as accountsPOST } from '@/app/api/partner/accounts/route'
import { DELETE as accountDELETE } from '@/app/api/partner/accounts/[externalId]/route'
import { POST as ssoPOST } from '@/app/api/partner/sso/route'
import { GET as ssoGET } from '@/app/auth/partner-sso/route'
import { POST as setPlanPOST } from '@/app/api/subscription/set-plan/route'
import { POST as checkoutPOST } from '@/app/api/subscription/checkout/route'
import { POST as subscriptionPOST } from '@/app/api/subscription/route'
import { POST as subBillingPOST } from '@/app/api/subscription/billing/route'
import { POST as refundsPOST } from '@/app/api/subscription/refunds/route'
import { GET as walletGET, POST as walletPOST } from '@/app/api/wallet/route'
import { POST as topupPOST } from '@/app/api/wallet/topup/route'
import { PUT as walletBillingPUT } from '@/app/api/wallet/billing/route'
import { POST as checkPaymentPOST } from '@/app/api/wallet/check-payment/route'
import { POST as verifyPaymentPOST } from '@/app/api/wallet/verify-payment/route'
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
jest.mock('@/lib/payment/stripe', () => ({
  stripe: { checkout: { sessions: { retrieve: jest.fn() } }, customers: { retrieve: jest.fn() }, paymentIntents: { retrieve: jest.fn() } },
  StripeManager: { createCustomer: jest.fn(), getCustomer: jest.fn(), updateCustomer: jest.fn(), createWalletTopUpSession: jest.fn(), createCheckoutSession: jest.fn(), createBillingPortalSession: jest.fn() },
}))
jest.mock('@/lib/auth/userManagement', () => ({
  auth0UserManager: {
    getUser: jest.fn(), getUserSubscriptionInfo: jest.fn().mockResolvedValue({ plan: 'free' }),
    updateUserMetadata: jest.fn(), updateUserSubscription: jest.fn(), ensureUser: jest.fn(),
  },
}))

const U = 'http://localhost:3000'
const SECRET = 'test-partner-secret-vetcontrol'
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
const EXT = 'a'.repeat(32)
const H = { authorization: `Partner ${SECRET}` }
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
const partnerSession = (customerId: string, gen?: number) =>
  nextAuth().mockResolvedValue({ user: { id: customerId }, customerId, partnerId: 'vetcontrol', partnerSsoGen: gen })
const seedKey = async (doc: any) => (await getDb()).collection('esign_apikeys').insertOne({ active: true, userId: 'u', ...doc })

const envBackup = { ...process.env }
beforeEach(() => {
  process.env.OSIGN_PARTNERS = JSON.stringify([
    { id: 'vetcontrol', secretSha256: sha(SECRET), defaultPlan: 'pyme', ssoAllowedReturn: ['/contracts'] },
  ])
  nextAuth().mockResolvedValue(null)
  useRealAuthContext()
})
afterEach(() => {
  process.env = { ...envBackup }
})

describe('N1 (partner part): /api/oauth/clients', () => {
  const post = (body: any, headers: Record<string, string> = {}) => clientsPOST(req('POST', '/api/oauth/clients', body, headers))

  it('N1 refuses partner SSO sessions (403 SESSION_NOT_ALLOWED), for POST and GET', async () => {
    await (await getDb()).collection('partner_accounts').insertOne({ partnerId: 'vetcontrol', externalId: EXT, customerId: 'cust-p', status: 'active' })
    partnerSession('cust-p')
    const res = await post({ client_id: 'victim-client' })
    expect(res.status).toBe(403)
    expect((await json(res)).errorCode).toBe('SESSION_NOT_ALLOWED')
    expect((await clientsGET(req('GET', '/api/oauth/clients'))).status).toBe(403)
    expect(await (await getDb()).collection('oauth_clients').countDocuments({})).toBe(0)
  })

})

describe('N3: partner session bound to the account generation', () => {
  const sessionCfg = () => jest.requireActual('@/lib/auth/config').config.callbacks
  const create = () => accountsPOST(req('POST', '/api/partner/accounts', { externalId: EXT, email: 'clinic@example.com', businessName: 'Clinica' }, H))
  const sso = async () => {
    const { url } = await json(await ssoPOST(req('POST', '/api/partner/sso', { externalId: EXT, email: 'vet@example.com', name: 'Vet', returnTo: '/contracts' }, H)))
    return new URL(url).searchParams.get('token')!
  }
  const redeem = (token: string) => ssoGET(buildRequest({ url: `${U}/auth/partner-sso`, searchParams: { token } }) as NextRequest)
  const decodeCookie = async (res: Response) =>
    decode({ token: (res as any).cookies.get('authjs.session-token').value, secret: process.env.AUTH_SECRET!, salt: 'authjs.session-token' }) as any

  beforeEach(() => {
    process.env.AUTH0_CLIENT_ID = 'x'; process.env.AUTH0_CLIENT_SECRET = 'x'; process.env.AUTH0_ISSUER = 'https://e2e.example.auth0.com'
  })

  it('N3 a session minted before DELETE + re-provision of the same externalId stays dead', async () => {
    await create()
    const old = await decodeCookie(await redeem(await sso()))
    expect(await sessionCfg().jwt({ token: { ...old } })).toMatchObject({ partnerSso: 'vetcontrol' })

    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`, undefined, H), { params: Promise.resolve({ externalId: EXT }) })
    expect((await create()).status).toBe(201) // re-provision, same externalId and customerId
    expect(await sessionCfg().jwt({ token: { ...old } })).toBeNull()

    // the old session is also dead for getAuthContext readers
    partnerSession(old.customerId, old.partnerSsoGen)
    const { getAuthContext } = jest.requireActual('@/lib/auth/unified')
    expect(await getAuthContext(req('GET', '/api/contracts'))).toBeNull()

    // a fresh SSO works against the new incarnation
    const fresh = await decodeCookie(await redeem(await sso()))
    expect(await sessionCfg().jwt({ token: { ...fresh } })).toMatchObject({ partnerSso: 'vetcontrol' })
    expect(fresh.partnerSsoGen).not.toBe(old.partnerSsoGen)
  })

  it('N3 an SSO token minted before the disconnect cannot be redeemed after re-provisioning', async () => {
    await create()
    const staleToken = await sso()
    await accountDELETE(req('DELETE', `/api/partner/accounts/${EXT}`, undefined, H), { params: Promise.resolve({ externalId: EXT }) })
    await create()
    const res = await redeem(staleToken)
    expect(res.headers.get('location')).toContain('sso_expired')
    expect((res as any).cookies.get('authjs.session-token')).toBeUndefined()
  })
})

describe('N5: partner SSO sessions cannot change plan or billing', () => {
  const post = (path: string, body: any = { planId: 'pyme', amount: 10, paymentIntentId: 'pi_x', sessionId: 'cs_x' }) =>
    req('POST', path, body)
  const cases: Array<[string, () => Promise<Response>]> = [
    ['POST /api/subscription/set-plan', () => setPlanPOST(post('/api/subscription/set-plan'))],
    ['POST /api/subscription/checkout', () => checkoutPOST(post('/api/subscription/checkout'))],
    ['POST /api/subscription', () => subscriptionPOST(post('/api/subscription'))],
    ['POST /api/subscription/billing', () => subBillingPOST(post('/api/subscription/billing'))],
    ['POST /api/subscription/refunds', () => refundsPOST(post('/api/subscription/refunds'))],
    ['POST /api/wallet/topup', () => topupPOST(post('/api/wallet/topup'))],
    ['PUT /api/wallet/billing', () => walletBillingPUT(req('PUT', '/api/wallet/billing', { taxId: 'x' }))],
    ['POST /api/wallet/check-payment', () => checkPaymentPOST(post('/api/wallet/check-payment'))],
    ['POST /api/wallet/verify-payment', () => verifyPaymentPOST(post('/api/wallet/verify-payment'))],
  ]

  it.each(cases)('N5 %s -> 403 SESSION_NOT_ALLOWED for a partner SSO session', async (_n, call) => {
    partnerSession('cust-p')
    const res = await call()
    expect(res.status).toBe(403)
    expect((await json(res)).errorCode).toBe('SESSION_NOT_ALLOWED')
  })

  it('N5 manual wallet credit is refused to a partner session and writes nothing', async () => {
    partnerSession('cust-p')
    expect((await walletPOST(post('/api/wallet'))).status).toBe(403)
    const db = await getDb()
    const all = await Promise.all((await db.collections()).map((c: any) => c.countDocuments({})))
    expect(all.reduce((a: number, b: number) => a + b, 0)).toBe(0)
  })

  it('N5 read-only wallet balance stays allowed for partner sessions', async () => {
    partnerSession('cust-p')
    require('@/lib/auth/userManagement').auth0UserManager.getUserSubscriptionInfo.mockResolvedValue({ plan: { id: 'pay_per_use' } })
    expect((await walletGET(req('GET', '/api/wallet'))).status).toBe(200)
  })
})
