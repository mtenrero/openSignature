import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Cron endpoints authenticate with `Authorization: Bearer ${CRON_SECRET}` (Vercel
 * Cron sends it automatically when CRON_SECRET is set). The user-agent is
 * attacker-controlled and is NOT a credential. Fails closed when CRON_SECRET is
 * unset; `next dev` may call without it.
 */
export function verifyCronRequest(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === 'development') return null
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') || ''
  if (secret) {
    const a = crypto.createHash('sha256').update(header).digest()
    const b = crypto.createHash('sha256').update(`Bearer ${secret}`).digest()
    if (crypto.timingSafeEqual(a, b)) return null
  }
  return NextResponse.json({ error: 'Unauthorized - Invalid cron request' }, { status: 401 })
}
