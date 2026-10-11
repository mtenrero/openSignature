/**
 * Plan changes + wallet payment verification, with Stripe and Auth0 MOCKED.
 *
 *   POST /api/subscription/set-plan | /api/subscription  → free / pay_per_use only, owner only
 *   POST /api/wallet/verify-payment                       → own session only, credits once
 *   POST /api/wallet/check-payment                        → own payment intent only, credits once
 *   POST /api/wallet/topup                                → amount validated, rate limited
 */
jest.mock('@/lib/payment/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: jest.fn() } },
    customers: { retrieve: jest.fn() },
    paymentIntents: { retrieve: jest.fn() },
    subscriptions: { list: jest.fn() },
  },
  StripeManager: {
    createCustomer: jest.fn(),
    getCustomer: jest.fn(),
    updateCustomer: jest.fn(),
    createWalletTopUpSession: jest.fn(),
  },
}))

jest.mock('@/lib/auth/userManagement', () => ({
  auth0UserManager: {
    getUser: jest.fn(),
    getUserSubscriptionInfo: jest.fn(),
    updateUserSubscription: jest.fn().mockResolvedValue(undefined),
    updateUserMetadata: jest.fn().mockResolvedValue(undefined),
    ensureUser: jest.fn().mockResolvedValue(undefined),
  },
}))

import { POST as SETPLAN_POST } from '@/app/api/subscription/set-plan/route'
import { POST as SUB_POST } from '@/app/api/subscription/route'
import { POST as VERIFY_POST } from '@/app/api/wallet/verify-payment/route'
import { POST as CHECK_POST } from '@/app/api/wallet/check-payment/route'
import { POST as TOPUP_POST } from '@/app/api/wallet/topup/route'
import { stripe, StripeManager } from '@/lib/payment/stripe'
import { auth } from '@/lib/auth/config'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'
import { buildRequest, readJson } from '../helpers/nextRequest'

const s = stripe as unknown as {
  checkout: { sessions: { retrieve: jest.Mock } }
  customers: { retrieve: jest.Mock }
  paymentIntents: { retrieve: jest.Mock }
  subscriptions: { list: jest.Mock }
}
const sm = StripeManager as unknown as Record<string, jest.Mock>
const a0 = auth0UserManager as unknown as Record<string, jest.Mock>

const USER = 'pay-user'
const CUST = 'pay-customer'
const OTHER_CUST = 'someone-else'

function signedIn(extra: Record<string, unknown> = {}) {
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: USER, email: 'pay@test.dev' }, customerId: CUST, ...extra })
}
const req = (url: string, body: unknown) => buildRequest({ method: 'POST', url: `http://localhost:3000${url}`, body: body as any }) as any
const balance = async (c: string) => (await VirtualWallet.getBalance(c)).balance

beforeEach(() => {
  jest.clearAllMocks()
  a0.updateUserSubscription.mockResolvedValue(undefined)
  a0.getUserSubscriptionInfo.mockResolvedValue({
    user: { user_id: USER, user_metadata: {} },
    plan: { id: 'pay_per_use' },
  })
  s.subscriptions.list.mockResolvedValue({ data: [] })
  signedIn()
})

