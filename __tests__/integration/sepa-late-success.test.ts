/**
 * A SEPA top-up that was marked failed/expired (or reversed, for legacy rows credited up
 * front) and LATER succeeds in Stripe must be credited, exactly once, by whichever path
 * learns about it first: payment_intent.succeeded webhook, /api/wallet/check-payment or
 * the cron re-check. Stripe is mocked; wallet and pending rows are real (in-memory Mongo).
 */
jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: jest.fn() },
    customers: { retrieve: jest.fn() },
    paymentIntents: { retrieve: jest.fn() },
    prices: { retrieve: jest.fn() },
  })),
)

import { POST as WEBHOOK_POST } from '@/app/api/webhooks/stripe/route'
import { POST as CHECK_PAYMENT } from '@/app/api/wallet/check-payment/route'
import { GET as CRON_GET } from '@/app/api/cron/check-pending-payments/route'
import { stripe } from '@/lib/payment/stripe'
import { auth } from '@/lib/auth/config'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'
import { buildRequest, readJson } from '../helpers/nextRequest'

const CUST = 'late-sepa-customer'
const PI = 'pi_late'
const s = stripe as unknown as {
  webhooks: { constructEvent: jest.Mock }
  paymentIntents: { retrieve: jest.Mock }
}

const intent = (over: any = {}) => ({
  id: PI,
  status: 'succeeded',
  amount: 5000,
  amount_received: 5000,
  latest_charge: { id: 'ch_late' },
  metadata: { type: 'wallet_topup', oSignEUCustomerId: CUST, amountInCents: '5000' },
  ...over,
})

let evt = 0
const succeededWebhook = (id = `evt_late_${++evt}`) => {
  s.webhooks.constructEvent.mockReturnValueOnce({ id, type: 'payment_intent.succeeded', data: { object: intent() } })
  return WEBHOOK_POST(
    buildRequest({
      method: 'POST',
      url: 'http://localhost:3000/api/webhooks/stripe',
      body: '{}',
      headers: { 'stripe-signature': 't=1,v1=x' },
    }) as any,
  )
}
const checkPayment = () =>
  CHECK_PAYMENT(
    buildRequest({ method: 'POST', url: 'http://localhost:3000/api/wallet/check-payment', body: { paymentIntentId: PI } }) as any,
  )
const cron = () =>
  CRON_GET(
    buildRequest({
      method: 'GET',
      url: 'http://localhost:3000/api/cron/check-pending-payments',
      headers: { authorization: 'Bearer late-cron' },
    }) as any,
  )

const db = () => (global as any).__getTestDb()
const balance = async () => (await VirtualWallet.getBalance(CUST)).balance
const row = () => PendingPaymentManager.findByPaymentIntent(PI) as Promise<any>

async function failedRow(status: 'failed' | 'expired') {
  const p = await PendingPaymentManager.createPendingPayment({
    customerId: CUST, stripePaymentIntentId: PI, amount: 5000, description: 'Bono (SEPA)', paymentMethod: 'sepa_debit',
  })
  s.paymentIntents.retrieve.mockResolvedValue(
    status === 'failed' ? intent({ status: 'requires_payment_method' }) : intent({ status: 'requires_action' }),
  )
  if (status === 'expired') {
    await (await db()).collection('pending_payments').updateOne({ _id: p._id }, { $set: { createdAt: new Date(Date.now() - 20 * 86400000) } })
  }
  await PendingPaymentManager.checkPendingPayment((await row()) as any)
  expect((await row()).status).toBe(status)
  expect(await balance()).toBe(0)
  s.paymentIntents.retrieve.mockResolvedValue(intent())
}

async function legacyReversedRow(spent = 0) {
  const credit = await VirtualWallet.addCredits(CUST, 5000, 'top_up', 'Bono (SEPA) (PENDIENTE)', PI)
  await (await db()).collection('pending_payments').insertOne({
    customerId: CUST, stripePaymentIntentId: PI, amount: 5000, description: 'Bono (SEPA)', paymentMethod: 'sepa_debit',
    status: 'pending', createdAt: new Date(), walletTransactionId: credit._id, creditedUpfront: true,
    metadata: { checkAttempts: 0 }, updatedAt: new Date(),
  })
  if (spent) await VirtualWallet.debitCredits(CUST, spent, 'extra_contract', 'uso')
  s.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'canceled' }))
  await PendingPaymentManager.checkPendingPayment((await row()) as any)
  expect((await row()).status).toBe('failed')
  s.paymentIntents.retrieve.mockResolvedValue(intent())
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'late-cron'
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' }, customerId: CUST })
})

