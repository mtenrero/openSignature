/**
 * Integration tests for the WALLET TOP-UP flow.
 *
 * Money path under test (the part that actually credits the DB):
 *   POST /api/wallet/topup          → creates a Stripe Checkout session (no credit yet)
 *   POST /api/wallet/verify-payment → on a paid session, credits the wallet via
 *                                     VirtualWallet.addCredits (idempotent by paymentIntent)
 *   GET  /api/wallet                → reflects the resulting balance
 *
 * Stripe and Auth0 are mocked (no network, no import-time crash on missing keys).
 * VirtualWallet is REAL and runs against the in-memory Mongo, so balance math and
 * idempotency are genuinely exercised — not stubbed.
 */

// ── Mocks (hoisted above imports by jest) ───────────────────────────────────
jest.mock('@/lib/payment/stripe', () => ({
  stripe: {
    checkout: { sessions: { retrieve: jest.fn() } },
    customers: { retrieve: jest.fn() },
    paymentIntents: { retrieve: jest.fn() },
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
    updateUserMetadata: jest.fn().mockResolvedValue(undefined),
    updateUserSubscription: jest.fn().mockResolvedValue(undefined),
    ensureUser: jest.fn().mockResolvedValue(undefined),
  },
}))

import { GET as WALLET_GET, POST as WALLET_POST } from '@/app/api/wallet/route'
import { POST as TOPUP_POST } from '@/app/api/wallet/topup/route'
import { POST as VERIFY_POST } from '@/app/api/wallet/verify-payment/route'
import { auth } from '@/lib/auth/config'
import { stripe, StripeManager } from '@/lib/payment/stripe'
import { auth0UserManager } from '@/lib/auth/userManagement'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { buildRequest, readJson } from '../helpers/nextRequest'

const USER_ID = 'wallet-user'
const CUSTOMER_ID = 'wallet-customer'

const a0 = auth0UserManager as unknown as {
  getUser: jest.Mock
  getUserSubscriptionInfo: jest.Mock
  updateUserMetadata: jest.Mock
}
const SM = StripeManager as unknown as {
  createCustomer: jest.Mock
  getCustomer: jest.Mock
  updateCustomer: jest.Mock
  createWalletTopUpSession: jest.Mock
}
const stripeMock = stripe as unknown as {
  checkout: { sessions: { retrieve: jest.Mock } }
  customers: { retrieve: jest.Mock }
  paymentIntents: { retrieve: jest.Mock }
}

function signedIn(over: Record<string, unknown> = {}) {
  ;(auth as jest.Mock).mockResolvedValue({
    user: { id: USER_ID, email: 'owner@test.dev', name: 'Owner' },
    customerId: CUSTOMER_ID,
    ...over,
  })
}
function signedOut() {
  ;(auth as jest.Mock).mockResolvedValue(null)
}

