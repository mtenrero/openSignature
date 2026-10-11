/**
 * FULL-STACK e2e: a SEPA top-up marked failed that LATER succeeds in Stripe is credited
 * (once) by the signed payment_intent.succeeded webhook and by the cron re-check.
 * Stripe is the LOCAL mock (e2e/mock-stripe): the app's SDK is pointed at it, webhooks are
 * signed with the stack's TEST webhook secret. Never the real Stripe.
 */
import { test, expect } from '@playwright/test'
import crypto from 'crypto'
import { OSIGN_URL, osignDb, state_ } from './stack'

const stripeUrl = state_.stripeUrl as string
const secret = state_.webhookSecret as string
if (!stripeUrl || !/^http:\/\/127\.0\.0\.1:\d+$/.test(stripeUrl) || !secret) throw new Error('stack state has no local mock Stripe (restart the stack with the current launcher)')

const mockPi = (pi: any) => fetch(`${stripeUrl}/__test/payment_intent`, { method: 'POST', body: JSON.stringify(pi) })

function signedHeaders(payload: string) {
  const t = Math.floor(Date.now() / 1000)
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')
  return { 'stripe-signature': `t=${t},v1=${v1}`, 'content-type': 'application/json' }
}
const event = (type: string, pi: any, id = `evt_e2e_${crypto.randomBytes(6).toString('hex')}`) =>
  JSON.stringify({ id, object: 'event', api_version: '2025-08-27.basil', created: Math.floor(Date.now() / 1000), type, data: { object: pi } })

const intent = (id: string, customerId: string, over: any = {}) => ({
  id, object: 'payment_intent', status: 'processing', amount: 5000, amount_received: 0, currency: 'eur',
  latest_charge: null,
  metadata: { type: 'wallet_topup', oSignEUCustomerId: customerId, amountInCents: '5000' },
  ...over,
})

async function seedPending(customerId: string, pi: string) {
  const { client, db } = await osignDb()
  try {
    await db.collection('pending_payments').insertOne({
      customerId, stripePaymentIntentId: pi, amount: 5000, description: 'Bono (SEPA)', paymentMethod: 'sepa_debit',
      status: 'pending', createdAt: new Date(), expectedConfirmationDate: new Date(Date.now() + 5 * 86400000),
      metadata: { checkAttempts: 0 }, updatedAt: new Date(),
    } as any)
  } finally { await client.close() }
}
async function readState(customerId: string, pi: string) {
  const { client, db } = await osignDb()
  try {
    const row: any = await db.collection('pending_payments').findOne({ stripePaymentIntentId: pi })
    const bal: any = await db.collection('wallet_balances').findOne({ customerId })
    const credits = await db.collection('wallet_transactions').countDocuments({ customerId, type: 'credit' })
    return { status: row?.status as string, balance: (bal?.balance ?? 0) as number, credits }
  } finally { await client.close() }
}
const uniq = () => crypto.randomBytes(5).toString('hex')

async function deliver(request: any, type: string, pi: any, id?: string) {
  const payload = event(type, pi, id)
  return request.post(`${OSIGN_URL}/api/webhooks/stripe`, { data: payload, headers: signedHeaders(payload) })
}