describe('plan changes', () => {
  it('free plan change works only for the signed-in owner (401 anonymous)', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await SETPLAN_POST(req('/api/subscription/set-plan', { planId: 'free' }))).status).toBe(401)
    expect((await SUB_POST(req('/api/subscription', { planId: 'free' }))).status).toBe(401)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('free plan change applies to the SESSION user, never to a user id from the body', async () => {
    const res = await SUB_POST(req('/api/subscription', { planId: 'free', userId: 'victim', user_id: 'victim', customerId: 'victim' }))
    expect(res.status).toBe(200)
    expect(a0.updateUserSubscription).toHaveBeenCalledTimes(1)
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER, 'free')
  })

  it('plan-change fails CLOSED (503) when the current plan cannot be read: nothing is written', async () => {
    a0.getUserSubscriptionInfo.mockRejectedValue(new Error('auth0 down'))
    const res = await SETPLAN_POST(req('/api/subscription/set-plan', { planId: 'free' }))
    expect(res.status).toBe(503)
    expect(((await readJson(res as any)) as any).errorCode).toBe('PLAN_CHECK_FAILED')
    expect((await SUB_POST(req('/api/subscription', { planId: 'free' }))).status).toBe(503)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
    expect(s.subscriptions.list).not.toHaveBeenCalled()
  })

  it('a session without customerId cannot change plan', async () => {
    ;(auth as jest.Mock).mockResolvedValue({ user: { id: USER } })
    expect((await SETPLAN_POST(req('/api/subscription/set-plan', { planId: 'free' }))).status).toBe(401)
    expect((await SUB_POST(req('/api/subscription', { planId: 'free' }))).status).toBe(401)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it.each(['pyme', 'PYME', 'pyme_advanced', 'premium', 'gold', 'enterprise'])(
    'set-plan cannot grant the paid plan %s',
    async (planId) => {
      const res = await SETPLAN_POST(req('/api/subscription/set-plan', { planId }))
      expect([400, 404]).toContain(res.status)
      expect(a0.updateUserSubscription).not.toHaveBeenCalled()
    },
  )

  it('POST /api/subscription never grants a paid plan, it only points at checkout', async () => {
    const res = await SUB_POST(req('/api/subscription', { planId: 'premium' }))
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(false)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('rejects non-string / malformed plan ids and bodies', async () => {
    for (const planId of [{ $ne: 1 }, ['free'], 42, null]) {
      expect((await SETPLAN_POST(req('/api/subscription/set-plan', { planId }))).status).toBe(400)
      expect((await SUB_POST(req('/api/subscription', { planId }))).status).toBe(400)
    }
    const bad = await SETPLAN_POST(buildRequest({ method: 'POST', body: '{not json' }) as any)
    expect(bad.status).toBe(400)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('cannot drop to free while a Stripe subscription is live (409) - cancel via the portal', async () => {
    a0.getUserSubscriptionInfo.mockResolvedValue({
      user: { user_id: USER, user_metadata: { stripeCustomerId: 'cus_live' } },
      plan: { id: 'pyme' },
    })
    s.subscriptions.list.mockResolvedValue({ data: [{ id: 'sub_live' }] })
    const res = await SETPLAN_POST(req('/api/subscription/set-plan', { planId: 'free' }))
    expect(res.status).toBe(409)
    expect(((await readJson(res as any)) as any).errorCode).toBe('ACTIVE_SUBSCRIPTION')
    expect((await SUB_POST(req('/api/subscription', { planId: 'free' }))).status).toBe(409)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('fails closed when Stripe cannot confirm there is no live subscription', async () => {
    a0.getUserSubscriptionInfo.mockResolvedValue({
      user: { user_id: USER, user_metadata: { stripeCustomerId: 'cus_x' } },
      plan: { id: 'pyme' },
    })
    s.subscriptions.list.mockRejectedValue(new Error('stripe down'))
    expect((await SETPLAN_POST(req('/api/subscription/set-plan', { planId: 'free' }))).status).toBe(503)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('a paid user whose subscription already ended can drop to free', async () => {
    a0.getUserSubscriptionInfo.mockResolvedValue({
      user: { user_id: USER, user_metadata: { stripeCustomerId: 'cus_dead' } },
      plan: { id: 'pyme' },
    })
    expect((await SETPLAN_POST(req('/api/subscription/set-plan', { planId: 'free' }))).status).toBe(200)
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER, 'free')
  })

  it('asking for the plan you already have is an idempotent no-op', async () => {
    a0.getUserSubscriptionInfo.mockResolvedValue({ user: { user_id: USER, user_metadata: {} }, plan: { id: 'free' } })
    const res = await SETPLAN_POST(req('/api/subscription/set-plan', { planId: 'free' }))
    expect(res.status).toBe(200)
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })
})

describe('POST /api/wallet/verify-payment', () => {
  const checkout = (over: Record<string, unknown> = {}) => ({
    id: 'cs_test_1',
    customer: 'cus_mine',
    payment_status: 'paid',
    amount_total: 6050,
    amount_subtotal: 5000,
    payment_intent: { id: 'pi_1', payment_method_types: ['card'] },
    metadata: { type: 'wallet_topup', oSignEUCustomerId: CUST, amountInCents: '5000' },
    ...over,
  })

  beforeEach(() => {
    s.customers.retrieve.mockResolvedValue({ id: 'cus_mine', metadata: { customerId: CUST } })
    s.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_1', latest_charge: 'ch_1' })
  })

  it('double call credits the wallet once', async () => {
    s.checkout.sessions.retrieve.mockResolvedValue(checkout())
    const r1 = await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))
    const r2 = await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(await balance(CUST)).toBe(5000) // net amount, not the VAT-inclusive 6050
    expect(await VirtualWallet.getTransactions(CUST)).toHaveLength(1)
  })

  it('parallel calls credit once', async () => {
    s.checkout.sessions.retrieve.mockResolvedValue(checkout())
    await Promise.all(Array.from({ length: 5 }, () => VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))))
    expect(await balance(CUST)).toBe(5000)
  })

  it('a foreign checkout session is rejected (403) and credits nobody', async () => {
    s.customers.retrieve.mockResolvedValue({ id: 'cus_theirs', metadata: { customerId: OTHER_CUST } })
    s.checkout.sessions.retrieve.mockResolvedValue(
      checkout({ customer: 'cus_theirs', metadata: { type: 'wallet_topup', oSignEUCustomerId: OTHER_CUST, amountInCents: '5000' } }),
    )
    const res = await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))
    expect(res.status).toBe(403)
    expect(await balance(CUST)).toBe(0)
    expect(await balance(OTHER_CUST)).toBe(0)
  })

  it('a session whose Stripe customer is mine but whose metadata names someone else is rejected', async () => {
    s.checkout.sessions.retrieve.mockResolvedValue(
      checkout({ metadata: { type: 'wallet_topup', oSignEUCustomerId: OTHER_CUST, amountInCents: '5000' } }),
    )
    const res = await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))
    expect(res.status).toBe(403)
    expect(await balance(OTHER_CUST)).toBe(0)
  })

  it('a session with no customer is rejected', async () => {
    s.checkout.sessions.retrieve.mockResolvedValue(checkout({ customer: null }))
    expect((await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))).status).toBe(403)
    expect(await balance(CUST)).toBe(0)
  })

  it('never credits more than the checkout charged, whatever the metadata says', async () => {
    s.checkout.sessions.retrieve.mockResolvedValue(
      checkout({ amount_subtotal: 1000, amount_total: 1210, metadata: { type: 'wallet_topup', oSignEUCustomerId: CUST, amountInCents: '100000' } }),
    )
    await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))
    expect(await balance(CUST)).toBe(1000)
  })

  it('an unpaid session credits nothing', async () => {
    s.checkout.sessions.retrieve.mockResolvedValue(checkout({ payment_status: 'unpaid', payment_intent: { id: 'pi_1', payment_method_types: ['card'] } }))
    const res = await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))
    expect(((await readJson(res as any)) as any).success).toBe(false)
    expect(await balance(CUST)).toBe(0)
  })

  it('does not echo the Stripe metadata back', async () => {
    s.checkout.sessions.retrieve.mockResolvedValue(checkout())
    const body = (await readJson((await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))) as any)) as any
    expect(body.metadata).toBeUndefined()
  })

  it('rejects malformed session ids without calling Stripe', async () => {
    for (const sessionId of ['', 'pi_123', { a: 1 }, 'cs_ok; drop']) {
      expect((await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId }))).status).toBe(400)
    }
    expect(s.checkout.sessions.retrieve).not.toHaveBeenCalled()
  })

  it('requires a signed-in customer', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))).status).toBe(401)
  })

  it('is rate limited per customer (429)', async () => {
    s.checkout.sessions.retrieve.mockResolvedValue(checkout({ payment_status: 'unpaid' }))
    let last = 0
    for (let i = 0; i < 35; i++) last = (await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_test_1' }))).status
    expect(last).toBe(429)
  })
})