// ── Top-up: create checkout session ─────────────────────────────────────────
describe('POST /api/wallet/topup — create checkout session', () => {
  beforeEach(() => {
    signedIn()
    a0.getUser.mockResolvedValue({ email: 'owner@test.dev', name: 'Owner', user_metadata: {} })
    a0.getUserSubscriptionInfo.mockResolvedValue({ plan: { id: 'pay_per_use' } })
    SM.createCustomer.mockResolvedValue({ id: 'cus_new' })
    SM.getCustomer.mockResolvedValue({ id: 'cus_new' })
    SM.createWalletTopUpSession.mockResolvedValue({ id: 'cs_123', url: 'https://checkout.stripe.test/cs_123' })
  })

  it('rejects unauthenticated callers with 401', async () => {
    signedOut()
    const res = await TOPUP_POST(buildRequest({ method: 'POST', body: { amount: 50 } }) as any)
    expect(res.status).toBe(401)
  })

  it.each([
    ['missing amount', {}],
    ['below the 10€ minimum', { amount: 5 }],
    ['above the 1000€ maximum', { amount: 2000 }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await TOPUP_POST(buildRequest({ method: 'POST', body }) as any)
    expect(res.status).toBe(400)
  })

  it('returns 404 when the Auth0 user cannot be found', async () => {
    a0.getUser.mockResolvedValue(null)
    const res = await TOPUP_POST(buildRequest({ method: 'POST', body: { amount: 50 } }) as any)
    expect(res.status).toBe(404)
  })

  it('blocks free-plan users with 403 and points them at pay_per_use', async () => {
    a0.getUserSubscriptionInfo.mockResolvedValue({ plan: { id: 'free' } })
    const res = await TOPUP_POST(buildRequest({ method: 'POST', body: { amount: 50 } }) as any)
    expect(res.status).toBe(403)
    const body = (await readJson(res as any)) as any
    expect(body.requiredPlan).toBe('pay_per_use')
  })

  it('creates a Stripe checkout session (in cents) for a valid pay_per_use top-up', async () => {
    const res = await TOPUP_POST(buildRequest({ method: 'POST', body: { amount: 50 } }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.sessionId).toBe('cs_123')
    expect(body.checkoutUrl).toBe('https://checkout.stripe.test/cs_123')
    expect(body.amount).toBe(50)

    // Amount converted euros → cents, and the oSign customerId is what gets stamped
    // into Stripe metadata (later read back by verify-payment).
    expect(SM.createWalletTopUpSession).toHaveBeenCalledWith(
      'cus_new',
      5000,
      CUSTOMER_ID,
      expect.any(String),
      expect.any(String),
    )
    // First-time customer → created in Stripe and persisted to Auth0 metadata.
    expect(SM.createCustomer).toHaveBeenCalledTimes(1)
    expect(a0.updateUserMetadata).toHaveBeenCalledWith(USER_ID, { stripeCustomerId: 'cus_new' })
  })

  it('reuses an existing Stripe customer instead of creating a new one', async () => {
    a0.getUser.mockResolvedValue({
      email: 'owner@test.dev',
      name: 'Owner',
      user_metadata: { stripeCustomerId: 'cus_existing' },
    })
    SM.getCustomer.mockResolvedValue({ id: 'cus_existing' })

    const res = await TOPUP_POST(buildRequest({ method: 'POST', body: { amount: 100 } }) as any)
    expect(res.status).toBe(200)
    expect(SM.createCustomer).not.toHaveBeenCalled()
    expect(SM.createWalletTopUpSession).toHaveBeenCalledWith(
      'cus_existing',
      10000,
      CUSTOMER_ID,
      expect.any(String),
      expect.any(String),
    )
  })
})

// ── Verify payment: the step that actually credits the wallet ───────────────
describe('POST /api/wallet/verify-payment — credit the wallet', () => {
  const paidSession = {
    id: 'cs_paid',
    payment_status: 'paid',
    payment_intent: 'pi_123',
    customer: 'cus_x',
    amount_total: 5000,
    metadata: { type: 'wallet_topup', oSignEUCustomerId: CUSTOMER_ID, amountInCents: '5000' },
  }

  beforeEach(() => {
    signedIn()
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({ ...paidSession })
    stripeMock.customers.retrieve.mockResolvedValue({ metadata: { customerId: CUSTOMER_ID } })
    // Modern Stripe API (>= 2022-11-15): the Charge is on `latest_charge`, not `charges.data`.
    stripeMock.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { id: 'ch_1' } })
  })

  it('rejects unauthenticated callers with 401', async () => {
    signedOut()
    const res = await VERIFY_POST(buildRequest({ method: 'POST', body: { sessionId: 'cs_paid' } }) as any)
    expect(res.status).toBe(401)
  })

  it('requires a sessionId (400)', async () => {
    const res = await VERIFY_POST(buildRequest({ method: 'POST', body: {} }) as any)
    expect(res.status).toBe(400)
  })

  it('forbids verifying a session that belongs to another customer (403)', async () => {
    stripeMock.customers.retrieve.mockResolvedValue({ metadata: { customerId: 'someone-else' } })
    const res = await VERIFY_POST(buildRequest({ method: 'POST', body: { sessionId: 'cs_paid' } }) as any)
    expect(res.status).toBe(403)
    // Nothing credited on a rejected session.
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
  })

  it('credits the wallet with the paid amount and records the transaction', async () => {
    const res = await VERIFY_POST(buildRequest({ method: 'POST', body: { sessionId: 'cs_paid' } }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(true)
    expect(body.amount).toBe(50)

    const balance = await VirtualWallet.getBalance(CUSTOMER_ID)
    expect(balance.balance).toBe(5000)
    expect(balance.totalCredits).toBe(5000)

    const txns = await VirtualWallet.getTransactions(CUSTOMER_ID)
    expect(txns).toHaveLength(1)
    expect(txns[0]).toMatchObject({
      type: 'credit',
      reason: 'top_up',
      amount: 5000,
      stripePaymentIntentId: 'pi_123',
      stripeChargeId: 'ch_1',
    })
  })

  it('is idempotent — verifying the same session twice credits the wallet only once', async () => {
    await VERIFY_POST(buildRequest({ method: 'POST', body: { sessionId: 'cs_paid' } }) as any)
    await VERIFY_POST(buildRequest({ method: 'POST', body: { sessionId: 'cs_paid' } }) as any)

    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(5000)
    expect(await VirtualWallet.getTransactions(CUSTOMER_ID)).toHaveLength(1)
  })

  it('does not credit when the checkout session is still unpaid', async () => {
    stripeMock.checkout.sessions.retrieve.mockResolvedValue({
      ...paidSession,
      payment_status: 'unpaid',
      payment_intent: { id: 'pi_unpaid', payment_method_types: ['card'] },
    })
    const res = await VERIFY_POST(buildRequest({ method: 'POST', body: { sessionId: 'cs_paid' } }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(false)
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
  })
})

// ── Reading the balance back ────────────────────────────────────────────────
describe('GET /api/wallet — read balance', () => {
  beforeEach(() => {
    signedIn()
    a0.getUserSubscriptionInfo.mockResolvedValue({ plan: { id: 'pay_per_use' } })
  })

  it('blocks free-plan users with 403', async () => {
    a0.getUserSubscriptionInfo.mockResolvedValue({ plan: { id: 'free' } })
    const res = await WALLET_GET(buildRequest({ method: 'GET' }) as any)
    expect(res.status).toBe(403)
  })

  it('reflects the credited balance for an entitled plan', async () => {
    await VirtualWallet.addCredits(CUSTOMER_ID, 5000, 'top_up', 'seed', 'pi_seed', 'ch_seed')

    const res = await WALLET_GET(buildRequest({ method: 'GET' }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.balance.current).toBe(5000)
    expect(body.transactions).toHaveLength(1)
    expect(body.transactions[0].stripePaymentIntentId).toBe('pi_seed')
  })
})

// ── Concurrent idempotency: the unique partial index closes the TOCTOU race ──
describe('VirtualWallet.addCredits — concurrent idempotency (unique index)', () => {
  it('credits a payment intent exactly once under concurrent calls', async () => {
    const CID = 'race-customer'
    // Warm the unique index + pre-create the balance doc so the concurrent batch
    // races only the transaction insert (what the index guards), not setup.
    await VirtualWallet.getTransactionsCollection()
    await VirtualWallet.getBalance(CID)

    // 8 simultaneous credits for the SAME payment intent (mirrors the webhook storm).
    const results = await Promise.all(
      Array.from({ length: 8 }, () => VirtualWallet.addCredits(CID, 5000, 'top_up', 'race', 'pi_race', 'ch_race')),
    )

    // Every call resolves to a credit (losers return the winner, never throw)…
    expect(results.every((r) => r?.type === 'credit')).toBe(true)
    // …and the money landed exactly once.
    expect((await VirtualWallet.getBalance(CID)).balance).toBe(5000)
    expect(await VirtualWallet.getTransactions(CID)).toHaveLength(1)
  })

  it('still allows independent payment intents and no-pi credits', async () => {
    const CID = 'race-customer-2'
    await VirtualWallet.getTransactionsCollection()
    await VirtualWallet.addCredits(CID, 1000, 'top_up', 'a', 'pi_a')
    await VirtualWallet.addCredits(CID, 2000, 'top_up', 'b', 'pi_b')
    await VirtualWallet.addCredits(CID, 500, 'bonus', 'manual-1') // no pi
    await VirtualWallet.addCredits(CID, 500, 'bonus', 'manual-2') // no pi
    expect((await VirtualWallet.getBalance(CID)).balance).toBe(4000)
    expect(await VirtualWallet.getTransactions(CID)).toHaveLength(4)
  })
})
