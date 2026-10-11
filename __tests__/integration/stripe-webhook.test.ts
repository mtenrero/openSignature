/**
 * Integration tests for POST /api/webhooks/stripe.
 *
 * This is the canonical, signature-verified path by which money/plan state lands
 * in our DB. We mock the `stripe` SDK package (so signature verification and HTTP
 * calls are synthetic) but run the REAL StripeManager.handleWebhook dispatch plus
 * its handlers — crediting via the real VirtualWallet/Mongo and plan changes via a
 * mocked auth0UserManager.
 *
 *   checkout.session.completed (wallet_topup) → VirtualWallet.addCredits
 *   customer.subscription.updated             → updateUserSubscription(plan)
 *   customer.subscription.deleted             → updateUserSubscription('free')
 *   bad signature                             → 400
 */

// Mock the SDK package itself: `new Stripe()` returns a configurable instance.
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: jest.fn() },
    customers: { retrieve: jest.fn() },
    paymentIntents: { retrieve: jest.fn() },
    prices: { retrieve: jest.fn() },
  })),
)

jest.mock('@/lib/auth/userManagement', () => ({
  auth0UserManager: {
    updateUserSubscription: jest.fn().mockResolvedValue(undefined),
    updateUserMetadata: jest.fn().mockResolvedValue(undefined),
    ensureUser: jest.fn().mockResolvedValue(undefined),
    getUserSubscriptionInfo: jest.fn().mockResolvedValue(null),
  },
}))

import { POST as WEBHOOK_POST } from '@/app/api/webhooks/stripe/route'
import { stripe } from '@/lib/payment/stripe'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { buildRequest, readJson } from '../helpers/nextRequest'

const CUSTOMER_ID = 'wh-customer'
const USER_ID = 'wh-user'

const s = stripe as unknown as {
  webhooks: { constructEvent: jest.Mock }
  customers: { retrieve: jest.Mock }
  paymentIntents: { retrieve: jest.Mock }
  prices: { retrieve: jest.Mock }
}
const a0 = auth0UserManager as unknown as { updateUserSubscription: jest.Mock }

function postWebhook(withSignature = true) {
  return WEBHOOK_POST(
    buildRequest({
      method: 'POST',
      url: 'http://localhost:3000/api/webhooks/stripe',
      body: JSON.stringify({ id: 'evt_test' }),
      headers: withSignature ? { 'stripe-signature': 't=1,v1=deadbeef' } : {},
    }) as any,
  )
}

