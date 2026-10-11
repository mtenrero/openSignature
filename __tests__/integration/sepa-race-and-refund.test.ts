/**
 * F4: deterministic interleavings of settleSucceeded / settleFailed on a legacy
 * (credited up front) SEPA row. F5: a PaymentIntent that succeeded and was LATER refunded
 * must credit only amount_received - amount_refunded, and charge.refunded debits a row
 * that was already credited.
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
import { stripe } from '@/lib/payment/stripe'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'
import { buildRequest } from '../helpers/nextRequest'

const CUST = 'sepa-race-customer'
const PI = 'pi_race'
const s = stripe as unknown as { webhooks: { constructEvent: jest.Mock }; paymentIntents: { retrieve: jest.Mock } }
const db = () => (global as any).__getTestDb()
const balance = async () => (await VirtualWallet.getBalance(CUST)).balance
const row = () => PendingPaymentManager.findByPaymentIntent(PI) as Promise<any>

const intent = (over: any = {}) => ({
  id: PI, status: 'succeeded', amount: 5000, amount_received: 5000,
  latest_charge: { id: 'ch_race', amount_refunded: 0 },
  metadata: { type: 'wallet_topup', oSignEUCustomerId: CUST, amountInCents: '5000' },
  ...over,
})

let evt = 0
const webhook = (type: string, object: any) => {
  s.webhooks.constructEvent.mockReturnValueOnce({ id: `evt_race_${++evt}`, type, data: { object } })
  return WEBHOOK_POST(
    buildRequest({ method: 'POST', url: 'http://localhost:3000/api/webhooks/stripe', body: '{}', headers: { 'stripe-signature': 't=1,v1=x' } }) as any,
  )
}

async function legacyPendingRow() {
  const credit = await VirtualWallet.addCredits(CUST, 5000, 'top_up', 'Bono (SEPA) (PENDIENTE)', PI)
  await (await db()).collection('pending_payments').insertOne({
    customerId: CUST, stripePaymentIntentId: PI, amount: 5000, description: 'Bono (SEPA)', paymentMethod: 'sepa_debit',
    status: 'pending', createdAt: new Date(), walletTransactionId: credit._id, creditedUpfront: true,
    metadata: { checkAttempts: 0 }, updatedAt: new Date(),
  })
  return (await row()) as any
}
async function plainPendingRow() {
  await PendingPaymentManager.createPendingPayment({
    customerId: CUST, stripePaymentIntentId: PI, amount: 5000, description: 'Bono (SEPA)', paymentMethod: 'sepa_debit',
  })
  return (await row()) as any
}

beforeEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
})

describe('SEPA legacy race: success vs failure (F4)', () => {
  it('failure lands between settleSucceeded read and claim -> credit restored', async () => {
    const pending = await legacyPendingRow()
    const realFind = VirtualWallet.findTransactionByPaymentIntent.bind(VirtualWallet)
    let fired = false
    // settleSucceeded has read the row as `pending`; right after it looks up the credit,
    // the failure wins the claim and writes its reversal.
    jest.spyOn(VirtualWallet, 'findTransactionByPaymentIntent').mockImplementation(async (id: string) => {
      const r = await realFind(id)
      if (!fired) { fired = true; await PendingPaymentManager.settleFailed(pending, 'failed', 'PAGO FALLIDO') }
      return r
    })
    expect(await PendingPaymentManager.settleSucceeded(pending, 5000, 'ch_race')).toBe(true)
    expect((await row()).status).toBe('confirmed')
    expect(await balance()).toBe(5000)
    const txns = await VirtualWallet.getTransactions(CUST)
    expect(txns.filter((t: any) => t.metadata?.restoration)).toHaveLength(1)
  })

  it('success lands after the failure claimed but before its reversal is written -> credit restored', async () => {
    const pending = await legacyPendingRow()
    const realReverse = VirtualWallet.reverseCredit.bind(VirtualWallet)
    jest.spyOn(VirtualWallet, 'reverseCredit').mockImplementation(async (...args: any[]) => {
      // success runs to completion while the failure is mid-flight (row already `failed`)
      await PendingPaymentManager.settleSucceeded((await row()) as any, 5000, 'ch_race')
      return (realReverse as any)(...args)
    })
    await PendingPaymentManager.settleFailed(pending, 'failed', 'PAGO FALLIDO')
    expect((await row()).status).toBe('confirmed')
    expect(await balance()).toBe(5000)
  })

  it('success first, failure afterwards: nothing reversed', async () => {
    const pending = await legacyPendingRow()
    await PendingPaymentManager.settleSucceeded(pending, 5000, 'ch_race')
    expect(await PendingPaymentManager.settleFailed(pending, 'failed', 'x')).toBe(false)
    expect(await balance()).toBe(5000)
  })
})

describe('SEPA refunded after success (F5)', () => {
  it('credits amount_received - amount_refunded (partial refund)', async () => {
    const pending = await plainPendingRow()
    s.paymentIntents.retrieve.mockResolvedValue(intent({ latest_charge: { id: 'ch', amount_refunded: 2000 } }))
    await PendingPaymentManager.checkPendingPayment(pending)
    expect(await balance()).toBe(3000)
    expect((await row()).status).toBe('confirmed')
  })

  it('credits nothing when fully refunded', async () => {
    const pending = await plainPendingRow()
    s.paymentIntents.retrieve.mockResolvedValue(intent({ latest_charge: { id: 'ch', amount_refunded: 5000, refunded: true } }))
    await PendingPaymentManager.checkPendingPayment(pending)
    expect(await balance()).toBe(0)
    expect(await VirtualWallet.getTransactions(CUST)).toHaveLength(0)
  })

  it('recheckRecentlyFailed does not credit a late success that was refunded', async () => {
    const pending = await plainPendingRow()
    s.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'requires_payment_method' }))
    await PendingPaymentManager.checkPendingPayment(pending)
    expect((await row()).status).toBe('failed')
    s.paymentIntents.retrieve.mockResolvedValue(intent({ latest_charge: { id: 'ch', amount_refunded: 5000, refunded: true } }))
    await PendingPaymentManager.recheckRecentlyFailed()
    expect(await balance()).toBe(0)
  })

  it('recheckRecentlyFailed credits only the net of a partial refund', async () => {
    const pending = await plainPendingRow()
    s.paymentIntents.retrieve.mockResolvedValue(intent({ status: 'requires_payment_method' }))
    await PendingPaymentManager.checkPendingPayment(pending)
    s.paymentIntents.retrieve.mockResolvedValue(intent({ latest_charge: { id: 'ch', amount_refunded: 1500 } }))
    await PendingPaymentManager.recheckRecentlyFailed()
    expect(await balance()).toBe(3500)
  })

  it('charge.refunded debits an already-credited row, once, and only the increment', async () => {
    const pending = await plainPendingRow()
    s.paymentIntents.retrieve.mockResolvedValue(intent())
    await PendingPaymentManager.checkPendingPayment(pending)
    expect(await balance()).toBe(5000)
    await webhook('charge.refunded', { id: 'ch_race', payment_intent: PI, amount_refunded: 2000 })
    expect(await balance()).toBe(3000)
    await webhook('charge.refunded', { id: 'ch_race', payment_intent: PI, amount_refunded: 2000 }) // replay, new event id
    expect(await balance()).toBe(3000)
    await webhook('charge.refunded', { id: 'ch_race', payment_intent: PI, amount_refunded: 5000 })
    expect(await balance()).toBe(0)
    await webhook('charge.refunded', { id: 'ch_race', payment_intent: PI, amount_refunded: 1000 }) // stale smaller total
    expect(await balance()).toBe(0)
  })

  it('charge.refunded may drive the balance negative when the money was spent', async () => {
    const pending = await plainPendingRow()
    s.paymentIntents.retrieve.mockResolvedValue(intent())
    await PendingPaymentManager.checkPendingPayment(pending)
    await VirtualWallet.debitCredits(CUST, 4500, 'extra_contract', 'uso')
    await webhook('charge.refunded', { id: 'ch_race', payment_intent: PI, amount_refunded: 5000 })
    expect(await balance()).toBe(-4500)
  })

  it('a refund already counted at settlement is not debited again by charge.refunded', async () => {
    const pending = await plainPendingRow()
    s.paymentIntents.retrieve.mockResolvedValue(intent({ latest_charge: { id: 'ch', amount_refunded: 2000 } }))
    await PendingPaymentManager.checkPendingPayment(pending)
    await webhook('charge.refunded', { id: 'ch', payment_intent: PI, amount_refunded: 2000 })
    expect(await balance()).toBe(3000)
  })

  it('charge.refunded for an unknown or unsettled row is a no-op', async () => {
    expect((await webhook('charge.refunded', { id: 'c', payment_intent: 'pi_unknown', amount_refunded: 100 })).status).toBe(200)
    await plainPendingRow()
    await webhook('charge.refunded', { id: 'c', payment_intent: PI, amount_refunded: 100 })
    expect(await balance()).toBe(0)
  })

  it('legacy pre-credited row refunded before it settles: refund is debited at confirmation', async () => {
    const pending = await legacyPendingRow()
    s.paymentIntents.retrieve.mockResolvedValue(intent({ latest_charge: { id: 'ch', amount_refunded: 5000, refunded: true } }))
    await PendingPaymentManager.checkPendingPayment(pending)
    expect(await balance()).toBe(0)
    expect((await row()).status).toBe('confirmed')
  })
})
