/**
 * Refund enforcement: who may trigger what, ownership, idempotency, server-side amounts.
 *
 *   POST /api/subscription/refunds  → per-customer request OR global processing
 *   GET  /api/subscription/refunds  → caller's own summary
 *   RefundSystem                    → atomic at-most-once, amount capped by what was paid
 *
 * Wallet/refund stores are REAL (in-memory Mongo). No Stripe is involved in refunds
 * (they credit the oSign wallet), so there is nothing to call externally.
 */
import { POST as REFUNDS_POST, GET as REFUNDS_GET } from '@/app/api/subscription/refunds/route'
import { POST as CRON_POST } from '@/app/api/cron/process-refunds/route'
import { RefundSystem, RefundExceedsPaidError, REFUND_WINDOW_DAYS } from '@/lib/subscription/refundSystem'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { auth } from '@/lib/auth/config'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { ObjectId } from 'mongodb'

const CRON_SECRET = 'refund-hardening-cron'
const OWNER = 'cust-owner'
const OTHER = 'cust-other'
const PAID = 25 // cents debited for the request

const db = async () => (global as any).__getTestDb()
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

function signedInAs(customerId: string, extra: Record<string, unknown> = {}) {
  ;(auth as jest.Mock).mockResolvedValue({
    user: { id: `user-of-${customerId}`, email: `${customerId}@test.dev` },
    customerId,
    ...extra,
  })
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return REFUNDS_POST(buildRequest({ method: 'POST', url: 'http://localhost:3000/api/subscription/refunds', body: body as any, headers }) as any)
}

async function seedSignature(opts: { customerId?: string; status?: string; ageDays?: number; paid?: number; type?: string; smsAttempts?: number } = {}) {
  const d = await db()
  const customerId = opts.customerId ?? OWNER
  const _id = new ObjectId()
  await d.collection('signatureRequests').insertOne({
    _id,
    customerId,
    contractId: new ObjectId().toString(),
    status: opts.status ?? 'expired',
    signatureType: opts.type ?? 'email',
    smsAttempts: opts.smsAttempts,
    createdAt: daysAgo(opts.ageDays ?? 10),
  })
  const paid = opts.paid ?? PAID
  if (paid > 0) {
    await d.collection('wallet_transactions').insertOne({
      customerId, type: 'debit', amount: paid, reason: 'extra_signature', description: 'Firma',
      relatedEntityId: _id.toString(), balanceBefore: paid, balanceAfter: 0, createdAt: daysAgo(opts.ageDays ?? 10),
    })
  }
  return _id.toString()
}

async function seedContract(opts: { customerId?: string; status?: string; paid?: number } = {}) {
  const d = await db()
  const customerId = opts.customerId ?? OWNER
  const _id = new ObjectId()
  await d.collection('contracts').insertOne({ _id, customerId, status: opts.status ?? 'archived', createdAt: daysAgo(5) })
  const paid = opts.paid ?? 200
  if (paid > 0) {
    await d.collection('wallet_transactions').insertOne({
      customerId, type: 'debit', amount: paid, reason: 'extra_contract', description: 'Contrato extra',
      relatedEntityId: _id.toString(), balanceBefore: paid, balanceAfter: 0, createdAt: daysAgo(5),
    })
  }
  return _id.toString()
}

const balance = async (c: string) => (await VirtualWallet.getBalance(c)).balance

beforeAll(() => {
  process.env.CRON_SECRET = CRON_SECRET
  process.env.OSIGN_ADMIN_EMAILS = 'admin-cust@test.dev'
  delete process.env.OSIGN_ADMIN_USER_IDS
})