describe('POST /api/webhooks/stripe', () => {
  it('rejects requests with no stripe-signature header (400)', async () => {
    const res = await postWebhook(false)
    expect(res.status).toBe(400)
  })

  it('rejects an invalid signature with 400 (constructEvent throws)', async () => {
    s.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })
    const res = await postWebhook()
    expect(res.status).toBe(400)
  })

  it('returns 400 for an event type it does not handle', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      id: 'evt_radar',
      type: 'radar.early_fraud_warning.created',
      data: { object: {} },
    })
    const res = await postWebhook()
    expect(res.status).toBe(400)
  })

  it('credits the wallet on checkout.session.completed (wallet_topup)', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      id: 'evt_wh_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_wh',
          payment_status: 'paid',
          payment_intent: 'pi_wh',
          metadata: { type: 'wallet_topup', oSignEUCustomerId: CUSTOMER_ID, amountInCents: '5000' },
        },
      },
    })
    // Modern Stripe API: Charge lives on `latest_charge` (charges.data was removed).
    s.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { id: 'ch_wh' } })

    const res = await postWebhook()
    expect(res.status).toBe(200)
    expect((await readJson(res as any)) as any).toEqual({ received: true })

    const balance = await VirtualWallet.getBalance(CUSTOMER_ID)
    expect(balance.balance).toBe(5000)
    const txns = await VirtualWallet.getTransactions(CUSTOMER_ID)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({ reason: 'top_up', amount: 5000, stripePaymentIntentId: 'pi_wh', stripeChargeId: 'ch_wh' })
  })

  it('is idempotent across checkout + payment_intent.succeeded for the same intent', async () => {
    // 1) checkout.session.completed
    s.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_dup_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_dup',
          payment_status: 'paid',
          payment_intent: 'pi_dup',
          metadata: { type: 'wallet_topup', oSignEUCustomerId: CUSTOMER_ID, amountInCents: '3000' },
        },
      },
    })
    s.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_dup', latest_charge: { id: 'ch_dup' } })
    await postWebhook()

    // 2) payment_intent.succeeded for the SAME intent → must not double-credit
    s.webhooks.constructEvent.mockReturnValueOnce({
      id: 'evt_dup_2',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_dup',
          metadata: { type: 'wallet_topup', oSignEUCustomerId: CUSTOMER_ID, amountInCents: '3000' },
        },
      },
    })
    await postWebhook()

    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(3000)
    expect(await VirtualWallet.getTransactions(CUSTOMER_ID)).toHaveLength(1)
  })

  it('updates the plan on customer.subscription.updated', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_upd',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_wh',
          customer: 'cus_wh',
          status: 'active',
          metadata: { planId: 'pyme' },
          items: { data: [{ price: { id: 'price_pyme', product: 'plan_pyme' } }] },
        },
      },
    })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_wh', email: 'wh@test.dev', name: 'WH', metadata: { auth0UserId: USER_ID } })

    const res = await postWebhook()
    expect(res.status).toBe(200)
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER_ID, 'pyme', 'cus_wh')
  })

  it('downgrades to free on customer.subscription.deleted', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      id: 'evt_sub_del',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_del', customer: 'cus_wh', status: 'canceled' } },
    })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_wh', metadata: { auth0UserId: USER_ID } })

    const res = await postWebhook()
    expect(res.status).toBe(200)
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER_ID, 'free')
  })
})