describe('POST /api/wallet/check-payment', () => {
  const pi = (over: Record<string, unknown> = {}) => ({
    id: 'pi_chk',
    status: 'succeeded',
    amount: 6050,
    amount_received: 6050,
    currency: 'eur',
    latest_charge: 'ch_chk',
    metadata: { type: 'wallet_topup', oSignEUCustomerId: CUST, amountInCents: '5000' },
    ...over,
  })

  it('double call credits once', async () => {
    s.paymentIntents.retrieve.mockResolvedValue(pi())
    const r1 = await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'pi_chk' }))
    const r2 = await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'pi_chk' }))
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(await balance(CUST)).toBe(5000)
    expect(await VirtualWallet.getTransactions(CUST)).toHaveLength(1)
  })

  it('a foreign payment intent is rejected (403) in EVERY status and credits nobody', async () => {
    for (const status of ['succeeded', 'processing', 'requires_payment_method']) {
      s.paymentIntents.retrieve.mockResolvedValue(
        pi({ status, metadata: { type: 'wallet_topup', oSignEUCustomerId: OTHER_CUST, amountInCents: '5000' } }),
      )
      const res = await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'pi_chk' }))
      expect(res.status).toBe(403)
      expect(JSON.stringify(await readJson(res as any))).not.toContain('amount')
    }
    expect(await balance(OTHER_CUST)).toBe(0)
    expect(await balance(CUST)).toBe(0)
  })

  it('a payment intent without our metadata is not the caller\'s', async () => {
    s.paymentIntents.retrieve.mockResolvedValue(pi({ metadata: {} }))
    expect((await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'pi_chk' }))).status).toBe(403)
  })

  it('never credits more than Stripe received', async () => {
    s.paymentIntents.retrieve.mockResolvedValue(
      pi({ amount_received: 700, metadata: { type: 'wallet_topup', oSignEUCustomerId: CUST, amountInCents: '90000' } }),
    )
    await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'pi_chk' }))
    expect(await balance(CUST)).toBe(700)
  })

  it('rejects malformed ids and anonymous callers', async () => {
    expect((await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: { x: 1 } }))).status).toBe(400)
    expect((await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'cs_nope' }))).status).toBe(400)
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'pi_chk' }))).status).toBe(401)
  })
})