describe('global refund processing is cron/admin only', () => {
  async function seedExpiredPending() {
    const d = await db()
    const _id = new ObjectId()
    await d.collection('signatureRequests').insertOne({
      _id, customerId: OTHER, contractId: 'x', status: 'pending', signatureType: 'email', createdAt: daysAgo(40),
    })
    await d.collection('wallet_transactions').insertOne({
      customerId: OTHER, type: 'debit', amount: PAID, reason: 'extra_signature', description: 'Firma',
      relatedEntityId: _id.toString(), balanceBefore: PAID, balanceAfter: 0, createdAt: daysAgo(40),
    })
    return _id
  }

  it('non-admin cannot run global refunds (403) and nothing is processed', async () => {
    const id = await seedExpiredPending()
    signedInAs(OWNER)
    const res = await post({})
    expect(res.status).toBe(403)
    expect(((await readJson(res as any)) as any).errorCode).toBe('ADMIN_REQUIRED')
    const d = await db()
    expect((await d.collection('signatureRequests').findOne({ _id: id })).status).toBe('pending')
    expect(await balance(OTHER)).toBe(0)
  })

  it('a body with unrelated fields is still global processing and still 403 for a normal user', async () => {
    signedInAs(OWNER)
    expect((await post({ all: true, customerId: OTHER })).status).toBe(403)
  })

  it('unauthenticated callers get 401', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await post({})).status).toBe(401)
  })

  it('the CRON_SECRET bearer can run it', async () => {
    const id = await seedExpiredPending()
    ;(auth as jest.Mock).mockResolvedValue(null)
    const res = await post({}, { authorization: `Bearer ${CRON_SECRET}` })
    expect(res.status).toBe(200)
    expect(((await readJson(res as any)) as any).data.processedSignatures).toBe(1)
    const d = await db()
    expect((await d.collection('signatureRequests').findOne({ _id: id })).status).toBe('expired')
    expect(await balance(OTHER)).toBe(PAID)
  })

  it('a wrong bearer is not the cron', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    expect((await post({}, { authorization: 'Bearer nope' })).status).toBe(401)
  })

  it('an allowlisted admin can run it', async () => {
    await seedExpiredPending()
    signedInAs('admin-cust')
    const res = await post({})
    expect(res.status).toBe(200)
    expect(await balance(OTHER)).toBe(PAID)
  })

  it('a partner session is never admin, even with an allowlisted email', async () => {
    signedInAs('admin-cust', { partnerId: 'partner-1' })
    expect((await post({})).status).toBe(403)
  })

  it('the cron route requires the secret (no session is enough)', async () => {
    signedInAs('admin-cust')
    const res = await CRON_POST(buildRequest({ method: 'POST', body: {} }) as any)
    expect(res.status).toBe(401)
  })

  it('without CRON_SECRET configured nothing authenticates as cron', async () => {
    const saved = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    try {
      ;(auth as jest.Mock).mockResolvedValue(null)
      const res = await post({}, { authorization: 'Bearer undefined' })
      expect(res.status).toBe(401)
    } finally {
      process.env.CRON_SECRET = saved
    }
  })
})

