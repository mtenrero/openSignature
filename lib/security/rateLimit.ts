import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db/mongodb'

/**
 * Small Mongo-backed fixed-window rate limiter for endpoints that trigger a paid /
 * rate-limited upstream call (Stripe) per request. Atomic ($inc upsert), shared across
 * instances, self-cleaning (TTL). Fails OPEN on DB errors so billing never hard-breaks.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const db = await getDatabase()
    const col = db.collection('rate_limits')
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    const windowStart = Math.floor(Date.now() / (windowSeconds * 1000))
    const doc = await col.findOneAndUpdate(
      { _id: `${key}:${windowStart}` as any },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((windowStart + 2) * windowSeconds * 1000) },
      },
      { upsert: true, returnDocument: 'after' },
    )
    const count = (doc as any)?.count ?? 1
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
  } catch (err) {
    console.error('[rateLimit] failed open:', err instanceof Error ? err.message : 'error')
    return { allowed: true, remaining: limit }
  }
}

/** Returns a 429 response when the bucket is exhausted, otherwise null. */
export async function rateLimitOr429(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  const r = await consumeRateLimit(`${bucket}:${subject}`, limit, windowSeconds)
  if (r.allowed) return null
  return NextResponse.json(
    { error: 'Too many requests', errorCode: 'RATE_LIMITED' },
    { status: 429, headers: { 'Retry-After': String(windowSeconds) } },
  )
}
