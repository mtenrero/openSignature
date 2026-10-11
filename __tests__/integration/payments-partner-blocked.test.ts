/**
 * Partner SSO sessions (clinics provisioned by a partner) never change plan, buy, top
 * up, verify payments or trigger refunds: billing goes through the partner.
 * Every mutating billing handler answers 403 SESSION_NOT_ALLOWED before touching anything.
 */
jest.mock('@/lib/payment/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: jest.fn() } },
    customers: { retrieve: jest.fn() },
    paymentIntents: { retrieve: jest.fn() },
    subscriptions: { list: jest.fn() },
  },
  StripeManager: { createWalletTopUpSession: jest.fn(), createBillingPortalSession: jest.fn() },
}))
jest.mock('@/lib/auth/userManagement', () => ({
  auth0UserManager: {
    getUser: jest.fn(),
    getUserSubscriptionInfo: jest.fn(),
    updateUserSubscription: jest.fn(),
    updateUserMetadata: jest.fn(),
    ensureUser: jest.fn().mockResolvedValue(undefined),
  },
}))

import { POST as SETPLAN } from '@/app/api/subscription/set-plan/route'
import { POST as SUB } from '@/app/api/subscription/route'
import { POST as CHECKOUT } from '@/app/api/subscription/checkout/route'
import { POST as BILLING } from '@/app/api/subscription/billing/route'
import { POST as REFUNDS } from '@/app/api/subscription/refunds/route'
import { POST as TOPUP } from '@/app/api/wallet/topup/route'
import { POST as VERIFY } from '@/app/api/wallet/verify-payment/route'
import { POST as CHECK } from '@/app/api/wallet/check-payment/route'
import { stripe, StripeManager } from '@/lib/payment/stripe'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { ObjectId } from 'mongodb'

const CUST = 'partner-clinic'
const req = (url: string, body: unknown) => buildRequest({ method: 'POST', url: `http://localhost:3000${url}`, body: body as any }) as any

beforeAll(() => {
  process.env.OSIGN_ADMIN_EMAILS = 'partner-admin@test.dev'
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(auth as jest.Mock).mockResolvedValue({
    user: { id: 'partner-user', email: 'partner-admin@test.dev' },
    customerId: CUST,
    partnerId: 'partner-1',
  })
})

describe('partner SSO is blocked from billing mutations', () => {
  const cases: Array<[string, (b?: unknown) => Promise<Response>, unknown]> = [
    ['set-plan', (b) => SETPLAN(req('/api/subscription/set-plan', b)), { planId: 'free' }],
    ['subscription', (b) => SUB(req('/api/subscription', b)), { planId: 'free' }],
    ['checkout', (b) => CHECKOUT(req('/api/subscription/checkout', b)), { planId: 'pyme' }],
    ['billing portal', (b) => BILLING(req('/api/subscription/billing', b)), {}],
    ['topup', (b) => TOPUP(req('/api/wallet/topup', b)), { amount: 20 }],
    ['verify-payment', (b) => VERIFY(req('/api/wallet/verify-payment', b)), { sessionId: 'cs_test_1' }],
    ['check-payment', (b) => CHECK(req('/api/wallet/check-payment', b)), { paymentIntentId: 'pi_1' }],
    ['refunds (own item)', (b) => REFUNDS(req('/api/subscription/refunds', b)), { signatureRequestId: new ObjectId().toHexString() }],
    ['refunds (global, even with an allowlisted email)', (b) => REFUNDS(req('/api/subscription/refunds', b)), {}],
  ]

  it.each(cases)('%s answers 403 SESSION_NOT_ALLOWED and touches nothing', async (_name, call, body) => {
    const res = await call(body)
    expect(res.status).toBe(403)
    expect(((await readJson(res as any)) as any).errorCode).toBe('SESSION_NOT_ALLOWED')

    const a0 = auth0UserManager as unknown as Record<string, jest.Mock>
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
    expect(a0.updateUserMetadata).not.toHaveBeenCalled()
    const s = stripe as unknown as { checkout: { sessions: { retrieve: jest.Mock } }; paymentIntents: { retrieve: jest.Mock } }
    expect(s.checkout.sessions.retrieve).not.toHaveBeenCalled()
    expect(s.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect((StripeManager as unknown as Record<string, jest.Mock>).createWalletTopUpSession).not.toHaveBeenCalled()
    expect((await VirtualWallet.getBalance(CUST)).balance).toBe(0)
  })

  it('the same handlers work for the same user once it is not a partner session', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'direct-user' }, customerId: 'direct-cust' })
    ;(auth0UserManager as any).getUserSubscriptionInfo.mockResolvedValue({ user: { user_id: 'direct-user', user_metadata: {} }, plan: { id: 'pay_per_use' } })
    const res = await SETPLAN(req('/api/subscription/set-plan', { planId: 'free' }))
    expect(res.status).toBe(200)
  })
})