describe('customer refund request: ownership, eligibility, window', () => {
  it('refunds the owner of an expired paid signature request, exactly what was debited', async () => {
    const id = await seedSignature()
    signedInAs(OWNER)
    const res = await post({ signatureRequestId: id })
    expect(res.status).toBe(200)
    expect(((await readJson(res as any)) as any)).toMatchObject({ success: true, refunded: true, refundAmount: PAID })
    expect(await balance(OWNER)).toBe(PAID)
  })

  it('cross-customer refund attempt is 404 and credits nobody', async () => {
    const id = await seedSignature({ customerId: OWNER })
    signedInAs(OTHER)
    const res = await post({ signatureRequestId: id })
    expect(res.status).toBe(404)
    expect(await balance(OTHER)).toBe(0)
    expect(await balance(OWNER)).toBe(0)
    const d = await db()
    expect(await d.collection('refund_transactions').countDocuments()).toBe(0)
  })

  it('cross-customer contract refund attempt is 404 too', async () => {
    const id = await seedContract({ customerId: OWNER })
    signedInAs(OTHER)
    expect((await post({ contractId: id })).status).toBe(404)
    expect(await balance(OTHER)).toBe(0)
  })

  it('a customerId in the body is ignored (the session decides)', async () => {
    const id = await seedSignature({ customerId: OWNER })
    signedInAs(OTHER)
    expect((await post({ signatureRequestId: id, customerId: OWNER })).status).toBe(404)
  })

  it('refunds a paid archived contract the same way', async () => {
    const id = await seedContract({ paid: 200 })
    signedInAs(OWNER)
    const res = await post({ contractId: id })
    expect(((await readJson(res as any)) as any).refundAmount).toBe(200)
    expect(await balance(OWNER)).toBe(200)
  })

  it('a signed / still-pending item is not eligible (409), nothing credited', async () => {
    signedInAs(OWNER)
    const pending = await seedSignature({ status: 'pending' })
    const signed = await seedSignature({ status: 'signed' })
    expect((await post({ signatureRequestId: pending })).status).toBe(409)
    expect((await post({ signatureRequestId: signed })).status).toBe(409)
    const completedContract = await seedContract({ status: 'completed' })
    expect((await post({ contractId: completedContract })).status).toBe(409)
    expect(await balance(OWNER)).toBe(0)
  })

  it('the refund window is enforced server-side', async () => {
    const id = await seedSignature({ ageDays: REFUND_WINDOW_DAYS + 5 })
    signedInAs(OWNER)
    const res = await post({ signatureRequestId: id })
    expect(res.status).toBe(409)
    expect(((await readJson(res as any)) as any).errorCode).toBe('REFUND_WINDOW_EXPIRED')
    expect(await balance(OWNER)).toBe(0)
  })

  it('rejects malformed ids and ambiguous targets (400)', async () => {
    signedInAs(OWNER)
    expect((await post({ signatureRequestId: 'not-an-id' })).status).toBe(400)
    expect((await post({ signatureRequestId: { $ne: null } })).status).toBe(400)
    const id = await seedSignature()
    expect((await post({ signatureRequestId: id, contractId: id })).status).toBe(400)
  })

  it('an unpaid (monthly allowance) item is recorded but credits nothing', async () => {
    const id = await seedSignature({ paid: 0 })
    signedInAs(OWNER)
    const res = await post({ signatureRequestId: id })
    expect(((await readJson(res as any)) as any)).toMatchObject({ refunded: true, refundAmount: 0 })
    expect(await balance(OWNER)).toBe(0)
  })

  it('SMS that were really sent are not refunded', async () => {
    const id = await seedSignature({ type: 'sms', smsAttempts: 1 })
    signedInAs(OWNER)
    const res = await post({ signatureRequestId: id })
    expect(((await readJson(res as any)) as any).refundAmount).toBe(0)
    expect(await balance(OWNER)).toBe(0)
  })
})

