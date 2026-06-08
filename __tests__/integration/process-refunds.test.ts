/**
 * Integration tests for the refunds cron (POST /api/cron/process-refunds) and
 * RefundSystem.processExpiredRefunds.
 *
 * Refunds give credit back to the wallet when a PAID signature request expires
 * unsigned. The wallet/refund stores are REAL (in-memory Mongo); UsageTracker is
 * mocked (its real impl reads collections we don't seed) and plan data is real.
 *
 * This also pins the fix for a real bug: refundToWallet used a non-existent
 * `new VirtualWallet().addFunds()`, so refunds never actually credited the wallet.
 */

jest.mock('@/lib/subscription/usage', () => ({
  UsageTracker: {
    getCurrentUsage: jest.fn().mockResolvedValue({
      planId: 'pay_per_use',
      contractsCreated: 0,
      emailSignaturesSent: 5, // beyond pay_per_use emailSignatures:0 → a PAID signature
      smsSignaturesSent: 0,
      localSignaturesSent: 0,
    }),
  },
}))

import { POST as REFUNDS_POST, GET as REFUNDS_GET } from '@/app/api/cron/process-refunds/route'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { getPlanById } from '@/lib/subscription/plans'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { ObjectId } from 'mongodb'

const CRON_SECRET = 'test-cron-secret'
const CUSTOMER_ID = 'refund-customer'

async function db() {
  return (global as any).__getTestDb()
}

const fortyDaysAgo = () => new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)

async function seedExpiredEmailRequest(customerId = CUSTOMER_ID) {
  const d = await db()
  const _id = new ObjectId()
  await d.collection('signatureRequests').insertOne({
    _id,
    customerId,
    contractId: new ObjectId().toString(),
    status: 'pending',
    signatureType: 'email',
    signerName: 'Ada Lovelace',
    createdAt: fortyDaysAgo(),
  })
  return _id.toString()
}

beforeAll(() => {
  process.env.CRON_SECRET = CRON_SECRET
})

describe('POST /api/cron/process-refunds — auth', () => {
  it('rejects without a CRON_SECRET Bearer (401)', async () => {
    const res = await REFUNDS_POST(buildRequest({ method: 'POST', body: {} }) as any)
    expect(res.status).toBe(401)
  })

  it('rejects a wrong secret (401)', async () => {
    const res = await REFUNDS_POST(
      buildRequest({ method: 'POST', body: {}, headers: { authorization: 'Bearer nope' } }) as any,
    )
    expect(res.status).toBe(401)
  })

  it('GET is a public health check (200)', async () => {
    const res = await REFUNDS_GET()
    expect(res.status).toBe(200)
    expect((await readJson(res as any)) as any).toMatchObject({ status: 'healthy' })
  })
})

describe('processExpiredRefunds (via cron) — expires + refunds to wallet', () => {
  it('expires an old unsigned PAID signature request and credits the wallet exactly once', async () => {
    const id = await seedExpiredEmailRequest()
    const expectedRefund = getPlanById('pay_per_use')!.limits.extraSignatureCost
    expect(expectedRefund).toBeGreaterThan(0)

    const res = await REFUNDS_POST(
      buildRequest({ method: 'POST', body: {}, headers: { authorization: `Bearer ${CRON_SECRET}` } }) as any,
    )
    expect(res.status).toBe(200)
    const body = (await readJson(res as any)) as any
    expect(body.success).toBe(true)
    expect(body.data.processedSignatures).toBe(1)
    expect(body.data.errorCount).toBe(0)

    const d = await db()
    // 1) request marked expired
    const reqDoc = await d.collection('signatureRequests').findOne({ _id: new ObjectId(id) })
    expect(reqDoc.status).toBe('expired')

    // 2) a refund transaction recorded for it
    const refund = await d.collection('refund_transactions').findOne({ signatureRequestId: id })
    expect(refund).toBeTruthy()
    expect(refund.refundAmount).toBe(expectedRefund)

    // 3) the wallet was ACTUALLY credited (the refundToWallet fix)
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(expectedRefund)
  })

  it('does not touch recent (non-expired) requests', async () => {
    const d = await db()
    await d.collection('signatureRequests').insertOne({
      _id: new ObjectId(),
      customerId: 'recent-customer',
      contractId: new ObjectId().toString(),
      status: 'pending',
      signatureType: 'email',
      createdAt: new Date(), // today
    })

    const res = await REFUNDS_POST(
      buildRequest({ method: 'POST', body: {}, headers: { authorization: `Bearer ${CRON_SECRET}` } }) as any,
    )
    const body = (await readJson(res as any)) as any
    expect(body.data.processedSignatures).toBe(0)
    expect((await VirtualWallet.getBalance('recent-customer')).balance).toBe(0)
  })

  it('is idempotent — re-running does not double-refund an already-expired request', async () => {
    await seedExpiredEmailRequest()
    const expectedRefund = getPlanById('pay_per_use')!.limits.extraSignatureCost

    const post = () =>
      REFUNDS_POST(buildRequest({ method: 'POST', body: {}, headers: { authorization: `Bearer ${CRON_SECRET}` } }) as any)

    await post()
    // second run: the request is now 'expired' (not pending/sent) → not re-processed
    const res2 = await post()
    const body2 = (await readJson(res2 as any)) as any
    expect(body2.data.processedSignatures).toBe(0)
    expect((await VirtualWallet.getBalance(CUSTOMER_ID)).balance).toBe(expectedRefund)
  })
})
