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
 *   bad signature                             → 401
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

  it('rejects an invalid signature with 401 (constructEvent throws)', async () => {
    s.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature')
    })
    const res = await postWebhook()
    expect(res.status).toBe(401)
  })

  it('returns 400 for an event type it does not handle', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      type: 'radar.early_fraud_warning.created',
      data: { object: {} },
    })
    const res = await postWebhook()
    expect(res.status).toBe(400)
  })

  it('credits the wallet on checkout.session.completed (wallet_topup)', async () => {
    s.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_wh',
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
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_dup',
          payment_intent: 'pi_dup',
          metadata: { type: 'wallet_topup', oSignEUCustomerId: CUSTOMER_ID, amountInCents: '3000' },
        },
      },
    })
    s.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_dup', latest_charge: { id: 'ch_dup' } })
    await postWebhook()

    // 2) payment_intent.succeeded for the SAME intent → must not double-credit
    s.webhooks.constructEvent.mockReturnValueOnce({
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
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_del', customer: 'cus_wh', status: 'canceled' } },
    })
    s.customers.retrieve.mockResolvedValue({ id: 'cus_wh', metadata: { auth0UserId: USER_ID } })

    const res = await postWebhook()
    expect(res.status).toBe(200)
    expect(a0.updateUserSubscription).toHaveBeenCalledWith(USER_ID, 'free')
  })
})
