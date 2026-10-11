/**
 * Integration tests for the SEPA pending-payment lifecycle (PendingPaymentManager).
 *
 * SEPA debits don't settle instantly, so the wallet is NOT credited until Stripe says
 * the payment succeeded (the pending row is shown to the user as "pendiente"):
 *   createPendingPayment        → records a pending row, no credit
 *   checkPendingPayment(succeeded) → credits once (idempotent per intent), confirms
 *   checkPendingPayment(canceled)  → marks failed, never credited
 * Legacy rows credited up front are reversed on failure and may go negative.
 *
 * The `stripe` wrapper is mocked (paymentIntents.retrieve is synthetic); the wallet
 * and pending-payment stores are REAL against in-memory Mongo.
 */

jest.mock('@/lib/payment/stripe', () => ({
  stripe: {
    paymentIntents: { retrieve: jest.fn() },
  },
  StripeManager: {},
}))

import { PendingPaymentManager } from '@/lib/wallet/pendingPayments'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { stripe } from '@/lib/payment/stripe'
import { GET as CRON_GET, POST as CRON_POST } from '@/app/api/cron/check-pending-payments/route'
import { buildRequest, readJson } from '../helpers/nextRequest'

const CUSTOMER_ID = 'sepa-customer'
const stripeMock = stripe as unknown as { paymentIntents: { retrieve: jest.Mock } }

const newPending = () =>
  PendingPaymentManager.createPendingPayment({
    customerId: CUSTOMER_ID,
    stripePaymentIntentId: 'pi_sepa',
    amount: 5000,
    description: 'Bono de uso adicional (SEPA)',
    paymentMethod: 'sepa_debit',
    sessionId: 'cs_sepa',
  })

const newPendingFor = (customerId: string, intentId: string) =>
  PendingPaymentManager.createPendingPayment({
    customerId,
    stripePaymentIntentId: intentId,
    amount: 5000,
    description: 'Bono de uso adicional (SEPA)',
    paymentMethod: 'sepa_debit',
  })

describe('PendingPaymentManager — SEPA lifecycle (credit only when cleared)', () => {
  it('does NOT credit while pending: records the pending row, balance stays 0', async () => {
    const pending = await newPending()
    expect(pending.status).toBe('pending')

    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
    expect(await VirtualWallet.getTransactions(CUSTOMER_ID)).toHaveLength(0)

    // Shown to the customer as "pendiente" (GET /api/wallet pendingPayments) and by intent id.
    expect(await PendingPaymentManager.getPendingPayments(CUSTOMER_ID)).toHaveLength(1)
    const found = await PendingPaymentManager.findByPaymentIntent('pi_sepa')
    expect(found?._id?.toString()).toBe(pending._id?.toString())
  })

  it('credits exactly once when Stripe reports the intent succeeded', async () => {
    const pending = await newPending()
    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'succeeded', latest_charge: { id: 'ch_sepa' } })

    const result = await PendingPaymentManager.checkPendingPayment(pending)
    expect(result.newStatus).toBe('confirmed')

    const stored = await PendingPaymentManager.findByPaymentIntent('pi_sepa')
    expect(stored?.status).toBe('confirmed')
    expect(stored?.stripeChargeId).toBe('ch_sepa')
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(5000)
    const txns = await VirtualWallet.getTransactions(CUSTOMER_ID)
    expect(txns[0].description).not.toContain('PENDIENTE')

    // Re-checking / replayed webhooks never credit twice.
    await PendingPaymentManager.checkPendingPayment(pending)
    await PendingPaymentManager.checkPendingPayment(stored as any)
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(5000)
    expect(await VirtualWallet.getTransactions(CUSTOMER_ID)).toHaveLength(1)
  })

  it('SEPA-D: a failed SEPA payment never credits, so nothing can be spent first and kept', async () => {
    const pending = await newPending()
    // The customer cannot spend credit that has not cleared.
    const spend = await VirtualWallet.debitCredits(CUSTOMER_ID, 4500, 'extra_contract', 'uso')
    expect(spend.success).toBe(false)

    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'canceled' })
    const result = await PendingPaymentManager.checkPendingPayment(pending)
    expect(result.newStatus).toBe('failed')

    expect((await PendingPaymentManager.findByPaymentIntent('pi_sepa'))?.status).toBe('failed')
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
    expect(await VirtualWallet.getTransactions(CUSTOMER_ID)).toHaveLength(0)
  })

  it('SEPA-D legacy: a pre-credited pending that was spent and then fails drives the balance NEGATIVE and blocks usage', async () => {
    // Row created by the OLD flow: credited up front, 45 EUR spent, then the debit fails.
    const credit = await VirtualWallet.addCredits(CUSTOMER_ID, 5000, 'top_up', 'Bono (SEPA) (PENDIENTE)', 'pi_sepa')
    const d = await (global as any).__getTestDb()
    await d.collection('pending_payments').insertOne({
      customerId: CUSTOMER_ID, stripePaymentIntentId: 'pi_sepa', amount: 5000, description: 'Bono (SEPA)',
      paymentMethod: 'sepa_debit', status: 'pending', createdAt: new Date(), walletTransactionId: credit._id,
      creditedUpfront: true, metadata: { checkAttempts: 0 }, updatedAt: new Date(),
    })
    expect((await VirtualWallet.debitCredits(CUSTOMER_ID, 4500, 'extra_contract', 'uso')).success).toBe(true)
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(500)

    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'requires_payment_method' })
    const pending = (await PendingPaymentManager.findByPaymentIntent('pi_sepa')) as any
    await PendingPaymentManager.checkPendingPayment(pending)

    // Owes 45 EUR: reversal of 5000 on a balance of 500 => -4500, not "skipped".
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(-4500)
    expect((await VirtualWallet.debitCredits(CUSTOMER_ID, 1, 'sms', 'x')).success).toBe(false)
    expect((await PendingPaymentManager.findByPaymentIntent('pi_sepa'))?.status).toBe('failed')

    // Reversal happens once only, even if the failure webhook is replayed.
    await PendingPaymentManager.checkPendingPayment(pending)
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(-4500)

    // A later top-up pays the debt back first.
    await VirtualWallet.addCredits(CUSTOMER_ID, 5000, 'top_up', 'recarga', 'pi_new')
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(500)
  })

  it('an expired pending payment is marked expired without any credit', async () => {
    const pending = await newPending()
    const d = await (global as any).__getTestDb()
    await d.collection('pending_payments').updateOne({ _id: pending._id }, { $set: { createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000) } })
    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'requires_action' })
    const stored = (await PendingPaymentManager.findByPaymentIntent('pi_sepa')) as any
    const result = await PendingPaymentManager.checkPendingPayment(stored)
    expect(result.newStatus).toBe('expired')
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
  })

  it('does not credit while the intent is still processing', async () => {
    const pending = await newPending()
    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'processing' })

    const result = await PendingPaymentManager.checkPendingPayment(pending)
    expect(result.newStatus).toBe('processing')

    const stored = await PendingPaymentManager.findByPaymentIntent('pi_sepa')
    expect(stored?.status).toBe('processing')
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
  })

  it('creating the same pending payment twice returns the first row', async () => {
    const a = await newPending()
    const b = await newPending()
    expect(String(b._id)).toBe(String(a._id))
  })
})

