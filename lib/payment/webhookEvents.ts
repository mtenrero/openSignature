import { getDatabase } from '@/lib/db/mongodb'

/**
 * Idempotency store for Stripe webhook events (keyed by the signed event id).
 * Stripe retries and may redeliver: an event must have its side effects at most once.
 *
 *   claim()    atomically take the event ('claimed'), or learn it is already
 *              'duplicate' (processed) / 'in_progress' (another delivery is running)
 *   complete() mark processed
 *   release()  handler failed: free the claim so Stripe's retry can run it again
 */
const STALE_MS = 5 * 60 * 1000

async function col() {
  const db = await getDatabase()
  const c = db.collection('stripe_webhook_events')
  await c.createIndex({ eventId: 1 }, { unique: true })
  await c.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })
  return c
}

export type ClaimResult = 'claimed' | 'duplicate' | 'in_progress'

export async function claimWebhookEvent(eventId: string, type: string): Promise<ClaimResult> {
  const c = await col()
  const now = new Date()
  try {
    await c.insertOne({ eventId, type, status: 'processing', createdAt: now, startedAt: now })
    return 'claimed'
  } catch (err: any) {
    if (err?.code !== 11000) throw err
  }
  // A previous delivery crashed mid-way (claim older than STALE_MS): take it over, once.
  const takeover = await c.findOneAndUpdate(
    { eventId, status: 'processing', startedAt: { $lt: new Date(now.getTime() - STALE_MS) } },
    { $set: { startedAt: now } },
  )
  if (takeover) return 'claimed'
  const existing = await c.findOne({ eventId })
  return existing?.status === 'processed' ? 'duplicate' : 'in_progress'
}

export async function completeWebhookEvent(eventId: string): Promise<void> {
  const c = await col()
  await c.updateOne({ eventId }, { $set: { status: 'processed', processedAt: new Date() } })
}

export async function releaseWebhookEvent(eventId: string): Promise<void> {
  const c = await col()
  await c.deleteOne({ eventId, status: 'processing' })
}