test.describe('d) SEPA late success', () => {
  test('failed -> succeeded webhook credits the wallet once; replays do not double credit', async ({ request }) => {
    const id = uniq(); const cust = `sepa_cust_${id}`; const pi = `pi_sepa_${id}`
    await seedPending(cust, pi)

    // SEPA debit rejected: Stripe says requires_payment_method, the signed failure webhook marks it failed.
    await mockPi(intent(pi, cust, { status: 'requires_payment_method', last_payment_error: { message: 'insufficient_funds' } }))
    expect((await deliver(request, 'payment_intent.payment_failed', intent(pi, cust, { status: 'requires_payment_method' }))).status()).toBe(200)
    expect(await readState(cust, pi)).toEqual({ status: 'failed', balance: 0, credits: 0 })

    // An unsigned / badly signed webhook is refused and changes nothing.
    const bad = await request.post(`${OSIGN_URL}/api/webhooks/stripe`, {
      data: event('payment_intent.succeeded', intent(pi, cust, { status: 'succeeded' })),
      headers: { 'stripe-signature': 't=1,v1=deadbeef', 'content-type': 'application/json' },
    })
    expect(bad.status()).toBe(400)
    expect(await readState(cust, pi)).toEqual({ status: 'failed', balance: 0, credits: 0 })

    // The SEPA payment finally settles in Stripe.
    const ok = intent(pi, cust, { status: 'succeeded', amount_received: 5000, latest_charge: 'ch_late_' + id })
    await mockPi(ok)
    const first = await deliver(request, 'payment_intent.succeeded', ok, `evt_same_${id}`)
    expect(first.status(), await first.text()).toBe(200)
    expect(await readState(cust, pi)).toEqual({ status: 'confirmed', balance: 5000, credits: 1 })

    // Replays: same event id and a brand-new event id for the same intent.
    expect((await deliver(request, 'payment_intent.succeeded', ok, `evt_same_${id}`)).status()).toBe(200)
    expect((await deliver(request, 'payment_intent.succeeded', ok)).status()).toBe(200)
    expect(await readState(cust, pi)).toEqual({ status: 'confirmed', balance: 5000, credits: 1 })
  })

  test('the cron re-check also catches a failed row that later succeeded (no webhook needed), once', async ({ request }) => {
    const id = uniq(); const cust = `sepa_cron_${id}`; const pi = `pi_sepa_cron_${id}`
    await seedPending(cust, pi)
    await mockPi(intent(pi, cust, { status: 'requires_payment_method' }))
    expect((await deliver(request, 'payment_intent.payment_failed', intent(pi, cust, { status: 'requires_payment_method' }))).status()).toBe(200)
    expect((await readState(cust, pi)).status).toBe('failed')

    await mockPi(intent(pi, cust, { status: 'succeeded', amount_received: 5000, latest_charge: 'ch_cron_' + id }))
    const cron = () => request.get(`${OSIGN_URL}/api/cron/check-pending-payments`, { headers: { authorization: 'Bearer e2e' } })
    const r = await cron()
    expect(r.status(), await r.text()).toBe(200)
    expect(await readState(cust, pi)).toEqual({ status: 'confirmed', balance: 5000, credits: 1 })
    await cron(); await cron()
    expect(await readState(cust, pi)).toEqual({ status: 'confirmed', balance: 5000, credits: 1 })
  })

  test('amount actually received caps the credit', async ({ request }) => {
    const id = uniq(); const cust = `sepa_cap_${id}`; const pi = `pi_sepa_cap_${id}`
    await seedPending(cust, pi)
    await mockPi(intent(pi, cust, { status: 'requires_payment_method' }))
    await deliver(request, 'payment_intent.payment_failed', intent(pi, cust, { status: 'requires_payment_method' }))
    const partial = intent(pi, cust, { status: 'succeeded', amount_received: 3000, latest_charge: 'ch_cap_' + id })
    await mockPi(partial)
    expect((await deliver(request, 'payment_intent.succeeded', partial)).status()).toBe(200)
    expect(await readState(cust, pi)).toEqual({ status: 'confirmed', balance: 3000, credits: 1 })
  })

  test('legacy row (credited up front, reversed on failure) gets its credit back once on late success', async ({ request }) => {
    const id = uniq(); const cust = `sepa_legacy_${id}`; const pi = `pi_sepa_legacy_${id}`
    const { client, db } = await osignDb()
    try {
      const now = new Date()
      const tx = await db.collection('wallet_transactions').insertOne({
        customerId: cust, type: 'credit', amount: 5000, reason: 'top_up', description: 'Bono (SEPA) (PENDIENTE)',
        stripePaymentIntentId: pi, relatedEntityId: pi, balanceBefore: 0, balanceAfter: 5000, createdAt: now,
      } as any)
      await db.collection('wallet_balances').insertOne({ customerId: cust, balance: 5000, totalCredits: 5000, totalDebits: 0, lastUpdated: now, createdAt: now } as any)
      await db.collection('pending_payments').insertOne({
        customerId: cust, stripePaymentIntentId: pi, amount: 5000, description: 'Bono (SEPA)', paymentMethod: 'sepa_debit',
        status: 'pending', createdAt: now, walletTransactionId: tx.insertedId, creditedUpfront: true,
        metadata: { checkAttempts: 0 }, updatedAt: now,
      } as any)
    } finally { await client.close() }

    await mockPi(intent(pi, cust, { status: 'canceled' }))
    expect((await deliver(request, 'payment_intent.canceled', intent(pi, cust, { status: 'canceled' }))).status()).toBe(200)
    expect(await readState(cust, pi)).toMatchObject({ status: 'failed', balance: 0 })

    const ok = intent(pi, cust, { status: 'succeeded', amount_received: 5000, latest_charge: 'ch_legacy_' + id })
    await mockPi(ok)
    expect((await deliver(request, 'payment_intent.succeeded', ok)).status()).toBe(200)
    const after = await readState(cust, pi)
    expect(after).toMatchObject({ status: 'confirmed', balance: 5000 })
    await deliver(request, 'payment_intent.succeeded', ok)
    expect(await readState(cust, pi)).toEqual(after)
  })
})