// ── Batch reconciliation (the cron that runs without webhooks) ──────────────
describe('PendingPaymentManager.checkAllPendingPayments — batch reconciliation', () => {
  const statusByIntent: Record<string, any> = {
    pi_ok: { status: 'succeeded', latest_charge: { id: 'ch_ok' } },
    pi_bad: { status: 'canceled' },
    pi_wait: { status: 'processing' },
  }

  beforeEach(() => {
    stripeMock.paymentIntents.retrieve.mockImplementation((id: string) => Promise.resolve(statusByIntent[id]))
  })

  it('reconciles a mixed batch: confirms, fails (reverses), leaves processing', async () => {
    await newPendingFor('cust-ok', 'pi_ok')
    await newPendingFor('cust-bad', 'pi_bad')
    await newPendingFor('cust-wait', 'pi_wait')

    const results = await PendingPaymentManager.checkAllPendingPayments()

    expect(results.checked).toBe(3)
    expect(results.confirmed).toBe(1)
    expect(results.failed).toBe(1)
    expect(results.errors).toEqual([])

    // Confirmed: credited now.
    expect((await PendingPaymentManager.findByPaymentIntent('pi_ok'))?.status).toBe('confirmed')
    expect((await VirtualWallet.getBalance('cust-ok')).balance).toBe(5000)

    // Failed: never credited.
    expect((await PendingPaymentManager.findByPaymentIntent('pi_bad'))?.status).toBe('failed')
    expect((await VirtualWallet.getBalance('cust-bad')).balance).toBe(0)

    // Still processing: nothing credited yet, row not terminal.
    expect((await PendingPaymentManager.findByPaymentIntent('pi_wait'))?.status).toBe('processing')
    expect((await VirtualWallet.getBalance('cust-wait')).balance).toBe(0)
  })

  it('skips rows checked within the last 6h (no rework)', async () => {
    await newPendingFor('cust-ok', 'pi_ok')
    // First pass confirms it and stamps lastCheckedAt=now.
    await PendingPaymentManager.checkAllPendingPayments()
    // Second pass: confirmed rows aren't pending/processing anymore → nothing to check.
    const second = await PendingPaymentManager.checkAllPendingPayments()
    expect(second.checked).toBe(0)
  })
})

// ── Cron route wrapper (auth + response shape) ──────────────────────────────
describe('GET/POST /api/cron/check-pending-payments', () => {
  beforeEach(() => {
    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'succeeded', latest_charge: { id: 'ch' } })
  })

  it('rejects unauthenticated cron GET with 401', async () => {
    const res = await CRON_GET(buildRequest({ method: 'GET', url: 'http://localhost:3000/api/cron/check-pending-payments' }) as any)
    expect(res.status).toBe(401)
  })

  it('runs the batch when the caller is Vercel Cron (CRON_SECRET bearer, which Vercel sends)', async () => {
    process.env.CRON_SECRET = 'vercel-secret'
    await newPendingFor('cron-cust', 'pi_ok')
    const res = await CRON_GET(
      buildRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/cron/check-pending-payments',
        headers: { 'user-agent': 'vercel-cron/1.0', authorization: 'Bearer vercel-secret' },
      }) as any,
    )
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(true)
    expect(body.results.checked).toBe(1)
    expect(body.results.confirmed).toBe(1)
  })

  it('runs the batch when a valid CRON_SECRET Bearer token is supplied', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    await newPendingFor('cron-cust', 'pi_ok')
    const res = await CRON_GET(
      buildRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/cron/check-pending-payments',
        headers: { authorization: 'Bearer test-cron-secret' },
      }) as any,
    )
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.results.confirmed).toBe(1)
  })

  it('runs via the manual POST trigger and reports the tally', async () => {
    await newPendingFor('cron-cust', 'pi_ok')
    process.env.CRON_SECRET = 'test-cron-secret'
    const res = await CRON_POST(buildRequest({ method: 'POST', url: 'http://localhost:3000/api/cron/check-pending-payments', body: {}, headers: { authorization: 'Bearer test-cron-secret' } }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.trigger).toBe('manual-test')
    expect(body.results.checked).toBe(1)
    expect(body.results.confirmed).toBe(1)
  })
})