describe('SEPA top-ups are credited only once they clear', () => {
  it('verify-payment of an unpaid SEPA session registers a pending row and credits NOTHING', async () => {
    s.customers.retrieve.mockResolvedValue({ id: 'cus_mine', metadata: { customerId: CUST } })
    s.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_sepa', customer: 'cus_mine', payment_status: 'unpaid', amount_total: 6050, amount_subtotal: 5000,
      payment_intent: { id: 'pi_sepa_v', payment_method_types: ['sepa_debit'] },
      metadata: { type: 'wallet_topup', oSignEUCustomerId: CUST, amountInCents: '5000' },
    })
    const res = await VERIFY_POST(req('/api/wallet/verify-payment', { sessionId: 'cs_sepa' }))
    expect(res.status).toBe(200)
    expect(await balance(CUST)).toBe(0)
    expect(await VirtualWallet.getTransactions(CUST)).toHaveLength(0)
    expect(await PendingPaymentManager.getPendingPayments(CUST)).toHaveLength(1)
  })

  it('check-payment credits the pending SEPA top-up once it succeeded, and closes the pending row', async () => {
    await PendingPaymentManager.createPendingPayment({
      customerId: CUST, stripePaymentIntentId: 'pi_sepa_c', amount: 5000, description: 'Bono (SEPA)', paymentMethod: 'sepa_debit',
    })
    s.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_sepa_c', status: 'succeeded', amount: 6050, amount_received: 6050, latest_charge: 'ch_sepa_c',
      metadata: { type: 'wallet_topup', oSignEUCustomerId: CUST, amountInCents: '5000' },
    })
    expect(await balance(CUST)).toBe(0)
    await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'pi_sepa_c' }))
    await CHECK_POST(req('/api/wallet/check-payment', { paymentIntentId: 'pi_sepa_c' }))
    expect(await balance(CUST)).toBe(5000)
    expect(await VirtualWallet.getTransactions(CUST)).toHaveLength(1)
    expect((await PendingPaymentManager.findByPaymentIntent('pi_sepa_c'))?.status).toBe('confirmed')
  })
})

describe('POST /api/wallet/topup', () => {
  beforeEach(() => {
    a0.getUser.mockResolvedValue({ user_id: USER, email: 'pay@test.dev', name: 'Pay', user_metadata: { stripeCustomerId: 'cus_mine' } })
    sm.getCustomer.mockResolvedValue({ id: 'cus_mine' })
    sm.createWalletTopUpSession.mockResolvedValue({ id: 'cs_new', url: 'https://stripe.test/pay' })
  })

  it.each(['abc', '50', NaN, null, [50], { a: 1 }, 5, 5000, -20, Infinity])('rejects amount %p without calling Stripe', async (amount) => {
    const res = await TOPUP_POST(req('/api/wallet/topup', { amount }))
    expect(res.status).toBe(400)
    expect(sm.createWalletTopUpSession).not.toHaveBeenCalled()
  })

  it('creates a checkout for a valid amount with the SESSION customer id', async () => {
    const res = await TOPUP_POST(req('/api/wallet/topup', { amount: 20, customerId: 'victim', oSignEUCustomerId: 'victim' }))
    expect(res.status).toBe(200)
    expect(sm.createWalletTopUpSession).toHaveBeenCalledWith('cus_mine', 2000, CUST, expect.any(String), expect.any(String))
  })

  it('is rate limited per customer (429)', async () => {
    let last = 0
    for (let i = 0; i < 12; i++) last = (await TOPUP_POST(req('/api/wallet/topup', { amount: 20 }))).status
    expect(last).toBe(429)
    expect(sm.createWalletTopUpSession).toHaveBeenCalledTimes(10)
  })
})