describe('idempotency and server-side amounts', () => {
  it('double refund is idempotent: the second call changes nothing', async () => {
    const id = await seedSignature()
    signedInAs(OWNER)
    const first = (await readJson((await post({ signatureRequestId: id })) as any)) as any
    const second = await post({ signatureRequestId: id })
    expect(first.refunded).toBe(true)
    expect(second.status).toBe(200)
    expect(((await readJson(second as any)) as any)).toMatchObject({ refunded: false, alreadyRefunded: true })
    expect(await balance(OWNER)).toBe(PAID)
    const d = await db()
    expect(await d.collection('refund_transactions').countDocuments({ signatureRequestId: id })).toBe(1)
    expect(await d.collection('wallet_transactions').countDocuments({ type: 'credit', reason: 'refund' })).toBe(1)
  })

  it('concurrent refund requests credit once', async () => {
    const id = await seedSignature()
    signedInAs(OWNER)
    await Promise.all(Array.from({ length: 6 }, () => post({ signatureRequestId: id })))
    expect(await balance(OWNER)).toBe(PAID)
    const d = await db()
    expect(await d.collection('wallet_transactions').countDocuments({ type: 'credit', reason: 'refund' })).toBe(1)
  })

  it('a cron run after a customer refund does not refund again', async () => {
    const d = await db()
    const id = await seedSignature({ status: 'pending', ageDays: 40 })
    await d.collection('signatureRequests').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'expired' } })
    signedInAs(OWNER)
    await post({ signatureRequestId: id })
    // re-open it as if a stale cron run still saw it pending
    await d.collection('signatureRequests').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'pending' } })
    ;(auth as jest.Mock).mockResolvedValue(null)
    await post({}, { authorization: `Bearer ${CRON_SECRET}` })
    expect(await balance(OWNER)).toBe(PAID)
  })

  it('amount tampering in the body is ignored', async () => {
    const id = await seedSignature()
    signedInAs(OWNER)
    const res = await post({ signatureRequestId: id, amount: 999999, refundAmount: 999999, amountInCents: 999999 })
    expect(((await readJson(res as any)) as any).refundAmount).toBe(PAID)
    expect(await balance(OWNER)).toBe(PAID)
  })

  it('refund over the paid amount is rejected and credits nothing', async () => {
    const id = await seedSignature()
    await expect(RefundSystem.creditRefund(OWNER, id, PAID + 1, 'signature_refund')).rejects.toBeInstanceOf(RefundExceedsPaidError)
    expect(await balance(OWNER)).toBe(0)
    // and an entity that was never paid has nothing to refund
    const free = await seedSignature({ paid: 0 })
    await expect(RefundSystem.creditRefund(OWNER, free, 1, 'signature_refund')).rejects.toBeInstanceOf(RefundExceedsPaidError)
    // another customer's debit does not count as "paid" for me
    await expect(RefundSystem.creditRefund(OTHER, id, PAID, 'signature_refund')).rejects.toBeInstanceOf(RefundExceedsPaidError)
  })

  it('after a refund nothing more is refundable for that entity', async () => {
    const id = await seedSignature()
    signedInAs(OWNER)
    await post({ signatureRequestId: id })
    expect(await RefundSystem.getRefundableAmount(OWNER, id)).toBe(0)
    await expect(RefundSystem.creditRefund(OWNER, id, 1, 'signature_refund')).rejects.toBeInstanceOf(RefundExceedsPaidError)
  })

  it('the wallet refuses a second refund credit for the same entity (DB level)', async () => {
    const a = await VirtualWallet.addCredits(OWNER, 50, 'refund', 'r', undefined, undefined, 'entity-1')
    const b = await VirtualWallet.addCredits(OWNER, 50, 'refund', 'r', undefined, undefined, 'entity-1')
    expect(String(b._id)).toBe(String(a._id))
    expect(await balance(OWNER)).toBe(50)
  })

  it('wallet credits must be positive integers', async () => {
    await expect(VirtualWallet.addCredits(OWNER, -5, 'refund', 'x')).rejects.toThrow()
    await expect(VirtualWallet.addCredits(OWNER, 1.5, 'refund', 'x')).rejects.toThrow()
  })
})

describe('GET /api/subscription/refunds is scoped to the caller', () => {
  it('returns only the caller\'s refunds', async () => {
    const mine = await seedSignature({ customerId: OWNER })
    const theirs = await seedSignature({ customerId: OTHER })
    signedInAs(OWNER)
    await post({ signatureRequestId: mine })
    signedInAs(OTHER)
    await post({ signatureRequestId: theirs })

    signedInAs(OWNER)
    const res = await REFUNDS_GET(buildRequest({ url: 'http://localhost:3000/api/subscription/refunds' }) as any)
    const body = (await readJson(res as any)) as any
    expect(body.data.totalRefunds).toBe(1)
    expect(body.data.transactions[0].signatureRequestId).toBe(mine)
  })

  it('rejects a malformed month and unauthenticated callers', async () => {
    signedInAs(OWNER)
    const bad = await REFUNDS_GET(buildRequest({ url: 'http://localhost:3000/api/subscription/refunds?month=garbage' }) as any)
    expect(bad.status).toBe(400)
    ;(auth as jest.Mock).mockResolvedValue(null)
    const anon = await REFUNDS_GET(buildRequest({ url: 'http://localhost:3000/api/subscription/refunds' }) as any)
    expect(anon.status).toBe(401)
  })
})

describe('rate limit', () => {
  it('refund requests are rate limited per customer (429)', async () => {
    signedInAs(OWNER)
    let last = 200
    for (let i = 0; i < 25; i++) {
      last = (await post({ signatureRequestId: new ObjectId().toHexString() })).status
    }
    expect(last).toBe(429)
  })
})
