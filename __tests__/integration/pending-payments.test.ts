/**
 * Integration tests for the SEPA pending-payment lifecycle (PendingPaymentManager).
 *
 * SEPA debits don't settle instantly, so we credit the wallet immediately as
 * "(PENDIENTE)" and reconcile later against Stripe:
 *   createPendingPayment        → credits now, records a pending row
 *   checkPendingPayment(succeeded) → confirm, strip "(PENDIENTE)", balance unchanged
 *   checkPendingPayment(canceled)  → fail, REVERSE the credit (debit back to 0)
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

describe('PendingPaymentManager — SEPA lifecycle', () => {
  it('credits immediately as pending and records the pending row', async () => {
    const pending = await newPending()
    expect(pending.status).toBe('pending')

    // Credit lands right away (so the user can use it), tagged PENDIENTE.
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(5000)
    const txns = await VirtualWallet.getTransactions(CUSTOMER_ID)
    expect(txns[0].description).toContain('PENDIENTE')

    // Discoverable both as a customer pending payment and by intent id.
    expect(await PendingPaymentManager.getPendingPayments(CUSTOMER_ID)).toHaveLength(1)
    const found = await PendingPaymentManager.findByPaymentIntent('pi_sepa')
    expect(found?._id?.toString()).toBe(pending._id?.toString())
  })

  it('confirms when Stripe reports the intent succeeded (balance unchanged, tag removed)', async () => {
    const pending = await newPending()
    // Modern Stripe API: Charge is on `latest_charge`, not the removed `charges.data`.
    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'succeeded', latest_charge: { id: 'ch_sepa' } })

    const result = await PendingPaymentManager.checkPendingPayment(pending)
    expect(result.newStatus).toBe('confirmed')

    const stored = await PendingPaymentManager.findByPaymentIntent('pi_sepa')
    expect(stored?.status).toBe('confirmed')
    // Charge id captured from latest_charge (proves the migration off charges.data).
    expect(stored?.stripeChargeId).toBe('ch_sepa')
    // Already credited at creation → confirming must NOT credit again.
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(5000)
    const txns = await VirtualWallet.getTransactions(CUSTOMER_ID)
    expect(txns[0].description).not.toContain('PENDIENTE')
  })

  it('fails and reverses the credit when Stripe reports the intent canceled', async () => {
    const pending = await newPending()
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(5000)

    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'canceled' })

    const result = await PendingPaymentManager.checkPendingPayment(pending)
    expect(result.newStatus).toBe('failed')

    const stored = await PendingPaymentManager.findByPaymentIntent('pi_sepa')
    expect(stored?.status).toBe('failed')
    // Reversal debit brings the wallet back to zero.
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(0)
    const txns = await VirtualWallet.getTransactions(CUSTOMER_ID)
    expect(txns.some(t => t.type === 'debit')).toBe(true)
  })

  it('does not confirm while the intent is still processing', async () => {
    const pending = await newPending()
    stripeMock.paymentIntents.retrieve.mockResolvedValue({ status: 'processing' })

    const result = await PendingPaymentManager.checkPendingPayment(pending)
    expect(result.newStatus).toBe('processing')

    const stored = await PendingPaymentManager.findByPaymentIntent('pi_sepa')
    expect(stored?.status).toBe('processing')
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(5000)
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

    // Confirmed: credit stays.
    expect((await PendingPaymentManager.findByPaymentIntent('pi_ok'))?.status).toBe('confirmed')
    expect((await VirtualWallet.getBalance('cust-ok')).balance).toBe(5000)

    // Failed: credit reversed to zero.
    expect((await PendingPaymentManager.findByPaymentIntent('pi_bad'))?.status).toBe('failed')
    expect((await VirtualWallet.getBalance('cust-bad')).balance).toBe(0)

    // Still processing: credit held, row not terminal.
    expect((await PendingPaymentManager.findByPaymentIntent('pi_wait'))?.status).toBe('processing')
    expect((await VirtualWallet.getBalance('cust-wait')).balance).toBe(5000)
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

  it('runs the batch when the caller is Vercel Cron (user-agent)', async () => {
    await newPendingFor('cron-cust', 'pi_ok')
    const res = await CRON_GET(
      buildRequest({
        method: 'GET',
        url: 'http://localhost:3000/api/cron/check-pending-payments',
        headers: { 'user-agent': 'vercel-cron/1.0' },
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
    const res = await CRON_POST(buildRequest({ method: 'POST', url: 'http://localhost:3000/api/cron/check-pending-payments', body: {} }) as any)
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.trigger).toBe('manual-test')
    expect(body.results.checked).toBe(1)
    expect(body.results.confirmed).toBe(1)
  })
})
