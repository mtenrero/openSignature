/**
 * A contract / signature request that was EVER signed or completed is never refundable,
 * even after it is archived (signed -> archived, completed -> archived are allowed
 * transitions), regardless of its current status.
 */
import { POST as REFUNDS_POST } from '@/app/api/subscription/refunds/route'
import { POST as ARCHIVE_POST } from '@/app/api/contracts/[id]/archive/route'
import { PUT as STATUS_PUT } from '@/app/api/contracts/[id]/status/route'
import { VirtualWallet } from '@/lib/wallet/wallet'
import { auth } from '@/lib/auth/config'
import { mockAuthAs } from '../helpers/mockAuth'
import { buildRequest, readJson } from '../helpers/nextRequest'
import { ObjectId } from 'mongodb'

const C = 'cust-signed'
const db = async () => (global as any).__getTestDb()
const balance = async () => (await VirtualWallet.getBalance(C)).balance

function signedIn() {
  ;(auth as jest.Mock).mockResolvedValue({ user: { id: C, email: 'c@test.dev' }, customerId: C })
  mockAuthAs({ userId: C, customerId: C })
}
const refund = (body: unknown) =>
  REFUNDS_POST(buildRequest({ method: 'POST', url: 'http://localhost:3000/api/subscription/refunds', body: body as any }) as any)

async function seed(coll: string, doc: Record<string, unknown>, paid = 200) {
  const d = await db()
  const _id = new ObjectId()
  await d.collection(coll).insertOne({ _id, customerId: C, createdAt: new Date(), type: 'contract', ...doc })
  await d.collection('wallet_transactions').insertOne({
    customerId: C, type: 'debit', amount: paid, reason: 'extra', description: 'x',
    relatedEntityId: _id.toString(), balanceBefore: paid, balanceAfter: 0, createdAt: new Date(),
  })
  return _id.toString()
}

describe('signed / completed items are never refundable', () => {
  it('A1: signed contract archived via /archive then refunded -> 409 NOT_ELIGIBLE, no credit', async () => {
    signedIn()
    const id = await seed('contracts', { status: 'signed' })
    const arch = await ARCHIVE_POST(buildRequest({ method: 'POST', body: { reason: 'manual_archive' } }) as any, { params: Promise.resolve({ id }) })
    expect(arch.status).toBe(200)
    const d = await db()
    expect((await d.collection('contracts').findOne({ _id: new ObjectId(id) })).status).toBe('archived')
    const res = await refund({ contractId: id })
    expect(res.status).toBe(409)
    expect(((await readJson(res as any)) as any).errorCode).toBe('REFUND_NOT_ELIGIBLE')
    expect(await balance()).toBe(0)
  })

  it('A2: completed contract archived via PUT status then refunded -> rejected', async () => {
    signedIn()
    const id = await seed('contracts', { status: 'completed' })
    const put = await STATUS_PUT(buildRequest({ method: 'PUT', body: { status: 'archived' } }) as any, { params: Promise.resolve({ id }) })
    expect(put.status).toBe(200)
    const res = await refund({ contractId: id })
    expect(res.status).toBe(409)
    expect(await balance()).toBe(0)
  })

  it('an archived contract that has a signed signature request is rejected', async () => {
    signedIn()
    const id = await seed('contracts', { status: 'archived' })
    const d = await db()
    await d.collection('signatureRequests').insertOne({ customerId: C, contractId: id, status: 'signed', signedAt: new Date() })
    const res = await refund({ contractId: id })
    expect(res.status).toBe(409)
    expect(await balance()).toBe(0)
  })

  it('an archived contract with signedAt evidence is rejected', async () => {
    signedIn()
    const id = await seed('contracts', { status: 'archived', signedAt: new Date() })
    expect((await refund({ contractId: id })).status).toBe(409)
    expect(await balance()).toBe(0)
  })

  it('a signature request that was signed and then archived is rejected', async () => {
    signedIn()
    const id = await seed('signatureRequests', { status: 'archived', signedAt: new Date(), signatureData: 'data:image/png;base64,xx' })
    expect((await refund({ signatureRequestId: id })).status).toBe(409)
    expect(await balance()).toBe(0)
  })

  it('a signature request with a signed status in its history is rejected', async () => {
    signedIn()
    const id = await seed('signatureRequests', { status: 'cancelled', statusHistory: [{ status: 'pending' }, { status: 'signed' }] })
    expect((await refund({ signatureRequestId: id })).status).toBe(409)
    expect(await balance()).toBe(0)
  })

  it('control: a never-signed archived contract is still refunded', async () => {
    signedIn()
    const id = await seed('contracts', { status: 'archived' })
    const res = await refund({ contractId: id })
    expect(res.status).toBe(200)
    expect(await balance()).toBe(200)
  })
})