describe('SEPA late success', () => {
  it('failed -> succeeded via payment_intent.succeeded webhook credits once', async () => {
    await failedRow('failed')
    expect((await succeededWebhook()).status).toBe(200)
    expect(await balance()).toBe(5000)
    expect((await row()).status).toBe('confirmed')
    expect(await VirtualWallet.getTransactions(CUST)).toHaveLength(1)
  })

  it('expired -> succeeded credits once', async () => {
    await failedRow('expired')
    await succeededWebhook()
    expect(await balance()).toBe(5000)
    expect((await row()).status).toBe('confirmed')
  })

  it('a replayed success webhook (same and new event id) credits once', async () => {
    await failedRow('failed')
    await succeededWebhook('evt_same')
    await succeededWebhook('evt_same')
    await succeededWebhook()
    expect(await balance()).toBe(5000)
    expect(await VirtualWallet.getTransactions(CUST)).toHaveLength(1)
  })

  it('credits at most amount_received, never more than the pending amount', async () => {
    await failedRow('failed')
    s.paymentIntents.retrieve.mockResolvedValue(intent({ amount_received: 3000 }))
    await succeededWebhook()
    expect(await balance()).toBe(3000)
  })

  it('legacy reversed row is re-credited once (and only the reversed amount)', async () => {
    await legacyReversedRow()
    expect(await balance()).toBe(0) // credited 5000, reversed 5000
    await succeededWebhook()
    expect(await balance()).toBe(5000)
    expect((await row()).status).toBe('confirmed')
    await succeededWebhook()
    await checkPayment()
    expect(await balance()).toBe(5000)
    const txns = await VirtualWallet.getTransactions(CUST)
    expect(txns.filter((t: any) => t.metadata?.restoration)).toHaveLength(1)
  })

  it('legacy reversed row that had been spent: balance goes from negative back to the right total', async () => {
    await legacyReversedRow(4500)
    expect(await balance()).toBe(-4500)
    await succeededWebhook()
    expect(await balance()).toBe(500)
  })

  it('concurrent webhook + check-payment credit once', async () => {
    await failedRow('failed')
    const [a, b, c] = await Promise.all([succeededWebhook(), checkPayment(), succeededWebhook()])
    expect([a.status, b.status, c.status]).toEqual([200, 200, 200])
    expect(await balance()).toBe(5000)
    expect(await VirtualWallet.getTransactions(CUST)).toHaveLength(1)
  })

  it('concurrent webhook + check-payment on a reversed legacy row restore once', async () => {
    await legacyReversedRow()
    await Promise.all([succeededWebhook(), checkPayment(), succeededWebhook(), checkPayment()])
    expect(await balance()).toBe(5000)
  })

  it('check-payment settles a failed row by itself', async () => {
    await failedRow('failed')
    const res = await checkPayment()
    expect(res.status).toBe(200)
    expect(await balance()).toBe(5000)
    expect((await row()).status).toBe('confirmed')
  })

  it('cron re-checks recently failed/expired rows (missed webhook) and credits once', async () => {
    await failedRow('failed')
    const body = (await readJson((await cron()) as any)) as any
    expect(body.results.recovered).toBe(1)
    expect(await balance()).toBe(5000)
    await cron()
    expect(await balance()).toBe(5000)
  })

  it('cron leaves a row that is still failed in Stripe alone and stamps lastCheckedAt', async () => {
    await failedRow('failed')
    s.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'requires_payment_method' }))
    const body = (await readJson((await cron()) as any)) as any
    expect(body.results.recovered).toBe(0)
    expect(await balance()).toBe(0)
    expect((await row()).status).toBe('failed')
    expect((await row()).lastCheckedAt).toBeTruthy()
  })

  it('cron ignores rows that failed more than 14 days ago', async () => {
    await failedRow('failed')
    await (await db()).collection('pending_payments').updateOne({ stripePaymentIntentId: PI }, { $set: { failedAt: new Date(Date.now() - 20 * 86400000) } })
    const body = (await readJson((await cron()) as any)) as any
    expect(body.results.recovered).toBe(0)
    expect(await balance()).toBe(0)
  })

  it('a failure that lands while a success already confirmed the row does not leave the wallet reversed', async () => {
    await legacyReversedRow()
    // success arrives first
    await succeededWebhook()
    expect(await balance()).toBe(5000)
    // late failure replay: no-op, nothing reversed
    s.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'canceled' }))
    await PendingPaymentManager.checkPendingPayment((await row()) as any)
    expect(await balance()).toBe(5000)
  })
})