describe('POST /api/webhooks/stripe - hardening', () => {
  const walletEvent = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${id}`,
        payment_status: 'paid',
        payment_intent: `pi_${id}`,
        amount_subtotal: 5000,
        amount_total: 5000,
        metadata: { type: 'wallet_topup', oSignEUCustomerId: CUSTOMER_ID, amountInCents: '5000' },
        ...over,
      },
    },
  })

  beforeEach(() => {
    s.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { id: 'ch_x' } })
    a0.updateUserSubscription.mockClear()
  })

  it('fails closed when STRIPE_WEBHOOK_SECRET is missing (500) and processes nothing', async () => {
    const saved = process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_WEBHOOK_SECRET
    try {
      s.webhooks.constructEvent.mockReturnValue(walletEvent('evt_nosecret'))
      const res = await postWebhook()
      expect(res.status).toBe(500)
      expect(s.webhooks.constructEvent).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), undefined)
      expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = saved
    }
  })

  it('an event without an id is refused (400)', async () => {
    s.webhooks.constructEvent.mockReturnValue({ type: 'checkout.session.completed', data: { object: {} } })
    expect((await postWebhook()).status).toBe(400)
  })

  it('a replayed event is processed once (subscription change)', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      id: 'evt_replay',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_r', customer: 'cus_r', status: 'active', metadata: { planId: 'pyme' }, items: { data: [{ price: { id: 'price_pyme', product: 'plan_pyme' } }] } } },
    })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_r', metadata: { auth0UserId: USER_ID } })
    const r1 = await postWebhook()
    const r2 = await postWebhook()
    const r3 = await postWebhook()
    expect([r1.status, r2.status, r3.status]).toEqual([200, 200, 200])
    expect(a0.updateUserSubscription).toHaveBeenCalledTimes(1)
  })

  it('a replayed wallet event credits once and records the event as processed', async () => {
    s.webhooks.constructEvent.mockReturnValue(walletEvent('evt_wallet_replay'))
    await postWebhook()
    await postWebhook()
    expect(await VirtualWallet.getTransactions(CUSTOMER_ID)).toHaveLength(1)
    const d = await (global as any).__getTestDb()
    const rec = await d.collection('stripe_webhook_events').findOne({ eventId: 'evt_wallet_replay' })
    expect(rec.status).toBe('processed')
  })

  it('concurrent deliveries of the same event run the handler once', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      id: 'evt_parallel',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_p', customer: 'cus_p', status: 'active', metadata: { planId: 'pyme' }, items: { data: [] } } },
    })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_p', metadata: { auth0UserId: USER_ID } })
    const results = await Promise.all(Array.from({ length: 5 }, () => postWebhook()))
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true)
    expect(a0.updateUserSubscription).toHaveBeenCalledTimes(1)
  })

  it('a failed handler frees the event so the Stripe retry is processed', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      id: 'evt_retry',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_t', customer: 'cus_t', status: 'active', metadata: { planId: 'pyme' }, items: { data: [] } } },
    })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_t', metadata: { auth0UserId: USER_ID } })
    a0.updateUserSubscription.mockRejectedValueOnce(new Error('auth0 down'))
    expect((await postWebhook()).status).toBe(500)
    expect((await postWebhook()).status).toBe(200)
    expect(a0.updateUserSubscription).toHaveBeenCalledTimes(2)
  })

  it('an unpaid (SEPA still pending) checkout.session.completed does not credit', async () => {
    s.webhooks.constructEvent.mockReturnValue(walletEvent('evt_unpaid', { payment_status: 'unpaid' }))
    expect((await postWebhook()).status).toBe(200)
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
  })

  it('credits at most what Stripe charged, whatever the metadata says', async () => {
    s.webhooks.constructEvent.mockReturnValue(
      walletEvent('evt_inflated', { amount_subtotal: 1000, amount_total: 1210, metadata: { type: 'wallet_topup', oSignEUCustomerId: CUSTOMER_ID, amountInCents: '999999' } }),
    )
    await postWebhook()
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(1000)
  })

  it('a subscription that is not paid up (incomplete / past_due) grants nothing', async () => {
    for (const status of ['incomplete', 'past_due', 'paused']) {
      s.webhooks.constructEvent.mockReturnValue({
        id: `evt_${status}`,
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_i', customer: 'cus_i', status, metadata: { planId: 'premium' }, items: { data: [] } } },
      })
      s.customers.retrieve.mockResolvedValue({ id: 'cus_i', metadata: { auth0UserId: USER_ID } })
      expect((await postWebhook()).status).toBe(200)
    }
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('a dead subscription downgrades to free', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      id: 'evt_unpaid_sub',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_u', customer: 'cus_u', status: 'unpaid', metadata: { planId: 'pyme' }, items: { data: [] } } },
    })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_u', metadata: { auth0UserId: USER_ID } })
    await postWebhook()
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER_ID, 'free')
  })

  it('an unknown or free plan id in subscription metadata never reaches the user', async () => {
    for (const planId of ['superadmin', 'free', '__proto__']) {
      s.webhooks.constructEvent.mockReturnValue({
        id: `evt_plan_${planId}`,
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_x', customer: 'cus_x', status: 'active', metadata: { planId }, items: { data: [] } } },
      })
      s.customers.retrieve.mockResolvedValue({ id: 'cus_x', metadata: { auth0UserId: USER_ID } })
      await postWebhook()
    }
    expect(a0.updateUserSubscription).not.toHaveBeenCalled()
  })

  it('does not log the signature header, the secret or its prefix on a bad signature', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    s.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('bad sig')
    })
    await postWebhook()
    const logged = JSON.stringify(spy.mock.calls)
    spy.mockRestore()
    expect(logged).not.toContain('deadbeef')
    expect(logged).not.toContain(process.env.STRIPE_WEBHOOK_SECRET || '__none__')
  })
})
